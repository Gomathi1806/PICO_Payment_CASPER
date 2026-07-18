//! PicoRouter — Pico's on-chain fee splitter for the Casper Network.
//!
//! Phase 1 of the Casper rail routed 100% of every unlock payment
//! directly to the creator, because a native transfer has exactly one
//! recipient. This contract is Phase 2: a fan (or an autonomous agent)
//! calls `pay` with the unlock price attached, and the contract
//! atomically forwards the creator's share and Pico's platform fee in
//! one deploy — no trust in the server, no second transfer to forget.
//!
//! The `link_id` argument mirrors the transfer-id memo used by the
//! native-transfer flow (first 48 bits of the Pico link UUID), so both
//! rails stay attributable on-chain.

use odra::casper_types::U512;
use odra::prelude::*;

/// Basis-points denominator (100% == 10_000 bps).
const BPS_DENOMINATOR: u32 = 10_000;
/// Safety cap so a compromised owner key can never raise the fee
/// above 20% — protects creators using an already-deployed router.
const MAX_FEE_BPS: u32 = 2_000;

#[odra::odra_error]
pub enum Error {
    /// `pay` was called with no CSPR attached.
    NoValueAttached = 1,
    /// Caller is not the contract owner.
    NotOwner = 2,
    /// Requested fee exceeds MAX_FEE_BPS.
    FeeTooHigh = 3,
}

/// Emitted for every routed payment — the on-chain receipt that ties
/// a Pico link to its settlement.
#[odra::event]
pub struct PaymentRouted {
    pub link_id: u64,
    pub payer: Address,
    pub creator: Address,
    pub creator_amount: U512,
    pub fee: U512,
}

#[odra::module(events = [PaymentRouted], errors = Error)]
pub struct PicoRouter {
    owner: Var<Address>,
    treasury: Var<Address>,
    fee_bps: Var<u32>,
}

#[odra::module]
impl PicoRouter {
    /// Deploys the router. `treasury` receives the platform fee;
    /// `fee_bps` is the fee in basis points (500 = 5%).
    pub fn init(&mut self, treasury: Address, fee_bps: u32) {
        if fee_bps > MAX_FEE_BPS {
            self.env().revert(Error::FeeTooHigh);
        }
        self.owner.set(self.env().caller());
        self.treasury.set(treasury);
        self.fee_bps.set(fee_bps);
    }

    /// Pays for a Pico link unlock. Attach the unlock price in CSPR;
    /// the contract splits it between `creator` and the treasury in
    /// the same deploy and emits a PaymentRouted receipt.
    #[odra(payable)]
    pub fn pay(&mut self, creator: Address, link_id: u64) {
        let env = self.env();
        let amount = env.attached_value();
        if amount.is_zero() {
            env.revert(Error::NoValueAttached);
        }

        let fee_bps = self.fee_bps.get_or_default();
        let fee = amount * U512::from(fee_bps) / U512::from(BPS_DENOMINATOR);
        let creator_amount = amount - fee;

        env.transfer_tokens(&creator, &creator_amount);
        if !fee.is_zero() {
            let treasury = self.treasury.get().unwrap_or_revert(&env);
            env.transfer_tokens(&treasury, &fee);
        }

        env.emit_event(PaymentRouted {
            link_id,
            payer: env.caller(),
            creator,
            creator_amount,
            fee,
        });
    }

    /// Owner-only: update the fee, hard-capped at 20%.
    pub fn set_fee_bps(&mut self, fee_bps: u32) {
        self.assert_owner();
        if fee_bps > MAX_FEE_BPS {
            self.env().revert(Error::FeeTooHigh);
        }
        self.fee_bps.set(fee_bps);
    }

    /// Owner-only: update the treasury address.
    pub fn set_treasury(&mut self, treasury: Address) {
        self.assert_owner();
        self.treasury.set(treasury);
    }

    pub fn fee_bps(&self) -> u32 {
        self.fee_bps.get_or_default()
    }

    pub fn treasury(&self) -> Option<Address> {
        self.treasury.get()
    }

    pub fn owner(&self) -> Option<Address> {
        self.owner.get()
    }

    fn assert_owner(&self) {
        if Some(self.env().caller()) != self.owner.get() {
            self.env().revert(Error::NotOwner);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostRef};

    const ONE_CSPR: u64 = 1_000_000_000;

    fn setup() -> (odra::host::HostEnv, PicoRouterHostRef) {
        let env = odra_test::env();
        let treasury = env.get_account(9);
        let contract = PicoRouter::deploy(
            &env,
            PicoRouterInitArgs { treasury, fee_bps: 500 },
        );
        (env, contract)
    }

    #[test]
    fn splits_95_5() {
        let (env, mut contract) = setup();
        let creator = env.get_account(1);
        let treasury = env.get_account(9);
        let creator_before = env.balance_of(&creator);
        let treasury_before = env.balance_of(&treasury);

        let price = U512::from(100 * ONE_CSPR);
        contract.with_tokens(price).pay(creator, 42);

        assert_eq!(
            env.balance_of(&creator) - creator_before,
            U512::from(95 * ONE_CSPR)
        );
        assert_eq!(
            env.balance_of(&treasury) - treasury_before,
            U512::from(5 * ONE_CSPR)
        );
    }

    #[test]
    fn emits_receipt() {
        let (env, mut contract) = setup();
        let creator = env.get_account(1);
        let payer = env.get_account(0);

        contract.with_tokens(U512::from(10 * ONE_CSPR)).pay(creator, 7);

        let event: PaymentRouted = env.get_event(&contract, 0).unwrap();
        assert_eq!(event.link_id, 7);
        assert_eq!(event.payer, payer);
        assert_eq!(event.creator, creator);
        assert_eq!(event.creator_amount, U512::from(9_500_000_000u64));
        assert_eq!(event.fee, U512::from(500_000_000u64));
    }

    #[test]
    fn rejects_zero_value() {
        let (env, mut contract) = setup();
        let creator = env.get_account(1);
        assert_eq!(
            contract.try_pay(creator, 1),
            Err(Error::NoValueAttached.into())
        );
    }

    #[test]
    fn only_owner_configures() {
        let (env, mut contract) = setup();
        env.set_caller(env.get_account(2));
        assert_eq!(contract.try_set_fee_bps(100), Err(Error::NotOwner.into()));
        assert_eq!(
            contract.try_set_treasury(env.get_account(2)),
            Err(Error::NotOwner.into())
        );
    }

    #[test]
    fn fee_cap_enforced() {
        let (_env, mut contract) = setup();
        assert_eq!(
            contract.try_set_fee_bps(2_001),
            Err(Error::FeeTooHigh.into())
        );
        contract.set_fee_bps(2_000); // at the cap is fine
        assert_eq!(contract.fee_bps(), 2_000);
    }

    #[test]
    fn zero_fee_router_sends_everything_to_creator() {
        let env = odra_test::env();
        let treasury = env.get_account(9);
        let mut contract = PicoRouter::deploy(
            &env,
            PicoRouterInitArgs { treasury, fee_bps: 0 },
        );
        let creator = env.get_account(1);
        let before = env.balance_of(&creator);
        contract.with_tokens(U512::from(3 * ONE_CSPR)).pay(creator, 1);
        assert_eq!(env.balance_of(&creator) - before, U512::from(3 * ONE_CSPR));
    }
}
