import { ethers } from 'hardhat'
import { parseEther, parseUnits } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  setupPool,
  createAndInitializeToken,
  fundUserAndApprovePool,
  setPriceOracle,
  usdc,
  setupAggregateAccount,
} from './helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('Pool', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]

  before(async () => {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest
  })

  beforeEach(async function () {
    const TestWAVAX = await ethers.getContractFactory('TestWAVAX')

    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp
    this.fiveSecondsSince = this.lastBlockTime + 5 * 1000
    this.fiveSecondsAgo = this.lastBlockTime - 5 * 1000

    // setup pool
    const poolSetup = await setupPool(owner)
    this.pool = poolSetup.pool
    this.WETH = await TestWAVAX.deploy()
  })

  describe('Asset DAI (18 decimals) and USDC (6 decimals)', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const aggregateAccount = await setupAggregateAccount(owner, 'USD-Stablecoins', true)
      await aggregateAccount.deployTransaction.wait()

      // Create and initialize token
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

      // Fund `user[0]` with 100 k
      await fundUserAndApprovePool(this.DAI, users[0], parseEther('100000').toString(), this.pool, owner)
      await fundUserAndApprovePool(this.USDC, users[0], usdc('100000').toString(), this.pool, owner)

      // Deposit 10 k of each into pool
      await this.pool
        .connect(users[0])
        .deposit(this.DAI.address, parseEther('10000'), users[0].address, this.fiveSecondsSince)

      await this.pool
        .connect(users[0])
        .deposit(this.USDC.address, usdc('10000'), users[0].address, this.fiveSecondsSince)
    })

    describe('Works with equilibrium coverage ratio', function () {
      it('applies impairment gain', async function () {
        // deposit when after deposit r* < 1

        // Adjust coverage ratio of USDC to 0.25
        await this.assetUSDC.connect(owner).setPool(owner.address)
        await this.assetUSDC.connect(owner).removeCash(parseUnits('7500', 6))
        await this.assetUSDC.connect(owner).transferUnderlyingToken(owner.address, parseUnits('7500', 6))
        await this.assetUSDC.connect(owner).setPool(this.pool.address)
        expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(0.25) // cov = 0.25

        // now deposit from user[1] and see if we get impairment gain
        await fundUserAndApprovePool(this.DAI, users[1], parseEther('1000').toString(), this.pool, owner)

        const beforeBalance = await this.DAI.balanceOf(users[1].address)

        const receipt = await this.pool
          .connect(users[1])
          .deposit(this.DAI.address, parseEther('1000'), users[1].address, this.fiveSecondsSince)

        const afterBalance = await this.DAI.balanceOf(users[1].address)

        expect(await this.assetDAI.balanceOf(users[1].address)).to.be.equal(parseEther('1600'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('-1000'))

        await expect(receipt)
          .to.emit(this.pool, 'Deposit')
          .withArgs(users[1].address, this.DAI.address, parseEther('1000'), parseEther('1600'), users[1].address)
      })

      it('applies impairment loss', async function () {
        // withdraw when before withdraw r* < 1

        // Adjust coverage ratio of USDC to 0.25
        await this.assetUSDC.connect(owner).setPool(owner.address)
        await this.assetUSDC.connect(owner).removeCash(parseUnits('7500', 6))
        await this.assetUSDC.connect(owner).transferUnderlyingToken(owner.address, parseUnits('7500', 6))
        await this.assetUSDC.connect(owner).setPool(this.pool.address)
        expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(0.25) // cov = 0.25

        // Now that eqCov is < 1, withdraw some DAI
        await this.assetDAI.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

        const beforeBalance = await this.DAI.balanceOf(users[0].address)
        const beforeBalanceAssetDAI = await this.assetDAI.balanceOf(users[0].address)

        // quote withdrawal
        const [quotedWithdrawal] = await this.pool.quotePotentialWithdraw(this.DAI.address, parseEther('1000'))

        // withdraw 1000 DAI
        const receipt = await this.pool
          .connect(users[0])
          .withdraw(this.DAI.address, parseEther('1000'), parseEther('0'), users[0].address, this.fiveSecondsSince)

        const afterBalance = await this.DAI.balanceOf(users[0].address)
        const afterBalanceAssetDAI = await this.assetDAI.balanceOf(users[0].address)

        expect(afterBalanceAssetDAI.sub(beforeBalanceAssetDAI)).to.be.equal(parseEther('-1000'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('625'))
        expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

        expect(receipt)
          .to.emit(this.pool, 'Withdraw')
          .withArgs(users[0].address, this.DAI.address, parseEther('625'), parseEther('1000'), users[0].address)
      })
    })
  })
})
