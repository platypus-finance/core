import { ethers, upgrades } from 'hardhat'
import chai from 'chai'
import { expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { parseEther } from '@ethersproject/units'
import { BigNumber } from 'ethers'
import { setupAggregateAccount } from '../helpers/helper'

chai.use(solidity)

describe('Asset (proxy)', function () {
  let owner, users

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    const TestERC20 = await ethers.getContractFactory('TestERC20')
    this.tokenName = 'ERC20 Token'
    this.tokenSymbol = 'ERC'
    this.token = await TestERC20.deploy(this.tokenName, this.tokenSymbol, 18, parseEther('10000000').toString())
    this.aggregate = await setupAggregateAccount(owner, 'test aggregate', true)
    await this.token.deployTransaction.wait()
  })

  describe('deploy', async function () {
    it('should deploy with correct token smart contract address', async function () {
      const Asset = await ethers.getContractFactory('Asset')
      const asset = await upgrades.deployProxy(
        Asset,
        [this.token.address, await this.token.name(), await this.token.symbol(), this.aggregate.address],
        { unsafeAllow: ['delegatecall'] }
      )
      expect(await asset.underlyingToken()).to.equal(this.token.address)
      expect(await asset.name()).to.equal(this.tokenName)
    })

    it('should deploy with correct contract owner address', async function () {
      const Asset = await ethers.getContractFactory('Asset')
      this.aggregate = await setupAggregateAccount(owner, 'test aggregate', true)
      const asset = await upgrades.deployProxy(
        Asset,
        [this.token.address, await this.token.name(), await this.token.symbol(), this.aggregate.address],
        { unsafeAllow: ['delegatecall'] }
      )
      expect(await asset.owner()).to.equal(owner.address)
    })
  })

  describe('upgrade', async function () {
    it('should start with correct token balance, name and symbol prior to upgrade', async function () {
      const { asset } = await deployAsset.call(this)
      expect((await asset.underlyingTokenBalance()).toString()).to.be.equal(parseEther('1000'))
    })

    it('should upgrade to keep correct token smart contract address', async function () {
      const { asset99 } = await deployAndUpgradeAsset.call(this)
      console.log(await asset99.name())
      console.log(await asset99.symbol())
      expect(await asset99.underlyingToken()).to.equal(this.token.address)
      expect(await asset99.name()).to.equal(this.tokenName)
      expect(await asset99.symbol()).to.equal(this.tokenSymbol)
    })

    it('should upgrade to keep correct lpToken smart contract address', async function () {
      const { asset, asset99 } = await deployAndUpgradeAsset.call(this)
      expect(await asset99.underlyingToken()).to.equal(this.token.address)
      expect(asset.address).to.be.equal(asset99.address)
    })

    it('should upgrade to keep correct asset contract owner address', async function () {
      const { asset99 } = await deployAndUpgradeAsset.call(this)
      expect(await asset99.owner()).to.equal(users[0].address)
    })

    it('should upgrade to keep correct asset token balance', async function () {
      const { asset99 } = await deployAndUpgradeAsset.call(this)
      expect((await asset99.underlyingTokenBalance()).toString()).to.be.equal(parseEther('1000'))
    })

    it('should upgrade to keep correct asset cash balance', async function () {
      const { asset99 } = await deployAndUpgradeAsset.call(this)
      expect((await asset99.cash()).toString()).to.be.equal(parseEther('2000'))
    })

    it('should upgrade to keep correct asset liability balance', async function () {
      const { asset99 } = await deployAndUpgradeAsset.call(this)
      expect((await asset99.liability()).toString()).to.be.equal(parseEther('3000'))
    })

    it('should upgrade to keep cov ratio', async function () {
      const { asset99 } = await deployAndUpgradeAsset.call(this)
      expect((await asset99.cash()) / (await asset99.liability())).to.be.equal(2 / 3)
    })

    it('should upgrade to correct asset contract version', async function () {
      const { asset99 } = await deployAndUpgradeAsset.call(this)
      expect((await asset99.version()).toString()).to.be.equal(BigNumber.from(99))
    })

    async function deployAndUpgradeAsset() {
      const { asset } = await deployAsset.call(this)
      const TestAsset99 = await ethers.getContractFactory('TestAssetV99')

      const asset99 = await upgrades.upgradeProxy(asset.address, TestAsset99, { unsafeAllow: ['delegatecall'] })
      return { asset, asset99 }
    }

    async function deployAsset() {
      const Asset = await ethers.getContractFactory('Asset')

      const asset = await upgrades.deployProxy(
        Asset,
        [this.token.address, await this.token.name(), await this.token.symbol(), this.aggregate.address],
        { unsafeAllow: ['delegatecall'] }
      )

      await asset.connect(owner).setPool(users[0].address)
      await this.token.connect(owner).transfer(asset.address, parseEther('1000').toString())
      await asset.connect(users[0]).addCash(parseEther('2000').toString())
      await asset.connect(users[0]).addLiability(parseEther('3000').toString())
      await asset.connect(owner).transferOwnership(users[0].address)
      return { asset }
    }
  })
})
