# Flashblocks Scripts

Scripts for working with Flashblocks pre-confirmations using viem and custom RPCs.

## Scripts

- **`time_fb_txns.ts`** - Send transactions and measure Flashblocks pre-confirmation timing
- **`read_fb_stream.ts`** - Read and monitor the Flashblocks WebSocket stream

## Setup

1. Install dependencies:
```bash
bun install
```

2. Create a `.env` file with required configuration:
```
PRIVATE_KEY=your_private_key_here
RPC_URL=http://localhost:8547
FLASHBLOCKS_RPC_URL=http://localhost:8550
CHAIN_ID=13
CHAIN_NAME=Custom Chain
RECIPIENT_ADDRESS=0x...
AMOUNT=0.0001
```

## Usage

### Time Flashblocks Transactions

Send a transaction and measure pre-confirmation timing:
```bash
bun run flashblocks:time
```

Send multiple transactions:
```bash
bun run flashblocks:time -- --tx-count 5
```

Use `sendTransactionSync` (sends transaction and waits for receipt in one call):
```bash
bun run flashblocks:time -- --use-send-txn-sync
```

With custom timing parameters:
```bash
bun run flashblocks:time -- --tx-count 10 --tx-interval-ms 100
```

With debug output (prints full receipts):
```bash
bun run flashblocks:time -- --debug
```

For all options:
```bash
bun run flashblocks:time -- --help
```

### Read Flashblocks Stream

Monitor the Flashblocks WebSocket stream:
```bash
bun run flashblocks:stream --ws-url wss://mainnet-flashblocks.unichain.org/ws --duration 10
```

## Notes

### Transaction Timing Script (`time_fb_txns.ts`)

- Sends transactions via RPC URL (regular execution layer) and reads receipts via Flashblocks RPC
- Provides detailed timing statistics (avg, p50, p90, max)
- Run `bun run flashblocks:time -- --help` for all options

### Stream Reader Script (`read_fb_stream.ts`)

- Connects to the Flashblocks WebSocket stream to monitor payloads
- See the script's help for usage: `bun run flashblocks:stream -- --help`
