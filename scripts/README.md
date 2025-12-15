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

2. Set environment variables by creating a `.env` file:
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

Send transactions and measure pre-confirmation timing:
```bash
bun run flashblocks:time
```

Send multiple transactions:
```bash
TX_COUNT=5 bun run flashblocks:time
```

### Read Flashblocks Stream

Monitor the Flashblocks WebSocket stream:
```bash
bun run flashblocks:stream --ws-url wss://mainnet-flashblocks.unichain.org/ws --duration 10
```

## Notes

### Transaction Timing Script (`time_fb_txns.ts`)

- Sends transactions via `RPC_URL` (regular execution layer) and reads receipts via `FLASHBLOCKS_RPC_URL` (flashblocks-rpc)
- `RPC_URL` is required - use your execution layer RPC (e.g., `http://localhost:8547` for op-geth)
- `FLASHBLOCKS_RPC_URL` is required - use your flashblocks-rpc endpoint (e.g., `http://localhost:8550`)
- `CHAIN_ID` defaults to 84532 (Base Sepolia) if not specified
- The private key should not include the `0x` prefix in the environment variable (it will be added automatically)
- Make sure your RPC endpoints support the required JSON-RPC methods
- Flashblocks RPC provides faster pre-confirmations for reading transaction receipts

### Stream Reader Script (`read_fb_stream.ts`)

- Connects to the Flashblocks WebSocket stream to monitor payloads
- See the script's help for usage: `bun run flashblocks:stream -- --help`
