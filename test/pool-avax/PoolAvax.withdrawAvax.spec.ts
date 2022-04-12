import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { usdc } from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ContractFactory } from '@ethersproject/contracts'
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

    // Get contracts for TestERC20, Pool, Asset
    TestERC20 = await ethers.getContractFactory('TestERC20')
    TestWAVAX = await ethers.getContractFactory('TestWAVAX')
    Pool = await ethers.getContractFactory('PoolAvax')
    Asset = await ethers.getContractFactory('Asset')
    WETHForwarder = await ethers.getContractFactory('WETHForwarder')
  })

  beforeEach(async function () {
    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp
    this.fiveSecondsSince = this.lastBlockTime + 5 * 1000
    this.fiveSecondsAgo = this.lastBlockTime - 5 * 1000

    this.WETH = await TestWAVAX.connect(owner).deploy()

    this.pool = await Pool.connect(owner).deploy()

    await this.pool.deployTransaction.wait()
    await this.pool.connect(owner).initialize(this.WETH.address)

    this.forwarder = await WETHForwarder.connect(owner).deploy(this.WETH.address)
    await this.forwarder.deployTransaction.wait()

    await this.forwarder.connect(owner).setPool(this.pool.address)
    await this.pool.connect(owner).setWETHForwarder(this.forwarder.address)

    this.DAI = await TestERC20.connect(owner).deploy('Dai Stablecoin', 'DAI', 18, parseEther('10000000'))
    await this.DAI.deployTransaction.wait()

    this.USDC = await TestERC20.deploy('USD Coin', 'USDC', 6, usdc('10000000'))
    await this.USDC.deployTransaction.wait()
  })

  describe('Asset WETH', function () {
    beforeEach(async function () {
      const aggregateName = 'Liquid staking AVAX Aggregate'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      this.asset = await Asset.connect(owner).deploy()
      await this.asset.connect(owner).initialize(this.WETH.address, 'AVAX Asset', 'LP-AVAX', aggregateAccount.address)

      await this.asset.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.WETH.address, this.asset.address)

      await this.pool.connect(users[0]).depositETH(users[0].address, this.fiveSecondsSince, { value: parseEther('1') })
    })

    describe('withdrawETH', function () {
      it('works', async function () {
        const beforeBalance = await ethers.provider.getBalance(users[1].address)
        // withdraw to users[1] so can test the exact ETH received (users[0] needs to pay gas)
        const receipt = await this.pool
          .connect(users[0])
          .withdrawETH(parseEther('0.25'), parseEther('0.25'), users[1].address, this.fiveSecondsSince)
        const afterBalance = await ethers.provider.getBalance(users[1].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('0.25'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('0.75'))
        expect(await this.asset.cash()).to.be.equal(parseEther('0.75'))
        expect(await this.asset.liability()).to.be.equal(parseEther('0.75'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('0.75'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0.75'))

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.WETH.address, parseEther('0.25'), parseEther('0.25'), users[1].address)
      })

      it('works with fee (cov > 0.4)', async function () {
        // Adjust coverage ratio to 0.6
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(parseEther('0.4'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('0.4'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.6)

        const beforeBalance = await ethers.provider.getBalance(users[1].address)
        // withdraw to users[1] so can test the exact ETH received (users[0] needs to pay gas)
        const receipt = await this.pool
          .connect(users[0])
          .withdrawETH(parseEther('0.1'), parseEther('0'), users[1].address, this.fiveSecondsSince)
        const afterBalance = await ethers.provider.getBalance(users[1].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('0.099610452959318153'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('0.9'))
        expect(await this.asset.cash()).to.be.equal(parseEther('0.500389547040681847'))
        expect(await this.asset.liability()).to.be.equal(parseEther('0.9'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('0.500389547040681847'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0.9'))

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(
            users[0].address,
            this.WETH.address,
            parseEther('0.099610452959318153'),
            parseEther('0.1'),
            users[1].address
          )
      })

      it('works with fee (cov > 0.4)', async function () {
        // Adjust coverage ratio to 0.3
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(parseEther('0.7'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('0.7'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.3)

        const beforeBalance = await ethers.provider.getBalance(users[1].address)
        // withdraw to users[1] so can test the exact ETH received (users[0] needs to pay gas)
        const receipt = await this.pool
          .connect(users[0])
          .withdrawETH(parseEther('0.1'), parseEther('0'), users[1].address, this.fiveSecondsSince)
        const afterBalance = await ethers.provider.getBalance(users[1].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('0.037690761059999831'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('0.9'))
        expect(await this.asset.cash()).to.be.equal(parseEther('0.262309238940000169'))
        expect(await this.asset.liability()).to.be.equal(parseEther('0.9'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('0.262309238940000169'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0.9'))

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(
            users[0].address,
            this.WETH.address,
            parseEther('0.037690761059999831'),
            parseEther('0.1'),
            users[1].address
          )
      })

      it('works without fee (cov >= 1)', async function () {
        // Adjust coverage ratio to 1.2
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).addCash(parseEther('0.2'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('0.2'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(1.2)

        const beforeBalance = await ethers.provider.getBalance(users[1].address)
        // withdraw to users[1] so can test the exact ETH received (users[0] needs to pay gas)
        const receipt = await this.pool
          .connect(users[0])
          .withdrawETH(parseEther('0.1'), parseEther('0'), users[1].address, this.fiveSecondsSince)
        const afterBalance = await ethers.provider.getBalance(users[1].address)

        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('0.1'))
        expect(await this.asset.balanceOf(users[0].address)).to.be.equal(parseEther('0.9'))
        expect(await this.asset.cash()).to.be.equal(parseEther('1.1'))
        expect(await this.asset.liability()).to.be.equal(parseEther('0.9'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('0.7'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0.9'))

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.WETH.address, parseEther('0.1'), parseEther('0.1'), users[1].address)
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .withdrawETH(parseEther('0.25'), parseEther('0.25'), users[1].address, this.fiveSecondsAgo),
          'Platypus: EXPIRED'
        ).to.be.reverted
      })

      it('reverts if liquidity provider does not have enough liquidity token', async function () {
        await this.asset.connect(users[1]).approve(this.pool.address, ethers.constants.MaxUint256)
        await expect(
          this.pool
            .connect(users[1])
            .withdrawETH(parseEther('0.25'), parseEther('0.25'), users[1].address, this.fiveSecondsSince),
          'ERC20: transfer amount exceeds balance'
        ).to.be.reverted
      })

      it('reverts if no liability to burn', async function () {
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeLiability(parseEther('1'))
        await this.asset.connect(owner).setPool(this.pool.address)

        await expect(
          this.pool
            .connect(users[0])
            .withdrawETH(parseEther('0.1'), parseEther('0'), users[1].address, this.fiveSecondsSince)
        ).to.be.revertedWith('INSUFFICIENT_LIQ_BURN')
      })

      it('reverts if amount to receive is less than expected', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .withdrawETH(parseEther('0.25'), parseEther('1'), users[1].address, this.fiveSecondsSince),
          'Platypus: AMOUNT_TOO_LOW'
        ).to.be.reverted
      })

      it('reverts if pool paused', async function () {
        await this.pool.connect(owner).pause()
        await expect(
          this.pool
            .connect(users[0])
            .withdrawETH(parseEther('0.25'), parseEther('0.25'), users[1].address, this.fiveSecondsSince),
          'Pausable: paused'
        ).to.be.reverted
      })

      it('only burn liability if fee is >= liabilityToBurn', async function () {
        // Adjust coverage ratio to 0.3
        await this.asset.connect(owner).setPool(owner.address)
        await this.asset.connect(owner).removeCash(parseEther('0.7'))
        await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('0.7'))
        await this.asset.connect(owner).setPool(this.pool.address)
        expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.3)
        console.log(`Cash : ${await this.asset.cash()}, Liabilities ${await this.asset.liability()}`)

        const beforeBalance = await ethers.provider.getBalance(users[1].address)
        await this.pool.quotePotentialWithdraw(this.WETH.address, parseEther('0.3'))

        await this.pool
          .connect(users[0])
          .withdrawETH(parseEther('0.1'), parseEther('0'), users[1].address, this.fiveSecondsSince)
        const afterBalance = await ethers.provider.getBalance(users[1].address)

        // expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        // expect 0
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('0.037690761059999831'))

        expect(await this.asset.balanceOf(users[1].address)).to.be.equal(parseEther('0'))
        expect(await this.asset.cash()).to.be.equal(parseEther('0.262309238940000169'))
        expect(await this.asset.liability()).to.be.equal(parseEther('0.9'))
        expect(await this.asset.underlyingTokenBalance()).to.be.equal(parseEther('0.262309238940000169'))
        expect(await this.asset.totalSupply()).to.be.equal(parseEther('0.9'))

        // shd burn all liability and return amount 0
        // expect(receipt)
        //   .to.emit(this.pool, 'Withdraw')
        //   .withArgs(users[0].address, this.WETH.address, parseEther('0'), parseEther('10'), users[0].address)
      })
      describe('quotePotentialWithdraw', () => {
        it('works with fee 1/2', async function () {
          // Adjust coverage ratio to around 0.5
          await this.asset.connect(owner).setPool(owner.address)
          await this.asset.connect(owner).removeCash(parseEther('0.5'))
          await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('0.5'))
          await this.asset.connect(owner).setPool(this.pool.address)
          expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.5)

          const [actualAmount, fee] = await this.pool.quotePotentialWithdraw(this.WETH.address, parseEther('0.01'))

          expect(actualAmount).to.be.equal(parseEther('0.009838734523557973'))
          expect(fee).to.be.equal(parseEther('0.000161265476442027'))
        })

        it('works with fee 2/2', async function () {
          // Adjust coverage ratio to around 0.44
          await this.asset.connect(owner).setPool(owner.address)
          await this.asset.connect(owner).removeCash(parseEther('0.5'))
          await this.asset.connect(owner).transferUnderlyingToken(owner.address, parseEther('0.5'))
          await this.asset.connect(owner).addLiability(parseEther('0.1269686'))
          await this.asset.connect(owner).setPool(this.pool.address)
          expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(0.44366808445239736)

          const [actualAmount, fee] = await this.pool.quotePotentialWithdraw(this.WETH.address, parseEther('0.01'))
          const beforeBalance0 = await ethers.provider.getBalance(users[0].address)
          const beforeBalance1 = await ethers.provider.getBalance(users[1].address)
          await this.pool
            .connect(users[0])
            .withdrawETH(parseEther('0.1'), parseEther('0'), users[1].address, this.fiveSecondsSince)
          const afterBalance0 = await ethers.provider.getBalance(users[0].address)
          const afterBalance1 = await ethers.provider.getBalance(users[1].address)

          // gas fee paid by users[0]
          expect(afterBalance0.sub(beforeBalance0)).to.be.equal(parseEther('-0.000143245001145960'))
          // amount withdrew
          expect(afterBalance1.sub(beforeBalance1)).to.be.equal(parseEther('0.102219608469615482'))
          expect(actualAmount).to.be.equal(parseEther('0.010720619351733528'))
          expect(fee).to.be.equal(parseEther('0.000549066648266472'))
        })

        it('works with 0 fee (cov >= 1)', async function () {
          expect((await this.asset.cash()) / (await this.asset.liability())).to.equal(1)
          const [actualAmount, fee] = await this.pool.quotePotentialWithdraw(this.WETH.address, parseEther('0.01'))
          expect(actualAmount).to.be.equal(parseEther('0.01'))
          expect(fee).to.be.equal(parseEther('0'))
        })
      })
    })
  })
})
