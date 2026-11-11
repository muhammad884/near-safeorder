use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::store::IterableMap;
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

const MAX_DESC: usize = 280;
const MAX_NOTE: usize = 140;
const NS_PER_HOUR: u64 = 3_600_000_000_000;
const MAX_SHIP_HOURS: u64 = 24 * 60;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_CALLBACK: Gas = Gas::from_tgas(15);

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Token { Near, Usdc }

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status { Created, Funded, Shipped, Disputed, Releasing, Released, Refunding, Refunded, Settling, Settled }

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Proposal { pub by: AccountId, pub buyer_amount: U128, pub note: String }

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Order {
    pub id: u64,
    pub buyer: Option<AccountId>,
    pub seller: AccountId,
    pub description: String,
    pub amount: U128,
    pub token: Token,
    pub created_at: U64,
    pub ship_window_hours: u64,
    pub ship_deadline: Option<U64>,
    pub status: Status,
    pub proposal: Option<Proposal>,
    pub owed_buyer: U128,
    pub owed_seller: U128,
    pub pending_legs: u8,
}

fn is_buyer(o: &Order, who: &AccountId) -> bool {
    o.buyer.as_ref() == Some(who)
}
fn buyer_id(o: &Order) -> AccountId {
    o.buyer.clone().unwrap_or_else(|| env::panic_str("Order has no buyer yet"))
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    usdc: AccountId,
    next_id: u64,
    orders: IterableMap<u64, Order>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(usdc_contract: AccountId) -> Self {
        Self { usdc: usdc_contract, next_id: 1, orders: IterableMap::new(b"o".to_vec()) }
    }

    /// Buyer creates an order for a known seller.
    #[payable]
    pub fn create_order(&mut self, seller: AccountId, description: String, amount: U128, token: Token, ship_window_hours: u64) -> u64 {
        let buyer = env::predecessor_account_id();
        require!(seller != buyer, "Seller cannot be the buyer");
        self.insert_order(Some(buyer.clone()), seller, description, amount, token, ship_window_hours, buyer)
    }

    /// Seller creates an invoice. With no buyer, the first account that pays becomes the buyer.
    #[payable]
    pub fn create_invoice(&mut self, description: String, amount: U128, token: Token, ship_window_hours: u64, buyer: Option<AccountId>) -> u64 {
        let seller = env::predecessor_account_id();
        if let Some(b) = &buyer {
            require!(*b != seller, "Seller cannot be the buyer");
        }
        self.insert_order(buyer, seller.clone(), description, amount, token, ship_window_hours, seller)
    }

    #[payable]
    pub fn pay_near(&mut self, order_id: u64) {
        let mut o = self.load(order_id);
        Self::claim_buyer(&mut o, &env::predecessor_account_id(), "Only the buyer can pay");
        require!(o.token == Token::Near, "This order is not in NEAR");
        require!(o.status == Status::Created, "Order is not payable");
        require!(env::attached_deposit().as_yoctonear() == o.amount.0, "Deposit must equal the order amount");
        Self::fund(&mut o);
        self.orders.insert(order_id, o);
    }

    /// NEP-141 receiver. msg = order id. A panic makes the token contract refund the sender.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdc, "Unsupported token");
        let order_id: u64 = msg.trim().parse().unwrap_or_else(|_| env::panic_str("msg must be the order id"));
        let mut o = self.load(order_id);
        require!(o.token == Token::Usdc, "This order is not in USDC");
        require!(o.status == Status::Created, "Order is not payable");
        Self::claim_buyer(&mut o, &sender_id, "Only the buyer can pay");
        require!(amount.0 == o.amount.0, "Amount must equal the order amount");
        Self::fund(&mut o);
        self.orders.insert(order_id, o);
        PromiseOrValue::Value(U128(0))
    }

    pub fn mark_shipped(&mut self, order_id: u64) {
        let mut o = self.load(order_id);
        require!(env::predecessor_account_id() == o.seller, "Only the seller can ship");
        require!(o.status == Status::Funded, "Order must be funded");
        let deadline = o.ship_deadline.map(|d| d.0).unwrap_or(0);
        require!(env::block_timestamp() <= deadline, "Shipping deadline has passed");
        o.status = Status::Shipped;
        self.orders.insert(order_id, o);
    }

    pub fn confirm_delivery(&mut self, order_id: u64) -> Promise {
        let o = self.load(order_id);
        require!(is_buyer(&o, &env::predecessor_account_id()), "Only the buyer can confirm");
        require!(o.status == Status::Shipped || o.status == Status::Disputed, "Order must be shipped");
        let to = o.seller.clone();
        self.settle(o, to, Status::Releasing, Status::Released)
    }

    pub fn open_dispute(&mut self, order_id: u64) {
        let mut o = self.load(order_id);
        require!(is_buyer(&o, &env::predecessor_account_id()), "Only the buyer can dispute");
        require!(o.status == Status::Shipped, "Only shipped orders can be disputed");
        o.status = Status::Disputed;
        self.orders.insert(order_id, o);
    }

    pub fn request_refund(&mut self, order_id: u64) -> Promise {
        let o = self.load(order_id);
        require!(is_buyer(&o, &env::predecessor_account_id()), "Only the buyer can refund");
        require!(o.status == Status::Funded, "Refund only before shipping");
        let deadline = o.ship_deadline.map(|d| d.0).unwrap_or(u64::MAX);
        require!(env::block_timestamp() > deadline, "Shipping deadline not reached");
        let to = buyer_id(&o);
        self.settle(o, to, Status::Refunding, Status::Refunded)
    }

    pub fn seller_refund(&mut self, order_id: u64) -> Promise {
        let o = self.load(order_id);
        require!(env::predecessor_account_id() == o.seller, "Only the seller can do this");
        require!(matches!(o.status, Status::Funded | Status::Shipped | Status::Disputed), "Nothing to refund");
        let to = buyer_id(&o);
        self.settle(o, to, Status::Refunding, Status::Refunded)
    }

    /// Buyer or seller proposes how much the buyer gets back; the rest goes to the seller.
    pub fn propose_settlement(&mut self, order_id: u64, buyer_amount: U128, note: String) {
        let mut o = self.load(order_id);
        let who = env::predecessor_account_id();
        require!(who == o.seller || is_buyer(&o, &who), "Only the buyer or seller can propose");
        require!(matches!(o.status, Status::Shipped | Status::Disputed), "Settlement only after shipping");
        require!(buyer_amount.0 <= o.amount.0, "Buyer share exceeds the order amount");
        require!(note.len() <= MAX_NOTE, "Note must be at most 140 characters");
        o.proposal = Some(Proposal { by: who, buyer_amount, note });
        self.orders.insert(order_id, o);
    }

    /// The other party accepts: the contract pays both shares.
    pub fn accept_settlement(&mut self, order_id: u64) {
        let mut o = self.load(order_id);
        let who = env::predecessor_account_id();
        require!(who == o.seller || is_buyer(&o, &who), "Only the buyer or seller can accept");
        require!(matches!(o.status, Status::Shipped | Status::Disputed), "Settlement only after shipping");
        let p = o.proposal.clone().unwrap_or_else(|| env::panic_str("No proposal"));
        require!(p.by != who, "You cannot accept your own proposal");
        o.owed_buyer = p.buyer_amount;
        o.owed_seller = U128(o.amount.0 - p.buyer_amount.0);
        o.proposal = None;
        o.status = Status::Settling;
        self.orders.insert(order_id, o);
        self.pay_owed(order_id);
    }

    /// Anyone can retry the legs that failed to pay out.
    pub fn retry_settlement(&mut self, order_id: u64) {
        let o = self.load(order_id);
        require!(o.status == Status::Settling, "Order is not settling");
        self.pay_owed(order_id);
    }

    #[private]
    pub fn on_settled(&mut self, order_id: u64, prev: Status, done: Status) -> bool {
        require!(env::promise_results_count() == 1, "Expected one promise result");
        let ok = env::promise_result_checked(0, 1024).is_ok();
        let mut o = self.load(order_id);
        require!(matches!(o.status, Status::Releasing | Status::Refunding), "Order is not settling");
        o.status = if ok { done } else { prev };
        self.orders.insert(order_id, o);
        ok
    }

    #[private]
    pub fn on_leg(&mut self, order_id: u64, to_buyer: bool, amount: U128) -> bool {
        require!(env::promise_results_count() == 1, "Expected one promise result");
        let ok = env::promise_result_checked(0, 1024).is_ok();
        let mut o = self.load(order_id);
        o.pending_legs = o.pending_legs.saturating_sub(1);
        if !ok {
            let slot = if to_buyer { &mut o.owed_buyer } else { &mut o.owed_seller };
            slot.0 = slot.0.checked_add(amount.0).unwrap_or_else(|| env::panic_str("Overflow"));
        }
        if o.pending_legs == 0 && o.owed_buyer.0 == 0 && o.owed_seller.0 == 0 {
            o.status = Status::Settled;
        }
        self.orders.insert(order_id, o);
        ok
    }

    pub fn get_order(&self, order_id: u64) -> Option<Order> {
        self.orders.get(&order_id).cloned()
    }

    pub fn get_orders_by_account(&self, account_id: AccountId, from_index: u64, limit: u64) -> Vec<Order> {
        self.orders
            .values()
            .filter(|o| o.buyer.as_ref() == Some(&account_id) || o.seller == account_id)
            .skip(from_index as usize)
            .take(limit.min(50) as usize)
            .cloned()
            .collect()
    }

    pub fn get_usdc_contract(&self) -> AccountId {
        self.usdc.clone()
    }

    pub fn get_total_orders(&self) -> u64 {
        self.next_id - 1
    }
}

impl Contract {
    fn load(&self, order_id: u64) -> Order {
        self.orders.get(&order_id).cloned().unwrap_or_else(|| env::panic_str("Order not found"))
    }

    #[allow(clippy::too_many_arguments)]
    fn insert_order(&mut self, buyer: Option<AccountId>, seller: AccountId, description: String, amount: U128, token: Token, ship_window_hours: u64, payer: AccountId) -> u64 {
        require!(amount.0 > 0, "Amount must be greater than zero");
        require!(!description.trim().is_empty() && description.len() <= MAX_DESC, "Description must be 1-280 characters");
        require!((1..=MAX_SHIP_HOURS).contains(&ship_window_hours), "Shipping window must be 1-1440 hours");
        let before = env::storage_usage();
        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1).unwrap_or_else(|| env::panic_str("Order id overflow"));
        self.orders.insert(
            id,
            Order {
                id, buyer, seller, description, amount, token,
                created_at: U64(env::block_timestamp()),
                ship_window_hours,
                ship_deadline: None,
                status: Status::Created,
                proposal: None,
                owed_buyer: U128(0),
                owed_seller: U128(0),
                pending_legs: 0,
            },
        );
        self.orders.flush();
        let used = env::storage_usage().saturating_sub(before) as u128;
        let cost = env::storage_byte_cost().as_yoctonear().checked_mul(used).unwrap_or_else(|| env::panic_str("Overflow"));
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= cost, "Attach more NEAR to cover order storage");
        if deposit > cost {
            Promise::new(payer).transfer(NearToken::from_yoctonear(deposit - cost)).detach();
        }
        id
    }

    fn claim_buyer(o: &mut Order, who: &AccountId, msg: &str) {
        let current = o.buyer.clone();
        match current {
            Some(b) => require!(b == *who, msg),
            None => {
                require!(*who != o.seller, "Seller cannot pay own order");
                o.buyer = Some(who.clone());
            }
        }
    }

    fn fund(o: &mut Order) {
        let window = o.ship_window_hours.checked_mul(NS_PER_HOUR).unwrap_or_else(|| env::panic_str("Overflow"));
        let deadline = env::block_timestamp().checked_add(window).unwrap_or_else(|| env::panic_str("Overflow"));
        o.ship_deadline = Some(U64(deadline));
        o.status = Status::Funded;
    }

    fn pay(&self, to: AccountId, token: Token, amount: U128) -> Promise {
        match token {
            Token::Near => Promise::new(to).transfer(NearToken::from_yoctonear(amount.0)),
            Token::Usdc => Promise::new(self.usdc.clone()).function_call(
                "ft_transfer".to_string(),
                json!({ "receiver_id": to, "amount": amount }).to_string().into_bytes(),
                NearToken::from_yoctonear(1),
                GAS_FT_TRANSFER,
            ),
        }
    }

    /// Lock the order in a pending state BEFORE paying out; on_settled restores it if the payout fails.
    fn settle(&mut self, mut o: Order, to: AccountId, pending: Status, done: Status) -> Promise {
        let prev = o.status;
        let id = o.id;
        let amount = o.amount;
        let token = o.token;
        o.status = pending;
        o.proposal = None;
        self.orders.insert(id, o);
        self.pay(to, token, amount).then(
            Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_settled(id, prev, done),
        )
    }

    /// Pay what is owed in a settlement. Owed amounts are zeroed BEFORE the transfers
    /// and restored by on_leg if a transfer fails.
    fn pay_owed(&mut self, order_id: u64) {
        let mut o = self.load(order_id);
        let legs = [(true, buyer_id(&o), o.owed_buyer.0), (false, o.seller.clone(), o.owed_seller.0)];
        for (to_buyer, to, amt) in legs {
            if amt == 0 {
                continue;
            }
            if to_buyer {
                o.owed_buyer = U128(0);
            } else {
                o.owed_seller = U128(0);
            }
            o.pending_legs += 1;
            self.pay(to, o.token, U128(amt))
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_leg(order_id, to_buyer, U128(amt)))
                .detach();
        }
        if o.owed_buyer.0 == 0 && o.owed_seller.0 == 0 && o.pending_legs == 0 {
            o.status = Status::Settled;
        }
        self.orders.insert(order_id, o);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    const USDC_AMT: u128 = 5_000_000; // 5 USDC (6 decimals)
    const T_FUND: u64 = 2_000;

    fn usdc() -> AccountId {
        "usdc.testnet".parse().unwrap()
    }
    fn buyer() -> AccountId {
        accounts(0)
    }
    fn seller() -> AccountId {
        accounts(1)
    }
    fn other() -> AccountId {
        accounts(2)
    }
    fn after_deadline() -> u64 {
        T_FUND + 24 * NS_PER_HOUR + 1
    }

    fn ctx(who: AccountId, deposit: u128, ts: u64) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("safeorder.testnet".parse().unwrap())
            .predecessor_account_id(who)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(ts)
            .build());
    }

    fn amt(t: Token) -> u128 {
        match t {
            Token::Near => 2 * NEAR,
            Token::Usdc => USDC_AMT,
        }
    }

    fn setup() -> Contract {
        ctx(other(), 0, 0);
        Contract::new(usdc())
    }

    fn new_order(c: &mut Contract, t: Token) -> u64 {
        ctx(buyer(), NEAR, 1_000);
        c.create_order(seller(), "Phone".to_string(), U128(amt(t)), t, 24)
    }

    fn fund(c: &mut Contract, t: Token, id: u64) {
        match t {
            Token::Near => {
                ctx(buyer(), amt(t), T_FUND);
                c.pay_near(id);
            }
            Token::Usdc => {
                ctx(usdc(), 0, T_FUND);
                c.ft_on_transfer(buyer(), U128(USDC_AMT), id.to_string());
            }
        }
    }

    fn status(c: &Contract, id: u64) -> Status {
        c.get_order(id).unwrap().status
    }

    fn shipped(c: &mut Contract, t: Token) -> u64 {
        let id = new_order(c, t);
        fund(c, t, id);
        ctx(seller(), 0, 3_000);
        c.mark_shipped(id);
        id
    }

    // ---- create ----
    #[test]
    fn creates_order() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        let o = c.get_order(id).unwrap();
        assert_eq!(id, 1);
        assert_eq!(o.buyer, Some(buyer()));
        assert_eq!(o.seller, seller());
        assert_eq!(o.status, Status::Created);
        assert_eq!(o.token, Token::Near);
        assert_eq!(o.amount.0, 2 * NEAR);
        assert!(o.ship_deadline.is_none());
        assert_eq!(c.get_total_orders(), 1);
    }

    #[test]
    #[should_panic(expected = "Seller cannot be the buyer")]
    fn rejects_self_seller() {
        let mut c = setup();
        ctx(buyer(), NEAR, 1_000);
        c.create_order(buyer(), "x".to_string(), U128(1), Token::Near, 24);
    }

    #[test]
    #[should_panic(expected = "Amount must be greater than zero")]
    fn rejects_zero_amount() {
        let mut c = setup();
        ctx(buyer(), NEAR, 1_000);
        c.create_order(seller(), "x".to_string(), U128(0), Token::Near, 24);
    }

    #[test]
    #[should_panic(expected = "Attach more NEAR")]
    fn rejects_missing_storage_deposit() {
        let mut c = setup();
        ctx(buyer(), 0, 1_000);
        c.create_order(seller(), "x".to_string(), U128(1), Token::Near, 24);
    }

    // ---- NEAR deposit ----
    #[test]
    fn funds_with_near() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        let o = c.get_order(id).unwrap();
        assert_eq!(o.status, Status::Funded);
        assert_eq!(o.ship_deadline.unwrap().0, T_FUND + 24 * NS_PER_HOUR);
    }

    #[test]
    #[should_panic(expected = "Deposit must equal")]
    fn rejects_wrong_near_amount() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        ctx(buyer(), NEAR, T_FUND);
        c.pay_near(id);
    }

    #[test]
    #[should_panic(expected = "Only the buyer can pay")]
    fn rejects_near_payment_from_stranger() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        ctx(other(), 2 * NEAR, T_FUND);
        c.pay_near(id);
    }

    #[test]
    #[should_panic(expected = "not in NEAR")]
    fn rejects_pay_near_on_usdc_order() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Usdc);
        ctx(buyer(), USDC_AMT, T_FUND);
        c.pay_near(id);
    }

    #[test]
    #[should_panic(expected = "Order is not payable")]
    fn rejects_double_payment() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        fund(&mut c, Token::Near, id);
    }

    // ---- USDC deposit (NEP-141) ----
    #[test]
    fn funds_with_usdc() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Usdc);
        ctx(usdc(), 0, T_FUND);
        let r = c.ft_on_transfer(buyer(), U128(USDC_AMT), id.to_string());
        match r {
            PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
            _ => panic!("expected value"),
        }
        assert_eq!(status(&c, id), Status::Funded);
    }

    #[test]
    #[should_panic(expected = "Unsupported token")]
    fn rejects_wrong_token_contract() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Usdc);
        ctx("fake-usdc.testnet".parse().unwrap(), 0, T_FUND);
        c.ft_on_transfer(buyer(), U128(USDC_AMT), id.to_string());
    }

    #[test]
    #[should_panic(expected = "Amount must equal")]
    fn rejects_wrong_usdc_amount() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Usdc);
        ctx(usdc(), 0, T_FUND);
        c.ft_on_transfer(buyer(), U128(USDC_AMT - 1), id.to_string());
    }

    #[test]
    #[should_panic(expected = "Only the buyer can pay")]
    fn rejects_wrong_usdc_sender() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Usdc);
        ctx(usdc(), 0, T_FUND);
        c.ft_on_transfer(other(), U128(USDC_AMT), id.to_string());
    }

    #[test]
    #[should_panic(expected = "not in USDC")]
    fn rejects_usdc_for_near_order() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        ctx(usdc(), 0, T_FUND);
        c.ft_on_transfer(buyer(), U128(USDC_AMT), id.to_string());
    }

    #[test]
    #[should_panic(expected = "Order not found")]
    fn rejects_invalid_order_id_in_usdc() {
        let mut c = setup();
        ctx(usdc(), 0, T_FUND);
        c.ft_on_transfer(buyer(), U128(USDC_AMT), "99".to_string());
    }

    #[test]
    #[should_panic(expected = "msg must be the order id")]
    fn rejects_bad_usdc_msg() {
        let mut c = setup();
        ctx(usdc(), 0, T_FUND);
        c.ft_on_transfer(buyer(), U128(USDC_AMT), "abc".to_string());
    }

    // ---- shipping ----
    #[test]
    fn seller_marks_shipped() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        assert_eq!(status(&c, id), Status::Shipped);
    }

    #[test]
    #[should_panic(expected = "Only the seller can ship")]
    fn stranger_cannot_ship() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(other(), 0, 3_000);
        c.mark_shipped(id);
    }

    #[test]
    #[should_panic(expected = "Only the seller can ship")]
    fn buyer_cannot_ship() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(buyer(), 0, 3_000);
        c.mark_shipped(id);
    }

    #[test]
    #[should_panic(expected = "Order must be funded")]
    fn cannot_ship_unfunded() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        ctx(seller(), 0, 3_000);
        c.mark_shipped(id);
    }

    #[test]
    #[should_panic(expected = "Shipping deadline has passed")]
    fn cannot_ship_after_deadline() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(seller(), 0, after_deadline());
        c.mark_shipped(id);
    }

    // ---- confirm / release ----
    #[test]
    fn buyer_confirm_starts_release() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(buyer(), 0, 4_000);
        let _ = c.confirm_delivery(id);
        assert_eq!(status(&c, id), Status::Releasing);
    }

    #[test]
    fn usdc_confirm_starts_release() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Usdc);
        ctx(buyer(), 0, 4_000);
        let _ = c.confirm_delivery(id);
        assert_eq!(status(&c, id), Status::Releasing);
    }

    #[test]
    #[should_panic(expected = "Order must be shipped")]
    fn prevents_double_release() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(buyer(), 0, 4_000);
        let _ = c.confirm_delivery(id);
        ctx(buyer(), 0, 4_001);
        let _ = c.confirm_delivery(id);
    }

    #[test]
    #[should_panic(expected = "Only the buyer can confirm")]
    fn stranger_cannot_confirm() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(other(), 0, 4_000);
        let _ = c.confirm_delivery(id);
    }

    #[test]
    #[should_panic(expected = "Only the buyer can confirm")]
    fn seller_cannot_confirm() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(seller(), 0, 4_000);
        let _ = c.confirm_delivery(id);
    }

    #[test]
    #[should_panic(expected = "Order must be shipped")]
    fn cannot_confirm_before_shipping() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(buyer(), 0, 4_000);
        let _ = c.confirm_delivery(id);
    }

    // ---- refund ----
    #[test]
    #[should_panic(expected = "Shipping deadline not reached")]
    fn refund_rejected_before_deadline() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(buyer(), 0, 5_000);
        let _ = c.request_refund(id);
    }

    #[test]
    fn eligible_refund_after_deadline() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(buyer(), 0, after_deadline());
        let _ = c.request_refund(id);
        assert_eq!(status(&c, id), Status::Refunding);
    }

    #[test]
    #[should_panic(expected = "Refund only before shipping")]
    fn prevents_double_refund() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(buyer(), 0, after_deadline());
        let _ = c.request_refund(id);
        ctx(buyer(), 0, after_deadline() + 1);
        let _ = c.request_refund(id);
    }

    #[test]
    #[should_panic(expected = "Refund only before shipping")]
    fn refund_rejected_after_shipping() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(buyer(), 0, after_deadline());
        let _ = c.request_refund(id);
    }

    #[test]
    #[should_panic(expected = "Only the buyer can refund")]
    fn stranger_cannot_refund() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(other(), 0, after_deadline());
        let _ = c.request_refund(id);
    }

    #[test]
    #[should_panic(expected = "Refund only before shipping")]
    fn cannot_refund_unfunded() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        ctx(buyer(), 0, after_deadline());
        let _ = c.request_refund(id);
    }

    #[test]
    fn usdc_refund_after_deadline() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Usdc);
        fund(&mut c, Token::Usdc, id);
        ctx(buyer(), 0, after_deadline());
        let _ = c.request_refund(id);
        assert_eq!(status(&c, id), Status::Refunding);
    }

    // ---- dispute ----
    #[test]
    fn dispute_locks_funds() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(buyer(), 0, 4_000);
        c.open_dispute(id);
        assert_eq!(status(&c, id), Status::Disputed);
    }

    #[test]
    #[should_panic(expected = "Refund only before shipping")]
    fn no_buyer_refund_during_dispute() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(buyer(), 0, 4_000);
        c.open_dispute(id);
        ctx(buyer(), 0, after_deadline());
        let _ = c.request_refund(id);
    }

    #[test]
    #[should_panic(expected = "Only shipped orders can be disputed")]
    fn cannot_dispute_unshipped() {
        let mut c = setup();
        let id = new_order(&mut c, Token::Near);
        fund(&mut c, Token::Near, id);
        ctx(buyer(), 0, 4_000);
        c.open_dispute(id);
    }

    #[test]
    #[should_panic(expected = "Only the buyer can dispute")]
    fn seller_cannot_dispute() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(seller(), 0, 4_000);
        c.open_dispute(id);
    }

    #[test]
    fn buyer_can_confirm_after_dispute() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(buyer(), 0, 4_000);
        c.open_dispute(id);
        ctx(buyer(), 0, 5_000);
        let _ = c.confirm_delivery(id);
        assert_eq!(status(&c, id), Status::Releasing);
    }

    // ---- seller refund ----
    #[test]
    fn seller_can_refund_shipped_order() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(seller(), 0, 4_000);
        let _ = c.seller_refund(id);
        assert_eq!(status(&c, id), Status::Refunding);
    }

    #[test]
    #[should_panic(expected = "Only the seller can do this")]
    fn stranger_cannot_seller_refund() {
        let mut c = setup();
        let id = shipped(&mut c, Token::Near);
        ctx(buyer(), 0, 4_000);
        let _ = c.seller_refund(id);
    }

    // ---- invalid ids / views ----
    #[test]
    #[should_panic(expected = "Order not found")]
    fn invalid_order_id_rejected() {
        let mut c = setup();
        ctx(seller(), 0, 3_000);
        c.mark_shipped(42);
    }

    #[test]
    fn lists_orders_by_account() {
        let mut c = setup();
        new_order(&mut c, Token::Near);
        new_order(&mut c, Token::Usdc);
        assert_eq!(c.get_orders_by_account(buyer(), 0, 10).len(), 2);
        assert_eq!(c.get_orders_by_account(seller(), 0, 10).len(), 2);
        assert_eq!(c.get_orders_by_account(other(), 0, 10).len(), 0);
        assert!(c.get_order(99).is_none());
        assert_eq!(c.get_usdc_contract(), usdc());
    }
}

#[cfg(test)]
mod tests_v2 {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    fn usdc() -> AccountId { "usdc.testnet".parse().unwrap() }
    fn ctx(who: AccountId, deposit: u128, ts: u64) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("safeorder.testnet".parse().unwrap())
            .predecessor_account_id(who)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(ts)
            .build());
    }
    fn setup() -> Contract { ctx(accounts(2), 0, 0); Contract::new(usdc()) }
    fn invoice(c: &mut Contract, buyer: Option<AccountId>, t: Token) -> u64 {
        ctx(accounts(1), NEAR, 1_000);
        let amt = if t == Token::Near { 2 * NEAR } else { 5_000_000 };
        c.create_invoice("Phone".to_string(), U128(amt), t, 24, buyer)
    }
    fn shipped(c: &mut Contract) -> u64 {
        ctx(accounts(0), NEAR, 1_000);
        let id = c.create_order(accounts(1), "Phone".to_string(), U128(2 * NEAR), Token::Near, 24);
        ctx(accounts(0), 2 * NEAR, 2_000);
        c.pay_near(id);
        ctx(accounts(1), 0, 3_000);
        c.mark_shipped(id);
        id
    }

    #[test]
    fn invoice_has_no_buyer_until_paid() {
        let mut c = setup();
        let id = invoice(&mut c, None, Token::Near);
        assert_eq!(c.get_order(id).unwrap().buyer, None);
        ctx(accounts(2), 2 * NEAR, 2_000);
        c.pay_near(id);
        let o = c.get_order(id).unwrap();
        assert_eq!(o.buyer, Some(accounts(2)));
        assert_eq!(o.status, Status::Funded);
    }

    #[test]
    #[should_panic(expected = "Seller cannot pay own order")]
    fn seller_cannot_pay_own_invoice() {
        let mut c = setup();
        let id = invoice(&mut c, None, Token::Near);
        ctx(accounts(1), 2 * NEAR, 2_000);
        c.pay_near(id);
    }

    #[test]
    #[should_panic(expected = "Only the buyer can pay")]
    fn named_buyer_invoice_rejects_others() {
        let mut c = setup();
        let id = invoice(&mut c, Some(accounts(0)), Token::Near);
        ctx(accounts(2), 2 * NEAR, 2_000);
        c.pay_near(id);
    }

    #[test]
    fn invoice_usdc_first_sender_becomes_buyer() {
        let mut c = setup();
        let id = invoice(&mut c, None, Token::Usdc);
        ctx(usdc(), 0, 2_000);
        let _ = c.ft_on_transfer(accounts(2), U128(5_000_000), id.to_string());
        assert_eq!(c.get_order(id).unwrap().buyer, Some(accounts(2)));
    }

    #[test]
    fn settlement_pays_both_legs() {
        let mut c = setup();
        let id = shipped(&mut c);
        ctx(accounts(0), 0, 4_000);
        c.propose_settlement(id, U128(NEAR), "half back".to_string());
        ctx(accounts(1), 0, 5_000);
        c.accept_settlement(id);
        let o = c.get_order(id).unwrap();
        assert_eq!(o.status, Status::Settling);
        assert_eq!(o.pending_legs, 2);
        assert_eq!(o.owed_buyer.0 + o.owed_seller.0, 0);
        assert!(o.proposal.is_none());
    }

    #[test]
    fn full_refund_settlement_is_one_leg() {
        let mut c = setup();
        let id = shipped(&mut c);
        ctx(accounts(1), 0, 4_000);
        c.propose_settlement(id, U128(2 * NEAR), "sorry".to_string());
        ctx(accounts(0), 0, 5_000);
        c.accept_settlement(id);
        assert_eq!(c.get_order(id).unwrap().pending_legs, 1);
    }

    #[test]
    fn settlement_works_from_disputed() {
        let mut c = setup();
        let id = shipped(&mut c);
        ctx(accounts(0), 0, 4_000);
        c.open_dispute(id);
        c.propose_settlement(id, U128(NEAR / 2), "".to_string());
        ctx(accounts(1), 0, 5_000);
        c.accept_settlement(id);
        assert_eq!(c.get_order(id).unwrap().status, Status::Settling);
    }

    #[test]
    #[should_panic(expected = "You cannot accept your own proposal")]
    fn cannot_accept_own_proposal() {
        let mut c = setup();
        let id = shipped(&mut c);
        ctx(accounts(0), 0, 4_000);
        c.propose_settlement(id, U128(NEAR), "x".to_string());
        c.accept_settlement(id);
    }

    #[test]
    #[should_panic(expected = "Buyer share exceeds")]
    fn proposal_cannot_exceed_amount() {
        let mut c = setup();
        let id = shipped(&mut c);
        ctx(accounts(0), 0, 4_000);
        c.propose_settlement(id, U128(3 * NEAR), "x".to_string());
    }

    #[test]
    #[should_panic(expected = "Only the buyer or seller can accept")]
    fn stranger_cannot_accept() {
        let mut c = setup();
        let id = shipped(&mut c);
        ctx(accounts(0), 0, 4_000);
        c.propose_settlement(id, U128(NEAR), "x".to_string());
        ctx(accounts(2), 0, 4_100);
        c.accept_settlement(id);
    }

    #[test]
    #[should_panic(expected = "Settlement only after shipping")]
    fn no_settlement_before_shipping() {
        let mut c = setup();
        ctx(accounts(0), NEAR, 1_000);
        let id = c.create_order(accounts(1), "x".to_string(), U128(2 * NEAR), Token::Near, 24);
        c.propose_settlement(id, U128(NEAR), "x".to_string());
    }

    #[test]
    #[should_panic(expected = "Order is not settling")]
    fn retry_only_while_settling() {
        let mut c = setup();
        let id = shipped(&mut c);
        ctx(accounts(2), 0, 4_000);
        c.retry_settlement(id);
    }
}
