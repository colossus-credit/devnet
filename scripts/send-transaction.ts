import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseEther, publicActions, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Get private key from environment variable
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("PRIVATE_KEY environment variable is required");
}

// Get RPC URL from environment variable (for sending transactions)
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
  throw new Error("RPC_URL environment variable is required");
}

// Get Flashblocks RPC URL from environment variable (for reading receipts)
const flashblocksRpcUrl = process.env.FLASHBLOCKS_RPC_URL;
if (!flashblocksRpcUrl) {
  throw new Error("FLASHBLOCKS_RPC_URL environment variable is required");
}

// Get chain ID from environment variable (default to Base Sepolia: 84532)
const chainId = parseInt(process.env.CHAIN_ID || "84532", 10);

// Create custom chain configuration
// You can customize these values based on your chain
const customChain = defineChain({
  id: chainId,
  name: process.env.CHAIN_NAME || "Custom Chain",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [rpcUrl],
    },
  },
  // Add other chain-specific config as needed
  // For Flashblocks, you might need additional configuration
});

// Create account from private key
const account = privateKeyToAccount(`0x${privateKey.replace(/^0x/, '')}`);

// Create wallet client for sending transactions (uses regular RPC)
const walletClient = createWalletClient({
  account,
  chain: customChain,
  transport: http(rpcUrl),
})
  .extend(publicActions);

// Create public client for reading receipts (uses flashblocks RPC)
// Configure HTTP transport with better connection handling
const flashblocksClient = createPublicClient({
  chain: customChain,
  transport: http(flashblocksRpcUrl, {
    timeout: 30000, // 30 second timeout
    fetchOptions: {
      keepalive: true,
    },
  }),
});

// Transaction recipient address (update this to your desired recipient)
const recipientAddress = process.env.RECIPIENT_ADDRESS || "0x0000000000000000000000000000000000000000";

// Amount to send (default 0.0001 ETH)
const amount = process.env.AMOUNT || "0.0001";

async function main() {
  const submissionTime = new Date();
  console.log(`Submitting transaction at: ${submissionTime.toISOString()}`);
  console.log(`From: ${account.address}`);
  console.log(`To: ${recipientAddress}`);
  console.log(`Amount: ${amount} ETH`);
  console.log(`Sending via RPC: ${rpcUrl}`);
  console.log(`Reading receipt via Flashblocks RPC: ${flashblocksRpcUrl}`);

  try {
    // Send transaction using regular RPC
    const hash = await walletClient.sendTransaction({
      to: recipientAddress as `0x${string}`,
      value: parseEther(amount),
    });
    console.log(`\nTransaction hash: ${hash}`);
    console.log(`Waiting for pre-confirmation via Flashblocks RPC...`);

    // Poll for transaction receipt (flashblocks provides pre-confirmations)
    // Poll aggressively for fast pre-confirmation (< 250ms target)
    // Keep polling until receipt is found (no timeout)
    let receipt = null;
    const pollInterval = 10; // Poll every 10ms for very fast pre-confirmation
    const pollingStartTime = Date.now();
    
    while (!receipt) {
      try {
        receipt = await flashblocksClient.getTransactionReceipt({ hash });
        if (receipt) {
          break;
        }
      } catch (error) {
        // Receipt not available yet, continue polling
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    const confirmTime = new Date();
    const timeDiff = confirmTime.getTime() - submissionTime.getTime();
    const pollingTime = Date.now() - pollingStartTime;

    console.log(`\n✅ Transaction pre-confirmed at: ${confirmTime.toISOString()}`);
    console.log(`⏱️  Total time (submission to confirmation): ${timeDiff}ms`);
    console.log(`⏱️  Polling time (first receipt found): ${pollingTime}ms`);
    console.log(`📦 Block number: ${receipt.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`✅ Status: ${receipt.status === 'success' ? 'Success' : 'Failed'}`);
    
    if (pollingTime > 250) {
      console.log(`⚠️  Warning: Pre-confirmation took ${pollingTime}ms, expected < 250ms`);
    } else {
      console.log(`✅ Pre-confirmation received within target (< 250ms)`);
    }
  } catch (error) {
    console.error("Error sending transaction:", error);
    process.exit(1);
  }
}

main();

