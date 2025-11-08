import { createPublicClient, http, formatEther } from 'viem';
import { base, celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

async function checkBalances() {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error('FACILITATOR_PRIVATE_KEY not set');
    process.exit(1);
  }

  const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  const account = privateKeyToAccount(formattedKey);

  console.log('Facilitator Address:', account.address);
  console.log('');

  // Check Base balance
  const baseClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  const baseBalance = await baseClient.getBalance({ address: account.address });
  console.log('Base ETH Balance:', formatEther(baseBalance), 'ETH');

  // Check Celo balance
  const celoClient = createPublicClient({
    chain: celo,
    transport: http('https://forno.celo.org'),
  });

  const celoBalance = await celoClient.getBalance({ address: account.address });
  console.log('Celo CELO Balance:', formatEther(celoBalance), 'CELO');
}

checkBalances().catch(console.error);
