import { ethers } from 'hardhat'
import { parseEther, parseUnits } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ContractFactory } from 'ethers'
import {
  createAndInitializeToken,
  fundUserAndApprovePool,
  setPriceOracle,
  expectAssetValues,
  usdc,
  setupAggregateAccount,
  setupSecondaryPurePool,
} from '../helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('PoolSecondaryPure', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let TestERC20: ContractFactory

  before(async () => {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    TestERC20 = await ethers.getContractFactory('TestERC20')
  })

  beforeEach(async function () {
    const TestWAVAX = await ethers.getContractFactory('TestWAVAX')

    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp
    this.fiveSecondsSince = this.lastBlockTime + 5 * 1000
    this.fiveSecondsAgo = this.lastBlockTime - 5 * 1000

    const poolSetup = await setupSecondaryPurePool(owner)
    this.pool = poolSetup.pool
    this.WETH = await TestWAVAX.deploy()
  })

  describe('Asset DAI (18 decimals) and USDC (6 decimals)', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const aggregateName = 'USD-Stablecoins'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      const tokenSetDAI = await createAndInitializeToken('DAI', 18, owner, this.pool, aggregateAccount)
      const tokenSetUSDC = await createAndInitializeToken('USDC', 6, owner, this.pool, aggregateAccount)

      this.DAI = tokenSetDAI.token
      this.assetDAI = tokenSetDAI.asset

      this.USDC = tokenSetUSDC.token
      this.assetUSDC = tokenSetUSDC.asset
      // Set price oracle
      await setPriceOracle(this.pool, owner, this.lastBlockTime, [
        { address: this.DAI.address, initialRate: parseUnits('1', 8).toString() },
        { address: this.USDC.address, initialRate: parseUnits('1', 8).toString() },
      ])

      // fund user with 100 k
      await fundUserAndApprovePool(this.DAI, users[0], parseEther('100000').toString(), this.pool, owner)
      await fundUserAndApprovePool(this.USDC, users[0], usdc('100000').toString(), this.pool, owner)

      // deposit 10 k dai
      await this.pool
        .connect(users[0])
        .deposit(this.DAI.address, parseEther('10000'), users[0].address, this.fiveSecondsSince)
      // deposit 10 k usdc
      await this.pool
        .connect(users[0])
        .deposit(this.USDC.address, usdc('10000'), users[0].address, this.fiveSecondsSince)
    })

    describe('swap', function () {
      it('works (DAI -> USDC)', async function () {
        const beforeFromBalance = await this.DAI.balanceOf(users[0].address)
        const beforeToBalance = await this.USDC.balanceOf(users[0].address)
        const [quotedAmount] = await this.pool
          .connect(users[0])
          .quotePotentialSwap(this.DAI.address, this.USDC.address, parseEther('100'))

        const receipt = await this.pool.connect(users[0]).swap(
          this.DAI.address,
          this.USDC.address,
          parseEther('100'),
          usdc('90'), //expect at least 90% of ideal quoted amount
          users[0].address,
          this.fiveSecondsSince
        )
        const afterFromBalance = await this.DAI.balanceOf(users[0].address)
        const afterToBalance = await this.USDC.balanceOf(users[0].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance)
        const tokenGot = afterToBalance.sub(beforeToBalance)

        expect(tokenSent).to.be.equal(parseEther('-100'))
        expect(tokenGot).to.be.equal(usdc('99.968879'))

        // check if quoted amount is the same to actual amount of token got
        expect(tokenGot).to.be.equal(quotedAmount)

        await expectAssetValues(this.assetDAI, 18, { cash: '10100', liability: '10000' })
        await expectAssetValues(this.assetUSDC, 6, { cash: '9900.031121', liability: '10000' })

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.DAI.address,
            this.USDC.address,
            parseEther('100'),
            usdc('99.968879'),
            users[0].address
          )

        expect(tokenSent.add(await this.assetDAI.cash())).to.be.equal(parseEther('10000'))
        expect(tokenGot.add(await this.assetUSDC.cash())).to.be.equal(usdc('10000'))
      })

      it('works (USDC -> DAI)', async function () {
        const beforeFromBalance = await this.USDC.balanceOf(users[0].address)
        const beforeToBalance = await this.DAI.balanceOf(users[0].address)

        const [quotedAmount] = await this.pool
          .connect(users[0])
          .quotePotentialSwap(this.USDC.address, this.DAI.address, usdc('100'))

        const receipt = await this.pool.connect(users[0]).swap(
          this.USDC.address,
          this.DAI.address,
          usdc('100'),
          parseEther('90'), //expect at least 90% of ideal quoted amount
          users[0].address,
          this.fiveSecondsSince
        )
        const afterFromBalance = await this.USDC.balanceOf(users[0].address)
        const afterToBalance = await this.DAI.balanceOf(users[0].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance)
        const tokenGot = afterToBalance.sub(beforeToBalance)
        expect(tokenSent).to.be.equal(usdc('-100'))
        expect(tokenGot).to.be.equal(parseEther('99.968879495882390916'))

        await expectAssetValues(this.assetUSDC, 6, { cash: '10100', liability: '10000' })

        //check if token got is equal to token quoted
        expect(tokenGot).to.be.equal(quotedAmount)
        await expectAssetValues(this.assetDAI, 18, {
          cash: '9900.031120504117609084',
          liability: '10000',
        })

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.USDC.address,
            this.DAI.address,
            usdc('100'),
            parseEther('99.968879495882390916'),
            users[0].address
          )

        expect(tokenSent.add(await this.assetUSDC.cash())).to.be.equal(usdc('10000'))
        expect(tokenGot.add(await this.assetDAI.cash())).to.be.equal(parseEther('10000'))
      })

      it('Rewards actions that move DAI (rci) and USDC (rcj) closer', async function () {
        // // Check current cash position of asset

        // First, adjust coverage ratio of first asset Si DAI to 0.5
        await this.assetDAI.connect(owner).setPool(owner.address)
        await this.assetDAI.connect(owner).removeCash(parseEther('5000')) // remove 5k from asset cash
        await this.assetDAI.connect(owner).transferUnderlyingToken(owner.address, parseEther('5000'))
        await this.assetDAI.connect(owner).setPool(this.pool.address)
        expect((await this.assetDAI.cash()) / (await this.assetDAI.liability())).to.equal(0.5) // Rci = 0.5

        // Second, check coverage ratio of second asset USDC is still 1
        expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(1) // Rcj = 1

        // In this case, Rci < Rcj which implies Si < Sj, which in turns implies Si - Sj < 0
        // Meaning the system will reward this transaction since fee is : 1 - (Si - Sj) > 1

        const beforeBalanceDAI = await this.DAI.balanceOf(users[0].address)
        const beforeBalanceUSDC = await this.USDC.balanceOf(users[0].address)

        const [quotedAmount] = await this.pool
          .connect(users[0])
          .quotePotentialSwap(this.DAI.address, this.USDC.address, parseEther('1000'))

        await this.pool.connect(users[0]).swap(
          this.DAI.address,
          this.USDC.address,
          parseEther('1000'),
          usdc('900'), //expect at least 90% of ideal quoted amount
          users[0].address,
          this.fiveSecondsSince
        )

        const afterBalanceDAI = await this.DAI.balanceOf(users[0].address)
        const afterBalanceUSDC = await this.USDC.balanceOf(users[0].address)

        const DAIDeltaAmount = afterBalanceDAI.sub(beforeBalanceDAI)
        const USDCDeltaAmount = afterBalanceUSDC.sub(beforeBalanceUSDC)

        expect(USDCDeltaAmount).to.be.equal(quotedAmount)

        // arbitrageDelta amount lost or won by trade
        const arbitrageDelta =
          parseInt(ethers.utils.formatUnits(USDCDeltaAmount, 6)) + parseInt(ethers.utils.formatEther(DAIDeltaAmount))

        expect(arbitrageDelta).to.be.above(0)
      })

      it('Penalize actions that move DAI (rci) and USDC (rcj) further away', async function () {
        // First, check coverage ratio of first asset DAI is still 1
        expect((await this.assetDAI.cash()) / (await this.assetDAI.liability())).to.equal(1) // Rci = 1

        // Second, adjust coverage ratio of second asset Sj USDC to 0.5
        await this.assetUSDC.connect(owner).setPool(owner.address)
        await this.assetUSDC.connect(owner).removeCash(usdc('5000')) // remove 5k from asset cash
        await this.assetUSDC.connect(owner).transferUnderlyingToken(owner.address, usdc('5000'))
        await this.assetUSDC.connect(owner).setPool(this.pool.address)
        expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(0.5) // Rcj = 0.5

        // In this case, Rci > Rcj (1 > 0.5) which implies Si > Sj, which in turns implies Si - Sj > 0
        // Meaning the system will penalize this transaction since fee is : 1 - (Si - Sj) < 1

        const beforeBalanceDAI = await this.DAI.balanceOf(users[0].address)
        const beforeBalanceUSDC = await this.USDC.balanceOf(users[0].address)

        const [quotedAmount] = await this.pool
          .connect(users[0])
          .quotePotentialSwap(this.DAI.address, this.USDC.address, parseEther('1000'))

        await this.pool.connect(users[0]).swap(
          this.DAI.address,
          this.USDC.address,
          parseEther('1000'),
          usdc('900'), //expect at least 90% of ideal quoted amount
          users[0].address,
          this.fiveSecondsSince
        )

        const afterBalanceDAI = await this.DAI.balanceOf(users[0].address)
        const afterBalanceUSDC = await this.USDC.balanceOf(users[0].address)

        const DAIDeltaAmount = afterBalanceDAI.sub(beforeBalanceDAI)
        const USDCDeltaAmount = afterBalanceUSDC.sub(beforeBalanceUSDC)

        // Check that expected amount is the same as quoted
        expect(USDCDeltaAmount).to.be.equal(quotedAmount)

        // arbitrageDelta amount lost or won by trade
        const arbitrageDelta =
          parseInt(ethers.utils.formatUnits(USDCDeltaAmount, 6)) + parseInt(ethers.utils.formatEther(DAIDeltaAmount))

        expect(arbitrageDelta).to.be.below(0)
      })

      it('revert if assets are in 2 different aggregate pools', async function () {
        const aggregateAccount2 = await setupAggregateAccount(owner, 'LINK', false)
        await aggregateAccount2.deployTransaction.wait()

        const tokenSetLINK = await createAndInitializeToken('LINK', 18, owner, this.pool, aggregateAccount2)

        this.LINK = tokenSetLINK.token
        this.assetLINK = tokenSetLINK.asset

        // await this.assetETH.connect(owner).initialize()
        await expect(
          this.pool
            .connect(users[0])
            .swap(this.USDC.address, this.LINK.address, usdc('1'), usdc('0'), users[0].address, this.fiveSecondsSince)
        ).to.be.revertedWith('DIFF_AGG_ACC')
      })

      it('allows swapping when cov = 0', async function () {
        // Adjust coverage ratio to 0
        await this.assetUSDC.connect(owner).setPool(owner.address)
        await this.assetUSDC.connect(owner).removeCash(await this.assetUSDC.cash())
        await this.assetUSDC.connect(owner).transferUnderlyingToken(owner.address, await this.assetUSDC.cash())
        await this.assetUSDC.connect(owner).setPool(this.pool.address)
        expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(0)

        const beforeFromBalance = await this.USDC.balanceOf(users[0].address)
        const beforeToBalance = await this.DAI.balanceOf(users[0].address)

        const [quotedAmount] = await this.pool
          .connect(users[0])
          .quotePotentialSwap(this.USDC.address, this.DAI.address, usdc('100'))

        const receipt = await this.pool.connect(users[0]).swap(
          this.USDC.address,
          this.DAI.address,
          usdc('100'),
          parseEther('90'), //expect at least 90% of ideal quoted amount
          users[0].address,
          this.fiveSecondsSince
        )
        const afterFromBalance = await this.USDC.balanceOf(users[0].address)
        const afterToBalance = await this.DAI.balanceOf(users[0].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance)
        const tokenGot = afterToBalance.sub(beforeToBalance)
        expect(tokenSent).to.be.equal(usdc('-100'))
        expect(tokenGot).to.be.equal(parseEther('199.925427143740538487'))

        //check if token got is equal to token quoted
        expect(tokenGot).to.be.equal(quotedAmount)

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.USDC.address,
            this.DAI.address,
            usdc('100'),
            parseEther('199.925427143740538487'),
            users[0].address
          )

        expect(tokenSent.add(await this.assetUSDC.cash())).to.be.equal(0)
        expect(tokenGot.add(await this.assetDAI.cash())).to.be.equal(parseEther('10000'))
        // const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('100000'))
      })

      it('allows swapping then withdrawing', async function () {
        // Approve spending by pool
        await this.assetDAI.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
        await this.assetUSDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

        // Swap 100 DAI to USDC
        const swapReceipt = await this.pool.connect(users[0]).swap(
          this.DAI.address,
          this.USDC.address,
          parseEther('100'),
          usdc('90'), //expect at least 90% of ideal quoted amount
          users[0].address,
          this.fiveSecondsSince
        )

        expect(swapReceipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.DAI.address,
            this.USDC.address,
            parseEther('100'),
            usdc('99.968879'),
            users[0].address
          )

        // Then try to withdraw 1000 USDC
        const withdrawalReceipt = await this.pool
          .connect(users[0])
          .withdraw(this.USDC.address, usdc('1000'), usdc('999'), users[0].address, this.fiveSecondsSince)

        expect(withdrawalReceipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.USDC.address, usdc('999.999934'), usdc('1000'), users[0].address)
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool.connect(users[0]).swap(
            this.USDC.address,
            this.DAI.address,
            usdc('100'),
            parseEther('90'), //expect at least 90% of ideal quoted amount
            users[0].address,
            this.fiveSecondsAgo
          )
        ).to.be.revertedWith('EXPIRED')
      })

      it('reverts if amount to receive is less than expected', async function () {
        await expect(
          this.pool.connect(users[0]).swap(
            this.USDC.address,
            this.DAI.address,
            usdc('100'),
            parseEther('100'), //expect at least 100% of ideal quoted amount
            users[0].address,
            this.fiveSecondsSince
          )
        ).to.be.revertedWith('AMOUNT_TOO_LOW')
      })

      it('reverts if pool paused', async function () {
        await this.pool.connect(owner).pause()
        await expect(
          this.pool.connect(users[0]).swap(
            this.USDC.address,
            this.DAI.address,
            usdc('100'),
            parseEther('90'), //expect at least 90% of ideal quoted amount
            users[0].address,
            this.fiveSecondsSince
          )
        ).to.be.revertedWith('Pausable: paused')
      })

      it('reverts if zero address provided', async function () {
        await expect(
          this.pool.connect(users[0]).swap(
            ethers.constants.AddressZero,
            this.DAI.address,
            usdc('100'),
            parseEther('90'), //expect at least 90% of ideal quoted amount
            users[0].address,
            this.fiveSecondsSince
          )
        ).to.be.revertedWith('ZERO')

        await expect(
          this.pool.connect(users[0]).swap(
            this.USDC.address,
            ethers.constants.AddressZero,
            usdc('100'),
            parseEther('90'), //expect at least 90% of ideal quoted amount
            users[0].address,
            this.fiveSecondsSince
          )
        ).to.be.revertedWith('ZERO')
      })

      it('reverts if asset not exist', async function () {
        const pax = await TestERC20.connect(owner).deploy('PAX', 'PAX', 18, '0')
        await expect(
          this.pool
            .connect(users[0])
            .swap(pax.address, this.USDC.address, parseEther('10'), usdc('0'), users[0].address, this.fiveSecondsSince)
        ).to.be.revertedWith('ASSET_NOT_EXIST')
      })

      it('reverts if user does not have enough from tokens', async function () {
        await expect(
          this.pool.connect(users[3]).swap(
            this.USDC.address,
            this.DAI.address,
            usdc('100'),
            parseEther('0'), //expect at least 90% of ideal quoted amount
            users[3].address,
            this.fiveSecondsSince
          )
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('works when deviation is acceptable : less than max stated amount', async function () {
        // Set price oracle to show exactly 2% deviation between asset prices
        await setPriceOracle(this.pool, owner, this.lastBlockTime, [
          { address: this.DAI.address, initialRate: parseUnits('0.995', 8).toString() },
          { address: this.USDC.address, initialRate: parseUnits('1.015', 8).toString() },
        ])

        await expect(
          this.pool.connect(users[0]).swap(
            this.USDC.address,
            this.DAI.address,
            usdc('100'),
            parseEther('90'), //expect at least 90% of ideal quoted amount
            users[0].address,
            this.fiveSecondsSince
          )
        ).to.be.ok
      })
    })
  })

  describe('WBTC and WBTC.e (8 d.p)', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const aggregateName = 'BTC'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, false)
      await aggregateAccount.deployTransaction.wait()

      const tokenSetWBTC = await createAndInitializeToken('WBTC', 8, owner, this.pool, aggregateAccount)
      const tokenSetWBTCe = await createAndInitializeToken('WBTCe', 8, owner, this.pool, aggregateAccount)

      this.WBTC = tokenSetWBTC.token
      this.assetWBTC = tokenSetWBTC.asset

      this.WBTCe = tokenSetWBTCe.token
      this.assetWBTCe = tokenSetWBTCe.asset

      await setPriceOracle(this.pool, owner, this.lastBlockTime, [
        { address: this.WBTC.address, initialRate: parseEther('47604').toString() },
        { address: this.WBTCe.address, initialRate: parseEther('47604').toString() },
      ])

      // fund user with 10 k WBTC, WBTCe
      await fundUserAndApprovePool(this.WBTC, users[0], parseUnits('10000', 8).toString(), this.pool, owner)
      await fundUserAndApprovePool(this.WBTCe, users[0], parseUnits('10000', 8).toString(), this.pool, owner)

      // deposit 1000  wbtc
      await this.pool
        .connect(users[0])
        .deposit(this.WBTC.address, parseUnits('1000', 8), users[0].address, this.fiveSecondsSince)
      // deposit 1000 wbtce
      await this.pool
        .connect(users[0])
        .deposit(this.WBTCe.address, parseUnits('1000', 8), users[0].address, this.fiveSecondsSince)
    })

    describe('swap', function () {
      it('works (WBTC -> WBTCe)', async function () {
        const beforeFromBalance = await this.WBTC.balanceOf(users[0].address)
        const beforeToBalance = await this.WBTCe.balanceOf(users[0].address)

        const [quotedAmount] = await this.pool
          .connect(users[0])
          .quotePotentialSwap(this.WBTC.address, this.WBTCe.address, parseUnits('10', 8))

        // swap 10 wbtc to wbtce
        const receipt = await this.pool
          .connect(users[0])
          .swap(
            this.WBTC.address,
            this.WBTCe.address,
            parseUnits('10', 8),
            parseUnits('0', 8),
            users[0].address,
            this.fiveSecondsSince
          )
        const afterFromBalance = await this.WBTC.balanceOf(users[0].address)
        const afterToBalance = await this.WBTCe.balanceOf(users[0].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance)
        const tokenGot = afterToBalance.sub(beforeToBalance)

        expect(tokenSent).to.be.equal(parseUnits('-10', 8))
        expect(tokenGot).to.be.equal(parseUnits('9.99688795', 8))

        // check if tokenGot is equal to the potential quoted amount
        expect(tokenGot).to.be.equal(quotedAmount)

        await expectAssetValues(this.assetWBTC, 8, { cash: '1010', liability: '1000' })
        await expectAssetValues(this.assetWBTCe, 8, { cash: '990.00311205', liability: '1000' })

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.WBTC.address,
            this.WBTCe.address,
            parseUnits('10', 8),
            parseUnits('9.99688795', 8),
            users[0].address
          )

        expect(tokenSent.add(await this.assetWBTC.cash())).to.be.equal(parseUnits('1000', 8))
        expect(tokenGot.add(await this.assetWBTCe.cash())).to.be.equal(parseUnits('1000', 8))
      })

      it('works (WBTCe -> WBTC)', async function () {
        const beforeFromBalance = await this.WBTCe.balanceOf(users[0].address)
        const beforeToBalance = await this.WBTC.balanceOf(users[0].address)

        const [quotedAmount] = await this.pool
          .connect(users[0])
          .quotePotentialSwap(this.WBTCe.address, this.WBTC.address, parseUnits('50', 8))

        // swap 50 wbtce to wbtc
        const receipt = await this.pool
          .connect(users[0])
          .swap(
            this.WBTCe.address,
            this.WBTC.address,
            parseUnits('50', 8),
            parseUnits('0', 8),
            users[0].address,
            this.fiveSecondsSince
          )
        const afterFromBalance = await this.WBTCe.balanceOf(users[0].address)
        const afterToBalance = await this.WBTC.balanceOf(users[0].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance)
        const tokenGot = afterToBalance.sub(beforeToBalance)

        expect(tokenSent).to.be.equal(parseUnits('-50', 8))
        expect(tokenGot).to.be.equal(parseUnits('49.98214778', 8))

        // check if quoted amount is the same to actual amount of token got
        expect(tokenGot).to.be.equal(quotedAmount)

        await expectAssetValues(this.assetWBTCe, 8, { cash: '1050', liability: '1000' })
        await expectAssetValues(this.assetWBTC, 8, { cash: '950.01785222', liability: '1000' })

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.WBTCe.address,
            this.WBTC.address,
            parseUnits('50', 8),
            parseUnits('49.98214778', 8),
            users[0].address
          )

        expect(tokenSent.add(await this.assetWBTCe.cash())).to.be.equal(parseUnits('1000', 8))
        expect(tokenGot.add(await this.assetWBTC.cash())).to.be.equal(parseUnits('1000', 8))
      })
    })
  })

  describe("USDC -> DAI newton's method check", function () {
    beforeEach(async function () {
      // Setup aggregate account
      const aggregateName = 'USD-Stablecoins'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      const tokenSetDAI = await createAndInitializeToken('DAI', 18, owner, this.pool, aggregateAccount)
      const tokenSetUSDC = await createAndInitializeToken('USDC', 6, owner, this.pool, aggregateAccount)

      this.DAI = tokenSetDAI.token
      this.assetDAI = tokenSetDAI.asset

      this.USDC = tokenSetUSDC.token
      this.assetUSDC = tokenSetUSDC.asset
      await setPriceOracle(this.pool, owner, this.lastBlockTime, [
        { address: this.DAI.address, initialRate: parseEther('1').toString() },
        { address: this.USDC.address, initialRate: parseEther('1').toString() },
      ])

      // fund user with 100 k
      await fundUserAndApprovePool(this.DAI, users[0], parseEther('100000').toString(), this.pool, owner)
      await fundUserAndApprovePool(this.USDC, users[0], usdc('100000').toString(), this.pool, owner)

      // deposit 30 k dai
      await this.pool
        .connect(users[0])
        .deposit(this.DAI.address, parseEther('30000'), users[0].address, this.fiveSecondsSince)
      // deposit 30 k usdc
      await this.pool
        .connect(users[0])
        .deposit(this.USDC.address, usdc('30000'), users[0].address, this.fiveSecondsSince)

      // Set assets and liabilities
      await this.assetUSDC.connect(owner).setPool(owner.address)
      await this.assetDAI.connect(owner).setPool(owner.address)

      // [assets to remove, liabilities to remove]
      const deltaUsdc = [parseUnits('1501.9924', 6), parseUnits('1499.9936', 6)]
      const deltaDai = [parseUnits('24332.94831', 18), parseUnits('14584.7767', 18)]

      /// USDC
      await this.assetUSDC.connect(owner).removeCash(deltaUsdc[0])
      await this.assetUSDC.connect(owner).transferUnderlyingToken(owner.address, deltaUsdc[0])
      await this.assetUSDC.connect(owner).removeLiability(deltaUsdc[1])
      await this.assetUSDC.connect(owner).setPool(this.pool.address)

      /// DAI
      await this.assetDAI.connect(owner).removeCash(deltaDai[0])
      await this.assetDAI.connect(owner).removeLiability(deltaDai[1])
      await this.assetDAI.connect(owner).transferUnderlyingToken(owner.address, deltaDai[0])
      await this.assetDAI.connect(owner).setPool(this.pool.address)

      // finally, check asset values are what we need them to be for simulation
      await expectAssetValues(this.assetDAI, 18, { cash: '5667.05169', liability: '15415.2233' })
      await expectAssetValues(this.assetUSDC, 6, { cash: '28498.0076', liability: '28500.0064' })

      const desiredUSDCCov = 0.9999298666824159
      expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(desiredUSDCCov)

      const desiredDAICov = 0.36762696068113393
      expect((await this.assetDAI.cash()) / (await this.assetDAI.liability())).to.equal(desiredDAICov)
    })

    it("should get correct quoteFromAmount (newton's method check)", async function () {
      // Now swap using simulation values
      // To = 320
      // From = 684,4058421986970000000000
      const beforeFromBalance = await this.USDC.balanceOf(users[0].address)
      const beforeToBalance = await this.DAI.balanceOf(users[0].address)

      const [quotedAmount] = await this.pool
        .connect(users[0])
        .quotePotentialSwap(this.USDC.address, this.DAI.address, usdc('684.405842'))

      await this.pool
        .connect(users[0])
        .swap(
          this.USDC.address,
          this.DAI.address,
          usdc('684.405842'),
          parseEther('0'),
          users[0].address,
          this.fiveSecondsSince
        )
      // console.log(formatEther(quotedAmount))

      const afterFromBalance = await this.USDC.balanceOf(users[0].address)
      const afterToBalance = await this.DAI.balanceOf(users[0].address)
      const tokenSent = afterFromBalance.sub(beforeFromBalance)
      const tokenGot = afterToBalance.sub(beforeToBalance)
      expect(tokenGot).to.be.equal(quotedAmount)
      expect(tokenSent).to.be.equal(-usdc('684.405842'))
      expect(tokenGot).to.be.equal(parseEther('196.382409841773368881'))
    })
  })
})
