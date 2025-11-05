import { createPublicClient, http, type Address, type Hex } from 'viem';
import { celo } from 'viem/chains';

const USDC_ABI = [
  {
    name: 'authorizationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [
      { name: '', type: 'bool' },
    ],
  },
] as const;

async function checkNonceStatus() {
  const publicClient = createPublicClient({
    chain: celo,
    transport: http('https://forno.celo.org'),
  });

  const usdcAddress = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as Address;
  
  // Check the nonce from the failed transaction
  const failedNonce = '0x01325bbfb2998e8610d90110fc6b686319d1930a7c0fdf91163b16fe272276d6' as Hex;
  const failedFrom = '0x463c23E968AAB02E44977Dea5c1B0b16e61924ca' as Address;
  
  console.log('Checking nonce status on Celo USDC contract...\n');
  console.log('Address:', failedFrom);
  console.log('Nonce:', failedNonce);
  
  try {
    const isUsed = await publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'authorizationState',
      args: [failedFrom, failedNonce],
    });
    
    console.log('\nNonce Status:', isUsed ? '❌ ALREADY USED' : '✅ AVAILABLE');
    
    if (isUsed) {
      console.log('\n⚠️  This nonce has already been used!');
      console.log('This could explain why the signature is being rejected.');
      console.log('Each transfer must use a unique nonce that has never been used before.');
    }
  } catch (error) {
    console.error('\n❌ Error checking nonce status:', error);
  }
}

checkNonceStatus().catch(console.error);
