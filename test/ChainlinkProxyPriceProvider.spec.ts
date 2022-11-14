import { ethers } from 'hardhat'
import chai from 'chai'
import { ContractFactory } from 'ethers'
import { solidity } from 'ethereum-waffle'
import { parseEther, parseUnits } from '@ethersproject/units'

chai.use(solidity)
const { expect } = chai

describe('ChainlinkProxyPriceProvider', function () {
  let owner, users
  let ChainlinkProxyPriceProvider: ContractFactory
  let TestChainlinkAggregator: ContractFactory
  let ConstantChainlinkAggregator: ContractFactory


  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    ChainlinkProxyPriceProvider = await ethers.getContractFactory('ChainlinkProxyPriceProvider')
    TestChainlinkAggregator = await ethers.getContractFactory('TestChainlinkAggregator')
    ConstantChainlinkAggregator = await ethers.getContractFactory('ConstantChainlinkAggregator')
  })

  beforeEach(async function () {
    this.USDTAddress = '0xde3A24028580884448a5397872046a019649b084'
    this.USDTAVAX = await TestChainlinkAggregator.deploy()

    await this.USDTAVAX.setLatestAnswer('1677000000000000', '1606151568')

    this.LINKAddress = '0xB3fe5374F67D7a22886A0eE082b2E2f9d2651651'
    this.LINKAVAX = await TestChainlinkAggregator.deploy()

    await this.LINKAVAX.setLatestAnswer('24967610000000000', '1606150638')

    this.DAIAddress = '0xbA7dEebBFC5fA1100Fb055a87773e1E99Cd3507a'
    this.WAVAXAddress = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'

    this.USPAddress = '0x2E12576A13d610508A320aeCe98c7fC9eeF17A67'
    this.USPUSD = await ConstantChainlinkAggregator.deploy()

    this.provider = await ChainlinkProxyPriceProvider.connect(owner).deploy(
      [this.USDTAddress, this.LINKAddress, this.USPAddress],
      [this.USDTAVAX.address, this.LINKAVAX.address, this.USPUSD.address],
    )

  })

  describe('getAssetPrice', function () {
    it('gets an asset price by address', async function () {
      expect(await this.provider.getAssetPrice(this.USDTAddress)).to.be.equal(parseEther('0.001677'))
      expect(await this.provider.getAssetPrice(this.LINKAddress)).to.be.equal(parseEther('0.02496761'))
      expect(await this.provider.getAssetPrice(this.USPAddress)).to.be.equal(parseUnits('1', 8))

      expect(await this.USPUSD.latestAnswer()).to.be.equal(parseUnits('1', 8))
    })

    it('reverts if asset has no source', async function () {
      await expect(this.provider.getAssetPrice(this.DAIAddress)).to.be.revertedWith('SOURCE_IS_MISSING')
    })

    it('reverts if source is returning zero or negative price', async function () {
      await this.USDTAVAX.setLatestAnswer('0', '1606151568')
      await expect(this.provider.getAssetPrice(this.USDTAddress)).to.be.revertedWith('INVALID_PRICE')

      await this.LINKAVAX.setLatestAnswer('-1', '1606150638')
      await expect(this.provider.getAssetPrice(this.LINKAddress)).to.be.revertedWith('INVALID_PRICE')
    })
  })

  describe('getAssetPriceReciprocal', function () {
    it('gets ETH price in terms of asset', async function () {
      expect(await this.provider.getAssetPriceReciprocal(this.USDTAddress)).to.be.equal(
        parseEther('596.302921884317233154')
      )
      expect(await this.provider.getAssetPriceReciprocal(this.LINKAddress)).to.be.equal(
        parseEther('40.051891230277948110')
      )
    })

    it('reverts if calculated price is zero', async function () {
      // For some reason the price oracle returns a huge number, e.g. 10 ** 19
      await this.USDTAVAX.setLatestAnswer(parseEther('10000000000000000000'), '1606151568')
      await expect(this.provider.getAssetPriceReciprocal(this.USDTAddress)).to.be.revertedWith('INVALID_PRICE')
    })

    it('reverts if source of asset price is returning zero or negative number', async function () {
      await this.USDTAVAX.setLatestAnswer('0', '1606151568')
      await expect(this.provider.getAssetPriceReciprocal(this.USDTAddress)).to.be.revertedWith('INVALID_PRICE')

      await this.LINKAVAX.setLatestAnswer('-1', '1606150638')
      await expect(this.provider.getAssetPriceReciprocal(this.LINKAddress)).to.be.revertedWith('INVALID_PRICE')
    })
  })

  describe('getAssetsPrices', function () {
    it('gets a list of prices from a list of assets addresses', async function () {
      const prices = await this.provider.getAssetsPrices([this.USDTAddress, this.LINKAddress])
      expect(prices[0]).to.be.equal(parseEther('0.001677'))
      expect(prices[1]).to.be.equal(parseEther('0.02496761'))
    })

    it('reverts if any asset on the list has no source', async function () {
      await expect(
        this.provider.getAssetsPrices([this.USDTAddress, this.LINKAddress, this.DAIAddress])
      ).to.be.revertedWith('SOURCE_IS_MISSING')
    })

    it('reverts if any asset returns invalid price', async function () {
      await this.USDTAVAX.setLatestAnswer('0', '1606151568')
      await expect(this.provider.getAssetsPrices([this.USDTAddress, this.LINKAddress])).to.be.revertedWith(
        'INVALID_PRICE'
      )
    })
  })

  describe('setAssetSources', function () {
    it('sets or replaces sources of assets', async function () {
      await this.provider
        .connect(owner)
        .setAssetSources([this.USDTAddress, this.DAIAddress], [this.LINKAVAX.address, this.USDTAVAX.address])

      expect(await this.provider.getSourceOfAsset(this.USDTAddress)).to.equal(this.LINKAVAX.address)
      expect(await this.provider.getSourceOfAsset(this.LINKAddress)).to.equal(this.LINKAVAX.address)
      expect(await this.provider.getSourceOfAsset(this.DAIAddress)).to.equal(this.USDTAVAX.address)
    })

    it('reverts if the array length does not match', async function () {
      await expect(
        this.provider.connect(owner).setAssetSources([this.USDTAddress, this.LINKAddress], [this.USDTAVAX.address])
      ).to.be.revertedWith('INCONSISTENT_PARAMS_LENGTH')
    })

    it('restricts to only owner', async function () {
      await expect(this.provider.connect(users[0]).setAssetSources([], [])).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })
  })

  describe('getSourceOfAsset', function () {
    it('gets the address of the source for an asset address', async function () {
      expect(await this.provider.getSourceOfAsset(this.USDTAddress)).to.equal(this.USDTAVAX.address)
      expect(await this.provider.getSourceOfAsset(this.LINKAddress)).to.equal(this.LINKAVAX.address)
    })
  })

  describe('transferOwnership', function () {
    it('restricts to only owner', async function () {
      await expect(this.provider.connect(users[0]).transferOwnership(users[0].address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })
  })
})
