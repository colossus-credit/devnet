#!/usr/bin/env node
/**
 * Flashblocks Transaction Timing Tool (TypeScript)
 *
 * Sends transactions and measures Flashblocks pre-confirmation timing.
 *
 * Usage:
 *   bun run flashblocks:time -- --tx-count 5
 *
 * Notes:
 * - Set PRIVATE_KEY, RPC_URL, FLASHBLOCKS_RPC_URL in .env file
 * - Pass --help for full options
 */
import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseEther, publicActions, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Args = {
  rpcUrl: string;
  flashblocksRpcUrl: string;
  privateKey: string;
  chainId: number;
  chainName: string;
  recipient: string;
  amount: string;
  txCount: number;
  intervalMs: number;
  pollIntervalMs: number;
  receiptTimeoutMs: number;
  useSendTxnSync: boolean;
  debug: boolean;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    rpcUrl: process.env.RPC_URL || "",
    flashblocksRpcUrl: process.env.FLASHBLOCKS_RPC_URL || "",
    privateKey: process.env.PRIVATE_KEY || "",
    chainId: parseInt(process.env.CHAIN_ID || "84532", 10),
    chainName: process.env.CHAIN_NAME || "Custom Chain",
    recipient: process.env.RECIPIENT_ADDRESS || "0x0000000000000000000000000000000000000000",
    amount: process.env.AMOUNT || "0.0001",
    txCount: 1,
    intervalMs: 0,
    pollIntervalMs: 10,
    receiptTimeoutMs: 60_000,
    useSendTxnSync: false,
    debug: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];

    if (a === "--tx-count" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) args.txCount = clampInt(Math.trunc(n), 1, 10_000);
      i++;
      continue;
    }
    if (a === "--tx-interval-ms" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n >= 0) args.intervalMs = clampInt(Math.trunc(n), 0, 60_000);
      i++;
      continue;
    }
    if (a === "--poll-interval-ms" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) args.pollIntervalMs = clampInt(Math.trunc(n), 1, 5_000);
      i++;
      continue;
    }
    if (a === "--receipt-timeout-ms" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) args.receiptTimeoutMs = clampInt(Math.trunc(n), 1_000, 300_000);
      i++;
      continue;
    }
    if (a === "--use-send-txn-sync") {
      args.useSendTxnSync = true;
      continue;
    }
    if (a === "--debug") {
      args.debug = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      printHelpAndExit(0);
    }
  }

  // Validate required environment variables
  if (!args.privateKey) {
    // eslint-disable-next-line no-console
    console.error("Error: PRIVATE_KEY environment variable is required");
    process.exit(1);
  }
  if (!args.rpcUrl) {
    // eslint-disable-next-line no-console
    console.error("Error: RPC_URL environment variable is required");
    process.exit(1);
  }
  if (!args.flashblocksRpcUrl) {
    // eslint-disable-next-line no-console
    console.error("Error: FLASHBLOCKS_RPC_URL environment variable is required");
    process.exit(1);
  }

  return args;
}

function printHelpAndExit(code: number): never {
  // eslint-disable-next-line no-console
  console.log(`
Flashblocks Transaction Timing Tool

Sends transactions and measures pre-confirmation timing with Flashblocks.

Environment Variables (required in .env file):
  PRIVATE_KEY              Private key for signing transactions
  RPC_URL                  RPC URL for sending transactions (e.g., http://localhost:8547)
  FLASHBLOCKS_RPC_URL      Flashblocks RPC URL for reading receipts (e.g., http://localhost:8550)
  CHAIN_ID                 Chain ID (default: 84532 / Base Sepolia)
  CHAIN_NAME               Chain name (default: "Custom Chain")
  RECIPIENT_ADDRESS        Recipient address (default: 0x0000...)
  AMOUNT                   Amount to send in ETH (default: 0.0001)

CLI Options:
  --tx-count <n>               Number of transactions to send (default: 1)
  --tx-interval-ms <ms>        Delay between transactions (default: 0)
  --poll-interval-ms <ms>      Receipt polling interval (default: 10)
  --receipt-timeout-ms <ms>    Receipt wait timeout (default: 60000)
  --use-send-txn-sync          Use sendTransactionSync instead of sendTransaction
  --debug                      Print full transaction receipts
  -h, --help                   Show help

Examples:
  bun run flashblocks:time
  bun run flashblocks:time -- --tx-count 5
  bun run flashblocks:time -- --tx-count 10 --tx-interval-ms 100
  bun run flashblocks:time -- --use-send-txn-sync
`.trim());
  process.exit(code);
}

async function waitForReceipt(
  flashblocksClient: ReturnType<typeof createPublicClient>,
  hash: `0x${string}`,
  submittedAtMs: number,
  pollIntervalMs: number,
  timeoutMs: number,
) {
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
      if (Math.floor(elapsed / 1000) !== Math.floor((elapsed - pollIntervalMs) / 1000)) {
        // eslint-disable-next-line no-console
        console.log(`  Still waiting for receipt... (${elapsed}ms elapsed)`);
      }
    }
    await sleep(pollIntervalMs);
  }
}

async function sendOneTx(
  walletClient: ReturnType<typeof createWalletClient>,
  rpcPublicClient: ReturnType<typeof createPublicClient>,
  flashblocksClient: ReturnType<typeof createPublicClient>,
  args: Args,
  account: ReturnType<typeof privateKeyToAccount>,
) {
  const submittedAt = new Date();
  const submittedAtMs = submittedAt.getTime();

  // Get current nonce before sending each transaction
  const nonce = await rpcPublicClient.getTransactionCount({ address: account.address, blockTag: "pending" });

  try {
    if (args.useSendTxnSync) {
      // Use sendTransactionSync - sends transaction and waits for receipt
      const receipt = await walletClient.sendTransactionSync({
        account: account,
        chain: undefined,
        to: args.recipient as `0x${string}`,
        value: parseEther(args.amount),
        nonce,
      });
      const confirmedAtMs = Date.now();
      const submitToReceiptMs = confirmedAtMs - submittedAtMs;
      
      // eslint-disable-next-line no-console
      console.log(`  ✓ Transaction sent via sendTransactionSync: ${receipt.transactionHash} (nonce: ${nonce})`);
      
      // Query balance using pending tag to get latest state including this transaction
      const balance = await flashblocksClient.getBalance({ 
        address: args.recipient as `0x${string}`,
        blockTag: "pending",
      });
      
      if (args.debug) {
        // eslint-disable-next-line no-console
        console.log(`  Receipt:`, JSON.stringify(receipt, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
        // eslint-disable-next-line no-console
        console.log(`  Recipient balance: ${balance.toString()} wei (${(Number(balance) / 1e18).toFixed(6)} ETH)`);
      }
      
      return {
        hash: receipt.transactionHash,
        receipt,
        submittedAtMs,
        confirmedAtMs,
        submitToReceiptMs,
        balance,
      };
    } else {
      // Use regular sendTransaction and poll for receipt
      const hash = await walletClient.sendTransaction({
        account: account,
        chain: undefined,
        to: args.recipient as `0x${string}`,
        value: parseEther(args.amount),
        nonce,
      });
      // eslint-disable-next-line no-console
      console.log(`  ✓ Transaction sent: ${hash} (nonce: ${nonce})`);

      const { receipt, confirmedAtMs, submitToReceiptMs } = await waitForReceipt(
        flashblocksClient,
        hash,
        submittedAtMs,
        args.pollIntervalMs,
        args.receiptTimeoutMs,
      );
      
      // Query balance using pending tag to get latest state including this transaction
      const balance = await flashblocksClient.getBalance({ 
        address: args.recipient as `0x${string}`,
        blockTag: "pending",
      });
      
      if (args.debug) {
        // eslint-disable-next-line no-console
        console.log(`  Receipt:`, JSON.stringify(receipt, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
        // eslint-disable-next-line no-console
        console.log(`  Recipient balance: ${balance.toString()} wei (${(Number(balance) / 1e18).toFixed(6)} ETH)`);
      }
      
      return {
        hash,
        receipt,
        submittedAtMs,
        confirmedAtMs,
        submitToReceiptMs,
        balance,
      };
    }
  } catch (error) {
    throw new Error(`Failed to send transaction: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Create account from private key
  const account = privateKeyToAccount(`0x${args.privateKey.replace(/^0x/, '')}`);

  // Create custom chain configuration
  const customChain = defineChain({
    id: args.chainId,
    name: args.chainName,
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    rpcUrls: {
      default: {
        http: [args.rpcUrl],
      },
    },
  });

  // Create wallet client for sending transactions with hoisted account (uses regular RPC)
  const walletClient = createWalletClient({
    account,
    chain: customChain,
    transport: http(args.rpcUrl),
  });

  // Create public client for nonce reads (uses regular RPC)
  const rpcPublicClient = createPublicClient({
    chain: customChain,
    transport: http(args.rpcUrl),
  });

  // Create public client for reading receipts (uses flashblocks RPC)
  const flashblocksClient = createPublicClient({
    chain: customChain,
    transport: http(args.flashblocksRpcUrl, {
      timeout: 30000,
      fetchOptions: {
        keepalive: true,
      },
    }),
  });

  const submissionTime = new Date();
  // eslint-disable-next-line no-console
  console.log(`Submitting transaction(s) at: ${submissionTime.toISOString()}`);
  // eslint-disable-next-line no-console
  console.log(`From: ${account.address}`);
  // eslint-disable-next-line no-console
  console.log(`To: ${args.recipient}`);
  // eslint-disable-next-line no-console
  console.log(`Amount: ${args.amount} ETH`);
  // eslint-disable-next-line no-console
  console.log(`Sending via RPC: ${args.rpcUrl}`);
  // eslint-disable-next-line no-console
  console.log(`Reading receipt via Flashblocks RPC: ${args.flashblocksRpcUrl}`);
  // eslint-disable-next-line no-console
  console.log(`USE_SEND_TXN_SYNC=${args.useSendTxnSync}`);
  // eslint-disable-next-line no-console
  console.log(`TX_COUNT=${args.txCount} TX_INTERVAL_MS=${args.intervalMs} POLL_INTERVAL_MS=${args.pollIntervalMs} RECEIPT_TIMEOUT_MS=${args.receiptTimeoutMs}`);

  // Get initial balance to show increment (using pending to get latest state)
  const initialBalance = await flashblocksClient.getBalance({ 
    address: args.recipient as `0x${string}`,
    blockTag: "pending",
  });
  // eslint-disable-next-line no-console
  console.log(`Initial recipient balance: ${(Number(initialBalance) / 1e18).toFixed(6)} ETH`);

  try {
    const results: Array<Awaited<ReturnType<typeof sendOneTx>>> = [];

    // eslint-disable-next-line no-console
    console.log(`\nSending transactions...`);

    for (let i = 0; i < args.txCount; i++) {
      const result = await sendOneTx(walletClient, rpcPublicClient, flashblocksClient, args, account);
      results.push(result);

      // eslint-disable-next-line no-console
      console.log(`\nTransaction #${i + 1}/${args.txCount}`);
      // eslint-disable-next-line no-console
      console.log(`  hash: ${result.hash}`);
      // eslint-disable-next-line no-console
      console.log(`  block: ${result.receipt.blockNumber}`);
      // eslint-disable-next-line no-console
      console.log(`  gasUsed: ${result.receipt.gasUsed.toString()}`);
      // eslint-disable-next-line no-console
      console.log(`  status: ${result.receipt.status === "success" ? "Success" : "Failed"}`);
      // eslint-disable-next-line no-console
      console.log(`  submit->receipt: ${result.submitToReceiptMs}ms`);
      if (result.balance !== undefined) {
        const balanceEth = Number(result.balance) / 1e18;
        const initialBalanceEth = Number(initialBalance) / 1e18;
        const actualIncrement = balanceEth - initialBalanceEth;
        const expectedIncrement = parseFloat(args.amount) * (i + 1);
        const incrementWei = result.balance - initialBalance;
        // eslint-disable-next-line no-console
        console.log(`  recipient balance: ${balanceEth.toFixed(6)} ETH`);
        // eslint-disable-next-line no-console
        console.log(`  balance increment: ${incrementWei.toString()} wei (${actualIncrement >= 0 ? '+' : ''}${actualIncrement.toFixed(9)} ETH, expected: +${expectedIncrement.toFixed(9)} ETH)`);
        if (Math.abs(actualIncrement - expectedIncrement) > 0.000001) {
          // eslint-disable-next-line no-console
          console.log(`  ⚠️  Balance increment mismatch! Expected ${expectedIncrement.toFixed(9)} ETH, got ${actualIncrement.toFixed(9)} ETH`);
        }
      }

      if (args.intervalMs > 0 && i + 1 < args.txCount) {
        await sleep(args.intervalMs);
      }
    }

    const allMs = results.map((r) => r.submitToReceiptMs);
    allMs.sort((a, b) => a - b);
    const totalElapsedMs = Date.now() - submissionTime.getTime();
    const avgMs = allMs.reduce((a, b) => a + b, 0) / Math.max(1, allMs.length);
    const p50 = allMs[Math.floor(allMs.length * 0.5)] ?? 0;
    const p90 = allMs[Math.floor(allMs.length * 0.9)] ?? 0;
    const max = allMs[allMs.length - 1] ?? 0;

    // eslint-disable-next-line no-console
    console.log(`\nSummary`);
    // eslint-disable-next-line no-console
    console.log(`  sent: ${results.length}`);
    // eslint-disable-next-line no-console
    console.log(`  total elapsed: ${totalElapsedMs}ms`);
    // eslint-disable-next-line no-console
    console.log(`  submit->receipt avg: ${avgMs.toFixed(1)}ms p50: ${p50}ms p90: ${p90}ms max: ${max}ms`);

    if (p90 > 250) {
      // eslint-disable-next-line no-console
      console.log(`⚠️  Warning: p90 pre-confirmation took ${p90}ms, expected < 250ms`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`✅ p90 pre-confirmation within target (< 250ms)`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error sending transaction:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`Fatal error: ${String(err)}`);
  process.exit(1);
});

