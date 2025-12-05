# Flashblocks Transaction Sender

A script to send transactions with Flashblocks pre-confirmations using viem and a custom RPC.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set environment variables:
```bash
export PRIVATE_KEY="your_private_key_here"
export RPC_URL="http://localhost:8547"  # Regular RPC for sending transactions (op-geth)
export FLASHBLOCKS_RPC_URL="http://localhost:8550"  # Flashblocks RPC for reading receipts
export CHAIN_ID="13"  # Optional, defaults to 84532 (Base Sepolia)
export CHAIN_NAME="Custom Chain"  # Optional, defaults to "Custom Chain"
export RECIPIENT_ADDRESS="0x..."  # Optional, defaults to 0x0000...
export AMOUNT="0.0001"  # Optional, defaults to 0.0001 ETH
```

Or create a `.env` file:
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

Run the script:
```bash
bun run send
```

Or directly with bun:
```bash
bun run send-transaction.ts
```

## Notes

- The script sends transactions via `RPC_URL` (regular execution layer) and reads receipts via `FLASHBLOCKS_RPC_URL` (flashblocks-rpc)
- `RPC_URL` is required - use your execution layer RPC (e.g., `http://localhost:8547` for op-geth)
- `FLASHBLOCKS_RPC_URL` is required - use your flashblocks-rpc endpoint (e.g., `http://localhost:8550`)
- `CHAIN_ID` defaults to 84532 (Base Sepolia) if not specified
- The private key should not include the `0x` prefix in the environment variable (it will be added automatically)
- Make sure your RPC endpoints support the required JSON-RPC methods
- Flashblocks RPC provides faster pre-confirmations for reading transaction receipts
