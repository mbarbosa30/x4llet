import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  type Address, 
  parseAbi, 
  formatUnits, 
  parseUnits
} from 'viem';
import { gnosis } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getPrivateKey } from '@/lib/wallet';

const CIRCLES_RPC = 'https://rpc.aboutcircles.com';

const HUB_V2_ADDRESS = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8' as const;
const DEFAULT_INVITER = '0xbf3E8C2f1191dC6e3cdbA3aD05626A5EEeF60731' as const;
const FACILITATOR_URL = '/api/facilitator';

const publicClient = createPublicClient({
  chain: gnosis,
  transport: http(CIRCLES_RPC),
});

const hubAbi = parseAbi([
  'function avatars(address) view returns (address)',
  'function isHuman(address) view returns (bool)',
  'function isOrganization(address) view returns (bool)',
  'function isGroup(address) view returns (bool)',
  'function isTrusted(address truster, address trustee) view returns (bool)',
  'function trustMarkers(address truster, address trustee) view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function registerHuman(address inviter, bytes32 metadataDigest) returns (address)',
  'function personalMint()',
  'function trust(address trustee, uint96 expiryTime)',
  'function untrust(address trustee)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)',
]);

export interface CirclesAvatar {
  address: string;
  avatarAddress: string | null;
  isRegistered: boolean;
  isHuman: boolean;
  isOrganization: boolean;
  isGroup: boolean;
}

export interface CirclesTrustInfo {
  trustedBy: number;
  trusting: number;
}

export interface CirclesBalance {
  totalCrc: string;
  formattedCrc: string;
}

export async function getCirclesAvatar(address: string): Promise<CirclesAvatar> {
  try {
    const avatarAddress = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'avatars',
      args: [address as Address],
    }) as Address;

    const isRegistered = avatarAddress !== '0x0000000000000000000000000000000000000000';
    
    if (!isRegistered) {
      return {
        address,
        avatarAddress: null,
        isRegistered: false,
        isHuman: false,
        isOrganization: false,
        isGroup: false,
      };
    }

    const [isHuman, isOrganization, isGroup] = await Promise.all([
      publicClient.readContract({
        address: HUB_V2_ADDRESS,
        abi: hubAbi,
        functionName: 'isHuman',
        args: [avatarAddress],
      }),
      publicClient.readContract({
        address: HUB_V2_ADDRESS,
        abi: hubAbi,
        functionName: 'isOrganization',
        args: [avatarAddress],
      }),
      publicClient.readContract({
        address: HUB_V2_ADDRESS,
        abi: hubAbi,
        functionName: 'isGroup',
        args: [avatarAddress],
      }),
    ]);

    return {
      address,
      avatarAddress: avatarAddress,
      isRegistered: true,
      isHuman: isHuman as boolean,
      isOrganization: isOrganization as boolean,
      isGroup: isGroup as boolean,
    };
  } catch (error) {
    console.error('Error fetching Circles avatar:', error);
    return {
      address,
      avatarAddress: null,
      isRegistered: false,
      isHuman: false,
      isOrganization: false,
      isGroup: false,
    };
  }
}

export async function getCirclesBalance(address: string): Promise<CirclesBalance> {
  try {
    const avatarAddress = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'avatars',
      args: [address as Address],
    }) as Address;

    if (avatarAddress === '0x0000000000000000000000000000000000000000') {
      return {
        totalCrc: '0',
        formattedCrc: '0.00',
      };
    }

    const tokenId = BigInt(avatarAddress);
    
    const balance = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'balanceOf',
      args: [avatarAddress, tokenId],
    });

    const formatted = formatUnits(balance as bigint, 18);
    
    return {
      totalCrc: (balance as bigint).toString(),
      formattedCrc: parseFloat(formatted).toFixed(2),
    };
  } catch (error) {
    console.error('Error fetching Circles balance:', error);
    return {
      totalCrc: '0',
      formattedCrc: '0.00',
    };
  }
}

export async function checkTrust(truster: string, trustee: string): Promise<boolean> {
  try {
    const isTrusted = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'isTrusted',
      args: [truster as Address, trustee as Address],
    });
    return isTrusted as boolean;
  } catch (error) {
    console.error('Error checking trust:', error);
    return false;
  }
}

async function getWalletClient() {
  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error('No private key found');
  
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  return createWalletClient({
    account,
    chain: gnosis,
    transport: http(CIRCLES_RPC),
  });
}

async function requestGasDrip(address: string): Promise<void> {
  const response = await fetch(FACILITATOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'gas-drip',
      recipient: address,
      chainId: 100,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Gas drip request failed');
  }
}

export async function registerHuman(address: string, inviterAddress?: string): Promise<string> {
  try {
    await requestGasDrip(address);

    const walletClient = await getWalletClient();
    
    const inviter = (inviterAddress || DEFAULT_INVITER) as Address;
    const metadataDigest = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

    const hash = await walletClient.writeContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'registerHuman',
      args: [inviter, metadataDigest],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.transactionHash;
  } catch (error) {
    console.error('Error registering as human:', error);
    throw error;
  }
}

export async function mintPersonalCRC(address: string): Promise<string> {
  try {
    await requestGasDrip(address);

    const walletClient = await getWalletClient();

    const hash = await walletClient.writeContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'personalMint',
      args: [],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.transactionHash;
  } catch (error) {
    console.error('Error minting personal CRC:', error);
    throw error;
  }
}

export async function trustAddress(address: string, trusteeAddress: string): Promise<string> {
  try {
    await requestGasDrip(address);

    const walletClient = await getWalletClient();
    
    const maxExpiryTime = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFF');

    const hash = await walletClient.writeContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'trust',
      args: [trusteeAddress as Address, maxExpiryTime],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.transactionHash;
  } catch (error) {
    console.error('Error trusting address:', error);
    throw error;
  }
}

export async function untrustAddress(address: string, trusteeAddress: string): Promise<string> {
  try {
    await requestGasDrip(address);

    const walletClient = await getWalletClient();

    const hash = await walletClient.writeContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'untrust',
      args: [trusteeAddress as Address],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.transactionHash;
  } catch (error) {
    console.error('Error untrusting address:', error);
    throw error;
  }
}

export async function sendCRC(
  fromAddress: string, 
  toAddress: string, 
  amount: string
): Promise<string> {
  try {
    await requestGasDrip(fromAddress);

    const walletClient = await getWalletClient();
    
    const avatarAddress = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'avatars',
      args: [fromAddress as Address],
    }) as Address;

    if (avatarAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Sender is not registered in Circles');
    }

    const tokenId = BigInt(avatarAddress);
    const amountWei = parseUnits(amount, 18);

    const hash = await walletClient.writeContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'safeTransferFrom',
      args: [
        avatarAddress,
        toAddress as Address,
        tokenId,
        amountWei,
        '0x' as `0x${string}`,
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.transactionHash;
  } catch (error) {
    console.error('Error sending CRC:', error);
    throw error;
  }
}

export function getCirclesExplorerUrl(address: string): string {
  return `https://circles.garden/profile/${address}`;
}

export const CIRCLES_HUB_ADDRESS = HUB_V2_ADDRESS;
export const CIRCLES_CHAIN_ID = 100;
