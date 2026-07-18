//! Deploy + interact with PicoRouter via odra-cli.
//!
//! Livenet usage (Casper testnet):
//!   export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=../../agent/keys/agent-secret.pem
//!   export ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network
//!   export ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
//!   cargo run --bin pico_router_cli --features livenet -- deploy

use odra::host::HostEnv;
use pico_router::pico_router::{PicoRouter, PicoRouterInitArgs};
use odra_cli::{
    deploy::DeployScript, ContractProvider, DeployedContractsContainer, DeployerExt, OdraCli,
};

/// Deploys PicoRouter with a 5% fee. The deployer account doubles as
/// the initial treasury; `set_treasury` can repoint it any time.
pub struct PicoRouterDeployScript;

impl DeployScript for PicoRouterDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer,
    ) -> Result<(), odra_cli::deploy::Error> {
        let treasury = env.caller();
        let _router = PicoRouter::load_or_deploy(
            env,
            PicoRouterInitArgs {
                treasury,
                fee_bps: 500,
            },
            container,
            350_000_000_000,
        )?;
        Ok(())
    }
}

pub fn main() {
    OdraCli::new()
        .about("CLI tool for the PicoRouter fee-splitter contract")
        .deploy(PicoRouterDeployScript)
        .contract::<PicoRouter>()
        .build()
        .run();
}
