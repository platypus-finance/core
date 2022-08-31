import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ContractFactory } from 'ethers'
import { setPriceOracle, setupSAvaxPriceFeed, usdc } from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { setupAggregateAccount } from '../helpers/helper'
import { parseUnits } from 'ethers/lib/utils'

const { expect } = chai
chai.use(solidity)

describe('AvaxPool Deposit', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let TestERC20: ContractFactory
  let TestWAVAX: ContractFactory

  let Pool: ContractFactory
  let Asset: ContractFactory
  let WETHForwarder: ContractFactory

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    // Get contracts for TestERC20, Pool, Asset and LPToken
    TestERC20 = await ethers.getContractFactory('TestERC20')
    TestWAVAX = await ethers.getContractFactory('TestWAVAX')
    Pool = await ethers.getContractFactory('PoolSAvax')
    Asset = await ethers.getContractFactory('Asset')
    WETHForwarder = await ethers.getContractFactory('WETHForwarder')
  })

  beforeEach(async function () {
    // get last block time
    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp
    this.fiveSecondsSince = this.lastBlockTime + 5 * 1000
    this.fiveSecondsAgo = this.lastBlockTime - 5 * 1000

    // Deploy Pool and initialize
    this.pool = await Pool.deploy()

    this.WETH = await TestWAVAX.deploy()

    // Wait for transaction to be mined
    await this.pool.deployTransaction.wait()

    await this.pool.connect(owner).initialize(this.WETH.address)

    this.forwarder = await WETHForwarder.connect(owner).deploy(this.WETH.address)
    await this.forwarder.deployTransaction.wait()

    await this.forwarder.connect(owner).setPool(this.pool.address)
    await this.pool.connect(owner).setWETHForwarder(this.forwarder.address)
    // Set price oracle
    await setupSAvaxPriceFeed(this.pool)
  })

  describe('Asset DAI (18 decimals)', function () {
    beforeEach(async function () {
      // Deploy and initialize DAI ERC20 and corresponding LPToken
      this.DAI = await TestERC20.deploy('Dai Stablecoin', 'DAI', 18, parseEther('10000000')) // 10 M

      // Setup aggregate account
      const assetName = this.DAI.connect(owner).name()
      const aggregateAccount = await setupAggregateAccount(owner, assetName, true)
      await aggregateAccount.deployTransaction.wait()

      this.asset = await Asset.deploy()
      await this.asset.initialize(this.DAI.address, 'test', 'test', aggregateAccount.address)

      // Wait for transaction to be deployed
      await this.DAI.deployTransaction.wait()
      await this.asset.deployTransaction.wait()

      await this.asset.connect(owner).setPool(this.pool.address)
      // Add asset to pool
      await this.pool.connect(owner).addAsset(this.DAI.address, this.asset.address)
    })

    describe('deposit', function () {
      beforeEach(async function () {
        // Transfer 100k from contrac to users[0]
        await this.DAI.connect(owner).transfer(users[0].address, parseEther('100000')) // 100 k
        // Approve max allowance from users[0] to pool
        await this.DAI.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      })

      it('works (first LP)', async function () {
        // Get DAI balance of user[0]
        const beforeBalance = await this.DAI.balanceOf(users[0].address)
        // Deposit from user[0] to pool 100 dai
        const receipt = await this.pool
          .connect(users[0])
          .deposit(this.DAI.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.DAI.balanceOf(users[0].address)

        expect(await this.asset.cash()).to.be.equal(parseEther('100'))
        expect(await this.asset.liability()).to.be.equal(parseEther('100'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('100'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('100'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('100'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('-100'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.DAI.address, parseEther('100'), parseEther('100'), users[0].address)
      })

      it('works (second LP)', async function () {
        // Deposit from user[0] to pool 100 dai
        await this.pool
          .connect(users[0])
          .deposit(this.DAI.address, parseEther('100'), users[0].address, this.fiveSecondsSince)

        await this.DAI.connect(owner).transfer(users[1].address, parseEther('100000'))
        await this.DAI.connect(users[1]).approve(this.pool.address, ethers.constants.MaxUint256)
        // Deposit from user[1] to pool 100 dai
        await this.pool
          .connect(users[1])
          .deposit(this.DAI.address, parseEther('100'), users[1].address, this.fiveSecondsSince)

        expect(await this.asset.cash()).to.be.equal(parseEther('200'))
        expect(await this.asset.liability()).to.be.equal(parseEther('200'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('200'))
        expect(await this.asset.balanceOf(users[1].address)).to.be.equal(parseEther('100'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('200'))
      })

      it('Respects asset max supply', async function () {
        // set asset max supply
        await this.asset.connect(owner).setMaxSupply(ethers.utils.parseEther('100'))

        // try to deposit over the max supply
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.DAI.address, parseEther('101'), users[2].address, this.fiveSecondsSince)
        ).to.be.revertedWith('MAX_SUPPLY_REACHED')

        await this.asset.connect(owner).setMaxSupply(ethers.utils.parseEther('0'))
        // try to deposit now that max supply is not set
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.DAI.address, parseEther('101'), users[2].address, this.fiveSecondsSince)
        ).to.be.ok
      })

      it('applies deposit fee when cov > 1 to prevent deposit arbitrage', async function () {
        // First deposit 100 dai
        // Get DAI balance of user[0]
        const beforeBalance = await this.DAI.balanceOf(users[0].address)
        // Deposit from user[0] to pool 100 dai
        const receipt = await this.pool
          .connect(users[0])
          .deposit(this.DAI.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.DAI.balanceOf(users[0].address)

        expect(await this.asset.cash()).to.be.equal(parseEther('100'))
        expect(await this.asset.liability()).to.be.equal(parseEther('100'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('100'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('100'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('100'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('-100'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.DAI.address, parseEther('100'), parseEther('100'), users[0].address)

        // Next, adjust coverage ratio to = 2 > 1
        await this.asset.connect(owner).setPool(owner.address)
        await this.DAI.connect(owner).transfer(this.asset.address, parseEther('100')) // transfer Dai to Asset to back
        await this.asset.connect(owner).addCash(parseEther('100'))
        // await this.asset.connect(owner).transferToken(owner.address, parseEther('40'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(2) // cov = 2

        // Now that cov = 2 > 1
        // A = 200 , L = 100
        // try to deposit again
        // Deposit from user[0] to pool 100 dai
        await this.pool
          .connect(users[0])
          .deposit(this.DAI.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
        const afterBalance2 = await this.DAI.balanceOf(users[0].address)

        expect(await this.asset.cash()).to.be.equal(parseEther('300')) // Assets = 200 + 100
        expect(await this.asset.liability()).to.be.equal(parseEther('199.999781514346136200'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('300'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('199.999781514346136200'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('199.999781514346136200'))
        expect(afterBalance2.sub(beforeBalance)).to.be.equal(parseEther('-200'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.DAI.address, parseEther('100'), parseEther('100'), users[0].address)

        // Now, try to withdraw 100 and see if we can perform arbitrage : if amount withdrawn is > 100
        const beforeBalance3 = await this.DAI.balanceOf(users[0].address)

        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.DAI.address, parseEther('100'))

        // approve asset spending by pool
        await this.asset.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

        const receipt3 = await this.pool
          .connect(users[0])
          .withdraw(this.DAI.address, parseEther('100'), parseEther('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance3 = await this.DAI.balanceOf(users[0].address)

        // check that quoted withdrawal is the same as amount withdrawn
        expect(afterBalance3.sub(beforeBalance3)).to.be.equal(quotedWithdrawal)

        // expect(afterBalance3.sub(beforeBalance3)).to.be.below(parseEther('100'))
        expect(afterBalance3.sub(beforeBalance3)).to.be.equal(parseEther('100'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('99.999781514346136200'))
        expect(await this.asset.cash()).to.be.equal(parseEther('200'))
        expect(await this.asset.liability()).to.be.equal(parseEther('99.999781514346136200'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('200'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('99.999781514346136200'))

        expect(receipt3)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.DAI.address, parseEther('100'), parseEther('100'), users[0].address)
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.DAI.address, parseEther('100'), users[0].address, this.fiveSecondsAgo),
          'EXPIRED'
        ).to.be.reverted
      })

      it('reverts if liquidity to mint is too small', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.DAI.address, parseEther('0'), users[0].address, this.fiveSecondsSince),
          'INSUFFICIENT_LIQUIDITY_MINTED'
        ).to.be.reverted
      })

      it('reverts if liquidity provider does not have enough balance', async function () {
        await this.DAI.connect(users[1]).approve(this.pool.address, ethers.constants.MaxUint256)
        await expect(
          this.pool
            .connect(users[1])
            .deposit(this.DAI.address, parseEther('100'), users[1].address, this.fiveSecondsSince),
          'ERC20: transfer amount exceeds balance'
        ).to.be.reverted
      })

      it('reverts if pool paused', async function () {
        await this.pool.connect(owner).pause()
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.DAI.address, parseEther('100'), users[0].address, this.fiveSecondsSince),
          'Pausable: paused'
        ).to.be.reverted
      })

      it('reverts if zero address provided', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .deposit(ethers.constants.AddressZero, parseEther('100'), users[0].address, this.fiveSecondsSince),
          'ZERO'
        ).to.be.reverted
      })

      it('reverts if asset not exist', async function () {
        const btc = await TestERC20.deploy('Bitcoin', 'BTC', 8, '0')

        // Wait for transaction to be mined
        await btc.deployTransaction.wait()

        btc.connect(owner)
        await expect(
          this.pool.connect(users[0]).deposit(btc.address, parseEther('100'), users[0].address, this.fiveSecondsSince),
          'ASSET_NOT_EXIST'
        ).to.be.reverted
      })
    })
  })

  describe('Asset USDC (6 decimals)', function () {
    beforeEach(async function () {
      this.USDC = await TestERC20.deploy('USD Coin', 'USDC', 6, usdc('10000000'))

      // Setup aggregate account
      const assetName = this.USDC.connect(owner).name()
      const aggregateAccount = await setupAggregateAccount(owner, assetName, true)
      await aggregateAccount.deployTransaction.wait()

      this.asset = await Asset.deploy()
      this.asset.initialize(this.USDC.address, 'test', 'test', aggregateAccount.address)

      // Wait for transaction to be mined
      await this.USDC.deployTransaction.wait()
      await this.asset.deployTransaction.wait()

      await this.asset.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.USDC.address, this.asset.address)

      // Set price oracle
      await setPriceOracle(this.pool, owner, this.lastBlockTime, [
        { address: this.USDC.address, initialRate: parseUnits('1', 8).toString() },
      ])
    })

    describe('deposit', function () {
      beforeEach(async function () {
        await this.USDC.connect(owner).transfer(users[0].address, usdc('100000'))
        await this.USDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      })

      it('works (first LP)', async function () {
        const beforeBalance = await this.USDC.balanceOf(users[0].address)
        await this.pool
          .connect(users[0])
          .deposit(this.USDC.address, usdc('100'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.USDC.balanceOf(users[0].address)

        expect(await this.asset.cash()).to.be.equal(usdc('100'))
        expect(await this.asset.liability()).to.be.equal(usdc('100'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(usdc('100'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('0.0000000001'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0.0000000001'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(usdc('-100'))
      })

      it('works (second LP)', async function () {
        await this.pool
          .connect(users[0])
          .deposit(this.USDC.address, usdc('100'), users[0].address, this.fiveSecondsSince)

        await this.USDC.connect(owner).transfer(users[1].address, usdc('100000'))
        await this.USDC.connect(users[1]).approve(this.pool.address, ethers.constants.MaxUint256)
        await this.pool
          .connect(users[1])
          .deposit(this.USDC.address, usdc('100'), users[1].address, this.fiveSecondsSince)

        expect(await this.asset.cash()).to.be.equal(usdc('200'))
        expect(await this.asset.liability()).to.be.equal(usdc('200'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(usdc('200'))
        expect(await this.asset.balanceOf(users[1].address)).to.be.equal(parseEther('0.0000000001'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0.0000000002'))
      })
    })
  })
})
