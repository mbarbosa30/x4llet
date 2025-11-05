import { createPublicClient, http, type Address, type Hex, getAddress, hashTypedData } from 'viem';
import { celo } from 'viem/chains';

const USDC_ABI = [
  {
    name: 'DOMAIN_SEPARATOR',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'version',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

async function verifyDomainSeparator() {
  const publicClient = createPublicClient({
    chain: celo,
    transport: http('https://forno.celo.org'),
  });

  const usdcAddress = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as Address;
  
  console.log('Verifying domain separator for Celo USDC...\n');
  
  // Get on-chain values
  const [onChainSeparator, name, version] = await Promise.all([
    publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'DOMAIN_SEPARATOR',
    }),
    publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'name',
    }),
    publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'version',
    }),
  ]);
  
  console.log('On-chain values:');
  console.log('  Name:', name);
  console.log('  Version:', version);
  console.log('  DOMAIN_SEPARATOR:', onChainSeparator);
  
  // Compute local domain separator with what we think is correct
  const testDomains = [
    {
      label: 'Using "USDC" as name',
      domain: {
        name: 'USDC',
        version: '2',
        chainId: 42220,
        verifyingContract: getAddress(usdcAddress),
      },
    },
    {
      label: 'Using "USD Coin" as name',
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: 42220,
        verifyingContract: getAddress(usdcAddress),
      },
    },
    {
      label: 'Using contract name()',
      domain: {
        name,
        version: '2',
        chainId: 42220,
        verifyingContract: getAddress(usdcAddress),
      },
    },
    {
      label: 'Using contract version()',
      domain: {
        name: 'USDC',
        version,
        chainId: 42220,
        verifyingContract: getAddress(usdcAddress),
      },
    },
  ];
  
  console.log('\nTesting different domain configurations:\n');
  
  for (const test of testDomains) {
    // Compute domain separator hash using viem's hashTypedData with empty message
    // to get just the domain separator
    const computed = hashTypedData({
      domain: test.domain as any,
      types: {
        Test: [{ name: 'value', type: 'uint256' }],
      },
      primaryType: 'Test',
      message: { value: BigInt(0) },
    });
    
    // Extract just the domain part by computing it directly
    const domainHash = hashTypedData({
      domain: test.domain as any,
      types: {},
      primaryType: 'EIP712Domain',
      message: test.domain,
    });
    
    const matches = computed.toLowerCase().includes(onChainSeparator.toLowerCase()) ||
                    domainHash.toLowerCase() === onChainSeparator.toLowerCase();
    
    console.log(`${test.label}:`);
    console.log(`  Domain:`, JSON.stringify(test.domain, null, 2));
    console.log(`  Matches: ${matches ? '✅ YES' : '❌ NO'}`);
    console.log();
  }
  
  console.log('Expected DOMAIN_SEPARATOR:', onChainSeparator);
}

verifyDomainSeparator().catch(console.error);
