import { createPublicClient, http, type Address, parseAbi, formatUnits } from 'viem';
import { gnosis } from 'viem/chains';

const CIRCLES_RPC = 'https://rpc.aboutcircles.com';

const HUB_V2_ADDRESS = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8' as const;
const STANDARD_TREASURY = '0x08F90aB73A515308f03A718257ff9887ED330C6e' as const;

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
]);

const nameRegistryAbi = parseAbi([
  'function getShortName(address avatar) view returns (string)',
  'function getName(address avatar) view returns (string)',
]);

export interface CirclesAvatar {
  address: string;
  isRegistered: boolean;
  isHuman: boolean;
  isOrganization: boolean;
  isGroup: boolean;
  shortName?: string;
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
    });

    const isRegistered = avatarAddress !== '0x0000000000000000000000000000000000000000';
    
    if (!isRegistered) {
      return {
        address,
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
        args: [address as Address],
      }),
      publicClient.readContract({
        address: HUB_V2_ADDRESS,
        abi: hubAbi,
        functionName: 'isOrganization',
        args: [address as Address],
      }),
      publicClient.readContract({
        address: HUB_V2_ADDRESS,
        abi: hubAbi,
        functionName: 'isGroup',
        args: [address as Address],
      }),
    ]);

    return {
      address,
      isRegistered: true,
      isHuman: isHuman as boolean,
      isOrganization: isOrganization as boolean,
      isGroup: isGroup as boolean,
    };
  } catch (error) {
    console.error('Error fetching Circles avatar:', error);
    return {
      address,
      isRegistered: false,
      isHuman: false,
      isOrganization: false,
      isGroup: false,
    };
  }
}

export async function getCirclesBalance(address: string): Promise<CirclesBalance> {
  try {
    const tokenId = BigInt(address);
    
    const balance = await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: hubAbi,
      functionName: 'balanceOf',
      args: [address as Address, tokenId],
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

export function getCirclesExplorerUrl(address: string): string {
  return `https://circles.garden/profile/${address}`;
}

export const CIRCLES_HUB_ADDRESS = HUB_V2_ADDRESS;
export const CIRCLES_CHAIN_ID = 100;
