import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { createAndInitializeToken, fundUserAndApprovePool, setupAnkrETHPriceFeed } from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ContractFactory } from '@ethersproject/contracts'
import { setupAggregateAccount } from '../helpers/helper'
import { BigNumber } from '@ethersproject/bignumber'
import { log } from 'console'

const { expect } = chai
chai.use(solidity)

describe('AvaxPool Withdraw Other Asset', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let Pool: ContractFactory
  let Asset: ContractFactory
  let TestERC20: ContractFactory

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    // Get contracts for Pool, Asset
    Pool = await ethers.getContractFactory('PoolAnkrETH')
    Asset = await ethers.getContractFactory('Asset')
    TestERC20 = await ethers.getContractFactory('TestERC20')
  })

  beforeEach(async function () {
    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp
    this.fiveSecondsSince = this.lastBlockTime + 5 * 1000
    this.fiveSecondsAgo = this.lastBlockTime - 5 * 1000

    this.pool = await Pool.connect(owner).deploy()

    await this.pool.deployTransaction.wait()
    await this.pool.connect(owner).initialize()

    this.ankrETHOracle = await setupAnkrETHPriceFeed(this.pool)
    await this.ankrETHOracle.setRate(BigNumber.from('987861801997814300'))
  })

  describe('ETH asset WETH.e and ankrETH', function () {
    beforeEach(async function () {
      const aggregateName = 'Liquid staking ETH Aggregate'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, false)
      await aggregateAccount.deployTransaction.wait()

      const tokenSetAnkrETH = await createAndInitializeToken('ankrETH', 18, owner, this.pool, aggregateAccount)
      const tokenSetWETHe = await createAndInitializeToken('WETH.e', 18, owner, this.pool, aggregateAccount)

      this.ankrETH = tokenSetAnkrETH.token
      this.assetAnkrETH = tokenSetAnkrETH.asset

      this.WETHe = tokenSetWETHe.token
      this.assetWETHe = tokenSetWETHe.asset

      await this.pool.setAnkrETH(this.ankrETH.address)
      await this.pool.setWETHe(this.WETHe.address)

      await fundUserAndApprovePool(this.ankrETH, users[0], parseEther('100000').toString(), this.pool, owner)
      await fundUserAndApprovePool(this.WETHe, users[0], parseEther('100000').toString(), this.pool, owner)

      // 1000 WETH.e and 1000 ankrETH
      await this.pool
        .connect(users[0])
        .deposit(this.WETHe.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
      await this.pool
        .connect(users[0])
        .deposit(this.ankrETH.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
    })

    // WETH.e to ankrETH
    // should need to send more WETH.e than you receive ankrETH
    it('works to withdraw from other asset of same aggregate WETH.e to ankrETH', async function () {
      // Here we are using our WETH.e LP to withdraw ankrETH!
      // add 70 cash to ankrETH
      await this.assetAnkrETH.connect(owner).setPool(owner.address)
      await this.assetAnkrETH.connect(owner).addCash(parseEther('70'))
      await this.ankrETH.connect(owner).transfer(this.assetAnkrETH.address, parseEther('70'))
      await this.assetAnkrETH.connect(owner).setPool(this.pool.address)

      const maxWithdrawableAmount = await this.pool.quoteMaxInitialAssetWithdrawable(
        this.WETHe.address,
        this.ankrETH.address
      )
      expect(maxWithdrawableAmount).to.be.equal(parseEther('70.860114095346789150'))

      const beforeBalance = await this.ankrETH.balanceOf(users[0].address)

      // quote withdrawal using USDC Asset to withdraw DAI
      const [quotedWithdrawal] = await this.pool.quotePotentialWithdrawFromOtherAsset(
        this.WETHe.address,
        this.ankrETH.address,
        parseEther('70')
      )

      await this.assetWETHe.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

      // check before call
      const receipt = await this.pool
        .connect(users[0])
        .withdrawFromOtherAsset(
          this.WETHe.address,
          this.ankrETH.address,
          parseEther('70'),
          parseEther('0'),
          users[0].address,
          this.fiveSecondsSince
        )

      const afterBalance = await this.ankrETH.balanceOf(users[0].address)

      // check that quoted withdrawal is the same as amount withdrawn
      expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

      expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('70'))
      expect(await this.assetWETHe.balanceOf(users[0].address)).to.be.equal(parseEther('29.139885904653210850'))
      expect(await this.assetWETHe.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetWETHe.liability()).to.be.equal(parseEther('29.139885904653210850'))
      expect(await this.assetWETHe.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetWETHe.totalSupply()).to.be.equal(parseEther('29.139885904653210850'))

      expect(await this.assetAnkrETH.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetAnkrETH.liability()).to.be.equal(parseEther('100'))
      expect(await this.assetAnkrETH.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetAnkrETH.totalSupply()).to.be.equal(parseEther('100'))

      expect(receipt)
        .to.emit(this.pool, 'Withdraw')
        .withArgs(
          users[0].address,
          this.ankrETH.address,
          parseEther('70'),
          parseEther('70.860114095346789150'),
          users[0].address
        )
    })

    /// use ankrETH to withdraw WETH.e. We should send less than expected with current rates
    it('works to withdraw from other asset of same aggregate ankrETH to AVAX', async function () {
      // Here we are using our ankrETH LP to withdraw WETH.e!
      // add 25 cash to WETH.e
      await this.assetWETHe.connect(owner).setPool(owner.address)
      await this.assetWETHe.connect(owner).addCash(parseEther('25'))
      await this.WETHe.connect(owner).transfer(this.assetWETHe.address, parseEther('25'))
      await this.assetWETHe.connect(owner).setPool(this.pool.address)

      const maxWithdrawableAmount = await this.pool.quoteMaxInitialAssetWithdrawable(
        this.ankrETH.address,
        this.WETHe.address
      )
      expect(maxWithdrawableAmount).to.be.equal(parseEther('24.696545049945357502'))

      const beforeBalance = await this.WETHe.balanceOf(users[1].address)

      // quote withdrawal using USDC Asset to withdraw DAI
      const [quotedWithdrawal] = await this.pool.quotePotentialWithdrawFromOtherAsset(
        this.ankrETH.address,
        this.WETHe.address,
        parseEther('25')
      )

      await this.assetAnkrETH.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

      // withdraw to users[1] so can test the exact ETH received (users[0] needs to pay gas)
      const receipt = await this.pool
        .connect(users[0])
        .withdrawFromOtherAsset(
          this.ankrETH.address,
          this.WETHe.address,
          parseEther('25'),
          parseEther('0'),
          users[1].address,
          this.fiveSecondsSince
        )

      const afterBalance = await this.WETHe.balanceOf(users[1].address)

      // check that quoted withdrawal is the same as amount withdrawn
      expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

      expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('25'))
      expect(await this.assetAnkrETH.balanceOf(users[0].address)).to.be.equal(parseEther('75.303454950054642498'))
      expect(await this.assetAnkrETH.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetAnkrETH.liability()).to.be.equal(parseEther('75.303454950054642498'))
      expect(await this.assetAnkrETH.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetAnkrETH.totalSupply()).to.be.equal(parseEther('75.303454950054642498'))

      expect(await this.assetWETHe.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetWETHe.liability()).to.be.equal(parseEther('100'))
      expect(await this.assetWETHe.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetWETHe.totalSupply()).to.be.equal(parseEther('100'))

      expect(receipt)
        .to.emit(this.pool, 'Withdraw')
        .withArgs(
          users[0].address,
          this.WETHe.address,
          parseEther('25'),
          parseEther('24.696545049945357502'),
          users[1].address
        )
    })
  })
})
