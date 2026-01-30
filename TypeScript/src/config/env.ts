import * as dotenv from 'dotenv';
import { CopyStrategy, CopyStrategyConfig, parseTieredMultipliers } from './copyStrategy';
import { ConfigurationError } from '../utils/errors';
dotenv.config();

/**
 * Hardcoded list of known traders to monitor
 * Comment/uncomment addresses to enable/disable tracking specific traders
 */
interface TraderInfo {
    address: string;
    name: string;
    category?: 'UpDown' | 'Politics' | 'Sports' | 'Weather' | 'Other';
}

const KNOWN_TRADERS_INFO: TraderInfo[] = [
    { address: '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', name: 'kch123', category: 'Sports' },
    { address: '0xee00ba338c59557141789b127927a55f5cc5cea1', name: 'S-Works', category: 'Sports' },
    { address: '0x20d6436849f930584892730c7f96ebb2ac763856', name: '0x20D6436849F930584892730C7F96eBB2Ac763856-1768642056357', category: 'Sports' },
    { address: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b', name: 'Car' },
    { address: '0xd218e474776403a330142299f7796e8ba32eb5c9', name: 'cigarettes' },
    { address: '0x6bab41a0dc40d6dd4c1a915b8c01969479fd1292', name: 'Dropper', category: 'Politics' },
    { address: '0xa4b366ad22fc0d06f1e934ff468e8922431a87b8', name: 'HolyMoses7', category: 'Politics' },
    // { address: '0x8545ff3521691618f2d5e4f5460d76186a5023be', name: '1KChallenge' },
    { address: '0x751a2b86cab503496efd325c8344e10159349ea1', name: 'Sharky6999', category: 'UpDown' },
    { address: '0xe9c6312464b52aa3eff13d822b003282075995c9', name: 'kingofcoinflips', category: 'UpDown' },
    { address: '0xd0d6053c3c37e727402d84c14069780d360993aa', name: 'k9Q2mX4L8A7ZP3R', category: 'UpDown' },
    // { address: '0x134240c2a99fa2a1cd9db6fc2caa65043259c997', name: '1j59y6nk' },
    { address: '0xfeb581080aee6dc26c264a647b30a9cd44d5a393', name: 'completion', category: 'UpDown' },
    { address: '0xe3726a1b9c6ba2f06585d1c9e01d00afaedaeb38', name: 'cry.eth2', category: 'Politics' },
    { address: '0x44c1dfe43260c94ed4f1d00de2e1f80fb113ebc1', name: 'aenews2', category: 'Politics' },
    { address: '0x4959175440b8f38229b32f2f036057f6893ea6f5', name: 'Majas' },
    { address: '0x5bffcf561bcae83af680ad600cb99f1184d6ffbe', name: 'YatSen', category: 'Politics' },
    { address: '0x75e765216a57942d738d880ffcda854d9f869080', name: '25usdc' },
    { address: '0xd3989ba133ab48b5b3a81e3dba9b37b5966a46d7', name: 'semi', category: 'Politics' },
    { address: '0x9c5455d1ff77d42fd093511a2e3a5d3d53f8a525', name: 'cramschool', category: 'UpDown' },
    { address: '0xf2f6af4f27ec2dcf4072095ab804016e14cd5817', name: 'gopfan2', category: 'Politics' },
    { address: '0x6139c42e48cf190e67a0a85d492413b499336b7a', name: 'RememberAmalek', category: 'Politics' },
    { address: '0x594edb9112f526fa6a80b8f858a6379c8a2c1c11', name: '0x594e...c1c11', category: 'Weather' },
    { address: '0x9977760c6bd6f824cac834d1a36ee99478d63020', name: 'meropi', category: 'Weather' },
    { address: '0xbdcd1a99e6880b8146f61323dcb799bb5b243e9c', name: '1pixel', category: 'Weather' },
    { address: '0x0f37cb80dee49d55b5f6d9e595d52591d6371410', name: 'Hans323', category: 'Weather' },
    { address: '0xd8f8c13644ea84d62e1ec88c5d1215e436eb0f11', name: 'automatedAItradingbot' },
    { address: '0x9d3e989dd42030664e6157dae42f6d549542c49e', name: '0x9d3e...2c49e', category: 'Weather' },
    { address: '0x6297b93ea37ff92a57fd636410f3b71ebf74517e', name: 'neobrother', category: 'Weather' },
    { address: '0x08cf0b0fec3d42d9920bb0dfbc49fde635088cbc', name: 'HondaCivic', category: 'Weather' },
    { address: '0xb43699cbbb52520952833c10737bc43e7625bb3c', name: 'DOJ', category: 'Sports' },
    { address: '0x3b7ed1242417f4b8f6992b5dd53aa9415a2c23eb', name: 'phdcapital', category: 'Politics' },
    { address: '0x0b219cf3d297991b58361dbebdbaa91e56b8deb6', name: 'TerreMoto', category: 'Politics' },
    { address: '0x589222a5124a96765443b97a3498d89ffd824ad2', name: 'PurpleThunderBicycleMountain', category: 'UpDown' },
    { address: '0x1f0a343513aa6060488fabe96960e6d1e177f7aa', name: 'archaic', category: 'Politics' },
    { address: '0x40e1D00D3A43aF1C4f215bD7A1039cc792AD973f', name: '0x40e1...D973f', category: 'Politics' },
    { address: '0xe00740bce98a594e26861838885ab310ec3b548c', name: 'distinct-baguette', category: 'UpDown' },
    { address: '0x01542a212c9696da5b409cae879143b8966115a8', name: '0x0154...115a8', category: 'UpDown' },
    { address: '0x090a0d3fc9d68d3e16db70e3460e3e4b510801b4', name: 'slight-', category: 'Politics' },
    { address: '0x80f8b674265a2915b51f566c3a011db08ca3abc9', name: 'Atg1', category: 'Politics' },
    { address: '0x6baf05d193692bb208d616709e27442c910a94c5', name: 'SBet365', category: 'Politics' },
    { address: '0x6d7776a0f954be1a7c975a1e8244de6268f7b72c', name: 'humanbeans', category: 'Politics' },
    { address: '0xb6bed94e75c333dae24eb9c80b3fef47ef3cfcfe', name: 'DickTurbin', category: 'Politics' },
    { address: '0x79add3f87e377b0899b935472c07d2c3816ba9f1', name: 'lmtfalone', category: 'Politics' },
    { address: '0x858d551d073e9c647c17079ad9021de830201047', name: 'flipfloppity', category: 'Sports' },
    { address: '0x961afce6bd9aec79c5cf09d2d4dac2b434b23361', name: 'CRYINGLITTLEBABY', category: 'UpDown' },
    // { address: '0x1ff49fdcb6685c94059b65620f43a683be0ce7a5', name: 'ca6859f3c004bff' },
    { address: '0x818f214c7f3e479cce1d964d53fe3db7297558cb', name: 'livebreathevolatility', category: 'UpDown' },
    { address: '0xf247584e41117bbbe4cc06e4d2c95741792a5216', name: '0xf247584e41117bbBe4Cc06E4d2C95741792a5216-1742469835200', category: 'UpDown' },
    { address: '0xd0d6053c3c37e727402d84c14069780d360993aa', name: 'k9Q2mX4L8A7ZP3R', category: 'UpDown' },
    { address: '0x63ce342161250d705dc0b16df89036c8e5f9ba9a', name: '0x8dxd', category: 'UpDown' },
    { address: '0x000d257d2dc7616feaef4ae0f14600fdf50a758e', name: 'scottilicious', category: 'Politics' },
    { address: '0x0b9cae2b0dfe7a71c413e0604eaac1c352f87e44', name: 'MCgenius', category: 'Politics' },
    { address: '0x6954d3e807749511e79f6f6c1cfe53a3be549fd8', name: '0x6954D3E807749511E79F6F6C1cFE53A3BE549fd8', category: 'Politics' },
    { address: '0xd1c769317bd15de7768a70d0214cf0bbcc531d2b', name: '033033033', category: 'Politics' },
    { address: '0x9d84ce0306f8551e02efef1680475fc0f1dc1344', name: 'ImJustKen' },
    { address: '0xca3f77cb090cf7cbcf48bcf865e8f27364418078', name: 'crispy-avocado', category: 'Sports' },
    { address: '0xa9878e59934ab507f9039bcb917c1bae0451141d', name: 'ilovecircle', category: 'Sports' },
    { address: '0x336848a1a1cb00348020c9457676f34d882f21cd', name: '0x3368...f21cd', category: 'UpDown' },
    { address: '0x22e4248bdb066f65c9f11cd66cdd3719a28eef1c', name: 'ProfessionalPunter' },
    { address: '0xcc500cbcc8b7cf5bd21975ebbea34f21b5644c82', name: 'justdance', category: 'UpDown' },
    { address: '0x55be7aa03ecfbe37aa5460db791205f7ac9ddca3', name: 'coinman2', category: 'UpDown' },
    { address: '0xe9c6312464b52aa3eff13d822b003282075995c9', name: 'kingofcoinflips' },
    { address: '0x6031b6eed1c97e853c6e0f03ad3ce3529351f96d', name: 'gabagool22', category: 'UpDown' },
    { address: '0x71a70f24538d885d1b45f9cea158a2cdf2e56fcf', name: 'easyclap', category: 'UpDown' },
    { address: '0xa2f1fecf1cc7db65a46588f764b6691533052d22', name: 'elPolloLoco' },
    { address: '0x16b29c50f2439faf627209b2ac0c7bbddaa8a881', name: 'SeriouslySirius', category: 'Sports' },
    { address: '0x4b92a2d2fd3807981a5dddae7315122530a542e6', name: 'wisser', category: 'Politics' },
    { address: '0x89e75fd541c6cb6549f13e98c78b971c8f3e50e9', name: 'ClaudeAI', category: 'Politics' },
    { address: '0x204f72f35326db932158cba6adff0b9a1da95e14', name: 'swisstony', category: 'Sports' },
];

// Create address to name mapping for quick lookup
const TRADER_NAME_MAP: Map<string, string> = new Map(
    KNOWN_TRADERS_INFO.map(t => [t.address.toLowerCase(), t.name])
);

// Create address to category mapping for quick lookup
const TRADER_CATEGORY_MAP: Map<string, string> = new Map(
    KNOWN_TRADERS_INFO
        .filter(t => t.category)
        .map(t => [t.address.toLowerCase(), t.category!])
);

// Set of UpDown trader addresses for quick lookup
const UPDOWN_TRADERS: Set<string> = new Set(
    KNOWN_TRADERS_INFO
        .filter(t => t.category === 'UpDown')
        .map(t => t.address.toLowerCase())
);

// Extract just the addresses for backward compatibility
const KNOWN_TRADERS: string[] = KNOWN_TRADERS_INFO.map(t => t.address);

/**
 * Validate Ethereum address format
 */
const isValidEthereumAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate required environment variables
 */
const validateRequiredEnv = (): void => {
    // USER_ADDRESSES is now hardcoded in KNOWN_TRADERS, no longer required in .env
    const required = [
        'PROXY_WALLET',
        'PRIVATE_KEY',
        'CLOB_HTTP_URL',
        'CLOB_WS_URL',
        'MONGO_URI',
        'RPC_URL',
        'USDC_CONTRACT_ADDRESS',
    ];

    const missing: string[] = [];
    for (const key of required) {
        if (!process.env[key]) {
            missing.push(key);
        }
    }

    if (missing.length > 0) {
        console.error('\n❌ Configuration Error: Missing required environment variables\n');
        console.error(`Missing variables: ${missing.join(', ')}\n`);
        console.error('🔧 Quick fix:');
        console.error('   1. Run the setup wizard: npm run setup');
        console.error('   2. Or manually create .env file with all required variables\n');
        console.error('📖 See docs/QUICK_START.md for detailed instructions\n');
        throw new ConfigurationError(
            `Missing required environment variables: ${missing.join(', ')}`
        );
    }
};

/**
 * Validate Ethereum addresses
 */
const validateAddresses = (): void => {
    if (process.env.PROXY_WALLET && !isValidEthereumAddress(process.env.PROXY_WALLET)) {
        console.error('\n❌ Invalid Wallet Address\n');
        console.error(`Your PROXY_WALLET: ${process.env.PROXY_WALLET}`);
        console.error('Expected format:    0x followed by 40 hexadecimal characters\n');
        console.error('Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0\n');
        console.error('💡 Tips:');
        console.error('   • Copy your wallet address from MetaMask');
        console.error('   • Make sure it starts with 0x');
        console.error('   • Should be exactly 42 characters long\n');
        throw new ConfigurationError(
            `Invalid PROXY_WALLET address format: ${process.env.PROXY_WALLET}`
        );
    }

    if (
        process.env.USDC_CONTRACT_ADDRESS &&
        !isValidEthereumAddress(process.env.USDC_CONTRACT_ADDRESS)
    ) {
        console.error('\n❌ Invalid USDC Contract Address\n');
        console.error(`Current value: ${process.env.USDC_CONTRACT_ADDRESS}`);
        console.error('Default value: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174\n');
        console.error('⚠️  Unless you know what you\'re doing, use the default value!\n');
        throw new ConfigurationError(
            `Invalid USDC_CONTRACT_ADDRESS format: ${process.env.USDC_CONTRACT_ADDRESS}`
        );
    }
};

/**
 * Validate numeric configuration values
 */
const validateNumericConfig = (): void => {
    const fetchInterval = parseInt(process.env.FETCH_INTERVAL || '1', 10);
    if (isNaN(fetchInterval) || fetchInterval <= 0) {
        throw new ConfigurationError(
            `Invalid FETCH_INTERVAL: ${process.env.FETCH_INTERVAL}. Must be a positive integer.`
        );
    }

    const retryLimit = parseInt(process.env.RETRY_LIMIT || '3', 10);
    if (isNaN(retryLimit) || retryLimit < 1 || retryLimit > 10) {
        throw new ConfigurationError(
            `Invalid RETRY_LIMIT: ${process.env.RETRY_LIMIT}. Must be between 1 and 10.`
        );
    }

    const tooOldTimestamp = parseInt(process.env.TOO_OLD_TIMESTAMP || '24', 10);
    if (isNaN(tooOldTimestamp) || tooOldTimestamp < 1) {
        throw new ConfigurationError(
            `Invalid TOO_OLD_TIMESTAMP: ${process.env.TOO_OLD_TIMESTAMP}. Must be a positive integer (hours).`
        );
    }

    const requestTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10);
    if (isNaN(requestTimeout) || requestTimeout < 1000) {
        throw new ConfigurationError(
            `Invalid REQUEST_TIMEOUT_MS: ${process.env.REQUEST_TIMEOUT_MS}. Must be at least 1000ms.`
        );
    }

    const networkRetryLimit = parseInt(process.env.NETWORK_RETRY_LIMIT || '3', 10);
    if (isNaN(networkRetryLimit) || networkRetryLimit < 1 || networkRetryLimit > 10) {
        throw new ConfigurationError(
            `Invalid NETWORK_RETRY_LIMIT: ${process.env.NETWORK_RETRY_LIMIT}. Must be between 1 and 10.`
        );
    }
};

/**
 * Validate URL formats
 */
const validateUrls = (): void => {
    if (process.env.CLOB_HTTP_URL && !process.env.CLOB_HTTP_URL.startsWith('http')) {
        console.error('\n❌ Invalid CLOB_HTTP_URL\n');
        console.error(`Current value: ${process.env.CLOB_HTTP_URL}`);
        console.error('Default value: https://clob.polymarket.com/\n');
        console.error('⚠️  Use the default value unless you have a specific reason to change it!\n');
        throw new ConfigurationError(
            `Invalid CLOB_HTTP_URL: ${process.env.CLOB_HTTP_URL}. Must be a valid HTTP/HTTPS URL.`
        );
    }

    if (process.env.CLOB_WS_URL && !process.env.CLOB_WS_URL.startsWith('ws')) {
        console.error('\n❌ Invalid CLOB_WS_URL\n');
        console.error(`Current value: ${process.env.CLOB_WS_URL}`);
        console.error('Default value: wss://ws-subscriptions-clob.polymarket.com/ws\n');
        console.error('⚠️  Use the default value unless you have a specific reason to change it!\n');
        throw new ConfigurationError(
            `Invalid CLOB_WS_URL: ${process.env.CLOB_WS_URL}. Must be a valid WebSocket URL (ws:// or wss://).`
        );
    }

    if (process.env.RPC_URL && !process.env.RPC_URL.startsWith('http')) {
        console.error('\n❌ Invalid RPC_URL\n');
        console.error(`Current value: ${process.env.RPC_URL}`);
        console.error('Must start with: http:// or https://\n');
        console.error('💡 Get a free RPC endpoint from:');
        console.error('   • Infura:  https://infura.io');
        console.error('   • Alchemy: https://www.alchemy.com');
        console.error('   • Ankr:    https://www.ankr.com\n');
        console.error('Example: https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID\n');
        throw new ConfigurationError(
            `Invalid RPC_URL: ${process.env.RPC_URL}. Must be a valid HTTP/HTTPS URL.`
        );
    }

    if (process.env.MONGO_URI && !process.env.MONGO_URI.startsWith('mongodb')) {
        console.error('\n❌ Invalid MONGO_URI\n');
        console.error(`Current value: ${process.env.MONGO_URI}`);
        console.error('Must start with: mongodb:// or mongodb+srv://\n');
        console.error('💡 Setup MongoDB Atlas (free):');
        console.error('   1. Visit https://www.mongodb.com/cloud/atlas/register');
        console.error('   2. Create a free cluster');
        console.error('   3. Create database user with password');
        console.error('   4. Whitelist IP: 0.0.0.0/0 (or your IP)');
        console.error('   5. Get connection string from "Connect" button\n');
        console.error('Example: mongodb+srv://username:password@cluster.mongodb.net/database\n');
        throw new ConfigurationError(
            `Invalid MONGO_URI: ${process.env.MONGO_URI}. Must be a valid MongoDB connection string.`
        );
    }
};

// Run all validations
validateRequiredEnv();
validateAddresses();
validateNumericConfig();
validateUrls();

// Parse USER_ADDRESSES: supports both comma-separated string and JSON array
const parseUserAddresses = (input: string): string[] => {
    const trimmed = input.trim();
    // Check if it's JSON array format
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                const addresses = parsed
                    .map((addr) => addr.toLowerCase().trim())
                    .filter((addr) => addr.length > 0);
                // Validate each address
                for (const addr of addresses) {
                    if (!isValidEthereumAddress(addr)) {
                        console.error('\n❌ Invalid Trader Address in USER_ADDRESSES\n');
                        console.error(`Invalid address: ${addr}`);
                        console.error('Expected format: 0x followed by 40 hexadecimal characters\n');
                        console.error('💡 Where to find trader addresses:');
                        console.error('   • Polymarket Leaderboard: https://polymarket.com/leaderboard');
                        console.error('   • Predictfolio: https://predictfolio.com\n');
                        console.error('Example: USER_ADDRESSES=\'0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b\'\n');
                        throw new ConfigurationError(
                            `Invalid Ethereum address in USER_ADDRESSES: ${addr}`
                        );
                    }
                }
                return addresses;
            }
        } catch (e) {
            if (e instanceof Error && e.message.includes('Invalid Ethereum address')) {
                throw e;
            }
            throw new ConfigurationError(
                `Invalid JSON format for USER_ADDRESSES: ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }
    // Otherwise treat as comma-separated
    const addresses = trimmed
        .split(',')
        .map((addr) => addr.toLowerCase().trim())
        .filter((addr) => addr.length > 0);
    // Validate each address
    for (const addr of addresses) {
        if (!isValidEthereumAddress(addr)) {
            console.error('\n❌ Invalid Trader Address in USER_ADDRESSES\n');
            console.error(`Invalid address: ${addr}`);
            console.error('Expected format: 0x followed by 40 hexadecimal characters\n');
            console.error('💡 Where to find trader addresses:');
            console.error('   • Polymarket Leaderboard: https://polymarket.com/leaderboard');
            console.error('   • Predictfolio: https://predictfolio.com\n');
            console.error('Example: USER_ADDRESSES=\'0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b\'\n');
            throw new ConfigurationError(
                `Invalid Ethereum address in USER_ADDRESSES: ${addr}`
            );
        }
    }
    return addresses;
};

// Parse copy strategy configuration
const parseCopyStrategy = (): CopyStrategyConfig => {
    // Support legacy COPY_PERCENTAGE + TRADE_MULTIPLIER for backward compatibility
    const hasLegacyConfig = process.env.COPY_PERCENTAGE && !process.env.COPY_STRATEGY;

    if (hasLegacyConfig) {
        console.warn(
            '⚠️  Using legacy COPY_PERCENTAGE configuration. Consider migrating to COPY_STRATEGY.'
        );
        const copyPercentage = parseFloat(process.env.COPY_PERCENTAGE || '10.0');
        const tradeMultiplier = parseFloat(process.env.TRADE_MULTIPLIER || '1.0');
        const effectivePercentage = copyPercentage * tradeMultiplier;

        const config: CopyStrategyConfig = {
            strategy: CopyStrategy.PERCENTAGE,
            copySize: effectivePercentage,
            maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '100.0'),
            minOrderSizeUSD: parseFloat(process.env.MIN_ORDER_SIZE_USD || '1.0'),
            maxPositionSizeUSD: process.env.MAX_POSITION_SIZE_USD
                ? parseFloat(process.env.MAX_POSITION_SIZE_USD)
                : undefined,
            maxDailyVolumeUSD: process.env.MAX_DAILY_VOLUME_USD
                ? parseFloat(process.env.MAX_DAILY_VOLUME_USD)
                : undefined,
        };

        // Parse tiered multipliers if configured (even for legacy mode)
        if (process.env.TIERED_MULTIPLIERS) {
            try {
                config.tieredMultipliers = parseTieredMultipliers(process.env.TIERED_MULTIPLIERS);
                console.log(`✓ Loaded ${config.tieredMultipliers.length} tiered multipliers`);
            } catch (error) {
                throw new ConfigurationError(
                    `Failed to parse TIERED_MULTIPLIERS: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        } else if (tradeMultiplier !== 1.0) {
            // If using legacy single multiplier, store it
            config.tradeMultiplier = tradeMultiplier;
        }

        return config;
    }

    // Parse new copy strategy configuration
    const strategyStr = (process.env.COPY_STRATEGY || 'PERCENTAGE').toUpperCase();
    const strategy =
        CopyStrategy[strategyStr as keyof typeof CopyStrategy] || CopyStrategy.PERCENTAGE;

    const config: CopyStrategyConfig = {
        strategy,
        copySize: parseFloat(process.env.COPY_SIZE || '10.0'),
        maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '100.0'),
        minOrderSizeUSD: parseFloat(process.env.MIN_ORDER_SIZE_USD || '1.0'),
        maxPositionSizeUSD: process.env.MAX_POSITION_SIZE_USD
            ? parseFloat(process.env.MAX_POSITION_SIZE_USD)
            : undefined,
        maxDailyVolumeUSD: process.env.MAX_DAILY_VOLUME_USD
            ? parseFloat(process.env.MAX_DAILY_VOLUME_USD)
            : undefined,
    };

    // Add adaptive strategy parameters if applicable
    if (strategy === CopyStrategy.ADAPTIVE) {
        config.adaptiveMinPercent = parseFloat(
            process.env.ADAPTIVE_MIN_PERCENT || config.copySize.toString()
        );
        config.adaptiveMaxPercent = parseFloat(
            process.env.ADAPTIVE_MAX_PERCENT || config.copySize.toString()
        );
        config.adaptiveThreshold = parseFloat(process.env.ADAPTIVE_THRESHOLD_USD || '500.0');
    }

    // Parse tiered multipliers if configured
    if (process.env.TIERED_MULTIPLIERS) {
        try {
            config.tieredMultipliers = parseTieredMultipliers(process.env.TIERED_MULTIPLIERS);
            console.log(`✓ Loaded ${config.tieredMultipliers.length} tiered multipliers`);
        } catch (error) {
            throw new ConfigurationError(
                `Failed to parse TIERED_MULTIPLIERS: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    } else if (process.env.TRADE_MULTIPLIER) {
        // Fall back to single multiplier if no tiers configured
        const singleMultiplier = parseFloat(process.env.TRADE_MULTIPLIER);
        if (singleMultiplier !== 1.0) {
            config.tradeMultiplier = singleMultiplier;
            console.log(`✓ Using single trade multiplier: ${singleMultiplier}x`);
        }
    }

    return config;
};

export const ENV = {
    // Use hardcoded KNOWN_TRADERS list instead of .env
    // To modify tracked traders, edit the KNOWN_TRADERS array at the top of this file
    USER_ADDRESSES: KNOWN_TRADERS.map(addr => addr.toLowerCase()),
    PROXY_WALLET: process.env.PROXY_WALLET as string,
    PRIVATE_KEY: process.env.PRIVATE_KEY as string,
    CLOB_HTTP_URL: process.env.CLOB_HTTP_URL as string,
    CLOB_WS_URL: process.env.CLOB_WS_URL as string,
    FETCH_INTERVAL: parseInt(process.env.FETCH_INTERVAL || '1', 10),
    TOO_OLD_TIMESTAMP: parseInt(process.env.TOO_OLD_TIMESTAMP || '24', 10),
    RETRY_LIMIT: parseInt(process.env.RETRY_LIMIT || '3', 10),
    // Legacy parameters (kept for backward compatibility)
    TRADE_MULTIPLIER: parseFloat(process.env.TRADE_MULTIPLIER || '1.0'),
    COPY_PERCENTAGE: parseFloat(process.env.COPY_PERCENTAGE || '10.0'),
    // New copy strategy configuration
    COPY_STRATEGY_CONFIG: parseCopyStrategy(),
    // Network settings
    REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10),
    NETWORK_RETRY_LIMIT: parseInt(process.env.NETWORK_RETRY_LIMIT || '3', 10),
    // Trade aggregation settings
    TRADE_AGGREGATION_ENABLED: process.env.TRADE_AGGREGATION_ENABLED === 'true',
    TRADE_AGGREGATION_WINDOW_SECONDS: parseInt(
        process.env.TRADE_AGGREGATION_WINDOW_SECONDS || '300',
        10
    ), // 5 minutes default
    // 15-minute UpDown trades setting (default: disabled to reduce noise)
    ENABLE_15MIN_UPDOWN_TRADES: process.env.ENABLE_15MIN_UPDOWN_TRADES === 'true',
    MONGO_URI: process.env.MONGO_URI as string,
    RPC_URL: process.env.RPC_URL as string,
    USDC_CONTRACT_ADDRESS: process.env.USDC_CONTRACT_ADDRESS as string,
};

/**
 * Get trader name by address
 * @param address The trader's wallet address
 * @returns The trader's name or formatted address if not found
 */
export const getTraderName = (address: string): string => {
    return TRADER_NAME_MAP.get(address.toLowerCase()) || `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Format address with name if available
 * @param address The trader's wallet address
 * @returns Formatted string like "0x204f...5e14 (swisstony)" or just "0x204f...5e14"
 */
export const formatAddressWithName = (address: string): string => {
    const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const name = TRADER_NAME_MAP.get(address.toLowerCase());
    return name ? `${shortAddr} (${name})` : shortAddr;
};

/**
 * Check if a trader is an UpDown trader (short-term crypto price predictions)
 * UpDown traders focus on 15-minute crypto price predictions which are time-sensitive
 * @param address The trader's wallet address
 * @returns true if the trader is categorized as UpDown
 */
export const isUpDownTrader = (address: string): boolean => {
    return UPDOWN_TRADERS.has(address.toLowerCase());
};

/**
 * Get trader category
 * @param address The trader's wallet address
 * @returns The trader's category or undefined if not set
 */
export const getTraderCategory = (address: string): string | undefined => {
    return TRADER_CATEGORY_MAP.get(address.toLowerCase());
};

/**
 * UpDown trade staleness threshold in seconds (15 minutes)
 * Trades older than this are considered too stale to copy for UpDown traders
 */
export const UPDOWN_STALENESS_THRESHOLD_SECONDS = 15 * 60; // 15 minutes

/**
 * Check if a trade slug is a 15-minute UpDown prediction
 * 15-minute UpDown trades have time ranges like "2:30AM-2:45AM" in the slug
 * Daily UpDown trades don't have time ranges, just dates like "January 30"
 * @param slug The trade slug or title
 * @returns true if it's a 15-minute interval UpDown trade
 */
export const is15MinuteUpDownTrade = (slug: string | undefined): boolean => {
    if (!slug) return false;
    
    // Check if it contains "Up or Down" (case insensitive)
    const lowerSlug = slug.toLowerCase();
    if (!lowerSlug.includes('up or down') && !lowerSlug.includes('updown')) {
        return false;
    }
    
    // 15-minute trades have time ranges like "2:30AM-2:45AM", "11:00PM-11:15PM"
    // Pattern: digit(s):digit(s)AM/PM-digit(s):digit(s)AM/PM
    const timeRangePattern = /\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)/i;
    return timeRangePattern.test(slug);
};

/**
 * Check if a 15-minute UpDown trade should be processed based on configuration
 * @param slug The trade slug or title
 * @returns true if the trade should be processed, false if it should be skipped
 */
export const shouldProcess15MinUpDownTrade = (slug: string | undefined): boolean => {
    // If it's not a 15-minute UpDown trade, always process it
    if (!is15MinuteUpDownTrade(slug)) {
        return true;
    }
    
    // If it is a 15-minute UpDown trade, check the configuration
    return ENV.ENABLE_15MIN_UPDOWN_TRADES;
};
