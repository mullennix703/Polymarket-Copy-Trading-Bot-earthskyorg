#!/usr/bin/env node
/**
 * Clean old log files script
 * 
 * This script removes ALL old log files except today's log.
 * Run manually to clean up disk space.
 * 
 * Usage: npm run clean-logs
 */

import * as fs from 'fs';
import * as path from 'path';

const LOGS_DIR = path.join(process.cwd(), 'logs');

const cleanOldLogs = () => {
    console.log('🧹 Starting log cleanup...\n');
    
    if (!fs.existsSync(LOGS_DIR)) {
        console.log('❌ Logs directory does not exist:', LOGS_DIR);
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayLogFile = `bot-${today}.log`;
    const files = fs.readdirSync(LOGS_DIR);
    let deletedCount = 0;
    let deletedSize = 0;

    console.log('📊 Current log files:');
    
    // Process all log files
    files.forEach(file => {
        if (file.startsWith('bot-') && file.endsWith('.log')) {
            const filePath = path.join(LOGS_DIR, file);
            const stats = fs.statSync(filePath);
            const sizeInMB = stats.size / (1024 * 1024);
            const sizeStr = sizeInMB.toFixed(2);

            // Keep today's log, delete everything else
            if (file === todayLogFile) {
                console.log(`   ✅ KEEP ${file} (today's log, ${sizeStr} MB)`);
            } else {
                console.log(`   🗑️  DELETE ${file} (${sizeStr} MB)`);
            }
        }
    });

    console.log('');

    // Delete old files
    files.forEach(file => {
        if (file.startsWith('bot-') && file.endsWith('.log') && file !== todayLogFile) {
            const filePath = path.join(LOGS_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                const sizeInMB = stats.size / (1024 * 1024);
                fs.unlinkSync(filePath);
                deletedCount++;
                deletedSize += sizeInMB;
                console.log(`   ✓ Deleted: ${file}`);
            } catch (error) {
                console.error(`   ✗ Failed to delete ${file}:`, error);
            }
        }
    });

    console.log('');
    console.log('✨ Cleanup complete:');
    console.log(`   Files deleted: ${deletedCount}`);
    console.log(`   Space freed: ${deletedSize.toFixed(2)} MB`);
    console.log(`   Files remaining: 1 (today's log)`);
};

// Run cleanup
try {
    cleanOldLogs();
} catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
}
