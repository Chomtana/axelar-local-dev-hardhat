import { Network, createNetwork, deployContract, relay } from "@axelar-network/axelar-local-dev";
import { expect } from "chai";
import { Wallet, Contract, utils, ContractTransaction } from "ethers-v5";
import { artifacts, ethers } from "hardhat";

const defaultAbiCoder = ethers.AbiCoder.defaultAbiCoder()

describe("Test ERC20 token bridge", function () {
  let eth: Network, avalanche: Network;
  let ethUserWallet: Wallet, avalancheUserWallet: Wallet;
  let usdcEthContract: Contract, usdcAvalancheContract: Contract;
  let ethContract: Contract, avalancheContract: Contract;

  before(async () => {
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

    // Extract user wallets for both Ethereum and Avalanche networks
    const ethUserWallets = eth.userWallets;
    const avalancheUserWallets = avalanche.userWallets;

    ethUserWallet = ethUserWallets[0]
    avalancheUserWallet = avalancheUserWallets[0]

    // Get the token contracts for both Ethereum and Avalanche networks
    usdcEthContract = await eth.getTokenContract("aUSDC");
    usdcAvalancheContract = await avalanche.getTokenContract("aUSDC");

    // Deploy MyToken
    const MyToken = await artifacts.readArtifact("ChomToken")
    ethContract = await deployContract(ethUserWallet, MyToken, [eth.gateway.address, eth.gasService.address])
    avalancheContract = await deployContract(avalancheUserWallet, MyToken, [avalanche.gateway.address, avalanche.gasService.address])

    console.log("ETH Token:", ethContract.address)
    console.log("Avalanche Token:", avalancheContract.address)

    // Link destination chain contract
    await ethContract.connect(ethUserWallet).setDestinationAddress(eth.name, ethContract.address).then((tx: ContractTransaction) => tx.wait());
    await ethContract.connect(ethUserWallet).setDestinationAddress(avalanche.name, avalancheContract.address).then((tx: ContractTransaction) => tx.wait());
    await avalancheContract.connect(avalancheUserWallet).setDestinationAddress(eth.name, ethContract.address).then((tx: ContractTransaction) => tx.wait());
    await avalancheContract.connect(avalancheUserWallet).setDestinationAddress(avalanche.name, avalancheContract.address).then((tx: ContractTransaction) => tx.wait());
  })

  it("Should mint token on the source chain", async () => {
    // Mint tokens on the source chain (Ethereum)
    await ethContract.connect(ethUserWallet).mint(ethUserWallet.address, BigInt(100e6));
    expect((await ethContract.balanceOf(ethUserWallet.address)).toNumber()).to.equal(100e6)
  })

  // Check revert cases
  it("Should revert if bridge to an unknown chain", async () => {
    await expect(ethContract
      .connect(ethUserWallet)
      .bridge(
        "Fantom",
        10e6,
        { value: utils.parseEther("0.01") }
      )).to.be.throw // Should use .to.be.reverted once axelar-local-dev has migrated to ethers-v6
  })

  // Bridge through source chain contract
  it("Should bridge token through source chain contract", async () => {
    const initialBalanceETH = 100e6;
    const initialBalanceAvax = 0;
    const amount = 40e6

    // Send message through source chain contract to the Avalanche network
    const ethGatewayTx = await ethContract
      .connect(ethUserWallet)
      .bridge(
        avalanche.name,
        amount,
        { value: utils.parseEther("0.01") }
      )
    await ethGatewayTx.wait()

    // Relay the transactions
    await relay();

    expect((await ethContract.balanceOf(ethUserWallet.address)).toNumber()).to.equal(initialBalanceETH - amount)
    expect((await avalancheContract.balanceOf(ethUserWallet.address)).toNumber()).to.equal(initialBalanceAvax + amount)
  })

  it("Should bridge remaining token through source chain contract", async () => {
    const initialBalanceETH = 60e6;
    const initialBalanceAvax = 40e6;
    const amount = 60e6

    // Send message through source chain contract to the Avalanche network
    const ethGatewayTx = await ethContract
      .connect(ethUserWallet)
      .bridge(
        avalanche.name,
        amount,
        { value: utils.parseEther("0.01") }
      )
    await ethGatewayTx.wait()

    // Relay the transactions
    await relay();

    expect((await ethContract.balanceOf(ethUserWallet.address)).toNumber()).to.equal(initialBalanceETH - amount)
    expect((await avalancheContract.balanceOf(ethUserWallet.address)).toNumber()).to.equal(initialBalanceAvax + amount)
  })

  // // Log the token balances
  // console.log(
  //   (await usdcEthContract.balanceOf(ethUserWallet.address)) / 1e6,
  //   "aUSDC in Ethereum wallet"
  // );
  // console.log(
  //   (await usdcAvalancheContract.balanceOf(avalancheUserWallet.address)) / 1e6,
  //   "aUSDC in Avalanche wallet"
  // );
})
