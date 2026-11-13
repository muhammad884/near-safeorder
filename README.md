# NEAR SafeOrder

Escrow for online sales on **NEAR Testnet**. People buy and sell through WhatsApp, Instagram and Telegram, where one side always has to trust the other first. With SafeOrder the buyer pays **NEAR or native USDC (NEP-141)** into a smart contract, and the seller is paid only after the buyer confirms delivery.

- **Live app:** https://near-safeorder.vercel.app
- **Contract (testnet):** `safeorder11130813.testnet`
- **USDC used (Circle native, testnet):** `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`
- **Track:** Real-World Money. Built solo.

## Another project by the same builder

This builder is entering two independent projects in the NEAR Hackathon, and each README names the other:

- **NEAR AI Wallet Guardian** (separate repository and separate deployment)
  - Repository: https://github.com/muhammad884/near-ai-wallet-guardian
  - Live demo: https://near-ai-wallet-guardian.vercel.app

## Try it in one minute (no wallet needed)

Open the app and press **Start demo**. It creates two throwaway testnet accounts (a buyer and a seller) in your browser tab, with a switch between them. Testnet only, no real money. The keys live in that tab only (session storage) and disappear when it closes.

1. As the seller: **Create order**, choose *I am selling*, then **Create payment link**.
2. Switch to the buyer, open the link, **Pay**.
3. Seller: **Mark as shipped**. Buyer: **Confirm delivery**. The order shows *Released* and every step links to the transaction on nearblocks.
4. For a problem case: the buyer taps **Report a problem**, then either side proposes a split of the money and the other accepts.

Demo accounts come from the public NEAR testnet faucet, which rate-limits requests per network (HTTP 429). If the demo reports that the faucet is rate-limited, switch networks, try again later, or connect Meteor Wallet instead.

The UI is available in **English and Hausa** (HA/EN button), with light and dark mode.

## How it works

1. The seller creates a **payment link** (an invoice). The buyer, or anyone with the link if no buyer was named, pays into escrow.
2. The seller marks the order shipped before the deadline.
3. The buyer confirms delivery and the contract releases the exact amount to the seller.

| Situation | What the contract allows |
|---|---|
| Paid, seller never ships, deadline passed | Buyer can request a refund |
| Seller shipped | No automatic refund |
| Buyer confirms delivery | Funds released to the seller |
| Problem after shipping | Buyer opens a dispute, funds stay locked |
| Shipped or disputed | Buyer and seller can agree on a split: one proposes (with a short note), the other accepts, the contract pays both shares |
| Funded, shipped or disputed | Seller can refund the buyer voluntarily |

The contract cannot know whether a parcel arrived and does **not** pretend to. There is no arbitrator. The seller is never paid just because the buyer stayed silent.

## Architecture

    React + Vite + Tailwind (Vercel)
       |  views: JSON-RPC (testnet)
       |  transactions: Meteor Wallet (wallet-selector) or demo accounts
       v
    SafeOrder contract (Rust, near-sdk 5)  <-- ft_transfer_call / ft_transfer -->  USDC (NEP-141)

- `contract/` Rust contract and 72 unit tests
- `web/` React app
- `scripts/` Node helpers used for on-chain checks (`deploy.mjs`, `e2e.mjs`, `proof.mjs`, `mkaccts.mjs`)
- `.github/workflows/build.yml` runs `cargo test` and builds the wasm with `cargo near`

## Contract methods

| Method | Who | What |
|---|---|---|
| `new(usdc_contract)` | deployer | Sets the one accepted USDC contract (not hardcoded) |
| `create_order(seller, description, amount, token, ship_window_hours)` payable | buyer | Buyer-created order. About 0.02 NEAR attached for storage, the unused part is refunded |
| `create_invoice(description, amount, token, ship_window_hours, buyer?)` payable | seller | Seller-created order. With no buyer, the first account that pays becomes the buyer |
| `pay_near(order_id)` payable | buyer | Deposit must equal the amount exactly |
| `ft_on_transfer(sender_id, amount, msg)` | USDC contract | `msg` is the order id. Rejects other tokens, wrong sender, wrong amount, wrong state. A panic makes the token contract refund the sender |
| `mark_shipped`, `confirm_delivery`, `open_dispute` | seller, buyer, buyer | State changes with caller and state checks |
| `request_refund` | buyer | Only while Funded and after the deadline |
| `seller_refund` | seller | Funded, Shipped or Disputed |
| `propose_settlement(order_id, buyer_amount, note)`, `accept_settlement(order_id, buyer_amount)`, `retry_settlement` | buyer or seller | Negotiated split. Each leg is paid separately; a failed leg is remembered and can be retried |
| `on_settled`, `on_leg` | contract only | Finalize or roll back payouts |
| `get_order`, `get_orders_by_account`, `get_usdc_contract`, `get_total_orders` | anyone | Views |

Safety design: amounts are `u128` in smallest units (NEAR 24 decimals, USDC 6) with checked arithmetic. Before any payout the order is moved to a pending state, so a second call cannot pay twice; if a single payout fails, the callback restores the previous state. Settlement amounts are zeroed before the transfers and restored for any failed leg. `accept_settlement` must repeat the amount of the proposal being accepted, so a proposal that was changed in the meantime cannot be accepted by mistake. Order creation reserves extra storage so later state changes never draw on the contract balance.

## What was tested

**Unit tests:** 72 (`cd contract && cargo test`, also run in CI): order creation, NEAR and USDC deposits, wrong token contract, wrong amount, wrong sender, unauthorized shipping, confirm, refund and dispute, invalid order ids and state transitions, refund before and after the deadline, refund rejected after shipping, dispute, double release, double refund, invoices (first payer becomes buyer, seller cannot pay own invoice), settlement proposals and acceptance.

**On testnet, real transactions** (scripts and the web app, throwaway test accounts):
- NEAR flow: create, pay, ship, confirm, *Released*. The seller received the exact amount (measured +0.3000 NEAR for a 0.3 NEAR order).
- An unauthorized `confirm_delivery` by the seller was rejected; a second release was rejected.
- Negotiated settlement: of 0.3 NEAR the buyer received exactly +0.1000 and the seller about +0.1993 (0.2 minus its own gas); the order ended *Settled*.
- Dispute then seller refund (NEAR). USDC order: create, pay (including registering the escrow contract and the seller on the token), ship, confirm, *Released*.

**Real wallet (Meteor Wallet, Android, Chrome in desktop mode):** it connects, signed a `create_invoice` transaction, and signed a `pay_near` transaction with an attached deposit through a payment link (the order became *Funded*).

## Not verified and limitations

- Shipping, confirming, disputing and settling signed by a real wallet were not run, and neither was a USDC `ft_transfer_call` signed by a real wallet. Other wallets (Intear, Nightly) were not verified. On the test phone the built-in NEAR Connect Meteor flow fails (the browser lacks Ed25519 in WebCrypto), so the app connects Meteor through the wallet-selector module.
- Refund after the shipping deadline is covered by unit tests but was not run on-chain end to end. The payout-failure rollback (`on_settled`, `on_leg`) is unit-tested through extracted functions, but a failed payout was never triggered on-chain. A USDC settlement split was not run on-chain.
- A dispute without agreement has **no resolution path**: funds stay locked unless the buyer confirms or the seller refunds. There is no arbitrator in this MVP.
- Testnet only. Not audited. The contract account key is held by the deployer. No upgrade or admin logic.
- USDC payouts need the receiver registered on the token; the app registers the escrow contract and the seller when the buyer pays.
- `get_orders_by_account` scans all orders (fine for a demo, not at scale) and returns at most 50.
- A testing sign-in with a pasted testnet key exists behind a URL flag and is not shown in the UI.

## Future work

NEAR Intents (pay with any token or chain, settle in USDC), gasless transactions for buyers, an optional mediator account (for example a DAO) per order, and a small fee model.

## Run it yourself

    cd contract && cargo test             # unit tests
    cd web && npm install && npm run dev  # frontend (build: npm run build)

Config (`.env.example`): `VITE_CONTRACT_ID`, `VITE_USDC_ID`, `VITE_RPC_URL`. Deploy to Vercel with **Root Directory = `web`**. The contract wasm is built by GitHub Actions and published in the `wasm-latest` release; `scripts/deploy.mjs <account>.testnet` deploys it (it needs `near-api-js` in `scripts/`).

Never put a real private key into any testnet tool.

## Security review (v3) and remaining limitations

Self-reviewed with AI assistance, not externally audited. Looked at unauthorized actions, reentrancy, double payouts and locked funds.

Changed in v3:
- `accept_settlement` is bound to the exact proposal being accepted: if the proposal changed in the meantime, the call is rejected.
- Order creation reserves extra storage so later updates (deadline, proposal) are paid by the order creator, not from the contract balance.
- Payout callback logic lives in small pure functions, so rollback and per-leg recovery are unit-tested. 72 tests in total, including failed payouts, retries, the exact deadline boundary and unauthorized calls.
- On-chain check on the v3 contract: accepting with a different amount than the proposal was rejected, and settlement and release paid the exact amounts.

Checked and found sound: the order moves to a pending status before any payout (no double release or double refund), callbacks are private, USDC deposits are accepted only from the configured token contract, amounts use checked arithmetic.

Still open:
- There is no arbitrator or mediator. A dispute without agreement keeps funds locked. A mutually agreed mediator is future work.
- A real failed payout (for example a USDC receiver that is not registered) was not triggered on-chain.
- `get_orders_by_account` scans all orders and would not scale.
- The deployer's key controls the contract account. No upgrade policy, no audit, testnet only.
