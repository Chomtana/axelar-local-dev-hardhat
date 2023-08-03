# Axelar local dev hardhat example

This project provide an example of how to unit test an Axelar smart contract with Hardhat using the [axelar-local-dev](https://github.com/axelarnetwork/axelar-local-dev) library.

## Running unit test

```bash
yarn install
npx hardhat test
```

## Example unit testing code

An overview of unit testing with axelar local dev and hardhat can be summarized in the below sample code snippet:

```typescript
import { Network, createNetwork, deployContract, relay } from "@axelar-network/axelar-local-dev";
import { expect } from "chai";
import { Wallet, Contract, utils } from "ethers-v5";
import { artifacts, ethers } from "hardhat";

const defaultAbiCoder = ethers.AbiCoder.defaultAbiCoder()

describe("Basic Axelar Bridge & GMP Unit Test", function () {
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

    // Deploy DummyAxelarExecutable
    const DummyAxelarExecutable = await artifacts.readArtifact("DummyAxelarExecutable")
    ethContract = await deployContract(ethUserWallet, DummyAxelarExecutable, [eth.gateway.address, eth.gasService.address])
    avalancheContract = await deployContract(avalancheUserWallet, DummyAxelarExecutable, [avalanche.gateway.address, avalanche.gasService.address])
  })

  it("Should mint token on the source chain", async () => {
    // Mint tokens on the source chain (Ethereum)
    await eth.giveToken(ethUserWallet.address, "aUSDC", BigInt(100e6));

    expect((await usdcEthContract.balanceOf(ethUserWallet.address)).toNumber()).to.equal(100e6)
  })

  // Send message directly through gateway
  it("Should send message directly through Axelar Gateway GMP", async () => {
    const message = "Hello Axelar!"

    // Must pay gas first
    const payGasTx = await eth.gasService
      .connect(ethUserWallet)  
      .payNativeGasForContractCall(
        ethUserWallet.address,
        avalanche.name, 
        avalancheContract.address, 
        defaultAbiCoder.encode(['string'], [message]),
        ethUserWallet.address,
        { value: utils.parseEther("0.01") }
      )
    await payGasTx.wait()

    // Request the Ethereum gateway to send message to the Avalanche network
    const ethGatewayTx = await eth.gateway
      .connect(ethUserWallet)
      .callContract(
        avalanche.name, 
        avalancheContract.address, 
        defaultAbiCoder.encode(['string'], [message]),
      )
    await ethGatewayTx.wait()

    // Relay the transactions
    await relay();

    expect(await avalancheContract.sourceChain()).to.equal(eth.name)
    expect(await avalancheContract.sourceAddress()).to.equal(ethUserWallet.address)
    expect(await avalancheContract.value()).to.equal(message)
  })

  // Send message through source chain contract
  it("Should send message through source chain contract", async () => {
    const message = "Hello Chom!"

    // Send message through source chain contract to the Avalanche network
    const ethGatewayTx = await ethContract
      .connect(ethUserWallet)
      .setRemoteValue(
        avalanche.name, 
        avalancheContract.address,
        message,
        { value: utils.parseEther("0.01") }
      )
    await ethGatewayTx.wait()

    // Relay the transactions
    await relay();

    expect(await avalancheContract.sourceChain()).to.equal(eth.name)
    expect(await avalancheContract.sourceAddress()).to.equal(ethContract.address)
    expect(await avalancheContract.value()).to.equal(message)
  })

  // Send token only
  it("Should bridge aUSDC to avalance", async () => {
    const initialBalanceETH = 100e6;
    const initialBalanceAvax = 0;
    const amount = 40e6;
    const fee = 1e6;

    // Approve the gateway to use tokens on the source chain (Ethereum)
    const ethApproveTx = await usdcEthContract
      .connect(ethUserWallet)
      .approve(eth.gateway.address, amount);
    await ethApproveTx.wait();

    // Request the Ethereum gateway to send tokens to the Avalanche network
    const ethGatewayTx = await eth.gateway
      .connect(ethUserWallet)
      .sendToken(avalanche.name, avalancheUserWallet.address, "aUSDC", amount);
    await ethGatewayTx.wait();

    // Relay the transactions
    await relay();

    expect((await usdcEthContract.balanceOf(ethUserWallet.address)).toNumber()).to.equal(initialBalanceETH - amount)
    expect((await usdcAvalancheContract.balanceOf(avalancheUserWallet.address)).toNumber()).to.equal(initialBalanceAvax + amount - fee)
  })

  // Send token and message
  it("Should bridge all aUSDC to avalance through Axelar Gateway GMP", async () => {
    const message = "Hello aUSDC!"

    const initialBalanceETH = 60e6;
    const initialBalanceAvax = 0;
    const amount = 60e6;

    // Must pay gas first
    const payGasTx = await eth.gasService
      .connect(ethUserWallet)  
      .payNativeGasForContractCallWithToken(
        ethUserWallet.address,
        avalanche.name, 
        avalancheContract.address, 
        defaultAbiCoder.encode(['string'], [message]),
        "aUSDC", 
        amount,
        ethUserWallet.address,
        { value: utils.parseEther("0.01") }
      )
    await payGasTx.wait()

    // Approve the gateway to use tokens on the source chain (Ethereum)
    const ethApproveTx = await usdcEthContract
      .connect(ethUserWallet)
      .approve(eth.gateway.address, amount);
    await ethApproveTx.wait();

    // Request the Ethereum gateway to send tokens to the Avalanche network
    const ethGatewayTx = await eth.gateway
      .connect(ethUserWallet)
      .callContractWithToken(
        avalanche.name, 
        avalancheContract.address, 
        defaultAbiCoder.encode(['string'], [message]),
        "aUSDC", 
        amount
      );
    await ethGatewayTx.wait();

    // Relay the transactions
    await relay();

    expect((await usdcEthContract.balanceOf(ethUserWallet.address)).toNumber()).to.equal(initialBalanceETH - amount)
    expect((await usdcAvalancheContract.balanceOf(avalancheContract.address)).toNumber()).to.equal(initialBalanceAvax + amount)

    expect(await avalancheContract.sourceChain()).to.equal(eth.name)
    expect(await avalancheContract.sourceAddress()).to.equal(ethUserWallet.address)
    expect(await avalancheContract.value()).to.equal(message)
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

```

Note: Since hardhat has already upgraded to ethers v6 but axelar-local-dev is still using ethers v5. We need to have two version in the same project until axelar-local-dev has successfully upgraded to ethers v6.
