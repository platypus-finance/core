import { ethers, upgrades } from 'hardhat'
import chai from 'chai'
import { expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber } from 'ethers'
import { setupAggregateAccount } from '../helpers/helper'

chai.use(solidity)

describe('Pool (proxy)', function () {
  let owner, users

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    const WETH = await ethers.getContractFactory('TestWAVAX')
    this.WETH = await WETH.deploy()
    await this.WETH.deployTransaction.wait()
  })

  it('deploys', async function () {
    const Pool = await ethers.getContractFactory('Pool')
    const pool = await upgrades.deployProxy(Pool, [], { unsafeAllow: ['delegatecall'] })
    expect(await pool.owner()).to.equal(owner.address)
  })

  it('upgrades', async function () {
    const Pool = await ethers.getContractFactory('Pool')

    const pool = await upgrades.deployProxy(Pool, [], { unsafeAllow: ['delegatecall'] })

    const ChainlinkProxyPriceProvider = await ethers.getContractFactory('ChainlinkProxyPriceProvider')
    const priceOracle = await ChainlinkProxyPriceProvider.deploy([], [])
    await priceOracle.deployed()
    await pool.connect(owner).setPriceOracle(priceOracle.address)

    const aggregate = await setupAggregateAccount(owner, 'test aggregate', true)

    const Asset = await ethers.getContractFactory('Asset')
    const asset = await upgrades.deployProxy(Asset, [this.WETH.address, 'Asset WAVAX', 'WAVAX', aggregate.address], {
      unsafeAllow: ['delegatecall'],
    })

    await pool.connect(owner).addAsset(this.WETH.address, asset.address)
    await pool.connect(owner).transferOwnership(users[0].address)
    await pool.connect(owner).pause()

    // Upgrade pool
    const PoolV99 = await ethers.getContractFactory('TestPoolV99')
    const pool99 = await upgrades.upgradeProxy(pool.address, PoolV99, { unsafeAllow: ['delegatecall'] })
    expect(await pool99.owner()).to.equal(users[0].address)
    expect(await pool99.getDev()).to.equal(owner.address)
    expect(await pool99.getPriceOracle()).to.equal(priceOracle.address)
    expect(await pool99.paused()).to.equal(true)
    expect((await pool99.version()).toString()).to.be.equal(BigNumber.from(99))
    await pool99.connect(owner).unpause()
    expect(await pool99.paused()).to.equal(false)
    expect(pool99.address).to.be.equal(pool.address)
  })
})
