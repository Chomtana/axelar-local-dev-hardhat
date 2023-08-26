import { Network, createNetwork, deployContract, relay } from "@axelar-network/axelar-local-dev";
import { Wallet, Contract, utils } from "ethers-v5";

let eth: Network, avalanche: Network;
let ethUserWallet: Wallet, avalancheUserWallet: Wallet;
let usdcEthContract: Contract, usdcAvalancheContract: Contract;

export async function bootstrapNetworks(walletIndex = 0) {
  if (!eth) {
    // Initialize an Ethereum network
    eth = await createNetwork({
      name: "Ethereum",
    });

    // Deploy USDC token on the Ethereum network
    await eth.deployToken("USDC", "aUSDC", 6, BigInt(100_000e6));

    // Initialize an Avalanche network
    avalanche = await createNetwork({
      name: "Avalanche",
    });

    // Deploy USDC token on the Avalanche network
    await avalanche.deployToken("USDC", "aUSDC", 6, BigInt(100_000e6));

    // Get the token contracts for both Ethereum and Avalanche networks
    usdcEthContract = await eth.getTokenContract("aUSDC");
    usdcAvalancheContract = await avalanche.getTokenContract("aUSDC");
  }

  // Extract user wallets for both Ethereum and Avalanche networks
  const ethUserWallets = eth.userWallets;
  const avalancheUserWallets = avalanche.userWallets;

  ethUserWallet = ethUserWallets[walletIndex]
  avalancheUserWallet = avalancheUserWallets[walletIndex]

  return {
    eth,
    avalanche,

    ethUserWallet,
    avalancheUserWallet,

    usdcEthContract,
    usdcAvalancheContract,
  }
}