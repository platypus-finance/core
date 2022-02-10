import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { BigNumber, BigNumberish, Contract, ContractFactory, Signer } from 'ethers'
import { solidity } from 'ethereum-waffle'

const { expect } = chai
chai.use(solidity)

export function usdc(n: string): BigNumber {
  return ethers.utils.parseUnits(n, 'mwei') // 6 decimals : 1_000_000
}

export function btc(n: string): BigNumber {
  return ethers.utils.parseUnits(n, 'gwei').div(10) // 8 decimals : 100_000_000
}

export function toWei(amount: BigNumberish, tokenDecimals: BigNumberish): BigNumber {
  return ethers.utils.parseUnits(amount.toString(), tokenDecimals)
}

let TestERC20: ContractFactory
let Asset: ContractFactory
let Pool: ContractFactory
let AggregateAccount: ContractFactory

async function intializeContractFactories() {
  TestERC20 = await ethers.getContractFactory('TestERC20')
  Asset = await ethers.getContractFactory('Asset')
  AggregateAccount = await ethers.getContractFactory('AggregateAccount')
  Pool = await ethers.getContractFactory('Pool')
}

intializeContractFactories()

export const setupPool = async (owner: Signer): Promise<{ pool: Contract }> => {
  Pool = await ethers.getContractFactory('Pool')

  const pool = await Pool.connect(owner).deploy()

  // Wait for contract to be deployed
  await pool.deployTransaction.wait()

  await pool.connect(owner).initialize()
  return { pool }
}

export const createAndInitializeToken = async (
  symbol: string,
  decimal: number,
  owner: Signer,
  pool: Contract,
  aggregateAccount: Contract
): Promise<{ token: Contract; asset: Contract }> => {
  const token = await TestERC20.connect(owner).deploy(symbol, symbol, decimal, parseEther('1000000000000')) // 1000 M
  const asset = await Asset.connect(owner).deploy()
  await asset.deployTransaction.wait()
  await asset.connect(owner).initialize(token.address, 'test', 'test', aggregateAccount.address)

  // Wait for transaction to be deployed
  await token.deployTransaction.wait()
  await asset.deployTransaction.wait()

  await asset.connect(owner).setPool(pool.address)
  await pool.connect(owner).addAsset(token.address, asset.address)

  return { token, asset }
}

export const setupAggregateAccount = async (owner: Signer, name: string, isStable: boolean): Promise<Contract> => {
  AggregateAccount = await ethers.getContractFactory('AggregateAccount')
  const aggregateAccount: Contract = await AggregateAccount.connect(owner).deploy()
  await aggregateAccount.deployTransaction.wait()
  await aggregateAccount.connect(owner).initialize(name, isStable)

  return aggregateAccount
}

export const expectAssetValues = async (
  asset: Contract,
  decimals: number,
  { cash, liability }: { cash: string; liability: string }
): Promise<void> => {
  const expectedCashBN = toWei(cash, decimals)

  expect(await asset.cash()).to.be.equal(expectedCashBN)
  expect(await asset.liability()).to.be.equal(toWei(liability, decimals))
  // TokenBalance should always equal cash
  expect(await asset.underlyingTokenBalance()).to.be.equal(expectedCashBN)
}

export const fundUserAndApprovePool = async (
  token: Contract,
  user: Signer,
  amount: string,
  pool: Contract,
  owner: Signer
): Promise<void> => {
  await token.connect(owner).transfer(user.getAddress(), amount)
  await token.connect(user).approve(pool.address, ethers.constants.MaxInt256)
}

let TestChainlinkAggregator: ContractFactory

async function initTestChainlinkAggregator() {
  TestChainlinkAggregator = await ethers.getContractFactory('TestChainlinkAggregator')
}

initTestChainlinkAggregator()

export const setupChainlink = async (owner: Signer, initialRate: string, block: string): Promise<Contract> => {
  const chainlink = await TestChainlinkAggregator.connect(owner).deploy()
  //TODO get from swap case info too
  await chainlink.connect(owner).setLatestAnswer(initialRate, block)

  return chainlink
}

let ChainlinkProxyPriceProvider: ContractFactory

async function initChainlinkProxyPriceProvider() {
  ChainlinkProxyPriceProvider = await ethers.getContractFactory('ChainlinkProxyPriceProvider')
}

initChainlinkProxyPriceProvider()

type OracleSetter = (rates: string[], newBlock: string) => void

interface Chainlink {
  address: string
  initialRate: string
}

export const setPriceOracle = async (
  // WETH: Contract,
  pool: Contract,
  owner: Signer,
  block: string,
  chainlinks: Chainlink[]
): Promise<OracleSetter> => {
  const priceOracle = await ChainlinkProxyPriceProvider.connect(owner).deploy([], [])
  // await priceOracle.connect(owner).setETHAddress(WETH.address)
  await pool.connect(owner).setPriceOracle(priceOracle.address)

  const chainlinkPromise = chainlinks.map(({ initialRate }) => {
    return setupChainlink(owner, initialRate, block)
  })

  const chainlinkValues = await Promise.all(chainlinkPromise)

  await priceOracle.connect(owner).setAssetSources(
    chainlinks.map(({ address }) => address),
    chainlinkValues.map(({ address }) => address)
  )

  return async (rates: string[], newBlock: string): Promise<void> => {
    const updatePromise = chainlinkValues.map((link, index) => {
      return link.connect(owner).setLatestAnswer(rates[index], newBlock)
    })

    await Promise.all(updatePromise)
  }
}
