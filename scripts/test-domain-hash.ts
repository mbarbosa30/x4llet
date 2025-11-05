import { keccak256, encodeAbiParameters, toHex } from 'viem';

const USDC_ADDRESS = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C';
const CHAIN_ID = 42220;
const EXPECTED_DOMAIN_SEPARATOR = '0xb2ce31d2838445fa765a491f550e7c78ac7280ab0f3bc9d6063a86df9c3fb578';

console.log('Testing different EIP-712 domain configurations for Celo USDC...\n');
console.log('Expected DOMAIN_SEPARATOR:', EXPECTED_DOMAIN_SEPARATOR, '\n');

// Test 1: Standard chainId format
function testStandardChainId() {
  console.log('Test 1: Standard chainId format');
  
  const TYPE_HASH = keccak256(toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'));
  const nameHash = keccak256(toHex('USD Coin'));
  const versionHash = keccak256(toHex('2'));
  
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' }
      ],
      [TYPE_HASH, nameHash, versionHash, BigInt(CHAIN_ID), USDC_ADDRESS as `0x${string}`]
    )
  );
  
  console.log('Result:', domainSeparator);
  console.log('Match:', domainSeparator === EXPECTED_DOMAIN_SEPARATOR, '\n');
  return domainSeparator === EXPECTED_DOMAIN_SEPARATOR;
}

// Test 2: Salt format with raw chainId
function testSaltRawChainId() {
  console.log('Test 2: Salt format with zero-padded chainId');
  
  const TYPE_HASH = keccak256(toHex('EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)'));
  const nameHash = keccak256(toHex('USD Coin'));
  const versionHash = keccak256(toHex('2'));
  const salt = `0x${CHAIN_ID.toString(16).padStart(64, '0')}`;
  
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'bytes32' }
      ],
      [TYPE_HASH, nameHash, versionHash, USDC_ADDRESS as `0x${string}`, salt as `0x${string}`]
    )
  );
  
  console.log('Result:', domainSeparator);
  console.log('Match:', domainSeparator === EXPECTED_DOMAIN_SEPARATOR, '\n');
  return domainSeparator === EXPECTED_DOMAIN_SEPARATOR;
}

// Test 3: Salt format with keccak256(abi.encode(chainId))
function testSaltHashedChainId() {
  console.log('Test 3: Salt format with keccak256(abi.encode(chainId))');
  
  const TYPE_HASH = keccak256(toHex('EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)'));
  const nameHash = keccak256(toHex('USD Coin'));
  const versionHash = keccak256(toHex('2'));
  const salt = keccak256(encodeAbiParameters([{ type: 'uint256' }], [BigInt(CHAIN_ID)]));
  
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'bytes32' }
      ],
      [TYPE_HASH, nameHash, versionHash, USDC_ADDRESS as `0x${string}`, salt]
    )
  );
  
  console.log('Salt value:', salt);
  console.log('Result:', domainSeparator);
  console.log('Match:', domainSeparator === EXPECTED_DOMAIN_SEPARATOR, '\n');
  return domainSeparator === EXPECTED_DOMAIN_SEPARATOR;
}

// Test 4: Try "USDC" instead of "USD Coin"
function testUSDCName() {
  console.log('Test 4: Using "USDC" as name instead of "USD Coin"');
  
  const TYPE_HASH = keccak256(toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'));
  const nameHash = keccak256(toHex('USDC'));
  const versionHash = keccak256(toHex('2'));
  
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' }
      ],
      [TYPE_HASH, nameHash, versionHash, BigInt(CHAIN_ID), USDC_ADDRESS as `0x${string}`]
    )
  );
  
  console.log('Result:', domainSeparator);
  console.log('Match:', domainSeparator === EXPECTED_DOMAIN_SEPARATOR, '\n');
  return domainSeparator === EXPECTED_DOMAIN_SEPARATOR;
}

async function runTests() {
  const results = [
    testStandardChainId(),
    testSaltRawChainId(),
    testSaltHashedChainId(),
    testUSDCName(),
  ];
  
  const matchIndex = results.indexOf(true);
  if (matchIndex !== -1) {
    console.log(`✅ Found matching configuration: Test ${matchIndex + 1}`);
  } else {
    console.log('❌ None of the tested configurations match');
  }
}

runTests().catch(console.error);
