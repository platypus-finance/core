import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ContractFactory } from 'ethers'
import { createAndInitializeToken, fundUserAndApprovePool } from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { setupAggregateAccount } from '../helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('AvaxPool', function () {
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
    Pool = await ethers.getContractFactory('PoolAvax')
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
  })

  describe('Asset AVAX', function () {
    beforeEach(async function () {
      const aggregateName = 'Liquid staking AVAX Aggregate'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      // get some WETH for owner
      await this.WETH.deposit({ value: parseEther('100') })

      this.asset = await Asset.deploy()
      this.asset.connect(owner)
      await this.asset.connect(owner).initialize(this.WETH.address, 'AVAX Asset', 'LP-AVAX', aggregateAccount.address)

      await this.asset.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.WETH.address, this.asset.address)
    })

    describe('deposit WETH - WAVAX deposit test', function () {
      it('works (wavax direct deposit)', async function () {
        /// check that both deposit() and depositAvax() functions can be used to deposit AVAX / WAVAX to the pool

        /// USE DEPOSIT()
        await this.WETH.transfer(users[0].address, parseEther('2'))
        await this.WETH.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
        const receipt = await this.pool
          .connect(users[0])
          .deposit(this.WETH.address, parseEther('1.83'), users[0].address, this.fiveSecondsSince)

        expect(await this.asset.cash()).to.be.equal(parseEther('1.83'))
        expect(await this.asset.liability()).to.be.equal(parseEther('1.83'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('1.83'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('1.83'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('1.83'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.WETH.address, parseEther('1.83'), parseEther('1.83'), users[0].address)

        /// USE DEPOSIT AVAX()
        // try to deposit using avax function and see if it cumulates correctly
        const receipt2 = await this.pool.connect(users[0]).depositETH(users[0].address, this.fiveSecondsSince, {
          value: parseEther('0.17'),
        })

        expect(await this.asset.cash()).to.be.equal(parseEther('2'))
        expect(await this.asset.liability()).to.be.equal(parseEther('2'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('2'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('2'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('2'))

        await expect(receipt2)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.WETH.address, parseEther('0.17'), parseEther('0.17'), users[0].address)

        /// USE WITHDRAW()
        /// now withdraw using normal withdraw function
        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.WETH.address, parseEther('1.5'))

        const beforeBalance = await this.WETH.balanceOf(users[0].address)
        const receipt3 = await this.pool
          .connect(users[0])
          .withdraw(this.WETH.address, parseEther('1.5'), parseEther('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.WETH.balanceOf(users[0].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('1.5'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('0.5'))
        expect(await this.asset.cash()).to.be.equal(parseEther('0.5'))
        expect(await this.asset.liability()).to.be.equal(parseEther('0.5'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('0.5'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0.5'))

        expect(receipt3)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.WETH.address, parseEther('1.5'), parseEther('1.5'), users[0].address)

        /// USE WITHDRAW AVAX()
        const beforeBalance2 = await ethers.provider.getBalance(users[1].address)
        // withdraw to users[1] so can test the exact ETH received (users[0] needs to pay gas)
        const receipt4 = await this.pool
          .connect(users[0])
          .withdrawETH(parseEther('0.5'), parseEther('0.5'), users[1].address, this.fiveSecondsSince)
        const afterBalance2 = await ethers.provider.getBalance(users[1].address)

        expect(afterBalance2.sub(beforeBalance2)).to.be.equal(parseEther('0.5'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('0'))
        expect(await this.asset.cash()).to.be.equal(parseEther('0'))
        expect(await this.asset.liability()).to.be.equal(parseEther('0'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('0'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0'))

        expect(receipt4)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.WETH.address, parseEther('0.5'), parseEther('0.5'), users[1].address)
      })
    })

    describe('depositETH', function () {
      it('works (first LP)', async function () {
        const receipt = await this.pool.connect(users[0]).depositETH(users[1].address, this.fiveSecondsSince, {
          value: parseEther('1.83'),
        })

        expect(await this.asset.cash()).to.be.equal(parseEther('1.83'))
        expect(await this.asset.liability()).to.be.equal(parseEther('1.83'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('1.83'))
        expect(await this.asset.balanceOf(users[1].address)).to.be.equal(parseEther('1.83'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('1.83'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.WETH.address, parseEther('1.83'), parseEther('1.83'), users[1].address)
      })

      it('works (second LP)', async function () {
        // Deposit from user[0] to pool 100 AVAX
        await this.pool.connect(users[0]).depositETH(users[0].address, this.fiveSecondsSince, {
          value: parseEther('1.83'),
        })

        // Deposit from user[0] to pool 100 AVAX
        await this.pool.connect(users[1]).depositETH(users[1].address, this.fiveSecondsSince, {
          value: parseEther('1.83'),
        })
        expect(await this.asset.cash()).to.be.equal(parseEther('3.66'))
        expect(await this.asset.liability()).to.be.equal(parseEther('3.66'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('3.66'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('1.83'))
        expect(await this.asset.balanceOf(users[1].address)).to.be.equal(parseEther('1.83'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('3.66'))
      })

      it('Respects asset max supply', async function () {
        // set asset max supply
        await this.asset.connect(owner).setMaxSupply(parseEther('1.83'))

        // try to deposit over the max supply
        await expect(
          this.pool.connect(users[0]).depositETH(users[1].address, this.fiveSecondsSince, {
            value: parseEther('1.84'),
          })
        ).to.be.revertedWith('MAX_SUPPLY_REACHED')

        await this.asset.connect(owner).setMaxSupply(parseEther('0'))
        // try to deposit now that max supply is not set
        await expect(
          this.pool.connect(users[0]).depositETH(users[1].address, this.fiveSecondsSince, {
            value: parseEther('1.83'),
          })
        ).to.be.ok
      })

      it('applies deposit fee when cov > 1 to prevent deposit arbitrage', async function () {
        // Deposit from user[0] to pool 100 AVAX
        const receipt = await this.pool.connect(users[0]).depositETH(users[1].address, this.fiveSecondsSince, {
          value: parseEther('100'),
        })

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.WETH.address, parseEther('100'), parseEther('100'), users[1].address)

        // Next, adjust coverage ratio to = 2 > 1
        await this.WETH.connect(owner).transfer(this.asset.address, parseEther('100'))
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).addCash(parseEther('100'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(2) // cov = 2

        // Now that cov = 2 > 1
        // A = 200 , L = 100
        // try to deposit again
        // Deposit from user[0] to pool 100 AVAX
        await this.pool.connect(users[0]).depositETH(users[1].address, this.fiveSecondsSince, {
          value: parseEther('100'),
        })
        expect(await this.asset.cash()).to.be.equal(parseEther('300')) // Assets = 200 + 100
        expect(await this.asset.liability()).to.be.equal(parseEther('199.999781514346136200'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('300'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('199.999781514346136200'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.WETH.address, parseEther('100'), parseEther('100'), users[1].address)

        // Now, try to withdraw 100 and see if we can perform arbitrage : if amount withdrawn is > 100
        const beforeBalance = await this.WETH.balanceOf(users[0].address)

        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.WETH.address, parseEther('100'))

        // approve asset spending by pool
        await this.asset.connect(users[1]).approve(this.pool.address, ethers.constants.MaxUint256)

        const receipt3 = await this.pool
          .connect(users[1])
          .withdraw(this.WETH.address, parseEther('100'), parseEther('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance3 = await this.WETH.balanceOf(users[0].address)

        // check that quoted withdrawal is the same as amount withdrawn
        expect(afterBalance3.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(afterBalance3.sub(beforeBalance)).to.be.equal(parseEther('100'))
        expect(await this.asset.balanceOf(users[1].address)).to.be.equal(parseEther('99.999781514346136200'))
        expect(await this.asset.cash()).to.be.equal(parseEther('200'))
        expect(await this.asset.liability()).to.be.equal(parseEther('99.999781514346136200'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('200'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('99.999781514346136200'))

        expect(receipt3)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[1].address, this.WETH.address, parseEther('100'), parseEther('100'), users[0].address)
      })

      it('maintains the LP token supply and liability ratio', async function () {
        await this.pool.connect(users[0]).depositETH(users[1].address, this.fiveSecondsSince, {
          value: parseEther('1.83'),
        })
        // Add dividend
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).addLiability(parseEther('0.01768743'))
        await this.asset.connect(owner).setPool(this.pool.address)

        expect((await this.asset.liability()) / (await this.asset.totalSupply())).to.equal(1.009665262295082)

        const receipt = await this.pool.connect(users[1]).depositETH(users[2].address, this.fiveSecondsSince, {
          value: parseEther('1.17'),
        })
        expect(await this.asset.liability()).to.be.equal(parseEther('3.01768743'))
        expect(await this.asset.balanceOf(users[2].address)).to.be.equal(parseEther('1.158799895066667201'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('2.988799895066667201'))
        expect((await this.asset.liability()) / (await this.asset.totalSupply())).to.equal(1.0096652622950821)

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(
            users[1].address,
            this.WETH.address,
            parseEther('1.17'),
            parseEther('1.158799895066667201'),
            users[2].address
          )
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool.connect(users[0]).depositETH(users[0].address, this.fiveSecondsAgo, { value: parseEther('1.83') }),
          'Platypus: EXPIRED'
        ).to.be.reverted
      })

      it('reverts if pool paused', async function () {
        await this.pool.connect(owner).pause()
        await expect(
          this.pool
            .connect(users[0])
            .depositETH(users[0].address, this.fiveSecondsSince, { value: parseEther('1.83') }),
          'Pausable: paused'
        ).to.be.reverted
      })

      it('reverts if liquidity to mint is too small', async function () {
        await expect(
          this.pool.connect(users[0]).depositETH(users[1].address, this.fiveSecondsSince, {
            value: parseEther('0'),
          }),
          'PTP:ZERO_VALUE'
        ).to.be.reverted
      })

      it('reverts if zero address provided', async function () {
        await expect(
          this.pool.connect(users[0]).depositETH(ethers.constants.AddressZero, this.fiveSecondsSince, {
            value: parseEther('1.83'),
          }),
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

  describe('Asset sAVAX', function () {
    beforeEach(async function () {
      const aggregateName = 'Liquid staking AVAX Aggregate'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      // get some WETH for owner
      await this.WETH.deposit({ value: parseEther('100') })

      this.asset = await Asset.deploy()
      this.asset.connect(owner)
      await this.asset.connect(owner).initialize(this.WETH.address, 'AVAX Asset', 'LP-AVAX', aggregateAccount.address)

      await this.asset.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.WETH.address, this.asset.address)

      const tokenSetSAvax = await createAndInitializeToken('sAVAX', 18, owner, this.pool, aggregateAccount)

      this.sAVAX = tokenSetSAvax.token
      this.asset = tokenSetSAvax.asset

      await fundUserAndApprovePool(this.sAVAX, users[0], parseEther('100000').toString(), this.pool, owner)
    })

    describe('deposit', function () {
      beforeEach(async function () {
        // Transfer 100k from contrac to users[0]
        await this.sAVAX.connect(owner).transfer(users[0].address, parseEther('100000')) // 100 k
        // Approve max allowance from users[0] to pool
        await this.sAVAX.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      })

      it('works (first LP)', async function () {
        // Get sAVAX balance of user[0]
        const beforeBalance = await this.sAVAX.balanceOf(users[0].address)
        // Deposit from user[0] to pool 100 sAVAX
        const receipt = await this.pool
          .connect(users[0])
          .deposit(this.sAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.sAVAX.balanceOf(users[0].address)

        expect(await this.asset.cash()).to.be.equal(parseEther('100'))
        expect(await this.asset.liability()).to.be.equal(parseEther('100'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('100'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('100'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('100'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('-100'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.sAVAX.address, parseEther('100'), parseEther('100'), users[0].address)
      })

      it('works (second LP)', async function () {
        // Deposit from user[0] to pool 100 sAVAX
        await this.pool
          .connect(users[0])
          .deposit(this.sAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince)

        await this.sAVAX.connect(owner).transfer(users[1].address, parseEther('100000'))
        await this.sAVAX.connect(users[1]).approve(this.pool.address, ethers.constants.MaxUint256)
        // Deposit from user[1] to pool 100 sAVAX
        await this.pool
          .connect(users[1])
          .deposit(this.sAVAX.address, parseEther('100'), users[1].address, this.fiveSecondsSince)

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
            .deposit(this.sAVAX.address, parseEther('101'), users[2].address, this.fiveSecondsSince)
        ).to.be.revertedWith('MAX_SUPPLY_REACHED')

        await this.asset.connect(owner).setMaxSupply(ethers.utils.parseEther('0'))
        // try to deposit now that max supply is not set
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.sAVAX.address, parseEther('101'), users[2].address, this.fiveSecondsSince)
        ).to.be.ok
      })

      it('applies deposit fee when cov > 1 to prevent deposit arbitrage', async function () {
        // First deposit 100 sAVAX
        // Get sAVAX balance of user[0]
        const beforeBalance = await this.sAVAX.balanceOf(users[0].address)
        // Deposit from user[0] to pool 100 sAVAX
        const receipt = await this.pool
          .connect(users[0])
          .deposit(this.sAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.sAVAX.balanceOf(users[0].address)

        expect(await this.asset.cash()).to.be.equal(parseEther('100'))
        expect(await this.asset.liability()).to.be.equal(parseEther('100'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('100'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('100'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('100'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('-100'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.sAVAX.address, parseEther('100'), parseEther('100'), users[0].address)

        // Next, adjust coverage ratio to = 2 > 1
        await this.asset.connect(owner).setPool(owner.address)
        await this.sAVAX.connect(owner).transfer(this.asset.address, parseEther('100')) // transfer sAVAX to Asset to back
        await this.asset.connect(owner).addCash(parseEther('100'))
        // await this.asset.connect(owner).transferToken(owner.address, parseEther('40'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(2) // cov = 2

        // Now that cov = 2 > 1
        // A = 200 , L = 100
        // try to deposit again
        // Deposit from user[0] to pool 100 sAVAX
        await this.pool
          .connect(users[0])
          .deposit(this.sAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
        const afterBalance2 = await this.sAVAX.balanceOf(users[0].address)

        expect(await this.asset.cash()).to.be.equal(parseEther('300')) // Assets = 200 + 100
        expect(await this.asset.liability()).to.be.equal(parseEther('199.999781514346136200'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('300'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('199.999781514346136200'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('199.999781514346136200'))
        expect(afterBalance2.sub(beforeBalance)).to.be.equal(parseEther('-200'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[0].address, this.sAVAX.address, parseEther('100'), parseEther('100'), users[0].address)

        // Now, try to withdraw 100 and see if we can perform arbitrage : if amount withdrawn is > 100
        const beforeBalance3 = await this.sAVAX.balanceOf(users[0].address)

        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.sAVAX.address, parseEther('100'))

        // approve asset spending by pool
        await this.asset.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

        const receipt3 = await this.pool
          .connect(users[0])
          .withdraw(this.sAVAX.address, parseEther('100'), parseEther('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance3 = await this.sAVAX.balanceOf(users[0].address)

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
          .withArgs(users[0].address, this.sAVAX.address, parseEther('100'), parseEther('100'), users[0].address)
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.sAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsAgo),
          'EXPIRED'
        ).to.be.reverted
      })

      it('reverts if liquidity to mint is too small', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.sAVAX.address, parseEther('0'), users[0].address, this.fiveSecondsSince),
          'INSUFFICIENT_LIQUIDITY_MINTED'
        ).to.be.reverted
      })

      it('reverts if liquidity provider does not have enough balance', async function () {
        await this.sAVAX.connect(users[1]).approve(this.pool.address, ethers.constants.MaxUint256)
        await expect(
          this.pool
            .connect(users[1])
            .deposit(this.sAVAX.address, parseEther('100'), users[1].address, this.fiveSecondsSince),
          'ERC20: transfer amount exceeds balance'
        ).to.be.reverted
      })

      it('reverts if pool paused', async function () {
        await this.pool.connect(owner).pause()
        await expect(
          this.pool
            .connect(users[0])
            .deposit(this.sAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince),
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
})
