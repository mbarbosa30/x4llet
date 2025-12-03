import { createPublicClient, createWalletClient, http, type Address, formatUnits } from 'viem';
import { gnosis } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CIRCLES_RPC = 'https://rpc.aboutcircles.com';
const HUB_V2_ADDRESS = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8' as const;
const INVITER_ADDRESS = '0xbf3E8C2f1191dC6e3cdbA3aD05626A5EEeF60731' as Address;

const hubAbi = [
  {
    name: 'registerHuman',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'inviter', type: 'address' },
      { name: 'metadataDigest', type: 'bytes32' }
    ],
    outputs: [{ type: 'address' }]
  },
  {
    name: 'avatars',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'address' }]
  },
  {
    name: 'isHuman',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_human', type: 'address' }],
    outputs: [{ type: 'bool' }]
  },
  {
    name: 'isTrusted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'truster', type: 'address' },
      { name: 'trustee', type: 'address' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    name: 'invitationOnlyTime',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'toTokenId',
    type: 'function',
    stateMutability: 'pure',
    inputs: [{ name: '_avatar', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256' }]
  }
] as const;

const INVITATION_COST = 96n * 10n ** 18n; // 96 Circles in atto

async function main() {
  let privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('FACILITATOR_PRIVATE_KEY not set');
  }

  // Ensure private key has 0x prefix
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
  const facilitatorNext = await publicClient.readContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'avatars',
    args: [account.address],
  });

  if (facilitatorNext !== '0x0000000000000000000000000000000000000000') {
    console.log('Facilitator is already in avatars linked list. Next avatar:', facilitatorNext);
    
    const isHuman = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'isHuman',
      args: [account.address],
    });
    console.log('Is human:', isHuman);
    return;
  }

  // Check invitationOnlyTime
  const invitationOnlyTime = await publicClient.readContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'invitationOnlyTime',
  });
  const now = BigInt(Math.floor(Date.now() / 1000));
  console.log('Invitation only time:', new Date(Number(invitationOnlyTime) * 1000).toISOString());
  console.log('Current time:', new Date(Number(now) * 1000).toISOString());
  console.log('Past invitation period:', now > invitationOnlyTime);

  // Check if inviter is human
  const inviterIsHuman = await publicClient.readContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'isHuman',
    args: [INVITER_ADDRESS],
  });
  console.log('Inviter is human:', inviterIsHuman);

  if (!inviterIsHuman) {
    throw new Error('Inviter is not a registered human');
  }

  // Check if inviter trusts the facilitator
  const isTrusted = await publicClient.readContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'isTrusted',
    args: [INVITER_ADDRESS, account.address],
  });
  console.log('Inviter trusts facilitator:', isTrusted);

  if (!isTrusted) {
    throw new Error('Inviter does not trust the facilitator. Cannot register.');
  }

  // After invitation period, the inviter needs to pay INVITATION_COST (96 Circles)
  if (now > invitationOnlyTime) {
    // Get inviter's token ID
    const inviterTokenId = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'toTokenId',
      args: [INVITER_ADDRESS],
    });
    console.log('Inviter token ID:', inviterTokenId);

    // Check inviter's balance of their own Circles
    const inviterBalance = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'balanceOf',
      args: [INVITER_ADDRESS, inviterTokenId],
    });
    console.log('Inviter Circles balance:', formatUnits(inviterBalance, 18), 'CRC');
    console.log('Invitation cost:', formatUnits(INVITATION_COST, 18), 'CRC');

    if (inviterBalance < INVITATION_COST) {
      throw new Error(`Inviter doesn't have enough Circles to pay invitation cost. Has ${formatUnits(inviterBalance, 18)} CRC, needs ${formatUnits(INVITATION_COST, 18)} CRC`);
    }
  }

  // Register as human with empty metadata
  console.log('\nRegistering facilitator as human...');
  console.log('Inviter:', INVITER_ADDRESS);
  
  const emptyMetadata = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

  const hash = await walletClient.writeContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'registerHuman',
    args: [INVITER_ADDRESS, emptyMetadata],
  });

  console.log('Transaction hash:', hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Transaction confirmed in block:', receipt.blockNumber);
  console.log('Status:', receipt.status);

  // Verify registration
  const isNowHuman = await publicClient.readContract({
    address: HUB_V2_ADDRESS,
    abi: hubAbi,
    functionName: 'isHuman',
    args: [account.address],
  });
  console.log('Facilitator is now human:', isNowHuman);

  console.log('\nFacilitator successfully registered as Circles human!');
}

main().catch(console.error);
