import { storage } from './storage';
import { runGasScanAndUpdate } from './gasScanner';

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // Run every hour
let schedulerRunning = false;

async function runScan() {
  try {
    console.log('[GasScanScheduler] Starting scheduled gas scan...');
    const total = await runGasScanAndUpdate(storage);
    console.log(`[GasScanScheduler] Scan complete. Total gas sponsored: $${total.toFixed(2)}`);
  } catch (error) {
    console.error('[GasScanScheduler] Error running gas scan:', error);
  }
}

export function startGasScanScheduler() {
  if (schedulerRunning) {
    console.log('[GasScanScheduler] Scheduler already running');
    return;
  }

  console.log('[GasScanScheduler] Starting gas scan scheduler...');
  console.log('[GasScanScheduler] Scans will run every hour');
  
  schedulerRunning = true;
  
  setInterval(() => {
    runScan();
  }, SCAN_INTERVAL_MS);
  
  console.log('[GasScanScheduler] Scheduler started');
}
