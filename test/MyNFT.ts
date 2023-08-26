import { Network, createNetwork, deployContract, relay } from "@axelar-network/axelar-local-dev";
import { expect } from "chai";
import { Wallet, Contract, utils, ContractTransaction } from "ethers-v5";
import { artifacts, ethers } from "hardhat";
import { bootstrapNetworks } from "./axelar";

const defaultAbiCoder = ethers.AbiCoder.defaultAbiCoder()

describe("Test ERC20 token bridge", function () {
  let eth: Network, avalanche: Network;
  let ethUserWallet: Wallet, avalancheUserWallet: Wallet;
  let usdcEthContract: Contract, usdcAvalancheContract: Contract;
  let ethContract: Contract, avalancheContract: Contract;

  before(async () => {
    // Bootstraping networks
    const bootstrap = await bootstrapNetworks()

    eth = bootstrap.eth;
    avalanche = bootstrap.avalanche;

    ethUserWallet = bootstrap.ethUserWallet;
    avalancheUserWallet = bootstrap.avalancheUserWallet;

    usdcEthContract = bootstrap.usdcEthContract;
    usdcAvalancheContract = bootstrap.usdcAvalancheContract;

    // Deploy MyToken
    const MyToken = await artifacts.readArtifact("ChomNFT")
    ethContract = await deployContract(ethUserWallet, MyToken, [eth.gateway.address, eth.gasService.address])
    avalancheContract = await deployContract(avalancheUserWallet, MyToken, [avalanche.gateway.address, avalanche.gasService.address])

    console.log("ETH Token:", ethContract.address)
    console.log("Avalanche Token:", avalancheContract.address)

    // Link destination chain contract
    await ethContract.connect(ethUserWallet).setDestinationMapping(eth.name, ethContract.address).then((tx: ContractTransaction) => tx.wait());
    await ethContract.connect(ethUserWallet).setDestinationMapping(avalanche.name, avalancheContract.address).then((tx: ContractTransaction) => tx.wait());
    await avalancheContract.connect(avalancheUserWallet).setDestinationMapping(eth.name, ethContract.address).then((tx: ContractTransaction) => tx.wait());
    await avalancheContract.connect(avalancheUserWallet).setDestinationMapping(avalanche.name, avalancheContract.address).then((tx: ContractTransaction) => tx.wait());
  })

  it("Should mint NFT on the source chain", async () => {
    // Mint NFT on the source chain (Ethereum)
    const tx = await ethContract.connect(ethUserWallet).safeMint(ethUserWallet.address, BigInt(1000));
    await tx.wait();
    expect((await ethContract.ownerOf(1000))).to.equal(ethUserWallet.address)
  })

  // Check revert cases
  it("Should revert if bridge to an unknown chain", async () => {
    await expect(ethContract
      .connect(ethUserWallet)
      .bridge(
        "Fantom",
        1000,
        { value: utils.parseEther("0.01") }
      )).to.be.throw // Should use .to.be.reverted once axelar-local-dev has migrated to ethers-v6
  })

  // Bridge through source chain contract
  it("Should bridge NFT through source chain contract", async () => {
    const nftId = 1000

    // Send message through source chain contract to the Avalanche network
    const ethGatewayTx = await ethContract
      .connect(ethUserWallet)
      .bridge(
        avalanche.name,
        nftId,
        { value: utils.parseEther("0.01") }
      )
    await ethGatewayTx.wait()

    // Relay the transactions
    await relay();

    expect(await ethContract.exists(nftId)).to.be.false
    expect((await avalancheContract.ownerOf(1000))).to.equal(ethUserWallet.address)
  })
})
