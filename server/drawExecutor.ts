import { storage } from './storage';
import { createPublicClient, createWalletClient, http, getAddress, type Address } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getNetworkByChainId } from '../shared/networks';
import { randomUUID } from 'crypto';

export interface DrawResult {
  success: boolean;
  dryRun?: boolean;
  error?: string;
  winner?: {
    address: string;
    yieldTickets: string;
    referralBonus: string;
    totalTickets: string;
    prize: string;
    prizeFormatted: string;
    prizeTxHash?: string;
  };
  collection?: {
    attempted: number;
    successful: number;
    failed: number;
    totalCollected: string;
    results: Array<{ address: string; amount: string; txHash?: string; error?: string }>;
  };
  totalParticipants: number;
  totalTickets: string;
  totalPrizePool: string;
  sponsoredPool: string;
  winningNumber: string;
  unapprovedUsers: number;
  participantsWithInsufficientAllowance?: number;
}

function getCurrentWeekInfo() {
  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
  return { weekNumber, year: now.getUTCFullYear() };
}

function getFacilitatorAccount() {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('FACILITATOR_PRIVATE_KEY not configured');
  }
  const formattedKey = privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}` as `0x${string}`;
  return privateKeyToAccount(formattedKey);
}

async function getFacilitatorAusdcBalance(): Promise<bigint> {
  try {
    const celoNetwork = getNetworkByChainId(42220);
    if (!celoNetwork?.aUsdcAddress) return 0n;
    
    const account = getFacilitatorAccount();
    const client = createPublicClient({
      chain: celo,
      transport: http('https://forno.celo.org'),
    });
    
    return await client.readContract({
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
  } catch {
    return 0n;
  }
}

async function getAaveUsersInterest(addresses: string[]): Promise<Map<string, { interest: bigint; totalBalance: bigint; principal: bigint }>> {
  const results = new Map<string, { interest: bigint; totalBalance: bigint; principal: bigint }>();
  
  const celoNetwork = getNetworkByChainId(42220);
  if (!celoNetwork?.aUsdcAddress) return results;
  
  const client = createPublicClient({
    chain: celo,
    transport: http(celoNetwork.rpcUrl),
  });
  
  for (const addr of addresses) {
    try {
      const normalizedAddress = getAddress(addr);
      const aUsdcAddress = celoNetwork.aUsdcAddress as Address;
      
      const totalBalance = await client.readContract({
        address: aUsdcAddress,
        abi: [{
          inputs: [{ name: 'account', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        }],
        functionName: 'balanceOf',
        args: [normalizedAddress],
      }) as bigint;
      
      const snapshot = await storage.getYieldSnapshot(addr.toLowerCase());
      let netDeposits = BigInt(snapshot?.netDeposits || '0');
      
      if (netDeposits === 0n && totalBalance > 0n) {
        netDeposits = totalBalance;
        await storage.upsertYieldSnapshot(addr.toLowerCase(), {
          netDeposits: totalBalance.toString(),
          lastAusdcBalance: totalBalance.toString(),
          isFirstWeek: true,
        });
      }
      
      const interest = totalBalance > netDeposits ? totalBalance - netDeposits : 0n;
      
      results.set(addr.toLowerCase(), {
        interest,
        totalBalance,
        principal: netDeposits,
      });
    } catch (err) {
      console.error(`[DrawExecutor] Error fetching interest for ${addr}:`, err);
    }
  }
  
  return results;
}

export async function executePoolDraw(weekNumber: number, year: number, dryRun: boolean = false): Promise<DrawResult> {
  const draw = await storage.getPoolDraw(weekNumber, year);
  if (!draw) {
    return {
      success: false,
      error: 'Draw not found',
      totalParticipants: 0,
      totalTickets: '0',
      totalPrizePool: '0',
      sponsoredPool: '0',
      winningNumber: '0',
      unapprovedUsers: 0,
    };
  }
  
  if (draw.status === 'completed') {
    return {
      success: false,
      error: 'Draw already completed',
      totalParticipants: 0,
      totalTickets: '0',
      totalPrizePool: '0',
      sponsoredPool: '0',
      winningNumber: '0',
      unapprovedUsers: 0,
    };
  }
  
  const celoNetwork = getNetworkByChainId(42220);
  if (!celoNetwork?.aUsdcAddress) {
    throw new Error('Celo aUSDC address not configured');
  }
  const CELO_AUSDC_ADDRESS = getAddress(celoNetwork.aUsdcAddress);
  
  const allSettings = await storage.getAllPoolSettings();
  const approvedUsers = allSettings.filter(s => s.optInPercent > 0 && s.facilitatorApproved);
  const unapprovedUsers = allSettings.filter(s => s.optInPercent > 0 && !s.facilitatorApproved);
  
  if (approvedUsers.length === 0) {
    return {
      success: false,
      error: 'No approved participants in this draw',
      totalParticipants: 0,
      totalTickets: '0',
      totalPrizePool: '0',
      sponsoredPool: '0',
      winningNumber: '0',
      unapprovedUsers: unapprovedUsers.length,
    };
  }
  
  const client = createPublicClient({
    chain: celo,
    transport: http('https://forno.celo.org'),
  });
  
  const facilitatorAccount = getFacilitatorAccount();
  
  const allReferrals = await storage.getAllReferrals();
  const refereeToReferrer = new Map<string, string>();
  for (const ref of allReferrals) {
    refereeToReferrer.set(ref.refereeAddress.toLowerCase(), ref.referrerAddress.toLowerCase());
  }
  
  const addresses = approvedUsers.map(s => s.walletAddress);
  const interestMap = await getAaveUsersInterest(addresses);
  
  const allSnapshots = await storage.getAllYieldSnapshots();
  const snapshotMap = new Map<string, typeof allSnapshots[0]>();
  for (const snap of allSnapshots) {
    snapshotMap.set(snap.walletAddress.toLowerCase(), snap);
  }
  
  const participantData: {
    address: string;
    totalBalance: bigint;
    principal: bigint;
    actualInterest: bigint;
    weeklyYield: bigint;
    contribution: bigint;
    allowance: bigint;
    hasEnoughAllowance: boolean;
  }[] = [];
  
  for (const settings of approvedUsers) {
    try {
      const addr = settings.walletAddress.toLowerCase();
      const interestData = interestMap.get(addr);
      
      if (!interestData) continue;
      
      const totalAccrued = interestData.interest;
      const snapshot = snapshotMap.get(addr);
      const isFirstWeek = snapshot?.isFirstWeek ?? true;
      const snapshotYield = BigInt(snapshot?.snapshotYield || '0');
      
      let weeklyYield: bigint;
      if (isFirstWeek) {
        weeklyYield = totalAccrued;
      } else {
        weeklyYield = totalAccrued > snapshotYield ? totalAccrued - snapshotYield : 0n;
      }
      
      if (weeklyYield === 0n) continue;
      
      const contribution = (weeklyYield * BigInt(settings.optInPercent)) / 100n;
      if (contribution === 0n) continue;
      
      const userAddress = getAddress(settings.walletAddress);
      const allowance = await client.readContract({
        address: CELO_AUSDC_ADDRESS,
        abi: [{
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
          ],
          name: 'allowance',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        }],
        functionName: 'allowance',
        args: [userAddress, facilitatorAccount.address],
      }) as bigint;
      
      participantData.push({
        address: addr,
        totalBalance: interestData.totalBalance,
        principal: interestData.principal,
        actualInterest: totalAccrued,
        weeklyYield,
        contribution,
        allowance,
        hasEnoughAllowance: allowance >= contribution,
      });
    } catch (error) {
      console.error(`[DrawExecutor] Error processing ${settings.walletAddress}:`, error);
    }
  }
  
  const contributionMap = new Map<string, bigint>();
  for (const p of participantData) {
    contributionMap.set(p.address, p.contribution);
  }
  
  const referralBonusMap = new Map<string, bigint>();
  for (const [participantAddr, contribution] of contributionMap) {
    const referrerAddr = refereeToReferrer.get(participantAddr);
    if (referrerAddr && contribution > 0n) {
      const bonus = contribution / 10n;
      referralBonusMap.set(referrerAddr, (referralBonusMap.get(referrerAddr) || 0n) + bonus);
    }
  }
  
  const participantTickets: {
    address: string;
    yieldTickets: bigint;
    referralBonus: bigint;
    totalTickets: bigint;
    yieldToCollect: bigint;
    hasEnoughAllowance: boolean;
  }[] = [];
  
  const allParticipantAddresses = new Set([...contributionMap.keys(), ...referralBonusMap.keys()]);
  for (const addr of allParticipantAddresses) {
    const participantInfo = participantData.find(p => p.address === addr);
    const yieldTickets = contributionMap.get(addr) || 0n;
    const referralBonus = referralBonusMap.get(addr) || 0n;
    const totalTickets = yieldTickets + referralBonus;
    
    if (totalTickets > 0n) {
      participantTickets.push({
        address: addr,
        yieldTickets,
        referralBonus,
        totalTickets,
        yieldToCollect: participantInfo?.contribution || 0n,
        hasEnoughAllowance: participantInfo?.hasEnoughAllowance ?? false,
      });
    }
  }
  
  if (participantTickets.length === 0) {
    return {
      success: false,
      error: 'No participants with tickets in this draw',
      totalParticipants: 0,
      totalTickets: '0',
      totalPrizePool: '0',
      sponsoredPool: '0',
      winningNumber: '0',
      unapprovedUsers: unapprovedUsers.length,
    };
  }
  
  const collectableParticipants = participantTickets.filter(p => p.hasEnoughAllowance && p.yieldToCollect > 0n);
  const totalTickets = participantTickets.reduce((sum, p) => sum + p.totalTickets, 0n);
  const totalYieldToCollect = collectableParticipants.reduce((sum, p) => sum + p.yieldToCollect, 0n);
  const sponsoredPool = await getFacilitatorAusdcBalance();
  const totalPrizePool = totalYieldToCollect + sponsoredPool;
  
  const randomBytes = randomUUID().replace(/-/g, '');
  const randomBigInt = BigInt('0x' + randomBytes) % totalTickets;
  
  let cumulative = 0n;
  let winner = participantTickets[0];
  for (const participant of participantTickets) {
    cumulative += participant.totalTickets;
    if (randomBigInt < cumulative) {
      winner = participant;
      break;
    }
  }
  
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      winner: {
        address: winner.address,
        yieldTickets: winner.yieldTickets.toString(),
        referralBonus: winner.referralBonus.toString(),
        totalTickets: winner.totalTickets.toString(),
        prize: totalPrizePool.toString(),
        prizeFormatted: (Number(totalPrizePool) / 1_000_000).toFixed(2),
      },
      totalParticipants: participantTickets.length,
      totalTickets: totalTickets.toString(),
      totalPrizePool: totalPrizePool.toString(),
      sponsoredPool: sponsoredPool.toString(),
      winningNumber: randomBigInt.toString(),
      unapprovedUsers: unapprovedUsers.length,
      participantsWithInsufficientAllowance: participantTickets.filter(p => !p.hasEnoughAllowance).length,
    };
  }
  
  const walletClient = createWalletClient({
    chain: celo,
    account: facilitatorAccount,
    transport: http('https://forno.celo.org'),
  });
  
  const collectionResults: { address: string; amount: string; txHash?: string; error?: string }[] = [];
  let totalCollected = 0n;
  
  for (const participant of collectableParticipants) {
    try {
      const transferFromTx = await walletClient.writeContract({
        address: CELO_AUSDC_ADDRESS,
        abi: [{
          inputs: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          name: 'transferFrom',
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function',
        }],
        functionName: 'transferFrom',
        args: [getAddress(participant.address), facilitatorAccount.address, participant.yieldToCollect],
      });
      
      await client.waitForTransactionReceipt({ hash: transferFromTx });
      
      collectionResults.push({
        address: participant.address,
        amount: participant.yieldToCollect.toString(),
        txHash: transferFromTx,
      });
      totalCollected += participant.yieldToCollect;
      
      console.log(`[DrawExecutor] Collected ${participant.yieldToCollect} from ${participant.address}: ${transferFromTx}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message.slice(0, 100) : 'Unknown error';
      console.error(`[DrawExecutor] Failed to collect from ${participant.address}:`, errorMsg);
      collectionResults.push({
        address: participant.address,
        amount: participant.yieldToCollect.toString(),
        error: errorMsg,
      });
    }
  }
  
  const actualPrize = totalCollected + sponsoredPool;
  let prizeTxHash: string | undefined;
  
  if (actualPrize > 0n) {
    try {
      prizeTxHash = await walletClient.writeContract({
        address: CELO_AUSDC_ADDRESS,
        abi: [{
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          name: 'transfer',
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function',
        }],
        functionName: 'transfer',
        args: [getAddress(winner.address), actualPrize],
      });
      
      await client.waitForTransactionReceipt({ hash: prizeTxHash as `0x${string}` });
      console.log(`[DrawExecutor] Transferred prize ${actualPrize} to winner ${winner.address}: ${prizeTxHash}`);
    } catch (error) {
      console.error(`[DrawExecutor] Failed to transfer prize to ${winner.address}:`, error);
      throw new Error('Failed to transfer prize to winner');
    }
  }
  
  await storage.completeDraw(draw.id, {
    winnerAddress: winner.address,
    winnerTickets: winner.totalTickets.toString(),
    winningNumber: randomBigInt.toString(),
    totalPool: actualPrize.toString(),
    totalTickets: totalTickets.toString(),
  });
  
  const { weekNumber: currentWeek, year: currentYear } = getCurrentWeekInfo();
  for (const participant of participantData) {
    try {
      await storage.upsertYieldSnapshot(participant.address, {
        lastAusdcBalance: participant.totalBalance.toString(),
        snapshotYield: participant.actualInterest.toString(),
        weekNumber: currentWeek,
        year: currentYear,
        isFirstWeek: false,
        lastCollectedAt: new Date(),
      });
    } catch (err) {
      console.error(`[DrawExecutor] Failed to save snapshot for ${participant.address}:`, err);
    }
  }
  
  console.log(`[DrawExecutor] Draw completed: winner=${winner.address}, tickets=${winner.totalTickets}, prize=${actualPrize}`);
  
  return {
    success: true,
    winner: {
      address: winner.address,
      yieldTickets: winner.yieldTickets.toString(),
      referralBonus: winner.referralBonus.toString(),
      totalTickets: winner.totalTickets.toString(),
      prize: actualPrize.toString(),
      prizeFormatted: (Number(actualPrize) / 1_000_000).toFixed(2),
      prizeTxHash,
    },
    collection: {
      attempted: collectableParticipants.length,
      successful: collectionResults.filter(r => !r.error).length,
      failed: collectionResults.filter(r => r.error).length,
      totalCollected: totalCollected.toString(),
      results: collectionResults,
    },
    totalParticipants: participantTickets.length,
    totalTickets: totalTickets.toString(),
    totalPrizePool: actualPrize.toString(),
    sponsoredPool: sponsoredPool.toString(),
    winningNumber: randomBigInt.toString(),
    unapprovedUsers: unapprovedUsers.length,
  };
}
