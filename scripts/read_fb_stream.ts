#!/usr/bin/env node
/**
 * Flashblocks Stream Reader (TypeScript)
 *
 * Connects to the Flashblocks/builder WebSocket and prints a rolling stream of
 * payloads + a short summary at the end.
 *
 * Usage:
 *   bun run flashblocks:stream -- --ws-url ws://127.0.0.1:33097 --duration 30
 *
 * Notes:
 * - This script is intentionally "read-only" (no transactions sent).
 * - If you want raw payloads printed, pass --raw.
 */
import WebSocket, { type RawData } from "ws";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

type FlashblocksPayload = {
  payload_id?: string;
  metadata?: {
    block_number?: number;
    receipts?: Record<string, unknown>;
    [k: string]: unknown;
  };
  diff?: {
    transactions?: unknown[];
    gas_used?: string | number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

const Colors = {
  GREEN: "\x1b[92m",
  RED: "\x1b[91m",
  YELLOW: "\x1b[93m",
  BLUE: "\x1b[94m",
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
} as const;

type Args = {
  wsUrl: string;
  durationSec?: number; // undefined => run until closed / ctrl-c
  timeoutMs: number; // inactivity timeout while waiting for first payload
  raw: boolean; // print raw JSON payloads
  quiet: boolean; // suppress per-payload pretty output; summary only
  debug: boolean; // log message framing/type info (binary vs text, sizes)
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    wsUrl: "ws://127.0.0.1:33097",
    durationSec: undefined,
    timeoutMs: 60_000,
    raw: false,
    quiet: false,
    debug: false,
  };

  // Very small CLI parser: supports either "--flag value" or boolean flags.
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];

    if (a === "--ws-url" && next) {
      args.wsUrl = next;
      i++;
      continue;
    }
    if (a === "--duration" && next) {
      const n = Number(next);
      args.durationSec = Number.isFinite(n) && n > 0 ? n : undefined;
      i++;
      continue;
    }
    if (a === "--timeout-ms" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) args.timeoutMs = n;
      i++;
      continue;
    }
    if (a === "--raw") {
      args.raw = true;
      continue;
    }
    if (a === "--quiet") {
      args.quiet = true;
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

  return args;
}

function printHelpAndExit(code: number): never {
  // eslint-disable-next-line no-console
  console.log(`
Flashblocks Stream Reader

Options:
  --ws-url <url>       WebSocket URL (default: ws://127.0.0.1:33097)
  --duration <sec>     Run for N seconds, then print summary and exit
  --timeout-ms <ms>    Inactivity timeout while waiting for messages (default: 60000)
  --raw                Print raw JSON payloads
  --quiet              Summary only (no per-payload pretty printing)
  --debug              Log message framing/type info (binary vs text, sizes)
  -h, --help           Show help

Examples:
  bun run flashblocks:stream -- --ws-url ws://127.0.0.1:33097 --duration 30
  bun run flashblocks:stream -- --raw
`.trim());
  process.exit(code);
}

function safeJsonParse(text: string): JsonValue | undefined {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

function toBuffer(data: RawData): Buffer {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (Array.isArray(data)) return Buffer.concat(data.filter(Buffer.isBuffer));
  return Buffer.from(String(data), "utf8");
}

function hexPrefix(buf: Buffer, bytes = 16): string {
  return buf.subarray(0, Math.min(bytes, buf.length)).toString("hex");
}

function tryDecodeJsonFromBuffer(buf: Buffer): string | undefined {
  const text = buf.toString("utf8").trim();
  return safeJsonParse(text) === undefined ? undefined : text;
}

type DecodeResult = { jsonText: string; method: "utf8-json" | "gzip" | "zlib" | "brotli" };

function tryDecompressAndDecodeJson(buf: Buffer): DecodeResult | undefined {
  // gzip magic: 1f 8b
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      const out = gunzipSync(buf);
      const text = tryDecodeJsonFromBuffer(out);
      if (text) return { jsonText: text, method: "gzip" };
    } catch {
      // ignore
    }
  }

  // zlib header often starts with 0x78 0x01/0x9c/0xda
  if (buf.length >= 2 && buf[0] === 0x78) {
    try {
      const out = inflateSync(buf);
      const text = tryDecodeJsonFromBuffer(out);
      if (text) return { jsonText: text, method: "zlib" };
    } catch {
      // ignore
    }
  }

  // brotli has no simple header; attempt as a last resort
  try {
    const out = brotliDecompressSync(buf);
    const text = tryDecodeJsonFromBuffer(out);
    if (text) return { jsonText: text, method: "brotli" };
  } catch {
    // ignore
  }

  return undefined;
}

function decodeWsFrameToJsonText(data: RawData, isBinary: boolean): DecodeResult | undefined {
  const buf = toBuffer(data);

  // Some servers send JSON bytes inside a binary frame; try direct UTF-8 first.
  const direct = tryDecodeJsonFromBuffer(buf);
  if (direct) return { jsonText: direct, method: "utf8-json" };

  if (isBinary) {
    const decompressed = tryDecompressAndDecodeJson(buf);
    if (decompressed) return decompressed;
  }

  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asPayload(v: JsonValue): FlashblocksPayload | undefined {
  if (!isObject(v)) return undefined;
  return v as unknown as FlashblocksPayload;
}

function nowMs(): number {
  return Date.now();
}

function formatWsError(err: unknown): string {
  // Node-style Error
  if (err instanceof Error) return `${err.name}: ${err.message}`;

  // DOM ErrorEvent shape: { message, error }
  if (typeof err === "object" && err !== null) {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.length) return `ErrorEvent: ${maybeMessage}`;

    const maybeInner = (err as { error?: unknown }).error;
    if (maybeInner instanceof Error) return `${maybeInner.name}: ${maybeInner.message}`;
  }

  return String(err);
}

class FlashblocksStreamReader {
  private ws: WebSocket | null = null;
  private readonly args: Args;

  private framesReceived = 0;
  private payloadsReceived = 0;
  private readonly decodeCounts: Record<DecodeResult["method"], number> = {
    "utf8-json": 0,
    gzip: 0,
    zlib: 0,
    brotli: 0,
  };
  private readonly blocksSeen = new Set<number>();
  private readonly payloadTimes: number[] = [];
  private readonly blockData = new Map<
    number,
    { payloadCount: number; txCount: number; gasUsed: number }
  >();

  private startTime: number | null = null;
  private endTime: number | null = null;
  private lastMessageAt: number | null = null;

  constructor(args: Args) {
    this.args = args;
  }

  async run(): Promise<void> {
    this.startTime = nowMs();
    await this.connect();
    await this.listen();
    this.printSummary();
  }

  private connect(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`${Colors.BLUE}Connecting to builder WebSocket: ${this.args.wsUrl}${Colors.RESET}`);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.args.wsUrl);

      this.ws.on("open", () => {
        // eslint-disable-next-line no-console
        console.log(`${Colors.GREEN}✓ Connected${Colors.RESET}\n`);
        resolve();
      });

      this.ws.on("error", (err: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`${Colors.RED}✗ WebSocket error: ${formatWsError(err)}${Colors.RESET}`);
        reject(err);
      });

      this.ws.on("close", () => {
        // eslint-disable-next-line no-console
        console.log(`${Colors.YELLOW}WebSocket closed${Colors.RESET}`);
      });
    });
  }

  private listen(): Promise<void> {
    const ws = this.ws;
    if (!ws) throw new Error("WebSocket not initialized");

    const durationMs = this.args.durationSec ? this.args.durationSec * 1000 : undefined;
    const startedAt = nowMs();
    this.lastMessageAt = startedAt;

    // eslint-disable-next-line no-console
    console.log(
      `${Colors.BLUE}Listening for payloads${durationMs ? ` (${this.args.durationSec}s)` : ""}...${Colors.RESET}\n`,
    );

    return new Promise((resolve) => {
      const tick = () => {
        const t = nowMs();
        const inactiveFor = this.lastMessageAt ? t - this.lastMessageAt : 0;
        const ranFor = t - startedAt;

        if (durationMs !== undefined && ranFor >= durationMs) {
          this.endTime = t;
          this.ws?.close();
          resolve();
          return;
        }

        // If we haven't received anything for a while, exit with summary
        if (inactiveFor >= this.args.timeoutMs && this.payloadsReceived === 0) {
          // eslint-disable-next-line no-console
          console.error(
            `${Colors.YELLOW}No payloads received within ${this.args.timeoutMs}ms; exiting.${Colors.RESET}`,
          );
          this.endTime = t;
          this.ws?.close();
          resolve();
          return;
        }

        setTimeout(tick, 250);
      };

      setTimeout(tick, 250);

      ws.on("message", (data: RawData, isBinary: boolean) => {
        this.lastMessageAt = nowMs();
        this.framesReceived++;
        const buf = toBuffer(data);

        if (this.args.debug && !this.args.quiet) {
          // eslint-disable-next-line no-console
          console.log(
            `${Colors.BLUE}↪ ws message${Colors.RESET} isBinary=${String(isBinary)} bytes=${buf.length} hex=${hexPrefix(buf)}`,
          );
        }

        const decoded = decodeWsFrameToJsonText(buf, isBinary);
        if (!decoded) return;

        this.decodeCounts[decoded.method]++;
        if (this.args.debug && !this.args.quiet) {
          // eslint-disable-next-line no-console
          console.log(`${Colors.BLUE}  decode=${decoded.method}${Colors.RESET}`);
        }

        const parsed = safeJsonParse(decoded.jsonText);
        if (!parsed) return;

        if (this.args.raw && !this.args.quiet) {
          // eslint-disable-next-line no-console
          console.log(decoded.jsonText);
        }

        // Support either a single payload object or batches ([{...}, {...}]).
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (Array.isArray(item)) continue;
            const payload = asPayload(item as unknown as JsonValue);
            if (!payload) continue;
            this.handlePayload(payload);
          }
          return;
        }

        const payload = asPayload(parsed);
        if (!payload) return;
        this.handlePayload(payload);
      });

      // Resolve if websocket closes (e.g. CTRL-C, remote close)
      ws.on("close", () => {
        this.endTime = this.endTime ?? nowMs();
        resolve();
      });

      process.on("SIGINT", () => {
        // eslint-disable-next-line no-console
        console.log(`\n${Colors.YELLOW}Caught SIGINT; closing...${Colors.RESET}`);
        this.endTime = nowMs();
        ws.close();
        resolve();
      });
    });
  }

  private handlePayload(payload: FlashblocksPayload): void {
    const payloadId = payload.payload_id ?? "unknown";
    const blockNumber =
      typeof payload.metadata?.block_number === "number" ? payload.metadata.block_number : undefined;
    const transactions = Array.isArray(payload.diff?.transactions) ? payload.diff.transactions : [];
    const gasUsedHex = payload.diff?.gas_used ?? "0x0";

    let gasUsed = 0;
    try {
      gasUsed =
        typeof gasUsedHex === "string"
          ? gasUsedHex.startsWith("0x")
            ? parseInt(gasUsedHex, 16)
            : parseInt(gasUsedHex, 10)
          : typeof gasUsedHex === "number"
            ? gasUsedHex
            : 0;
    } catch {
      gasUsed = 0;
    }

    const txCount = transactions.length;
    this.payloadsReceived++;
    const t = nowMs();
    this.payloadTimes.push(t);

    if (blockNumber !== undefined) {
      this.blocksSeen.add(blockNumber);
      if (!this.blockData.has(blockNumber)) {
        this.blockData.set(blockNumber, { payloadCount: 0, txCount: 0, gasUsed: 0 });
      }
      const bd = this.blockData.get(blockNumber)!;
      bd.payloadCount++;
      bd.txCount += txCount;
      // `diff.gas_used` is already a per-block running total across payloads.
      // So for a given block, we want the last (or max) value, not a sum across payloads.
      bd.gasUsed = Math.max(bd.gasUsed, gasUsed);
    }

    if (this.args.quiet) return;

    // eslint-disable-next-line no-console
    console.log(`${Colors.BOLD}📦 Payload #${this.payloadsReceived}:${Colors.RESET}`);
    if (blockNumber !== undefined) {
      // eslint-disable-next-line no-console
      console.log(`   Block Number: ${blockNumber}`);
    }
    // eslint-disable-next-line no-console
    console.log(`   Payload ID: ${payloadId.substring(0, 16)}...`);
    // eslint-disable-next-line no-console
    console.log(`   Transactions: ${txCount}`);
    // eslint-disable-next-line no-console
    console.log(`   Gas Used (block cumulative): ${gasUsed.toLocaleString()}`);
    // eslint-disable-next-line no-console
    console.log(`   Timestamp: ${new Date(t).toISOString().split("T")[1]}`);
    // eslint-disable-next-line no-console
    console.log();
  }

  private printSummary(): void {
    const start = this.startTime ?? nowMs();
    const end = this.endTime ?? nowMs();
    const elapsedSec = Math.max(0, (end - start) / 1000);

    // eslint-disable-next-line no-console
    console.log(`\n${Colors.BOLD}${Colors.BLUE}${"=".repeat(60)}${Colors.RESET}`);
    // eslint-disable-next-line no-console
    console.log(`${Colors.BOLD}${Colors.BLUE}  FLASHBLOCKS STREAM SUMMARY${Colors.RESET}`);
    // eslint-disable-next-line no-console
    console.log(`${Colors.BOLD}${Colors.BLUE}${"=".repeat(60)}${Colors.RESET}\n`);

    // eslint-disable-next-line no-console
    console.log(`Elapsed: ${elapsedSec.toFixed(1)}s`);
    // eslint-disable-next-line no-console
    console.log(`Frames Received: ${this.framesReceived}`);
    // eslint-disable-next-line no-console
    console.log(`Payloads Received: ${this.payloadsReceived}`);
    // eslint-disable-next-line no-console
    console.log(
      `Decode methods: utf8=${this.decodeCounts["utf8-json"]}, gzip=${this.decodeCounts.gzip}, zlib=${this.decodeCounts.zlib}, brotli=${this.decodeCounts.brotli}`,
    );
    // eslint-disable-next-line no-console
    console.log(`Unique Blocks: ${this.blocksSeen.size}`);

    if (this.payloadsReceived > 0 && elapsedSec > 0) {
      // eslint-disable-next-line no-console
      console.log(`Average Payload Rate: ${(this.payloadsReceived / elapsedSec).toFixed(2)} payloads/sec`);
    }

    if (this.payloadTimes.length > 1) {
      const intervals: number[] = [];
      for (let i = 1; i < this.payloadTimes.length; i++) {
        intervals.push(this.payloadTimes[i]! - this.payloadTimes[i - 1]!);
      }
      if (intervals.length) {
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const min = Math.min(...intervals);
        const max = Math.max(...intervals);
        // eslint-disable-next-line no-console
        console.log(`\nPayload Intervals:`);
        // eslint-disable-next-line no-console
        console.log(`  Average: ${avg.toFixed(1)}ms`);
        // eslint-disable-next-line no-console
        console.log(`  Min: ${min.toFixed(1)}ms`);
        // eslint-disable-next-line no-console
        console.log(`  Max: ${max.toFixed(1)}ms`);
      }
    }

    if (this.blockData.size > 0) {
      let totalTxs = 0;
      let totalGas = 0;
      for (const bd of this.blockData.values()) {
        totalTxs += bd.txCount;
        totalGas += bd.gasUsed;
      }

      // eslint-disable-next-line no-console
      console.log(`\nBlock Statistics:`);
      // eslint-disable-next-line no-console
      console.log(`  Total Transactions (from diffs): ${totalTxs}`);
      // eslint-disable-next-line no-console
      console.log(`  Total Gas Used (from diffs): ${totalGas.toLocaleString()}`);

      const blockNums = [...this.blocksSeen.values()];
      if (blockNums.length) {
        const minBlock = Math.min(...blockNums);
        const maxBlock = Math.max(...blockNums);
        // eslint-disable-next-line no-console
        console.log(`  Block Range: ${minBlock} - ${maxBlock}`);
      }
    }

    if (this.payloadsReceived === 0) {
      // eslint-disable-next-line no-console
      console.log(`\n${Colors.YELLOW}No payloads received.${Colors.RESET}`);
      // eslint-disable-next-line no-console
      console.log(`Troubleshooting:`);
      // eslint-disable-next-line no-console
      console.log(`  - Verify the WebSocket URL (--ws-url) is correct`);
      // eslint-disable-next-line no-console
      console.log(`  - Check the builder/proxy is running and accessible`);
      // eslint-disable-next-line no-console
      console.log(`  - Confirm there is network connectivity to the endpoint`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`\n${Colors.GREEN}✓ Stream read complete${Colors.RESET}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reader = new FlashblocksStreamReader(args);
  await reader.run();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`${Colors.RED}Fatal error: ${String(err)}${Colors.RESET}`);
  process.exit(1);
});


