import { keccak256, encodeAbiParameters, parseAbiParameters, getAddress, type Hex } from 'viem';

const usdcAddress = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C';
const chainId = 42220;

// EIP-712 Domain Type Hash
const DOMAIN_TYPEHASH = keccak256(
  Buffer.from('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
);

console.log('Computing EIP-712 Domain Separator for Celo USDC\n');
console.log('DOMAIN_TYPEHASH:', DOMAIN_TYPEHASH);
console.log();

function computeDomainSeparator(name: string, version: string) {
  const nameHash = keccak256(Buffer.from(name));
  const versionHash = keccak256(Buffer.from(version));
  
  const encoded = encodeAbiParameters(
    parseAbiParameters('bytes32, bytes32, bytes32, uint256, address'),
    [
      DOMAIN_TYPEHASH,
      nameHash,
      versionHash,
      BigInt(chainId),
      getAddress(usdcAddress) as Hex,
    ]
  );
  
  const separator = keccak256(encoded);
  
  return {
    nameHash,
    versionHash,
    separator,
  };
}

const testCases = [
  { name: 'USDC', version: '2' },
  { name: 'USD Coin', version: '2' },
  { name: 'USDC', version: 'v2' },
  { name: 'USDCoin', version: '2' },
];

const expectedSeparator = '0xb2ce31d2838445fa765a491f550e7c78ac7280ab0f3bc9d6063a86df9c3fb578';

console.log('Expected DOMAIN_SEPARATOR:', expectedSeparator);
console.log('='.repeat(80));
console.log();

for (const test of testCases) {
  const result = computeDomainSeparator(test.name, test.version);
  const matches = result.separator.toLowerCase() === expectedSeparator.toLowerCase();
  
  console.log(`Testing: name="${test.name}", version="${test.version}"`);
  console.log(`  Name Hash:      ${result.nameHash}`);
  console.log(`  Version Hash:   ${result.versionHash}`);
  console.log(`  Domain Sep:     ${result.separator}`);
  console.log(`  Matches:        ${matches ? '✅ YES' : '❌ NO'}`);
  console.log();
  
  if (matches) {
    console.log('🎉 FOUND THE CORRECT CONFIGURATION!');
    console.log(`   name: "${test.name}"`);
    console.log(`   version: "${test.version}"`);
    console.log();
  }
}
