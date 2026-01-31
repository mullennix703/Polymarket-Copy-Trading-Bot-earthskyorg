import { ENV, isUpDownTrader, getTraderName, UPDOWN_STALENESS_THRESHOLD_SECONDS, shouldProcess15MinUpDownTrade, shouldProcess1HourUpDownTrade } from '../config/env';
import { isDatabaseAvailable } from '../config/db';
import { getUserActivityModel, getUserPositionModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import Logger from '../utils/logger';
import { POLYMARKET_API, DB_FIELDS, TIME_CONSTANTS } from '../utils/constants';
import { UserPositionInterface, UserActivityInterface } from '../interfaces/User';

const USER_ADDRESSES = ENV.USER_ADDRESSES;
const TOO_OLD_TIMESTAMP = ENV.TOO_OLD_TIMESTAMP;
const FETCH_INTERVAL = ENV.FETCH_INTERVAL;
const HISTORICAL_SYNC_WINDOW_MINUTES = ENV.HISTORICAL_SYNC_WINDOW_MINUTES;

// Track logged stale UpDown trades to prevent duplicate logging
// Use composite key: address + conditionId + type + approximate timestamp (rounded to hour)
// This prevents logging the same logical trade multiple times even with different transactionHashes
const loggedStaleUpDownTrades = new Set<string>();
// Track logged skipped 15-minute UpDown trades to prevent duplicate logging
const loggedSkipped15MinTrades = new Set<string>();
// Track logged skipped 1-hour UpDown trades to prevent duplicate logging
const loggedSkipped1HourTrades = new Set<string>();

/**
 * Generate a unique key for deduplicating stale trade logs
 * Uses address + conditionId + type + hour-rounded timestamp to identify "same" trades
 */
const getStaleTradeLogKey = (address: string, activity: UserActivityInterface): string => {
    const hourTimestamp = Math.floor(activity.timestamp / 3600) * 3600; // Round to hour
    return `${address}:${activity.conditionId}:${activity.type}:${hourTimestamp}`;
};

if (!USER_ADDRESSES || USER_ADDRESSES.length === 0) {
    throw new Error('USER_ADDRESSES is not defined or empty');
}

// Create activity and position models for each user
const userModels = USER_ADDRESSES.map((address) => ({
    address,
    UserActivity: getUserActivityModel(address),
    UserPosition: getUserPositionModel(address),
}));

/**
 * Initialize trade monitor and display current status
 */
const init = async (): Promise<void> => {
    Logger.info(`Loading database stats for ${userModels.length} traders...`);
    
    // Parallel database queries for better performance
    const countPromises = userModels.map(({ UserActivity }) => 
        UserActivity.countDocuments().catch(() => 0)
    );
    const counts = await Promise.all(countPromises);
    
    Logger.clearLine();
    Logger.dbConnection(USER_ADDRESSES, counts);

    // Show your own positions first
    try {
        const myPositionsUrl = `${POLYMARKET_API.DATA_API_BASE}${POLYMARKET_API.POSITIONS_ENDPOINT}?user=${ENV.PROXY_WALLET}`;
        const myPositions = await fetchData<UserPositionInterface[]>(myPositionsUrl);

        // Get current USDC balance
        const getMyBalance = (await import('../utils/getMyBalance')).default;
        // const currentBalance = await getMyBalance(ENV.PROXY_WALLET);
        const currentBalance = 0;

        if (Array.isArray(myPositions) && myPositions.length > 0) {
            // Calculate your overall profitability and initial investment
            let totalValue = 0;
            let initialValue = 0;
            let weightedPnl = 0;
            myPositions.forEach((pos: UserPositionInterface) => {
                const value = pos.currentValue || 0;
                const initial = pos.initialValue || 0;
                const pnl = pos.percentPnl || 0;
                totalValue += value;
                initialValue += initial;
                weightedPnl += value * pnl;
            });
            const myOverallPnl = totalValue > 0 ? weightedPnl / totalValue : 0;

            // Get top 5 positions by profitability (PnL)
            const myTopPositions = myPositions
                .sort((a, b) => (b.percentPnl || 0) - (a.percentPnl || 0))
                .slice(0, 5);

            Logger.clearLine();
            Logger.myPositions(
                ENV.PROXY_WALLET,
                myPositions.length,
                myTopPositions,
                myOverallPnl,
                totalValue,
                initialValue,
                currentBalance
            );
        } else {
            Logger.clearLine();
            Logger.myPositions(ENV.PROXY_WALLET, 0, [], 0, 0, 0, currentBalance);
        }
    } catch (error) {
        Logger.error(`Failed to fetch your positions: ${error}`);
    }

    // Show current positions count with details for traders you're copying
    Logger.info(`Loading position data for ${userModels.length} traders (this may take a moment)...`);
    
    // Parallel position queries for better performance
    const positionPromises = userModels.map(async ({ address, UserPosition }) => {
        try {
            const positions = await UserPosition.find().exec();
            
            // Calculate overall profitability (weighted average by current value)
            let totalValue = 0;
            let weightedPnl = 0;
            positions.forEach((pos) => {
                const value = pos.currentValue || 0;
                const pnl = pos.percentPnl || 0;
                totalValue += value;
                weightedPnl += value * pnl;
            });
            const overallPnl = totalValue > 0 ? weightedPnl / totalValue : 0;

            // Get top 3 positions by profitability (PnL)
            const topPositions = positions
                .sort((a, b) => (b.percentPnl || 0) - (a.percentPnl || 0))
                .slice(0, 3)
                .map((p) => {
                    const obj = p.toObject();
                    if (obj.proxyWallet && typeof obj.proxyWallet === 'string') {
                        return obj as UserPositionInterface;
                    }
                    return null;
                })
                .filter((p): p is UserPositionInterface => p !== null);
            
            return {
                count: positions.length,
                profitability: overallPnl,
                details: topPositions,
            };
        } catch (error) {
            Logger.warning(`Failed to load positions for ${address.slice(0, 6)}...${address.slice(-4)}`);
            return { count: 0, profitability: 0, details: [] as UserPositionInterface[] };
        }
    });
    
    const positionResults = await Promise.all(positionPromises);
    const positionCounts = positionResults.map(r => r.count);
    const profitabilities = positionResults.map(r => r.profitability);
    const positionDetails = positionResults.map(r => r.details);
    
    Logger.clearLine();
    Logger.tradersPositions(USER_ADDRESSES, positionCounts, positionDetails, profitabilities);
};

/**
 * Process a single trader's data (extracted for parallel execution)
 */
const processTrader = async (
    address: string,
    UserActivity: ReturnType<typeof getUserActivityModel>,
    UserPosition: ReturnType<typeof getUserPositionModel>
): Promise<void> => {
    // Calculate cutoff timestamp once per trader (current time - TOO_OLD_TIMESTAMP hours)
    const currentUnix = Math.floor(Date.now() / 1000);
    const cutoffTimestamp = currentUnix - TOO_OLD_TIMESTAMP * 3600;
    
    // Fetch trade activities from Polymarket API with since parameter for efficiency
    // Only fetch trades from the last TOO_OLD_TIMESTAMP hours (older ones would be skipped anyway)
    const apiUrl = `${POLYMARKET_API.DATA_API_BASE}${POLYMARKET_API.ACTIVITY_ENDPOINT}?user=${address}&type=${DB_FIELDS.TYPE_TRADE}&since=${cutoffTimestamp}`;
    const activities = await fetchData<UserActivityInterface[]>(apiUrl);

    if (!Array.isArray(activities) || activities.length === 0) {
        return;
    }
    
    // Check if this is an UpDown trader (short-term crypto price predictions)
    const isUpDown = isUpDownTrader(address);
    const traderName = getTraderName(address);

    // Process each activity
    for (const activity of activities) {
        // Skip if too old
        if (activity.timestamp < cutoffTimestamp) {
            continue;
        }

        // Skip 15-minute UpDown trades if disabled (daily UpDown trades are not affected)
        // This is checked before UpDown trader logic to filter out 15-min noise from all traders
        // Check both title and slug since API may populate either field
        const tradeIdentifier = activity.title || activity.slug || '';
        if (!shouldProcess15MinUpDownTrade(tradeIdentifier)) {
            // Only log once per transaction (silently skip to reduce noise)
            if (!loggedSkipped15MinTrades.has(activity.transactionHash)) {
                loggedSkipped15MinTrades.add(activity.transactionHash);
            }
            continue;
        }

        // Skip 1-hour UpDown trades if disabled (daily UpDown trades are not affected)
        if (!shouldProcess1HourUpDownTrade(tradeIdentifier)) {
            // Only log once per transaction (silently skip to reduce noise)
            if (!loggedSkipped1HourTrades.has(activity.transactionHash)) {
                loggedSkipped1HourTrades.add(activity.transactionHash);
            }
            continue;
        }

        // Special handling for UpDown traders
        if (isUpDown) {
            const tradeAgeSeconds = currentUnix - activity.timestamp;
            
            // For UpDown traders, if trade is older than 15 minutes, skip processing and just log once
            if (tradeAgeSeconds > UPDOWN_STALENESS_THRESHOLD_SECONDS) {
                // Use composite key for better deduplication
                const logKey = getStaleTradeLogKey(address, activity);
                
                // Only log if we haven't logged this logical trade before
                if (!loggedStaleUpDownTrades.has(logKey)) {
                    Logger.info(
                        `⏭️ [UpDown] Skipping stale trade from ${traderName}: ${(tradeAgeSeconds / 60).toFixed(1)}min old (threshold: 15min) - "${activity.title || 'Unknown'}"`
                    );
                    loggedStaleUpDownTrades.add(logKey);
                }
                continue;
            }
            
            // For UpDown traders within 15 minutes, process but don't save to database
            Logger.info(
                `📊 [UpDown] Fresh trade from ${traderName}: ${(tradeAgeSeconds / 60).toFixed(1)}min old - "${activity.title || 'Unknown'}" (not saving to DB)`
            );
            // Note: We skip database save for UpDown traders but the trade will still be
            // picked up by trade executor if it's fresh enough (handled separately)
            continue;
        }

        // Skip database operations if database is unavailable
        if (!isDatabaseAvailable()) {
            const now = Date.now();
            const latency = ((now - activity.timestamp * 1000) / 1000).toFixed(1);
            Logger.info(
                `[${new Date(now).toLocaleString()}] 📡 Trade detected for ${address.slice(0, 6)}...${address.slice(-4)} (DB unavailable, skipping save) - Latency: ${latency}s`
            );
            continue;
        }

        // Check if this trade already exists in database (for non-UpDown traders)
        const existingActivity = await UserActivity.findOne({
            transactionHash: activity.transactionHash,
        }).exec();

        if (existingActivity) {
            continue; // Already processed this trade
        }

        // Save new trade to database (only for non-UpDown traders)
        const newActivity = new UserActivity({
            proxyWallet: activity.proxyWallet,
            timestamp: activity.timestamp,
            conditionId: activity.conditionId,
            type: activity.type,
            size: activity.size,
            usdcSize: activity.usdcSize,
            transactionHash: activity.transactionHash,
            price: activity.price,
            asset: activity.asset,
            side: activity.side,
            outcomeIndex: activity.outcomeIndex,
            title: activity.title,
            slug: activity.slug,
            icon: activity.icon,
            eventSlug: activity.eventSlug,
            outcome: activity.outcome,
            name: activity.name,
            pseudonym: activity.pseudonym,
            bio: activity.bio,
            profileImage: activity.profileImage,
            profileImageOptimized: activity.profileImageOptimized,
            bot: false,
            botExcutedTime: 0,
        });

        await newActivity.save();
        const now = Date.now();
        const latency = ((now - activity.timestamp * 1000) / 1000).toFixed(1);
        Logger.info(
            `[${new Date(now).toLocaleString()}] New trade detected for ${address.slice(0, 6)}...${address.slice(-4)} (Latency: ${latency}s)`
        );
    }

    // Update positions in background (non-blocking for trade detection)
    // Skip if database is unavailable
    if (!isDatabaseAvailable()) {
        return;
    }
    
    const positionsUrl = `${POLYMARKET_API.DATA_API_BASE}${POLYMARKET_API.POSITIONS_ENDPOINT}?user=${address}`;
    fetchData<UserPositionInterface[]>(positionsUrl)
        .then(async (positions) => {
            // Re-check database availability before writing
            if (!isDatabaseAvailable()) {
                return;
            }
            if (Array.isArray(positions) && positions.length > 0) {
                for (const position of positions) {
                    await UserPosition.findOneAndUpdate(
                        { asset: position.asset, conditionId: position.conditionId },
                        {
                            proxyWallet: position.proxyWallet,
                            asset: position.asset,
                            conditionId: position.conditionId,
                            size: position.size,
                            avgPrice: position.avgPrice,
                            initialValue: position.initialValue,
                            currentValue: position.currentValue,
                            cashPnl: position.cashPnl,
                            percentPnl: position.percentPnl,
                            totalBought: position.totalBought,
                            realizedPnl: position.realizedPnl,
                            percentRealizedPnl: position.percentRealizedPnl,
                            curPrice: position.curPrice,
                            redeemable: position.redeemable,
                            mergeable: position.mergeable,
                            title: position.title,
                            slug: position.slug,
                            icon: position.icon,
                            eventSlug: position.eventSlug,
                            outcome: position.outcome,
                            outcomeIndex: position.outcomeIndex,
                            oppositeOutcome: position.oppositeOutcome,
                            oppositeAsset: position.oppositeAsset,
                            endDate: position.endDate,
                            negativeRisk: position.negativeRisk,
                        },
                        { upsert: true }
                    );
                }
            }
        })
        .catch((error) => {
            // Only log if not a connection error (to reduce noise when DB is unavailable)
            if (isDatabaseAvailable()) {
                Logger.warning(`Position update failed for ${address.slice(0, 6)}...${address.slice(-4)}: ${error}`);
            }
        });
};

/**
 * Fetch and process trade data from Polymarket API (parallel with batching)
 */
const BATCH_SIZE = 10; // Process 10 traders in parallel at a time

const fetchTradeData = async (): Promise<void> => {
    // Process traders in batches for parallel execution
    for (let i = 0; i < userModels.length; i += BATCH_SIZE) {
        const batch = userModels.slice(i, i + BATCH_SIZE);

        // Execute batch in parallel
        const results = await Promise.allSettled(
            batch.map(({ address, UserActivity, UserPosition }) =>
                processTrader(address, UserActivity, UserPosition)
            )
        );

        // Log any errors
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const address = batch[index].address;
                Logger.error(
                    `Error fetching data for ${address.slice(0, 6)}...${address.slice(-4)}: ${result.reason}`
                );
            }
        });
    }
};

// Track if this is the first run
let isFirstRun = true;
// Track if monitor should continue running
let isRunning = true;

/**
 * Stop the trade monitor gracefully
 */
export const stopTradeMonitor = (): void => {
    isRunning = false;
    Logger.info('Trade monitor shutdown requested...');
};

/**
 * Main trade monitor function
 * Monitors traders for new trades and updates database
 * 
 * IMPORTANT: This function now waits for historical sync to complete
 * before starting the monitoring loop. The caller should await this
 * function to ensure historical trades are synced before starting
 * the trade executor.
 */
const tradeMonitor = async (): Promise<void> => {
    await init();
    Logger.success(`Monitoring ${USER_ADDRESSES.length} trader(s) every ${FETCH_INTERVAL}s`);
    Logger.separator();

    // On first run, fetch and mark all existing historical trades as already processed
    // This MUST complete BEFORE the trade executor starts to avoid processing old trades
    if (isFirstRun) {
        // Skip historical sync if database is unavailable
        if (!isDatabaseAvailable()) {
            Logger.info('📡 Database unavailable - skipping historical sync');
            isFirstRun = false;
            Logger.separator();
        } else {
            Logger.info('Syncing historical trades (this prevents old trades from being executed)...');
            
            // First, clean up all unprocessed trades from UpDown traders in the database
            // Only query if there are actually unprocessed records (avoid unnecessary writes)
            let totalUpDownCleaned = 0;
            for (const { address, UserActivity } of userModels) {
                if (isUpDownTrader(address)) {
                    try {
                        // First check if there are any unprocessed records
                        const unprocessedCount = await UserActivity.countDocuments({
                            [DB_FIELDS.BOT_EXECUTED]: false
                        }).exec();
                        
                        // Only update if there are records to clean
                        if (unprocessedCount > 0) {
                            const result = await UserActivity.updateMany(
                                { [DB_FIELDS.BOT_EXECUTED]: false },
                                {
                                    $set: {
                                        [DB_FIELDS.BOT_EXECUTED]: true,
                                        [DB_FIELDS.BOT_EXECUTED_TIME]: 999,
                                    },
                                }
                            );
                            totalUpDownCleaned += result.modifiedCount;
                        }
                    } catch (error) {
                        // Ignore DB errors during cleanup
                    }
                }
            }
            if (totalUpDownCleaned > 0) {
                Logger.info(`🧹 Cleaned up ${totalUpDownCleaned} old UpDown trades from database`);
            }
            
            // Fetch all current trades from API and save them as already processed
            const syncStartTime = Date.now();
            let totalSynced = 0;
            // Calculate since timestamp for historical sync (configurable window, default 30 minutes)
            const historicalSinceTimestamp = Math.floor(Date.now() / 1000) - HISTORICAL_SYNC_WINDOW_MINUTES * 60;
            
            for (const { address, UserActivity } of userModels) {
                // Skip database sync for UpDown traders (they don't save to DB)
                if (isUpDownTrader(address)) {
                    continue;
                }
                
                const traderStartTime = Date.now();
                let savedCount = 0;
                
                try {
                    const apiUrl = `${POLYMARKET_API.DATA_API_BASE}${POLYMARKET_API.ACTIVITY_ENDPOINT}?user=${address}&type=${DB_FIELDS.TYPE_TRADE}&since=${historicalSinceTimestamp}`;
                    const activities = await fetchData<UserActivityInterface[]>(apiUrl);
                    
                    if (Array.isArray(activities) && activities.length > 0) {
                        const currentUnix = Math.floor(Date.now() / 1000);
                        const cutoffTimestamp = currentUnix - TOO_OLD_TIMESTAMP * 3600;
                        
                        // Filter activities by timestamp first
                        const validActivities = activities.filter(a => a.timestamp >= cutoffTimestamp);
                        
                        if (validActivities.length > 0) {
                            // Batch query: get all existing transaction hashes in one query
                            const txHashes = validActivities.map(a => a.transactionHash);
                            const existingActivities = await UserActivity.find({
                                transactionHash: { $in: txHashes }
                            }).select('transactionHash').lean().exec();
                            
                            const existingHashes = new Set(existingActivities.map((a: any) => a.transactionHash));
                            
                            // Filter to only new activities
                            const newActivities = validActivities.filter(a => !existingHashes.has(a.transactionHash));
                            
                            // Batch insert all new activities at once
                            if (newActivities.length > 0) {
                                const documents = newActivities.map(activity => ({
                                    proxyWallet: activity.proxyWallet,
                                    timestamp: activity.timestamp,
                                    conditionId: activity.conditionId,
                                    type: activity.type,
                                    size: activity.size,
                                    usdcSize: activity.usdcSize,
                                    transactionHash: activity.transactionHash,
                                    price: activity.price,
                                    asset: activity.asset,
                                    side: activity.side,
                                    outcomeIndex: activity.outcomeIndex,
                                    title: activity.title,
                                    slug: activity.slug,
                                    icon: activity.icon,
                                    eventSlug: activity.eventSlug,
                                    outcome: activity.outcome,
                                    name: activity.name,
                                    pseudonym: activity.pseudonym,
                                    bio: activity.bio,
                                    profileImage: activity.profileImage,
                                    profileImageOptimized: activity.profileImageOptimized,
                                    bot: true,  // Mark as already processed
                                    botExcutedTime: 999,  // Mark as historical
                                }));
                                
                                await UserActivity.insertMany(documents, { ordered: false });
                                savedCount = newActivities.length;
                            }
                        }
                    }
                    
                    if (savedCount > 0) {
                        Logger.info(
                            `Synced ${savedCount} historical trades for ${address.slice(0, 6)}...${address.slice(-4)} (${Date.now() - traderStartTime}ms)`
                        );
                    }
                    totalSynced += savedCount;
                } catch (error) {
                    Logger.warning(`Failed to sync historical trades for ${address.slice(0, 6)}...${address.slice(-4)}`);
                }
            }
        
            Logger.info(`⏱️ Historical sync completed: ${totalSynced} trades synced in ${Date.now() - syncStartTime}ms (window: ${HISTORICAL_SYNC_WINDOW_MINUTES} minutes)`);
        
            // Also mark any existing unprocessed trades in DB (skip UpDown traders)
            for (const { address, UserActivity } of userModels) {
                // Skip UpDown traders as they don't use the database
                if (isUpDownTrader(address)) {
                    continue;
                }
                
                try {
                    await UserActivity.updateMany(
                        { [DB_FIELDS.BOT_EXECUTED]: false },
                        {
                            $set: {
                                [DB_FIELDS.BOT_EXECUTED]: true,
                                [DB_FIELDS.BOT_EXECUTED_TIME]: 999,
                            },
                        }
                    );
                } catch (error) {
                    // Ignore DB errors during initialization
                }
            }
            
            isFirstRun = false;
            Logger.success('Historical trades synced. Trade executor can now safely start.');
            Logger.separator();
        }
    }

    // Start monitoring loop in the background (non-blocking)
    // The historical sync above is complete, so executor can safely start
    setImmediate(() => {
        const monitorLoop = async () => {
            while (isRunning) {
                try {
                    await fetchTradeData();
                } catch (error) {
                    Logger.warning(`Error during trade fetch: ${error instanceof Error ? error.message : String(error)}`);
                }
                if (!isRunning) break;
                await new Promise((resolve) =>
                    setTimeout(resolve, FETCH_INTERVAL * TIME_CONSTANTS.SECOND_MS)
                );
            }
            Logger.info('Trade monitor stopped');
        };
        monitorLoop().catch(err => Logger.error(`Monitor loop error: ${err}`));
    });

    // Return immediately after historical sync is complete
    // This allows the executor to start while monitoring continues in background
    return;
};

export default tradeMonitor;
