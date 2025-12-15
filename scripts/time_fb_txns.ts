import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseEther, publicActions, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type SendTxOptions = {
  count: number;
  intervalMs: number;
  pollIntervalMs: number;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const sendOpts: SendTxOptions = {
  // Number of transactions to send
  count: clampInt(envInt("TX_COUNT", 1), 1, 10_000),
  // Delay between transaction submissions
  intervalMs: clampInt(envInt("TX_INTERVAL_MS", 0), 0, 60_000),
  // Receipt polling interval against Flashblocks RPC
  pollIntervalMs: clampInt(envInt("POLL_INTERVAL_MS", 10), 1, 5_000),
};

// Receipt wait timeout (default 60 seconds)
const receiptTimeoutMs = clampInt(envInt("RECEIPT_TIMEOUT_MS", 60_000), 1_000, 300_000);

// Create wallet client for sending transactions (uses regular RPC)
const walletClient = createWalletClient({
  account,
  chain: customChain,
  transport: http(rpcUrl),
})
  .extend(publicActions);

// Create public client for nonce reads (uses regular RPC)
const rpcPublicClient = createPublicClient({
  chain: customChain,
  transport: http(rpcUrl),
});

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

async function waitForReceipt(hash: `0x${string}`, submittedAtMs: number, timeoutMs: number = 60_000) {
  const startMs = Date.now();
  while (true) {
    const elapsed = Date.now() - startMs;
    if (elapsed > timeoutMs) {
      throw new Error(`Timeout waiting for receipt: ${hash} (waited ${elapsed}ms)`);
    }
    try {
      const receipt = await flashblocksClient.getTransactionReceipt({ hash });
      const confirmedAtMs = Date.now();
      return { receipt, confirmedAtMs, submitToReceiptMs: confirmedAtMs - submittedAtMs };
    } catch (error) {
      // Receipt not available yet, continue polling
      // Log every 100 polls (roughly every second with 10ms interval) to show it's still trying
      if (Math.floor(elapsed / 1000) !== Math.floor((elapsed - sendOpts.pollIntervalMs) / 1000)) {
        // eslint-disable-next-line no-console
        console.log(`  Still waiting for receipt... (${elapsed}ms elapsed)`);
      }
    }
    await sleep(sendOpts.pollIntervalMs);
  }
}

async function sendOneTx() {
  const submittedAt = new Date();
  const submittedAtMs = submittedAt.getTime();

  // Get current nonce before sending each transaction
  const nonce = await rpcPublicClient.getTransactionCount({ address: account.address, blockTag: "pending" });

  let hash: `0x${string}`;
  try {
    hash = await walletClient.sendTransaction({
      to: recipientAddress as `0x${string}`,
      value: parseEther(amount),
      nonce,
    });
    // eslint-disable-next-line no-console
    console.log(`  ✓ Transaction sent: ${hash} (nonce: ${nonce})`);
  } catch (error) {
    throw new Error(`Failed to send transaction: ${error instanceof Error ? error.message : String(error)}`);
  }

  const { receipt, confirmedAtMs, submitToReceiptMs } = await waitForReceipt(hash, submittedAtMs, receiptTimeoutMs);
  return {
    hash,
    receipt,
    submittedAtMs,
    confirmedAtMs,
    submitToReceiptMs,
  };
}

async function main() {
  const submissionTime = new Date();
  console.log(`Submitting transaction(s) at: ${submissionTime.toISOString()}`);
  console.log(`From: ${account.address}`);
  console.log(`To: ${recipientAddress}`);
  console.log(`Amount: ${amount} ETH`);
  console.log(`Sending via RPC: ${rpcUrl}`);
  console.log(`Reading receipt via Flashblocks RPC: ${flashblocksRpcUrl}`);
  console.log(`TX_COUNT=${sendOpts.count} TX_INTERVAL_MS=${sendOpts.intervalMs} POLL_INTERVAL_MS=${sendOpts.pollIntervalMs} RECEIPT_TIMEOUT_MS=${receiptTimeoutMs}`);

  try {
    const results: Array<Awaited<ReturnType<typeof sendOneTx>>> = [];

    console.log(`\nSending transactions...`);

    for (let i = 0; i < sendOpts.count; i++) {
      const result = await sendOneTx();
      results.push(result);

      console.log(`\nTransaction #${i + 1}/${sendOpts.count}`);
      console.log(`  hash: ${result.hash}`);
      console.log(`  block: ${result.receipt.blockNumber}`);
      console.log(`  gasUsed: ${result.receipt.gasUsed.toString()}`);
      console.log(`  status: ${result.receipt.status === "success" ? "Success" : "Failed"}`);
      console.log(`  submit->receipt: ${result.submitToReceiptMs}ms`);

      if (sendOpts.intervalMs > 0 && i + 1 < sendOpts.count) {
        await sleep(sendOpts.intervalMs);
      }
    }

    const allMs = results.map((r) => r.submitToReceiptMs);
    allMs.sort((a, b) => a - b);
    const totalElapsedMs = Date.now() - submissionTime.getTime();
    const avgMs = allMs.reduce((a, b) => a + b, 0) / Math.max(1, allMs.length);
    const p50 = allMs[Math.floor(allMs.length * 0.5)] ?? 0;
    const p90 = allMs[Math.floor(allMs.length * 0.9)] ?? 0;
    const max = allMs[allMs.length - 1] ?? 0;

    console.log(`\nSummary`);
    console.log(`  sent: ${results.length}`);
    console.log(`  total elapsed: ${totalElapsedMs}ms`);
    console.log(`  submit->receipt avg: ${avgMs.toFixed(1)}ms p50: ${p50}ms p90: ${p90}ms max: ${max}ms`);

    if (p90 > 250) {
      console.log(`⚠️  Warning: p90 pre-confirmation took ${p90}ms, expected < 250ms`);
    } else {
      console.log(`✅ p90 pre-confirmation within target (< 250ms)`);
    }
  } catch (error) {
    console.error("Error sending transaction:", error);
    process.exit(1);
  }
}

main();

