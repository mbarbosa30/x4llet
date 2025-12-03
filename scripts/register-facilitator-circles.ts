import { createPublicClient, createWalletClient, http, type Address } from 'viem';
import { gnosis } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CIRCLES_RPC = 'https://rpc.aboutcircles.com';
const HUB_V2_ADDRESS = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8' as const;

const hubAbi = [
  {
    name: 'registerOrganization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_name', type: 'string' },
      { name: '_metadataDigest', type: 'bytes32' }
    ],
    outputs: []
  },
  {
    name: 'avatars',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'address' }]
  },
  {
    name: 'isOrganization',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_organization', type: 'address' }],
    outputs: [{ type: 'bool' }]
  }
] as const;

async function main() {
  let privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('FACILITATOR_PRIVATE_KEY not set');
  }

  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log('Facilitator address:', account.address);

  const publicClient = createPublicClient({
    chain: gnosis,
    transport: http(CIRCLES_RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: gnosis,
    transport: http(CIRCLES_RPC),
  });

  // Check if already registered
  const avatarNext = await publicClient.readContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'avatars',
    args: [account.address],
  });

  if (avatarNext !== '0x0000000000000000000000000000000000000000') {
    console.log('Facilitator is already registered in Circles.');
    
    const isOrg = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'isOrganization',
      args: [account.address],
    });
    console.log('Is organization:', isOrg);
    return;
  }

  console.log('\nRegistering facilitator as Circles Organization...');
  console.log('Organization name: nanoPay');

  const emptyMetadata = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

  const hash = await walletClient.writeContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'registerOrganization',
    args: ['nanoPay', emptyMetadata],
  });

  console.log('Transaction hash:', hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Transaction confirmed in block:', receipt.blockNumber);
  console.log('Status:', receipt.status);

  // Verify registration
  const isNowOrg = await publicClient.readContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'isOrganization',
    args: [account.address],
  });
  console.log('\nFacilitator is now organization:', isNowOrg);

  console.log('\n✓ Facilitator successfully registered as Circles Organization "nanoPay"!');
}

main().catch(console.error);
