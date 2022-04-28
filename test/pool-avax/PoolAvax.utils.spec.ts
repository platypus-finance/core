import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, ContractFactory } from 'ethers'
import { setupAvaxPool, setupSAvaxPriceFeed, usdc } from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { assert } from 'chai'
import { setupAggregateAccount } from '../helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('AvaxPool Utils', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let TestERC20: ContractFactory
  let Asset: ContractFactory

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    // Get contracts for TestERC20, Pool, Asset
    TestERC20 = await ethers.getContractFactory('TestERC20')
    Asset = await ethers.getContractFactory('Asset')
  })

  beforeEach(async function () {
    const TestWAVAX = await ethers.getContractFactory('TestWAVAX')

    // Deploy and initialize pool
    const poolSetup = await setupAvaxPool(owner)
    this.pool = poolSetup.pool
    this.WETH = await TestWAVAX.deploy()
    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp

    await setupSAvaxPriceFeed(this.pool)
  })

  describe('Get and set slippage params, haircut and retention ratio', function () {
    it('Should gets params', async function () {
      assert.exists(this.pool.connect(owner).getSlippageParamK(), 'Param OK')
      assert.exists(this.pool.connect(owner).getSlippageParamN(), 'Param OK')
      assert.exists(this.pool.connect(owner).getHaircutRate(), 'Param OK')
      assert.exists(this.pool.connect(owner).getRetentionRatio(), 'Param OK')
      assert.exists(this.pool.connect(owner).getC1(), 'Param OK')
      assert.exists(this.pool.connect(owner).getXThreshold(), 'Param OK')
      assert.exists(this.pool.connect(owner).getMaxPriceDeviation(), 'Param OK')
      assert.exists(this.pool.connect(owner).getPriceOracle(), 'Param OK')
    })

    it('Should set slippage params', async function () {
      const receipt = await this.pool
        .connect(owner)
        .setSlippageParams(parseEther('0.1'), BigNumber.from('9'), parseEther('0.5'), parseEther('0.4'))

      expect(await this.pool.connect(owner).getSlippageParamK()).to.be.equal(parseEther('0.1'))
      expect(await this.pool.connect(owner).getSlippageParamN()).to.be.equal('9')
      expect(await this.pool.connect(owner).getXThreshold()).to.be.equal(parseEther('0.4'))
      expect(await this.pool.connect(owner).getC1()).to.be.equal(parseEther('0.5'))

      expect(receipt)
        .to.emit(this.pool, 'SlippageParamsUpdated')
        .withArgs(
          parseEther('0.00002'),
          parseEther('0.1'),
          BigNumber.from('7'),
          BigNumber.from('9'),
          BigNumber.from('376927610599998308'),
          parseEther('0.5'),
          BigNumber.from('329811659274998519'),
          parseEther('0.4')
        )
    })

    it('Should set retention ratio', async function () {
      const receipt = await this.pool.connect(owner).setRetentionRatio(parseEther('0.4'))
      expect(receipt).to.emit(this.pool, 'RetentionRatioUpdated').withArgs(parseEther('1'), parseEther('0.4'))

      expect(await this.pool.connect(owner).getRetentionRatio()).to.be.equal(parseEther('0.4'))
    })

    it('Should set haircut', async function () {
      const receipt = await this.pool.connect(owner).setHaircutRate(parseEther('0.3'))
      expect(await this.pool.connect(owner).getHaircutRate()).to.be.equal(parseEther('0.3'))
      expect(receipt).to.emit(this.pool, 'HaircutRateUpdated').withArgs(parseEther('0.0004'), parseEther('0.3'))
    })

    it('Should set max price deviation', async function () {
      const receipt = await this.pool.connect(owner).setMaxPriceDeviation(parseEther('0.03'))
      expect(await this.pool.connect(owner).getMaxPriceDeviation()).to.be.equal(parseEther('0.03'))

      expect(receipt).to.emit(this.pool, 'PriceDeviationUpdated').withArgs(parseEther('0.02'), parseEther('0.03'))
    })

    it('Should revert if notOwner sets or gets slippage params', async function () {
      await expect(
        this.pool
          .connect(users[0])
          .setSlippageParams(parseEther('0.1'), BigNumber.from('9'), parseEther('0.5'), parseEther('0.4'))
      ).to.be.reverted
    })

    it('sets and gets WETHForwarder', async function () {
      // gets WETHForwarder
      assert.exists(await this.pool.connect(owner).wethForwarder(), 'Param OK')

      // Can set WETHForwarder
      await this.pool.connect(owner).setWETHForwarder('0xd00ae08403B9bbb9124bB305C09058E32C39A48c')
      expect(await this.pool.connect(owner).wethForwarder()).to.be.equal('0xd00ae08403B9bbb9124bB305C09058E32C39A48c')
    })

    it('sets and gets sAvax', async function () {
      // gets sAvax
      assert.exists(await this.pool.connect(owner).sAvax(), 'Param OK')

      // Can set WETHForwarder
      await this.pool.connect(owner).setSAvax('0xd00ae08403B9bbb9124bB305C09058E32C39A48c')
      expect(await this.pool.connect(owner).sAvax()).to.be.equal('0xd00ae08403B9bbb9124bB305C09058E32C39A48c')
    })

    it('Should revert if slippage params are set outside out of their boundaries', async function () {
      // k cannot be bigger than 1
      await expect(
        this.pool
          .connect(owner)
          .setSlippageParams(
            BigNumber.from(2).mul(10).pow(18),
            BigNumber.from('9'),
            parseEther('0.5'),
            parseEther('0.4')
          )
      ).to.be.reverted
      // h
      await expect(this.pool.connect(owner).setHaircutRate(BigNumber.from(2).mul(10).pow(18))).to.be.reverted
      // retention ratio
      await expect(this.pool.connect(owner).setRetentionRatio(BigNumber.from(2).mul(10).pow(18))).to.be.reverted

      await expect(this.pool.connect(owner).setMaxPriceDeviation(BigNumber.from(2).mul(10).pow(19))).to.be.reverted
    })
  })

  describe('Add and configure Assets DAI and USDC', function () {
    beforeEach(async function () {
      /// DAI
      // Deploy DAI TestERC20
      this.DAI = await TestERC20.connect(owner).deploy('Dai Stablecoin', 'DAI', 18, parseEther('10000000')) // 10 M
      await this.DAI.deployTransaction.wait()

      // Setup aggregate account
      const assetName = this.DAI.connect(owner).name()
      const aggregateAccount = await setupAggregateAccount(owner, assetName, true)
      await aggregateAccount.deployTransaction.wait()

      this.assetDAI = await Asset.connect(owner).deploy()
      this.assetDAI.initialize(this.DAI.address, 'test', 'test', aggregateAccount.address)

      // Wait for transaction to be deployed
      await this.assetDAI.deployTransaction.wait()

      // Set pool for Asset contract
      await this.assetDAI.connect(owner).setPool(this.pool.address)
      // Add Asset to Pool
      await this.pool.connect(owner).addAsset(this.DAI.address, this.assetDAI.address)

      /// USDC
      // Deploy USDC TestERC20
      this.USDC = await TestERC20.connect(owner).deploy('USD Coin', 'USDC', 6, usdc('10000000')) // 10 M supply

      // Wait for transaction to be deployed
      await this.USDC.deployTransaction.wait()

      // Deploy and initialize lpUSDC
      // Deploy and initialize Asset contract with USDC and lpUSDC
      this.assetUSDC = await Asset.connect(owner).deploy()
      this.assetUSDC.initialize(this.USDC.address, 'test', 'test', aggregateAccount.address)

      // Wait for transaction to be deployed
      await this.assetUSDC.deployTransaction.wait()

      // Set pool for asset USDC
      await this.assetUSDC.connect(owner).setPool(this.pool.address)
      // Add asset to pool
      await this.pool.connect(owner).addAsset(this.USDC.address, this.assetUSDC.address)
    })

    describe('Add ERC20 Asset', function () {
      beforeEach(async function () {
        // Deploy and initialize TestERC20 and its corresponding lpToken
        this.erc20 = await TestERC20.connect(owner).deploy('ERC20', 'ERC', 18, parseEther('10000000')) // 10 M

        // Setup aggregate account
        const assetName = this.erc20.connect(owner).name()
        const aggregateAccount = await setupAggregateAccount(owner, assetName, false)
        await aggregateAccount.deployTransaction.wait()

        this.assetERC = await Asset.connect(owner).deploy()
        this.assetERC.initialize(this.erc20.address, 'test', 'test', aggregateAccount.address)

        // Wait for transaction to be deployed
        await this.erc20.deployTransaction.wait()
        await this.assetERC.deployTransaction.wait()
      })

      it('works', async function () {
        // Add ERC20 asset to pool
        const receipt = await this.pool.connect(owner).addAsset(this.erc20.address, this.assetERC.address)

        // check if added and if event has been emitted
        expect(await this.pool.assetOf(this.erc20.address)).to.equal(this.assetERC.address)
        await expect(receipt).to.emit(this.pool, 'AssetAdded').withArgs(this.erc20.address, this.assetERC.address)
      })

      it('gets tokens in the pool', async function () {
        await this.pool.connect(owner).addAsset(this.erc20.address, this.assetERC.address)

        const tokenAddresses = await this.pool.getTokenAddresses()
        const tokens = Object.values(tokenAddresses)

        expect(tokens.includes(this.erc20.address)).to.be.true
      })

      it('removes assets from the pool', async function () {
        await this.pool.connect(owner).addAsset(this.erc20.address, this.assetERC.address)
        const tokenAddresses = await this.pool.getTokenAddresses()
        const tokens = Object.values(tokenAddresses)

        expect(tokens.includes(this.erc20.address)).to.be.true

        //remove asset
        await this.pool.connect(owner).removeAsset(this.erc20.address)

        const tokenAddresses2 = await this.pool.getTokenAddresses()
        const tokens2 = Object.values(tokenAddresses2)
        expect(tokens2.includes(this.erc20.address)).to.be.false
      })

      it('reverts if not owner tries to remove asset', async function () {
        await this.pool.connect(owner).addAsset(this.erc20.address, this.assetERC.address)
        await expect(this.pool.connect(users[1]).removeAsset(this.erc20.address)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        )
      })

      it('reverts for invalid params', async function () {
        // Add ERC20 token with zero address
        await expect(
          this.pool.connect(owner).addAsset(ethers.constants.AddressZero, this.assetERC.address)
        ).to.be.revertedWith('ZERO')

        // Add Asset with zero address
        await expect(
          this.pool.connect(owner).addAsset(this.erc20.address, ethers.constants.AddressZero)
        ).to.be.revertedWith('ZERO')

        // Add existing asset
        await expect(this.pool.connect(owner).addAsset(this.DAI.address, this.assetERC.address)).to.be.revertedWith(
          'ASSET_EXISTS'
        )
      })

      it('restricts to only owner', async function () {
        await expect(
          this.pool.connect(users[0]).addAsset(this.erc20.address, this.assetERC.address)
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
    })

    describe('assetOf', function () {
      it('returns the address of asset', async function () {
        expect(await this.pool.assetOf(this.DAI.address)).to.equal(this.assetDAI.address)
        expect(await this.pool.assetOf(this.USDC.address)).to.equal(this.assetUSDC.address)
      })
    })
  })

  describe('getters', function () {
    it('works', async function () {
      expect(await this.pool.getDev()).to.equal(owner.address)

      // Change pool's dev
      const receipt = await this.pool.connect(owner).setDev(users[2].address)
      expect(await this.pool.getDev()).to.equal(users[2].address)

      expect(receipt).to.emit(this.pool, 'DevUpdated').withArgs(owner.address, users[2].address)
    })
  })

  describe('pausable', function () {
    it('works', async function () {
      // Pause pool : expect to emit event and for state pause event to change
      const receipt1 = await this.pool.connect(owner).pause()
      expect(await this.pool.paused()).to.equal(true)
      await expect(receipt1).to.emit(this.pool, 'Paused').withArgs(owner.address)

      // Unpause pool : expect emit event and state change
      const receipt2 = await this.pool.connect(owner).unpause()
      expect(await this.pool.paused()).to.equal(false)

      await expect(receipt2).to.emit(this.pool, 'Unpaused').withArgs(owner.address)
    })

    it('restricts to only dev (deployer)', async function () {
      await expect(this.pool.connect(users[0]).pause()).to.be.revertedWith('FORBIDDEN')
      await expect(this.pool.connect(users[0]).unpause()).to.be.revertedWith('FORBIDDEN')
    })
  })
})
