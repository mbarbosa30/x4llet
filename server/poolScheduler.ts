import { storage } from './storage';
import { createPublicClient, http, type Address } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getNetworkByChainId } from '../shared/networks';
import { executePoolDraw } from './drawExecutor';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
const DRAW_HOUR_UTC = 0; // Midnight UTC on Sunday
const MIN_CELO_FOR_GAS = BigInt('100000000000000000'); // 0.1 CELO

let lastExecutedDrawKey = '';
let schedulerRunning = false;

function getCurrentWeekInfo() {
  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
  
  const dayOfWeek = now.getUTCDay() || 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
  weekStart.setUTCHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  
  return {
    weekNumber,
    year: now.getUTCFullYear(),
    weekStart,
    weekEnd,
    now,
  };
}

function getPreviousWeekInfo() {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const startOfYear = new Date(Date.UTC(oneWeekAgo.getUTCFullYear(), 0, 1));
  const days = Math.floor((oneWeekAgo.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
  
  const dayOfWeek = oneWeekAgo.getUTCDay() || 7;
  const weekStart = new Date(oneWeekAgo);
  weekStart.setUTCDate(oneWeekAgo.getUTCDate() - dayOfWeek + 1);
  weekStart.setUTCHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  
  return {
    weekNumber,
    year: oneWeekAgo.getUTCFullYear(),
    weekStart,
    weekEnd,
  };
}

function getFacilitatorAccount() {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) {
    return null;
  }
  try {
    const formattedKey = privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}` as `0x${string}`;
    return privateKeyToAccount(formattedKey);
  } catch {
    return null;
  }
}

async function getFacilitatorCeloBalance(): Promise<bigint> {
  try {
    const account = getFacilitatorAccount();
    if (!account) return 0n;
    
    const client = createPublicClient({
      chain: celo,
      transport: http('https://forno.celo.org'),
    });
    return await client.getBalance({ address: account.address });
  } catch (error) {
    console.error('[PoolScheduler] Error getting CELO balance:', error);
    return 0n;
  }
}

async function getFacilitatorAusdcBalance(): Promise<bigint> {
  try {
    const celoNetwork = getNetworkByChainId(42220);
    if (!celoNetwork?.aUsdcAddress) return 0n;
    
    const account = getFacilitatorAccount();
    if (!account) return 0n;
    
    const client = createPublicClient({
      chain: celo,
      transport: http('https://forno.celo.org'),
    });
    
    const balance = await client.readContract({
      address: celoNetwork.aUsdcAddress as Address,
      abi: [{
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      }],
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint;
    
    return balance;
  } catch (error) {
    console.error('[PoolScheduler] Error getting aUSDC balance:', error);
    return 0n;
  }
}

async function ensureCurrentWeekDraw(): Promise<boolean> {
  try {
    const { weekNumber, year, weekStart, weekEnd } = getCurrentWeekInfo();
    
    const existingDraw = await storage.getPoolDraw(weekNumber, year);
    if (existingDraw) {
      return true;
    }
    
    await storage.createPoolDraw({
      weekNumber,
      year,
      weekStart,
      weekEnd,
    });
    
    console.log(`[PoolScheduler] Created draw for week ${weekNumber}/${year}`);
    return true;
  } catch (error) {
    console.error('[PoolScheduler] Error ensuring current week draw:', error);
    return false;
  }
}

function shouldExecuteDraw(): boolean {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hour = now.getUTCHours();
  
  return dayOfWeek === 0 && hour === DRAW_HOUR_UTC;
}

export async function triggerAutomaticDraw(): Promise<{
  success: boolean;
  message: string;
  drawKey?: string;
  error?: string;
  result?: any;
}> {
  const { weekNumber, year } = getPreviousWeekInfo();
  const drawKey = `${weekNumber}-${year}`;
  
  if (lastExecutedDrawKey === drawKey) {
    return {
      success: false,
      message: 'Draw already executed for previous week',
      drawKey,
    };
  }
  
  const draw = await storage.getPoolDraw(weekNumber, year);
  if (!draw) {
    return {
      success: false,
      message: `No draw found for previous week ${weekNumber}/${year}`,
      drawKey,
    };
  }
  
  if (draw.status === 'completed') {
    lastExecutedDrawKey = drawKey;
    return {
      success: false,
      message: 'Draw already completed',
      drawKey,
    };
  }
  
  const account = getFacilitatorAccount();
  if (!account) {
    return {
      success: false,
      message: 'Facilitator private key not configured',
      error: 'FACILITATOR_PRIVATE_KEY missing',
    };
  }
  
  const celoBalance = await getFacilitatorCeloBalance();
  if (celoBalance < MIN_CELO_FOR_GAS) {
    const balanceFormatted = (Number(celoBalance) / 1e18).toFixed(4);
    const minRequired = (Number(MIN_CELO_FOR_GAS) / 1e18).toFixed(4);
    console.error(`[PoolScheduler] ALERT: Insufficient CELO for gas. Balance: ${balanceFormatted} CELO, Required: ${minRequired} CELO. Please replenish facilitator wallet.`);
    return {
      success: false,
      message: `Insufficient CELO for gas (${balanceFormatted} < ${minRequired})`,
      error: 'LOW_GAS_BALANCE',
    };
  }
  
  console.log(`[PoolScheduler] Executing automatic draw for PREVIOUS week ${weekNumber}/${year}...`);
  
  try {
    const result = await executePoolDraw(weekNumber, year, false);
    
    lastExecutedDrawKey = drawKey;
    
    if (result.success) {
      console.log(`[PoolScheduler] Draw executed successfully. Winner: ${result.winner?.address}, Prize: ${result.winner?.prizeFormatted} USDC`);
      return {
        success: true,
        message: `Draw completed for week ${weekNumber}/${year}. Winner: ${result.winner?.address}`,
        drawKey,
        result,
      };
    } else {
      console.log(`[PoolScheduler] Draw execution returned: ${result.error}`);
      return {
        success: false,
        message: result.error || 'Draw execution failed',
        drawKey,
        result,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PoolScheduler] Draw execution error: ${errorMsg}`);
    return {
      success: false,
      message: `Draw execution failed: ${errorMsg}`,
      drawKey,
      error: errorMsg,
    };
  }
}

async function schedulerTick(): Promise<void> {
  try {
    await ensureCurrentWeekDraw();
    
    if (shouldExecuteDraw()) {
      const { weekNumber, year } = getPreviousWeekInfo();
      const drawKey = `${weekNumber}-${year}`;
      
      if (lastExecutedDrawKey !== drawKey) {
        console.log(`[PoolScheduler] Draw time detected (Sunday ${DRAW_HOUR_UTC}:00 UTC) - executing for previous week ${weekNumber}/${year}`);
        const result = await triggerAutomaticDraw();
        console.log(`[PoolScheduler] Trigger result: ${result.message}`);
      }
    }
    
  } catch (error) {
    console.error('[PoolScheduler] Error in scheduler tick:', error);
  }
}

export { getPreviousWeekInfo };

export function startPoolScheduler(): void {
  if (schedulerRunning) {
    console.log('[PoolScheduler] Scheduler already running');
    return;
  }
  
  const account = getFacilitatorAccount();
  if (!account) {
    console.log('[PoolScheduler] Warning: Facilitator private key not configured. Scheduler will not execute draws.');
  }
  
  console.log('[PoolScheduler] Starting pool draw scheduler...');
  console.log(`[PoolScheduler] Draws will execute at Sunday ${DRAW_HOUR_UTC}:00 UTC`);
  
  schedulerTick();
  
  setInterval(schedulerTick, CHECK_INTERVAL_MS);
  
  schedulerRunning = true;
  console.log('[PoolScheduler] Scheduler started, checking every hour');
}

export async function getSchedulerStatus(): Promise<{
  isRunning: boolean;
  isConfigured: boolean;
  nextDrawTime: string;
  hoursUntilDraw: number;
  currentWeekDraw: {
    weekNumber: number;
    year: number;
    status: string;
  } | null;
  lastExecutedDrawKey: string;
  facilitatorBalances: {
    celo: string;
    aUsdc: string;
    hasMinGas: boolean;
  };
}> {
  const { weekNumber, year, weekEnd } = getCurrentWeekInfo();
  
  const nextDrawTime = new Date(weekEnd);
  nextDrawTime.setUTCHours(DRAW_HOUR_UTC, 0, 0, 0);
  nextDrawTime.setUTCDate(nextDrawTime.getUTCDate() + 1);
  
  const hoursUntilDraw = Math.max(0, Math.floor((nextDrawTime.getTime() - Date.now()) / (1000 * 60 * 60)));
  
  const draw = await storage.getPoolDraw(weekNumber, year);
  
  const account = getFacilitatorAccount();
  const isConfigured = account !== null;
  
  const celoBalance = await getFacilitatorCeloBalance();
  const aUsdcBalance = await getFacilitatorAusdcBalance();
  
  return {
    isRunning: schedulerRunning,
    isConfigured,
    nextDrawTime: nextDrawTime.toISOString(),
    hoursUntilDraw,
    currentWeekDraw: draw ? {
      weekNumber: draw.weekNumber,
      year: draw.year,
      status: draw.status,
    } : null,
    lastExecutedDrawKey,
    facilitatorBalances: {
      celo: (Number(celoBalance) / 1e18).toFixed(4),
      aUsdc: (Number(aUsdcBalance) / 1e6).toFixed(2),
      hasMinGas: celoBalance >= MIN_CELO_FOR_GAS,
    },
  };
}
