import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { BigNumber, BigNumberish, Contract, ContractFactory, Signer } from 'ethers'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

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
let PoolYYAvax: ContractFactory
let PoolAnkrETH: ContractFactory
let AggregateAccount: ContractFactory
let WETHForwarder: ContractFactory
let TestWAVAX: ContractFactory

async function intializeContractFactories() {
  TestERC20 = await ethers.getContractFactory('TestERC20')
  Asset = await ethers.getContractFactory('Asset')
  AggregateAccount = await ethers.getContractFactory('AggregateAccount')
  Pool = await ethers.getContractFactory('Pool')
  TestWAVAX = await ethers.getContractFactory('TestWAVAX')
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

export const setupSecondaryPool = async (owner: Signer): Promise<{ pool: Contract }> => {
  Pool = await ethers.getContractFactory('PoolSecondary')

  const pool = await Pool.connect(owner).deploy()

  // Wait for contract to be deployed
  await pool.deployTransaction.wait()

  await pool.connect(owner).initialize()
  return { pool }
}

export const setupSecondaryPurePool = async (owner: Signer): Promise<{ pool: Contract }> => {
  Pool = await ethers.getContractFactory('PoolSecondaryPure')

  const pool = await Pool.connect(owner).deploy()

  // Wait for contract to be deployed
  await pool.deployTransaction.wait()

  await pool.connect(owner).initialize()
  return { pool }
}

export const setupSAvaxPool = async (owner: Signer): Promise<{ pool: Contract; WETH: Contract }> => {
  PoolYYAvax = await ethers.getContractFactory('PoolSAvax')
  WETHForwarder = await ethers.getContractFactory('WETHForwarder')

  const pool = await PoolYYAvax.connect(owner).deploy()
  const WETH = await TestWAVAX.connect(owner).deploy()

  // Wait for contract to be deployed
  await pool.deployTransaction.wait()
  await WETH.deployTransaction.wait()

  await pool.connect(owner).initialize(WETH.address)

  // Set WETH Forwarder
  const forwarder = await WETHForwarder.connect(owner).deploy(WETH.address)
  await forwarder.connect(owner).setPool(pool.address)
  await pool.connect(owner).setWETHForwarder(forwarder.address)

  return { pool, WETH }
}

export const setupSAvaxPoolTestERC20 = async (owner: Signer): Promise<{ pool: Contract; WETH: Contract }> => {
  PoolYYAvax = await ethers.getContractFactory('PoolSAvax')
  WETHForwarder = await ethers.getContractFactory('WETHForwarder')

  const pool = await PoolYYAvax.connect(owner).deploy()
  const WETH = await TestERC20.connect(owner).deploy('WAVAX', 'WAVAX', 18, parseEther('10000000000000000000000'))

  // Wait for contract to be deployed
  await pool.deployTransaction.wait()
  await WETH.deployTransaction.wait()

  await pool.connect(owner).initialize(WETH.address)

  // Set WETH Forwarder
  const forwarder = await WETHForwarder.connect(owner).deploy(WETH.address)
  await forwarder.connect(owner).setPool(pool.address)
  await pool.connect(owner).setWETHForwarder(forwarder.address)

  return { pool, WETH }
}

export const setupYYAvaxPool = async (owner: Signer): Promise<{ pool: Contract; WETH: Contract }> => {
  PoolYYAvax = await ethers.getContractFactory('PoolYYAvax')
  WETHForwarder = await ethers.getContractFactory('WETHForwarder')

  const pool = await PoolYYAvax.connect(owner).deploy()
  const WETH = await TestWAVAX.connect(owner).deploy()

  // Wait for contract to be deployed
  await pool.deployTransaction.wait()
  await WETH.deployTransaction.wait()

  await pool.connect(owner).initialize(WETH.address)

  // Set WETH Forwarder
  const forwarder = await WETHForwarder.connect(owner).deploy(WETH.address)
  await forwarder.connect(owner).setPool(pool.address)
  await pool.connect(owner).setWETHForwarder(forwarder.address)

  return { pool, WETH }
}

export const setupAAvaxCPool = async (owner: Signer): Promise<{ pool: Contract; WETH: Contract }> => {
  PoolAnkrETH = await ethers.getContractFactory('PoolAAvaxC')
  WETHForwarder = await ethers.getContractFactory('WETHForwarder')

  const pool = await PoolAnkrETH.connect(owner).deploy()
  const WETH = await TestWAVAX.connect(owner).deploy()

  // Wait for contract to be deployed
  await pool.deployTransaction.wait()
  await WETH.deployTransaction.wait()

  await pool.connect(owner).initialize(WETH.address)

  // Set WETH Forwarder
  const forwarder = await WETHForwarder.connect(owner).deploy(WETH.address)
  await forwarder.connect(owner).setPool(pool.address)
  await pool.connect(owner).setWETHForwarder(forwarder.address)

  return { pool, WETH }
}

export const setupAnkrETHPool = async (owner: Signer): Promise<{ pool: Contract }> => {
  PoolAnkrETH = await ethers.getContractFactory('PoolAnkrETH')

  const pool = await PoolAnkrETH.connect(owner).deploy()

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
  const token = await TestERC20.connect(owner).deploy(symbol, symbol, decimal, parseEther('10000000000000000000000'))
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

// export const addAssetCashAndLiability = async (
//   asset: Contract,
//   owner: SignerWithAddress,
//   cash: BigNumber,
//   liability: BigNumber
// ): Promise<void> => {
//   const pool = await asset.pool()
//   await asset.connect(owner).setPool(owner.address)
//   await asset.connect(owner).addCash(cash)
//   await asset.connect(owner).addLiability(liability)
//   await asset.connect(owner).setPool(pool)
// }

//       await initAssetWithValues(
//         this.USDC,
//   this.assetUSDC,
//   owner,
//   this.pool,
//   usdc('920270.929028'), // total supply
//   usdc('771551.875499'), // cash
//   usdc('916403.145845') // liability
// )
export const initAssetWithValues = async (
  token: Contract,
  asset: Contract,
  owner: SignerWithAddress,
  pool: Contract,
  totalSupply: BigNumber,
  cash: BigNumber,
  liability: BigNumber
): Promise<void> => {
  expect(await asset.underlyingToken()).to.be.equal(token.address)

  const fiveSecondsSince = (await ethers.provider.getBlock('latest')).timestamp + 5 * 1000

  await token.approve(pool.address, totalSupply)

  await pool.connect(owner).deposit(asset.underlyingToken(), totalSupply, owner.address, fiveSecondsSince)

  await asset.connect(owner).setPool(owner.address)

  if (totalSupply.lt(cash)) {
    await asset.connect(owner).addCash(cash.sub(totalSupply))
    await token.connect(owner).transfer(asset.address, cash.sub(totalSupply))
  } else if (totalSupply.gt(cash)) {
    await asset.connect(owner).removeCash(totalSupply.sub(cash))
    await asset.connect(owner).transferUnderlyingToken(owner.address, totalSupply.sub(cash))
  }

  if (totalSupply.lt(liability)) {
    await asset.connect(owner).addLiability(liability.sub(totalSupply))
  } else if (totalSupply.gt(liability)) {
    await asset.connect(owner).removeLiability(totalSupply.sub(liability))
  }

  await asset.connect(owner).setPool(pool.address)

  // sanity checks
  expect(await asset.cash()).to.be.equal(cash)
  expect(await asset.liability()).to.be.equal(liability)
  expect(await asset.underlyingTokenBalance()).to.be.equal(cash)
  expect(await asset.pool()).to.be.equal(pool.address)
  expect(await asset.totalSupply()).to.be.equal(totalSupply)
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

export const setupSAvaxPriceFeed = async (pool: Contract): Promise<Contract> => {
  const TestStakedAvax = await ethers.getContractFactory('TestStakedAvax')
  const testStakedAvax = await TestStakedAvax.deploy()

  await pool.setPriceOracle(testStakedAvax.address)
  return testStakedAvax
}

export const setupYYAvaxPriceFeed = async (pool: Contract): Promise<Contract> => {
  const testYYOracleFactory = await ethers.getContractFactory('TestYYOracle')
  const testYYOracle = await testYYOracleFactory.deploy()

  await pool.setPriceOracle(testYYOracle.address)
  return testYYOracle
}

export const setupAAvaxCPriceFeed = async (pool: Contract): Promise<Contract> => {
  const testAAvaxCFactory = await ethers.getContractFactory('TestAAvaxC')
  const testAAvaxCOracle = await testAAvaxCFactory.deploy()

  await pool.setPriceOracle(testAAvaxCOracle.address)
  return testAAvaxCOracle
}

export const setupAnkrETHPriceFeed = async (pool: Contract): Promise<Contract> => {
  const testAnkrETHFactory = await ethers.getContractFactory('TestAnkrETHOracle')
  const testAnkrETHOracle = await testAnkrETHFactory.deploy()

  await pool.setPriceOracle(testAnkrETHOracle.address)
  return testAnkrETHOracle
}
