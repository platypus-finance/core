import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { setPriceOracle, usdc } from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ContractFactory } from '@ethersproject/contracts'
import { setupAggregateAccount } from '../helpers/helper'
import { parseUnits } from 'ethers/lib/utils'

const { expect } = chai
chai.use(solidity)

describe('PoolSecondary', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let TestERC20: ContractFactory
  let TestWAVAX: ContractFactory
  let Pool: ContractFactory
  let Asset: ContractFactory

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    // Get contracts for TestERC20, Pool, Asset
    TestERC20 = await ethers.getContractFactory('TestERC20')
    TestWAVAX = await ethers.getContractFactory('TestWAVAX')
    Pool = await ethers.getContractFactory('PoolSecondary')
    Asset = await ethers.getContractFactory('Asset')
  })

  beforeEach(async function () {
    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp
    this.fiveSecondsSince = this.lastBlockTime + 5 * 1000
    this.fiveSecondsAgo = this.lastBlockTime - 5 * 1000

    this.TestWAVAX = await TestWAVAX.connect(owner).deploy()

    this.pool = await Pool.connect(owner).deploy()

    await this.pool.deployTransaction.wait()
    await this.pool.connect(owner).initialize()

    this.DAI = await TestERC20.connect(owner).deploy('Dai Stablecoin', 'DAI', 18, parseEther('10000000'))
    await this.DAI.deployTransaction.wait()

    this.USDC = await TestERC20.deploy('USD Coin', 'USDC', 6, usdc('10000000'))
    await this.USDC.deployTransaction.wait()

    // Set price oracle
    await setPriceOracle(this.pool, owner, this.lastBlockTime, [
      { address: this.DAI.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.USDC.address, initialRate: parseUnits('1', 8).toString() },
    ])
  })

  describe('Asset DAI (18 decimals)', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const assetName = this.DAI.connect(owner).name()
      this.aggregateAccount = await setupAggregateAccount(owner, assetName, true)
      await this.aggregateAccount.deployTransaction.wait()

      this.asset = await Asset.connect(owner).deploy()
      await this.asset.initialize(this.DAI.address, 'test', 'test', this.aggregateAccount.address)

      // Wait for transaction to be mined
      await this.asset.deployTransaction.wait()

      await this.asset.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.DAI.address, this.asset.address)

      await this.DAI.connect(owner).transfer(users[0].address, parseEther('100000'))
      await this.DAI.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.pool
        .connect(users[0])
        .deposit(this.DAI.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
      await this.asset.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
    })

    describe('withdraw', function () {
      it('works', async function () {
        const beforeBalance = await this.DAI.balanceOf(users[0].address)

        // quote withdrawal
        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.DAI.address, parseEther('70'))

        const receipt = await this.pool
          .connect(users[0])
          .withdraw(this.DAI.address, parseEther('70'), parseEther('70'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.DAI.balanceOf(users[0].address)

        // check that quoted withdrawal is the same as amount withdrawn
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('70'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('30'))
        expect(await this.asset.cash()).to.be.equal(parseEther('30'))
        expect(await this.asset.liability()).to.be.equal(parseEther('30'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('30'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('30'))

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.DAI.address, parseEther('70'), parseEther('70'), users[0].address)
      })

      it('works to withdraw all', async function () {
        const beforeBalance = await this.DAI.balanceOf(users[0].address)

        // quote withdrawal
        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.DAI.address, parseEther('100'))

        await this.pool
          .connect(users[0])
          .withdraw(this.DAI.address, parseEther('100'), parseEther('100'), users[0].address, this.fiveSecondsSince)

        const afterBalance = await this.DAI.balanceOf(users[0].address)

        // check that quoted withdrawal is the same as amount withdrawn
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('0'))
        expect(await this.asset.cash()).to.be.equal(parseEther('0'))
        expect(await this.asset.liability()).to.be.equal(parseEther('0'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('0'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0'))
      })

      it('works with fee (cov > 0.4)', async function () {
        // Adjust coverage ratio to 0.6
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(parseEther('40'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('40'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.6) // cov = 0.6

        const beforeBalance = await this.DAI.balanceOf(users[1].address)

        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.DAI.address, parseEther('10'))

        const receipt = await this.pool
          .connect(users[0])
          .withdraw(this.DAI.address, parseEther('10'), parseEther('0'), users[1].address, this.fiveSecondsSince)
        const afterBalance = await this.DAI.balanceOf(users[1].address)

        // check that quoted withdrawal is the same as amount withdrawn
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('9.961045295931815300'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('90'))
        expect(await this.asset.cash()).to.be.equal(parseEther('50.038954704068184700'))
        expect(await this.asset.liability()).to.be.equal(parseEther('90'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('50.038954704068184700'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('90'))

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(
            users[0].address,
            this.DAI.address,
            parseEther('9.961045295931815300'),
            parseEther('10'),
            users[1].address
          )
      })

      it('works with fee (cov < 0.4) - fees overcome withdrawn amount', async function () {
        // Adjust coverage ratio to 0.3
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(parseEther('70'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('70'))
        await this.asset.connect(owner).setPool(this.pool.address)
        // console.log(`Cash : ${await this.asset.cash()}, Liabilities ${await this.asset.liability()}`)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.3)

        const beforeBalance = await this.DAI.balanceOf(users[0].address)
        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.DAI.address, parseEther('10'))

        // console.log(ethers.utils.parseEther(beforeBalance))
        const receipt = await this.pool
          .connect(users[0])
          .withdraw(this.DAI.address, parseEther('10'), parseEther('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.DAI.balanceOf(users[0].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('3.769076105999983060'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('90'))
        expect(await this.asset.cash()).to.be.equal(parseEther('26.230923894000016940'))
        expect(await this.asset.liability()).to.be.equal(parseEther('90'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('26.230923894000016940'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('90'))

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.DAI.address, parseEther('3.769076105999983060'), parseEther('10'), users[0].address)
      })

      it('works without fee (cov >= 1)', async function () {
        // Adjust coverage ratio to 1.2
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).addCash(parseEther('20'))
        await this.DAI.connect(owner).transfer(this.asset.address, parseEther('20'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(1.2)

        const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(
          this.DAI.address,
          parseEther('10')
        )

        const beforeBalance = await this.DAI.balanceOf(users[0].address)
        await this.pool
          .connect(users[0])
          .withdraw(this.DAI.address, parseEther('10'), parseEther('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.DAI.balanceOf(users[0].address)

        expect(enoughCash).to.be.true
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('10'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('90'))
        expect(await this.asset.cash()).to.be.equal(parseEther('110'))
        expect(await this.asset.liability()).to.be.equal(parseEther('90'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('110'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('90'))
      })

      it('works on dust level', async function () {
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(parseEther('32.11691956203520551'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('32.11691956203520551'))
        await this.asset.connect(owner).setPool(this.pool.address)

        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(
          this.DAI.address,
          parseEther('10.891223863630034018')
        )

        const beforeBalance = await this.DAI.balanceOf(users[0].address)
        await this.pool
          .connect(users[0])
          .withdraw(
            this.DAI.address,
            parseEther('10.891223863630034018'),
            parseEther('0'),
            users[0].address,
            this.fiveSecondsSince
          )
        const afterBalance = await this.DAI.balanceOf(users[0].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('10.880404948535600741'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('89.108776136369965982'))
        expect(await this.asset.cash()).to.be.equal(parseEther('57.002675489429193749'))
        expect(await this.asset.liability()).to.be.equal(parseEther('89.108776136369965982'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('57.002675489429193749'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('89.108776136369965982'))
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .withdraw(this.DAI.address, parseEther('25'), parseEther('25'), users[0].address, this.fiveSecondsAgo)
        ).to.be.revertedWith('EXPIRED')
      })

      it('reverts if liquidity provider does not have enough liquidity token', async function () {
        await this.asset.connect(users[1]).approve(this.pool.address, ethers.constants.MaxUint256)
        await expect(
          this.pool
            .connect(users[1])
            .withdraw(this.DAI.address, parseEther('25'), parseEther('25'), users[1].address, this.fiveSecondsSince)
        ).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })

      it('reverts if amount to receive is less than expected', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .withdraw(this.DAI.address, parseEther('25'), parseEther('100'), users[0].address, this.fiveSecondsSince)
        ).to.be.revertedWith('AMOUNT_TOO_LOW')
      })

      it('reverts if no liability to burn', async function () {
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeLiability(parseEther('100'))
        // await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('100'))
        await this.asset.connect(owner).setPool(this.pool.address)

        await expect(
          this.pool
            .connect(users[0])
            .withdraw(this.DAI.address, parseEther('1'), parseEther('0'), users[0].address, this.fiveSecondsSince)
        ).to.be.revertedWith('INSUFFICIENT_LIQ_BURN')
      })

      it('reverts if pool paused', async function () {
        console.log('reverts if pool paused')
        await this.pool.connect(owner).pause()
        await expect(
          this.pool
            .connect(users[0])
            .withdraw(this.DAI.address, parseEther('25'), parseEther('25'), users[0].address, this.fiveSecondsSince)
        ).to.be.revertedWith('Pausable: paused')
      })

      it('reverts if zero address provided', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .withdraw(
              ethers.constants.AddressZero,
              parseEther('25'),
              parseEther('25'),
              users[0].address,
              this.fiveSecondsSince
            )
        ).to.be.revertedWith('ZERO')
      })

      it('reverts if asset not exist', async function () {
        const btc = await TestERC20.connect(owner).deploy('Bitcoin', 'BTC', 8, '0')
        await btc.deployTransaction.wait()
        await expect(
          this.pool
            .connect(users[0])
            .withdraw(btc.address, parseEther('25'), parseEther('25'), users[0].address, this.fiveSecondsSince)
        ).to.be.revertedWith('ASSET_NOT_EXIST')
      })

      describe('quotePotentialWithdraw', () => {
        it('works with fee', async function () {
          // Adjust coverage ratio to around 0.6
          await this.asset.connect(owner).setPool(owner.address)
          await this.asset.connect(owner).removeCash(parseEther('40'))
          await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('40'))
          await this.asset.connect(owner).addLiability(parseEther('1.768743776499783944'))
          await this.asset.connect(owner).setPool(this.pool.address)

          const [actualAmount, fee] = await this.pool.quotePotentialWithdraw(this.DAI.address, parseEther('10'))

          expect(actualAmount).to.be.equal(parseEther('10.128896004495631295'))
          expect(fee).to.be.equal(parseEther('0.047978373154347099'))
        })

        it('works with 0 fee (cov >= 1)', async function () {
          const [actualAmount, fee] = await this.pool.quotePotentialWithdraw(this.DAI.address, parseEther('10'))

          expect(actualAmount).to.be.equal(parseEther('10'))
          expect(fee).to.be.equal(parseEther('0'))
        })
      })
    })
  })

  describe('Asset USDC (6 d.p.)', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const assetName = this.USDC.connect(owner).name()
      const aggregateAccount = await setupAggregateAccount(owner, assetName, true)
      await aggregateAccount.deployTransaction.wait()

      this.asset = await Asset.connect(owner).deploy()
      await this.asset.initialize(this.USDC.address, 'test', 'test', aggregateAccount.address)

      // Wait for transaction to be mined
      await this.asset.deployTransaction.wait()

      await this.asset.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.USDC.address, this.asset.address)

      await this.USDC.connect(owner).transfer(users[0].address, usdc('100000'))
      await this.USDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.pool.connect(users[0]).deposit(this.USDC.address, usdc('100'), users[0].address, this.fiveSecondsSince)
      await this.asset.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
    })

    describe('withdraw', function () {
      it('works', async function () {
        const beforeBalance = await this.USDC.balanceOf(users[0].address)
        const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('70'))

        const receipt = await this.pool
          .connect(users[0])
          .withdraw(this.USDC.address, usdc('70'), usdc('70'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.USDC.balanceOf(users[0].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(usdc('70'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(enoughCash).to.be.true
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(usdc('30'))
        expect(await this.asset.cash()).to.be.equal(usdc('30'))
        expect(await this.asset.liability()).to.be.equal(usdc('30'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(usdc('30'))
        expect(await this.asset.totalSupply()).to.be.equal(usdc('30'))
        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.USDC.address, usdc('70'), usdc('70'), users[0].address)
      })

      it('works with fee (cov > 0.4)', async function () {
        // Adjust coverage ratio to 0.6
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(usdc('40'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, usdc('40'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.6)
        const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('10'))

        const beforeBalance = await this.USDC.balanceOf(users[1].address)
        const receipt = await this.pool
          .connect(users[0])
          .withdraw(this.USDC.address, usdc('10'), usdc('0'), users[1].address, this.fiveSecondsSince)
        const afterBalance = await this.USDC.balanceOf(users[1].address)
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)
        expect(enoughCash).to.be.true
        expect(afterBalance.sub(beforeBalance)).to.be.equal(usdc('9.961045'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(usdc('90'))
        expect(await this.asset.cash()).to.be.equal(usdc('50.038955'))
        expect(await this.asset.liability()).to.be.equal(usdc('90'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(usdc('50.038955'))
        expect(await this.asset.totalSupply()).to.be.equal(usdc('90'))

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.USDC.address, usdc('9.961045'), usdc('10'), users[1].address)
      })

      it('works with fee (cov < 0.4)', async function () {
        // Cov
        // Adjust coverage ratio to 0.3
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(usdc('70'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, usdc('70'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.3)
        const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('10'))

        const beforeBalance = await this.USDC.balanceOf(users[0].address)
        const receipt = await this.pool
          .connect(users[0])
          .withdraw(this.USDC.address, usdc('10'), usdc('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.USDC.balanceOf(users[0].address)

        expect(enoughCash).to.be.true
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)
        expect(afterBalance.sub(beforeBalance)).to.be.equal(usdc('3.769076'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(usdc('90'))
        expect(await this.asset.cash()).to.be.equal(usdc('26.230924'))
        expect(await this.asset.liability()).to.be.equal(usdc('90'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(usdc('26.230924'))
        expect(await this.asset.totalSupply()).to.be.equal(usdc('90'))
        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.USDC.address, usdc('3.769076'), usdc('10'), users[0].address)
      })

      it('works with fee (cov = 0.5)', async function () {
        // Cov
        // Adjust coverage ratio to 0.5
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(usdc('50'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, usdc('50'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.5)

        const beforeBalance = await this.USDC.balanceOf(users[0].address)

        const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('50'))

        const receipt = await this.pool
          .connect(users[0])
          .withdraw(this.USDC.address, usdc('50'), usdc('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.USDC.balanceOf(users[0].address)

        const withdrawnAmount = afterBalance.sub(beforeBalance)
        const fee = usdc('50').toNumber() - withdrawnAmount

        expect(enoughCash).to.be.true
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)
        expect(fee).to.be.equal(usdc('18.591381'))
        expect(withdrawnAmount).to.be.equal(usdc('31.408619'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(usdc('50'))
        expect(await this.asset.cash()).to.be.equal(usdc('18.591381'))
        expect(await this.asset.liability()).to.be.equal(usdc('50'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(usdc('18.591381'))
        expect(await this.asset.totalSupply()).to.be.equal(usdc('50'))
        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.USDC.address, usdc('31.408619'), usdc('50'), users[0].address)
      })

      it('works without fee (cov >= 1)', async function () {
        // Adjust coverage ratio to 1.2
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).addCash(usdc('20'))
        await this.USDC.connect(owner).transfer(this.asset.address, usdc('20'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(1.2)

        const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('10'))

        const beforeBalance = await this.USDC.balanceOf(users[0].address)
        await this.pool
          .connect(users[0])
          .withdraw(this.USDC.address, usdc('10'), usdc('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.USDC.balanceOf(users[0].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)
        expect(enoughCash).to.be.true
        expect(afterBalance.sub(beforeBalance)).to.be.equal(usdc('10'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(usdc('90'))
        expect(await this.asset.cash()).to.be.equal(usdc('110'))
        expect(await this.asset.liability()).to.be.equal(usdc('90'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(usdc('110'))
        expect(await this.asset.totalSupply()).to.be.equal(usdc('90'))
      })

      it('works on dust level', async function () {
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(usdc('32.768743'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, usdc('32.768743'))
        await this.asset.connect(owner).setPool(this.pool.address)

        const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(
          this.USDC.address,
          usdc('10.814713')
        )

        const beforeBalance = await this.USDC.balanceOf(users[0].address)
        await this.pool
          .connect(users[0])
          .withdraw(this.USDC.address, usdc('10.814713'), usdc('0'), users[0].address, this.fiveSecondsSince)
        const afterBalance = await this.USDC.balanceOf(users[0].address)

        expect(enoughCash).to.be.true
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(usdc('10.802702'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(usdc('89.185287'))
        expect(await this.asset.cash()).to.be.equal(usdc('56.428555'))
        expect(await this.asset.liability()).to.be.equal(usdc('89.185287'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(usdc('56.428555'))
        expect(await this.asset.totalSupply()).to.be.equal(usdc('89.185287'))
      })
    })
  })

  describe('MultiAsset tests', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const assetName = this.USDC.connect(owner).name()
      const aggregateAccount = await setupAggregateAccount(owner, assetName, true)
      await aggregateAccount.deployTransaction.wait()

      this.assetUSDC = await Asset.connect(owner).deploy()
      await this.assetUSDC.initialize(this.USDC.address, 'test', 'test', aggregateAccount.address)

      // Wait for transaction to be mined
      await this.assetUSDC.deployTransaction.wait()

      await this.assetUSDC.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.USDC.address, this.assetUSDC.address)

      await this.USDC.connect(owner).transfer(users[0].address, usdc('100000'))
      await this.USDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.pool.connect(users[0]).deposit(this.USDC.address, usdc('100'), users[0].address, this.fiveSecondsSince)
      await this.assetUSDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

      this.assetDAI = await Asset.connect(owner).deploy()
      await this.assetDAI.initialize(this.DAI.address, 'test', 'test', aggregateAccount.address)

      // Wait for transaction to be mined
      await this.assetDAI.deployTransaction.wait()

      await this.assetDAI.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.DAI.address, this.assetDAI.address)

      await this.DAI.connect(owner).transfer(users[0].address, parseEther('100000'))
      await this.DAI.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.pool
        .connect(users[0])
        .deposit(this.DAI.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
      await this.assetDAI.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
    })

    it('withdraw works when there is not enough cash in asset to cover for full liability to burn', async function () {
      // Adjust coverage ratio to 0.5 of USDC
      await this.assetUSDC.connect(owner).setPool(owner.address)
      await this.assetUSDC.connect(owner).removeCash(usdc('50'))
      await this.assetUSDC.connect(owner).transferUnderlyingToken(owner.address, usdc('50'))
      await this.assetUSDC.connect(owner).setPool(this.pool.address)
      expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(0.5)

      const beforeBalance = await this.USDC.balanceOf(users[0].address)

      // const startingCashPosition = await this.assetUSDC.cash()
      // console.log(`The remaining cash position is : ${startingCashPosition}`)
      // console.log(`The remaining liability position is : ${await this.assetUSDC.liability()}`)

      const [quotedWithdrawal, , enoughCash] = await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('100'))

      const receipt = await this.pool
        .connect(users[0])
        .withdraw(this.USDC.address, usdc('100'), usdc('0'), users[0].address, this.fiveSecondsSince)
      const afterBalance = await this.USDC.balanceOf(users[0].address)

      const withdrawnAmount = afterBalance.sub(beforeBalance)

      // console.log(`Withdrawn amount is : ${withdrawnAmount}`)
      // console.log(enoughCash)

      expect(enoughCash).to.be.false
      expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)
      expect(withdrawnAmount).to.be.equal(usdc('50'))
      expect(await this.assetUSDC.balanceOf(users[0].address)).to.be.equal(usdc('0'))
      expect(await this.assetUSDC.cash()).to.be.equal(usdc('0'))
      expect(await this.assetUSDC.liability()).to.be.equal(usdc('0'))
      expect(await this.assetUSDC.underlyingTokenBalance()).to.be.equal(usdc('0'))
      expect(await this.assetUSDC.totalSupply()).to.be.equal(usdc('0'))
      expect(receipt)
        .to.emit(this.pool, 'Withdraw')
        .withArgs(users[0].address, this.USDC.address, usdc('50'), usdc('100'), users[0].address)
    })
  })
})
