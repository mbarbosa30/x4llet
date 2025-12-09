import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

let scanInProgress = false;

const SUPPORTED_CHAINS = [
  { chainId: 8453, name: 'Base', nativeToken: 'ETH', decimals: 18 },
  { chainId: 42220, name: 'Celo', nativeToken: 'CELO', decimals: 18 },
  { chainId: 100, name: 'Gnosis', nativeToken: 'XDAI', decimals: 18 },
  { chainId: 42161, name: 'Arbitrum', nativeToken: 'ETH', decimals: 18 },
];

interface TransactionRecord {
  hash: string;
  blockNumber: string;
  gasUsed: string;
  gasPrice: string;
  timeStamp: string;
}

interface GasScanResult {
  chainId: number;
  chainName: string;
  transactionCount: number;
  totalGasNative: string;
  totalGasUsd: number;
  lastBlockScanned: string;
}

function getFacilitatorAddress(): string {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('FACILITATOR_PRIVATE_KEY not set');
  }
  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(formattedKey as Hex);
  return account.address;
}

async function fetchNativeTokenPrices(): Promise<Record<string, number>> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,celo,xdai&vs_currencies=usd'
    );
    const data = await response.json();
    return {
      ETH: data.ethereum?.usd || 0,
      CELO: data.celo?.usd || 0,
      XDAI: data.xdai?.usd || 1, // xDAI is pegged to $1
    };
  } catch (error) {
    console.error('[GasScanner] Error fetching prices:', error);
    return { ETH: 0, CELO: 0, XDAI: 1 };
  }
}

async function fetchFacilitatorTransactions(
  address: string,
  chainId: number,
  startBlock: string = '0'
): Promise<TransactionRecord[]> {
  const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
  
  if (!etherscanApiKey) {
    console.log(`[GasScanner] No ETHERSCAN_API_KEY available`);
    return [];
  }

  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=99999999&sort=asc&apikey=${etherscanApiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== '1' || !Array.isArray(data.result)) {
      if (data.message === 'No transactions found') {
        console.log(`[GasScanner] Chain ${chainId}: No transactions found`);
      } else {
        console.log(`[GasScanner] Chain ${chainId}: ${data.message || 'Unknown error'} - ${data.result || ''}`);
      }
      return [];
    }

    const filtered = data.result
      .filter((tx: any) => tx.from.toLowerCase() === address.toLowerCase())
      .map((tx: any) => ({
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gasUsed,
        gasPrice: tx.gasPrice,
        timeStamp: tx.timeStamp,
      }));
    
    console.log(`[GasScanner] Chain ${chainId}: Found ${data.result.length} total txs, ${filtered.length} from facilitator`);
    return filtered;
  } catch (error) {
    console.error(`[GasScanner] Error fetching chain ${chainId}:`, error);
    return [];
  }
}

function calculateGasCost(transactions: TransactionRecord[]): bigint {
  let totalWei = 0n;
  for (const tx of transactions) {
    const gasUsed = BigInt(tx.gasUsed || '0');
    const gasPrice = BigInt(tx.gasPrice || '0');
    totalWei += gasUsed * gasPrice;
  }
  return totalWei;
}

function weiToNative(wei: bigint, decimals: number = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = wei / divisor;
  const remainder = wei % divisor;
  const fractional = remainder.toString().padStart(decimals, '0').slice(0, 6);
  return `${whole}.${fractional}`;
}

export async function scanAllChainsGas(
  getLastBlock: (chainId: number) => Promise<string>,
  setLastBlock: (chainId: number, block: string) => Promise<void>
): Promise<{ totalUsd: number; results: GasScanResult[] }> {
  const facilitatorAddress = getFacilitatorAddress();
  console.log(`[GasScanner] Scanning gas for facilitator: ${facilitatorAddress}`);

  const prices = await fetchNativeTokenPrices();
  console.log('[GasScanner] Token prices:', prices);

  const results: GasScanResult[] = [];
  let grandTotalUsd = 0;

  for (const chain of SUPPORTED_CHAINS) {
    try {
      const lastBlock = await getLastBlock(chain.chainId);
      const startBlock = lastBlock ? (BigInt(lastBlock) + 1n).toString() : '0';
      
      console.log(`[GasScanner] ${chain.name}: Scanning from block ${startBlock}`);

      const transactions = await fetchFacilitatorTransactions(
        facilitatorAddress,
        chain.chainId,
        startBlock
      );

      if (transactions.length === 0) {
        console.log(`[GasScanner] ${chain.name}: No new transactions`);
        results.push({
          chainId: chain.chainId,
          chainName: chain.name,
          transactionCount: 0,
          totalGasNative: '0',
          totalGasUsd: 0,
          lastBlockScanned: lastBlock || '0',
        });
        continue;
      }

      const totalWei = calculateGasCost(transactions);
      const totalNative = weiToNative(totalWei, chain.decimals);
      const nativeFloat = parseFloat(totalNative);
      
      const priceKey = chain.nativeToken === 'XDAI' ? 'XDAI' : chain.nativeToken;
      const price = prices[priceKey] || 0;
      const totalUsd = nativeFloat * price;

      const lastTxBlock = transactions[transactions.length - 1].blockNumber;
      await setLastBlock(chain.chainId, lastTxBlock);

      console.log(`[GasScanner] ${chain.name}: ${transactions.length} txs, ${totalNative} ${chain.nativeToken}, $${totalUsd.toFixed(2)}`);

      results.push({
        chainId: chain.chainId,
        chainName: chain.name,
        transactionCount: transactions.length,
        totalGasNative: totalNative,
        totalGasUsd: totalUsd,
        lastBlockScanned: lastTxBlock,
      });

      grandTotalUsd += totalUsd;
    } catch (error) {
      console.error(`[GasScanner] Error scanning ${chain.name}:`, error);
    }
  }

  console.log(`[GasScanner] Total gas sponsored: $${grandTotalUsd.toFixed(2)}`);
  return { totalUsd: grandTotalUsd, results };
}

export async function runGasScanAndUpdate(
  storage: {
    getGlobalSetting: (key: string) => Promise<string | null>;
    setGlobalSetting: (key: string, value: string) => Promise<void>;
  }
): Promise<number> {
  if (scanInProgress) {
    console.log('[GasScanner] Scan already in progress, skipping...');
    const existingTotal = parseFloat((await storage.getGlobalSetting('gas_sponsored_usd')) || '0');
    return existingTotal;
  }

  scanInProgress = true;
  
  try {
    const getLastBlock = async (chainId: number): Promise<string> => {
      const key = `gas_scan_last_block_${chainId}`;
      return (await storage.getGlobalSetting(key)) || '0';
    };

    const setLastBlock = async (chainId: number, block: string): Promise<void> => {
      const key = `gas_scan_last_block_${chainId}`;
      await storage.setGlobalSetting(key, block);
    };

    const { totalUsd } = await scanAllChainsGas(getLastBlock, setLastBlock);

    const existingTotal = parseFloat((await storage.getGlobalSetting('gas_sponsored_usd')) || '0');
    const newTotal = existingTotal + totalUsd;

    await storage.setGlobalSetting('gas_sponsored_usd', newTotal.toFixed(2));
    await storage.setGlobalSetting('gas_scan_last_run', new Date().toISOString());

    console.log(`[GasScanner] Updated total: $${existingTotal.toFixed(2)} + $${totalUsd.toFixed(2)} = $${newTotal.toFixed(2)}`);

    return newTotal;
  } finally {
    scanInProgress = false;
  }
}
