import { createPublicClient, http } from 'viem';
import { celo } from 'viem/chains';

const USDC_ADDRESS = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C';

const publicClient = createPublicClient({
  chain: celo,
  transport: http('https://forno.celo.org'),
});

async function checkDomain() {
  console.log('Querying Celo USDC contract for EIP-712 domain...\n');

  // Try to get DOMAIN_SEPARATOR
  try {
    const domainSeparator = await publicClient.readContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: [{
        name: 'DOMAIN_SEPARATOR',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'bytes32' }]
      }],
      functionName: 'DOMAIN_SEPARATOR',
    });
    console.log('DOMAIN_SEPARATOR:', domainSeparator);
  } catch (error: any) {
    console.log('DOMAIN_SEPARATOR not found:', error.message);
  }

  // Try to get eip712Domain (EIP-5267)
  try {
    const domain = await publicClient.readContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: [{
        name: 'eip712Domain',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [
          { name: 'fields', type: 'bytes1' },
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
          { name: 'salt', type: 'bytes32' },
          { name: 'extensions', type: 'uint256[]' }
        ]
      }],
      functionName: 'eip712Domain',
    });
    console.log('\neip712Domain result:', domain);
  } catch (error: any) {
    console.log('\neip712Domain not found:', error.message);
  }

  // Try to get name and version
  try {
    const name = await publicClient.readContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: [{
        name: 'name',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'string' }]
      }],
      functionName: 'name',
    });
    console.log('\nToken name:', name);
  } catch (error: any) {
    console.log('\nname() not found:', error.message);
  }

  try {
    const version = await publicClient.readContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: [{
        name: 'version',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'string' }]
      }],
      functionName: 'version',
    });
    console.log('EIP-712 version:', version);
  } catch (error: any) {
    console.log('version() not found:', error.message);
  }
}

checkDomain().catch(console.error);
