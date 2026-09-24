# CG Assignment

A TypeScript/pnpm monorepo implementing a slice of a custodial wallet backend.

The project generates deterministic EVM wallets, indexes ERC20 transfers, persists wallet balances, handles chain reorganizations, and exposes an API for querying balances and building/signing withdrawals.

---

## Requirements

* [Foundry](https://getfoundry.sh/)
* Docker Compose
* pnpm `11.1.3`
* Node.js

### Foundry

Install Foundry with:

```bash
curl -L https://getfoundry.sh/install | bash
foundryup
```

The project uses **Anvil** for local blockchain testing.

Verify the installation:

```bash
forge --version
anvil --version
```

---

## Configuration

Indexer and API services do not have hardcoded values for the asset or multiple assets (native or erc20).
However I added a [seed job](https://github.com/khlrst/cg-assignment/tree/main/apps/seed) that does seed the database with wallets and deployed ERC20 token.

You can change the seed code to change token (set zero address to watch native transfers).
The wallets list is dependent on the value provided in root `.env` file.

```bash
# Main variable
RPC_URL=YOUR_RPC_URL
MNEMONIC=YOUR_MNEMONIC

# Optional variables
LOG_LEVEL=
RETRY_DELAY_NODE=
RETRY_MAX_RETRIES=
CONFIRMATIONS=
PORT=API_DESIRED_PORT
ENVIRONMENT=
```

you can find token code in the [token package](https://github.com/khlrst/cg-assignment/tree/main/apps/token)

this token is deployed to sepolia at address [0x0af5e44f14f1531783afcfb4c5ff46f4921bd7ae](https://sepolia.etherscan.io/address/0x0af5e44f14f1531783afcfb4c5ff46f4921bd7ae)

I intentionally left minting [function public](https://sepolia.etherscan.io/address/0x0af5e44f14f1531783afcfb4c5ff46f4921bd7ae#writeContract#F2), so you can test incoming deposits of this token to generated wallets. You can also use [mint batch](https://sepolia.etherscan.io/address/0x0af5e44f14f1531783afcfb4c5ff46f4921bd7ae#writeContract#F3) to conviniently mint to multiple wallets at once.

---

## Running the project

Install dependencies:

```bash
pnpm install
```

Build the monorepo:

```bash
pnpm build
```

Start the services:

```bash
docker compose up
```

The API is exposed on:

```text
http://localhost:3000
```

---

# API

The API exposes four endpoints:

| Method | Endpoint       | Description                                         |
| ------ | -------------- | --------------------------------------------------- |
| `GET`  | `/health`      | Health check                                        |
| `GET`  | `/wallet`      | Get the balance of a specific wallet/token pair     |
| `GET`  | `/wallets`     | Get all wallets and their balances                  |
| `POST` | `/withdrawals` | Build/sign a withdrawal and optionally broadcast it |

---

## Health check

### `GET /health`

Returns the service health status.

```bash
curl http://localhost:3000/health
```

Example response:

```json
{
  "status": "ok"
}
```

---

## Get a wallet balance

### `GET /wallet`

Query parameters:

| Parameter | Description         |
| --------- | ------------------- |
| `address` | Wallet address      |
| `token`   | ERC20 token address |

Example:

```bash
curl "http://localhost:3000/wallet?address=0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199&token=0x0af5e44f14f1531783afcfb4c5ff46f4921bd7ae"
```

Example response:

```json
{
  "wallet": {
    "token": "0x0af5e44f14f1531783afcfb4c5ff46f4921bd7ae",
    "chainId": 11155111,
    "confirmedBalance": "1900000000000000000000",
    "currentBalance": "1900000000000000000000"
  }
}
```

The balance contains both a confirmation-safe balance and the current balance at the indexed chain tip.

---

## Get all wallets

### `GET /wallets`

Returns the generated wallets and their balances.

Basic request:

```bash
curl "http://localhost:3000/wallets"
```

Pagination is supported through:

```text
limit
cursor
```

Example:

```bash
curl "http://localhost:3000/wallets?limit=10"
```

Using the returned cursor:

```bash
curl "http://localhost:3000/wallets?limit=10&cursor=YOUR_CURSOR"
```

### Balance structure

Each balance has the following structure:

```ts
type Balance = {
  token: string;
  chainId: number;

  // Balance N blocks behind the current chain tip,
  // where N is the configured confirmation depth.
  confirmedBalance: string;

  // Balance at the current indexed chain tip.
  currentBalance: string;
};
```

The difference between `currentBalance` and `confirmedBalance` represents the unconfirmed balance change:

```text
unconfirmed difference =
    currentBalance - confirmedBalance
```

---

# Withdrawals

### `POST /withdrawals`

The endpoint accepts:

| Field       | Description                          |
| ----------- | ------------------------------------ |
| `from`      | Generated wallet address             |
| `to`        | Destination address                  |
| `asset`     | ERC20 token address                  |
| `value`     | Amount in the token's smallest unit  |
| `broadcast` | Whether to broadcast the transaction |

### Build and sign without broadcasting

This is the safest way to inspect a withdrawal during development.

```bash
curl -X POST http://localhost:3000/withdrawals \
  -H "Content-Type: application/json" \
  -d '{
    "from": "0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199",
    "to": "0x39919853588384E093B12BaEAaBB5e03d4DC765a",
    "asset": "0x0af5E44f14F1531783afCFb4c5fF46F4921Bd7ae",
    "value": "1900000000000000000000",
    "broadcast": false
  }'
```

With `broadcast: false`, the API builds and signs the transaction but does **not** broadcast it.

The response contains the signed transaction data.

### Broadcast the transaction

To broadcast the transaction to the configured network:

```bash
curl -X POST http://localhost:3000/withdrawals \
  -H "Content-Type: application/json" \
  -d '{
    "from": "0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199",
    "to": "0x39919853588384E093B12BaEAaBB5e03d4DC765a",
    "asset": "0x0af5E44f14F1531783afCFb4c5fF46F4921Bd7ae",
    "value": "1000000000000000000",
    "broadcast": true
  }'
```

The API checks the wallet's confirmed balance before constructing the withdrawal.

---

# Task requirements

### 1.

 Wallet generation is delegated to the [evm package](https://github.com/khlrst/cg-assignment/blob/main/packages/evm/src/wallets.ts), which is utilizing the ethers v6 library and enforces wallet generation constraint from 1 to 20 wallets including.

 I have exposed a function `getWallet` which accepts seed phrase and index of desired wallet. So 1 to 20 constraint is mapped to 0 to 19 index range. The function generates consistent wallets for the same seed phrase and index.

### 2.

The balance is tracked via indexing incoming blocks.

Indexer support native and erc20 transfers, however for the native transfer we would need a provider supporting the `trace_block` rpc method, which is available in paid plans of quicknode, alchemy or requires running an own Erigon node, so I decided to stick with the ERC20 token transfers for this task.

The indexer saves blocks, transfers to and from our wallets, updates balances snapshots (for easier unconfirmed balance buildup), and handles reorgs.

Reorg handler relies on PG foreign key constraints and just deletes blocks, which in turn delete corresponding transfers and balance snapshots, so the balance is always consistent.

After the reorg indexer continues from resolved head (oldest db and onchain matched block hash).

### 3.

The deposits are explained in previous requirement. Withdrawals are treated the same way and only produced by the indexer, which in its' turn subtracts from the balance and updates the snapshot.

### 4.

To withdraw funds from wallet you should call the API endpoint `/withdrawals`, which allows optional broadcasting to the API's configured chain.

This design is only appropiate for this task, as it is only slice of the custodial backend. I will write more in Tradeoffs section.

### 5. 

API has 2 endpoints to retrieve wallet addresses and their balances.

Also it is designed to take confirmations into account, so the balance snapshot for a wallet contains not only confirmed address but also current unconfirmed balance.

The unconfirmed diff can be calculated by subtracting the confirmed balance from the current balance

### 6.

Unit tests are located in the `tests` directory of the [evm package](https://github.com/khlrst/cg-assignment/blob/main/packages/evm/).

# Deposit handling

The polling interval is one block, so all of the transfers within that block will be processed within a single database transaction. 

If indexer goes offline, it has the head block in the database.

When it comes back online it just resumes polling blocks from that head.

I did not implement catch-up logic in a way that indexer can process multiple block ranges, and that would be difficult to implement given that `trace_block` requires a full block download. However for just ERC20 tokens it is very easy to do.


# Tradeoffs

## 1. Database / indexer separation

Ideally I would split the database from the indexer to the standalone service behind a message queue.

In that way we can horizontally scale indexer processes for many chains (given that chain can have different transaction throughput).

Also, I would also add a queue listener, so we can have predictable amount of database connections.

## 2. Key management

API has mnemonic in its' runtime.

I would put withdrawal validation and resolution behind an MPC cluster with Raft protocol,

i.e. 3 nodes with 2/3 quorum, behind a leader and each node hold 1/2 of the private key to sign transaction.

I would also add a gas station service to supply ETH for gas fees and deploy an aggregator contract or use a standard multicall.

## 3. Fast catch-up logic

I did not make the fast catch-up logic, so if you miss a lot of blocks while the indexer is offline, you want to just delete the volumes and restart the indexer from the latest block.
