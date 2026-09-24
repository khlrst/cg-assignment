# cg-assignment

Repo contains a pnpm monorepo with packages and apps used for building slice of a custody backend.


### Requirements

- Foundry ```curl -L https://getfoundry.sh/install | bash && foundryup```
- Docker compose
- pnpm 11.1.3

### Configuration

Indexer and API services do not have hardcoded values for the asset or multiple assets (native or erc20). However I added a [seed job](https://github.com/khlrst/cg-assignment/tree/main/apps/seed) that does seed the database with wallets and deployed ERC20 token. You can change the seed code to change token (set zero address to watch native transfers). The wallets list is dependent on the value provided in root `.env` file.

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

### Run:
```bash
pnpm install

pnpm build

docker compose up
```

API will be exposed at `http://localhost:3000`

API has 4 endpoints:

- ***GET*** `/health`
- ***GET*** `/wallets:limit:cursor` - returns a snapshot of all wallets and their balances, and next cursor. The balance field of each wallet has four properties: 
  ```ts
  type Balance = {
    token: string;
    chainId: number;
    // the balance N blocks behind,
    // where N is the height of confirmation;
    confirmedBalance: string;
    // the current balance, i.e. the balance at the tip of the chain
    currentBalance: string;
  };
  ```
- ***GET*** `/wallets:address:token` - returns the balance of a wallet for a given token
- ***POST*** `/withdrawals` - it expects address `to`, `from`, `asset`, `value` and a `broadcast` flag in the request body; returns a signed withdrawal transaction as a string, which can be decoded to transaction object, and optionally broadcasted to the network.

## Requirements for task
1. Wallet generation is delegated to the [evm package](https://github.com/khlrst/cg-assignment/blob/main/packages/evm/src/wallets.ts), which is utilizing the ethers v6 library and enforces wallet generation constraint from 1 to 20 wallets including. I have exposed a function `getWallet` which accepts seed phrase and index of desired wallet. So 1 to 20 constraint is mapped to 0 to 19 index range. The function generates consistent wallets for the same seed phrase and index.
2. The balance is tracked via indexing incoming blocks. Indexer support native and erc20 transfers, however for the native transfer we would need a provider supporting the `trace_block` rpc method, which is available in paid plans of quicknode, alchemy or requires running an own Erigon node, so I decided to stick with the ERC20 token transfers for this task. The indexer saves blocks, transfers to and from our wallets, updates balances snapshots (for easier unconfirmed balance buildup), and handles reorgs. Reorg handler relies on PG foreign key constraints and just deletes blocks, which in turn delete corresponding transfers and balance snapshots, so the balance is always consistent. After the reorg indexer continues from resolved head (oldest db and onchain matched block hash).
3. The deposits are explained in previous requirement. Withdrawals are treated the same way and only produced by the indexer, which in its' turn subtracts from the balance and updates the snapshot.
4. To withdraw funds from wallet you should call the API endpoint `/withdrawals`, which allows optional broadcasting to the API's configured chain. This design is only appropiate for this task, as it is only slice of the custodial backend. I will write more in Tradeoffs section.
5. API has 2 endpoints to retrieve wallet addresses and their balances. Also it is designed to take confirmations into account, so the balance snapshot for a wallet contains not only confirmed address but also current unconfirmed balance. The unconfirmed diff can be calculated by subtracting the confirmed balance from the current balance.
6. Unit tests are located in the `tests` directory of the [evm package](https://github.com/khlrst/cg-assignment/blob/main/packages/evm/).

## Deposit handling
The polling interval is one block, so all of the transfers within that block will be processed within a single database transaction. If indexer goes offline, it has the head block in the database. When it comes back online it just resumes polling blocks from that head. I did not implement catch-up logic in a way that indexer can process multiple block ranges, and that would be difficult to implement given that `trace_block` requires a full block download. However for just ERC20 tokens it is very easy to do.


## Tradeoffs
1. Ideally I would split the database from the indexer to the standalone service behind a message queue. In that way we can horizontally scale indexer processes for many chains (given that chain can have different transaction throughput). So I would also add a queue listener, so we can have predictable amount of Database connections.
2. API has mnemonic in its runtime. I would put withdrawal resolution and check behind an MPC cluster with Raft protocol, i.e. 3 nodes with 2/3 quorum, behind a leader and each node hold 1/2 of the private key to sign transaction. I would also add a gas station service to supply ETH for gas fees and deploy an aggregator contract or use a standard multicall.
