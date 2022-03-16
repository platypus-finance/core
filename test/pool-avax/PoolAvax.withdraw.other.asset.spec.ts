import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { createAndInitializeToken, fundUserAndApprovePool, setPriceOracle, usdc } from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ContractFactory } from '@ethersproject/contracts'
import { setupAggregateAccount } from '../helpers/helper'
import { parseUnits } from 'ethers/lib/utils'
import { BigNumber } from '@ethersproject/bignumber'

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
    await this.WETH.deployTransaction.wait()

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

    this.WETHe = await TestERC20.deploy('Wrapped Ethereum ab bridge', 'WETH.e', 18, parseEther('10000000'))
    await this.WETHe.deployTransaction.wait()
  })

  describe('ETH asset => WAVAX', function () {
    beforeEach(async function () {
      const aggregateName = 'Liquid staking AVAX Aggregate'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      // get some WETH for owner
      await this.WETH.deposit({ value: parseEther('25') })

      this.assetAVAX = await Asset.connect(owner).deploy()
      await this.assetAVAX
        .connect(owner)
        .initialize(this.WETH.address, 'AVAX Asset', 'LP-AVAX', aggregateAccount.address)
      await this.assetAVAX.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.WETH.address, this.assetAVAX.address)

      const tokenSetSAvax = await createAndInitializeToken('sAVAX', 18, owner, this.pool, aggregateAccount)

      this.sAVAX = tokenSetSAvax.token
      this.assetSAVAX = tokenSetSAvax.asset

      await fundUserAndApprovePool(this.sAVAX, users[0], parseEther('100000').toString(), this.pool, owner)

      // 1000 AVAX and 1000 sAVAX
      await this.pool
        .connect(users[0])
        .depositETH(users[0].address, this.fiveSecondsSince, { value: parseEther('100') })
      await this.pool
        .connect(users[0])
        .deposit(this.sAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
    })

    it('works to withdraw from other asset of same aggregate AVAX / sAVAX', async function () {
      // Here we are using our AVAX LP to withdraw sAVAX!
      // add 70 cash to sAVAX
      await this.assetSAVAX.connect(owner).setPool(owner.address)
      await this.assetSAVAX.connect(owner).addCash(parseEther('70'))
      await this.sAVAX.connect(owner).transfer(this.assetSAVAX.address, parseEther('70'))
      await this.assetSAVAX.connect(owner).setPool(this.pool.address)

      const maxWithdrawableAmount = await this.pool.quoteMaxInitialAssetWithdrawable(
        this.WETH.address,
        this.sAVAX.address
      )
      expect(maxWithdrawableAmount).to.be.equal(parseEther('70'))

      const beforeBalance = await this.sAVAX.balanceOf(users[0].address)

      // quote withdrawal using USDC Asset to withdraw DAI
      const [quotedWithdrawal] = await this.pool.quotePotentialWithdrawFromOtherAsset(
        this.WETH.address,
        this.sAVAX.address,
        parseEther('70')
      )

      await this.assetAVAX.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

      // check before call
      const receipt = await this.pool
        .connect(users[0])
        .withdrawFromOtherAsset(
          this.WETH.address,
          this.sAVAX.address,
          parseEther('70'),
          parseEther('0'),
          users[0].address,
          this.fiveSecondsSince
        )

      const afterBalance = await this.sAVAX.balanceOf(users[0].address)

      // check that quoted withdrawal is the same as amount withdrawn
      expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

      expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('70'))
      expect(await this.assetAVAX.balanceOf(users[0].address)).to.be.equal(parseEther('30'))
      expect(await this.assetAVAX.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetAVAX.liability()).to.be.equal(parseEther('30'))
      expect(await this.assetAVAX.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetAVAX.totalSupply()).to.be.equal(parseEther('30'))

      expect(await this.assetSAVAX.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetSAVAX.liability()).to.be.equal(parseEther('100'))
      expect(await this.assetSAVAX.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetSAVAX.totalSupply()).to.be.equal(parseEther('100'))

      expect(receipt)
        .to.emit(this.pool, 'Withdraw')
        .withArgs(users[0].address, this.sAVAX.address, parseEther('70'), parseEther('70'), users[0].address)
    })

    it('works to withdraw from other asset of same aggregate sAVAX / AVAX', async function () {
      // Here we are using our sAVAX LP to withdraw AVAX!
      // add 25 cash to AVAX
      await this.assetAVAX.connect(owner).setPool(owner.address)
      await this.assetAVAX.connect(owner).addCash(parseEther('25'))
      await this.WETH.connect(owner).transfer(this.assetAVAX.address, parseEther('25'))
      await this.assetAVAX.connect(owner).setPool(this.pool.address)

      const maxWithdrawableAmount = await this.pool.quoteMaxInitialAssetWithdrawable(
        this.sAVAX.address,
        this.WETH.address
      )
      expect(maxWithdrawableAmount).to.be.equal(parseEther('25'))

      const beforeBalance = await ethers.provider.getBalance(users[1].address)

      // quote withdrawal using USDC Asset to withdraw DAI
      const [quotedWithdrawal] = await this.pool.quotePotentialWithdrawFromOtherAsset(
        this.sAVAX.address,
        this.WETH.address,
        parseEther('25')
      )

      await this.assetSAVAX.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

      // withdraw to users[1] so can test the exact ETH received (users[0] needs to pay gas)
      const receipt = await this.pool
        .connect(users[0])
        .withdrawFromOtherAsset(
          this.sAVAX.address,
          this.WETH.address,
          parseEther('25'),
          parseEther('0'),
          users[1].address,
          this.fiveSecondsSince
        )

      const afterBalance = await ethers.provider.getBalance(users[1].address)

      // check that quoted withdrawal is the same as amount withdrawn
      expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

      expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('25'))
      expect(await this.assetSAVAX.balanceOf(users[0].address)).to.be.equal(parseEther('75'))
      expect(await this.assetSAVAX.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetSAVAX.liability()).to.be.equal(parseEther('75'))
      expect(await this.assetSAVAX.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetSAVAX.totalSupply()).to.be.equal(parseEther('75'))

      expect(await this.assetAVAX.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetAVAX.liability()).to.be.equal(parseEther('100'))
      expect(await this.assetAVAX.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetAVAX.totalSupply()).to.be.equal(parseEther('100'))

      expect(receipt)
        .to.emit(this.pool, 'Withdraw')
        .withArgs(users[0].address, this.sAVAX.address, parseEther('70'), parseEther('70'), users[1].address)
    })
  })

  describe('MultiAsset tests USDC (6 d.p),  DAI (18 d.p) and WETH.e (18 d.p)', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const usdAggregateAccount = await setupAggregateAccount(owner, 'USD Aggregate', true)
      await usdAggregateAccount.deployTransaction.wait()

      // USDC
      this.assetUSDC = await Asset.connect(owner).deploy()
      await this.assetUSDC.initialize(this.USDC.address, 'test', 'test', usdAggregateAccount.address)

      // Wait for transaction to be mined
      await this.assetUSDC.deployTransaction.wait()

      await this.assetUSDC.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.USDC.address, this.assetUSDC.address)

      await this.USDC.connect(owner).transfer(users[0].address, usdc('100000'))
      await this.USDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.pool.connect(users[0]).deposit(this.USDC.address, usdc('100'), users[0].address, this.fiveSecondsSince)
      await this.assetUSDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

      // DAI
      this.assetDAI = await Asset.connect(owner).deploy()
      await this.assetDAI.initialize(this.DAI.address, 'test', 'test', usdAggregateAccount.address)

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

      // WETH.e
      const ethAggregateAccount = await setupAggregateAccount(owner, 'ETH Aggregate', false)
      await ethAggregateAccount.deployTransaction.wait()

      this.assetWETHe = await Asset.connect(owner).deploy()
      await this.assetWETHe.initialize(this.WETHe.address, 'test', 'test', ethAggregateAccount.address)

      // Wait for transaction to be mined
      await this.assetWETHe.deployTransaction.wait()

      await this.assetWETHe.connect(owner).setPool(this.pool.address)
      await this.pool.connect(owner).addAsset(this.WETHe.address, this.assetWETHe.address)

      await this.WETHe.connect(owner).transfer(users[0].address, parseEther('1000'))
      await this.WETHe.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.pool
        .connect(users[0])
        .deposit(this.WETHe.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
      await this.assetWETHe.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
    })

    it('works to withdraw from other asset of same aggregate USDC / DAI', async function () {
      // Here we are using our USDC LP to withdraw DAI!
      // add 70 cash to DAI
      await this.assetDAI.connect(owner).setPool(owner.address)
      await this.assetDAI.connect(owner).addCash(parseEther('70'))
      await this.DAI.connect(owner).transfer(this.assetDAI.address, parseEther('70'))
      await this.assetDAI.connect(owner).setPool(this.pool.address)

      const maxWithdrawableAmount = await this.pool.quoteMaxInitialAssetWithdrawable(
        this.USDC.address,
        this.DAI.address
      )
      expect(maxWithdrawableAmount).to.be.equal(parseUnits('70', 6))

      const beforeBalance = await this.DAI.balanceOf(users[0].address)

      // quote withdrawal using USDC Asset to withdraw DAI
      const [quotedWithdrawal] = await this.pool.quotePotentialWithdrawFromOtherAsset(
        this.USDC.address,
        this.DAI.address,
        parseEther('70')
      )

      const receipt = await this.pool
        .connect(users[0])
        .withdrawFromOtherAsset(
          this.USDC.address,
          this.DAI.address,
          parseEther('70'),
          parseEther('0'),
          users[0].address,
          this.fiveSecondsSince
        )

      const afterBalance = await this.DAI.balanceOf(users[0].address)

      // check that quoted withdrawal is the same as amount withdrawn
      expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

      expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('70'))
      expect(await this.assetUSDC.balanceOf(users[0].address)).to.be.equal(parseUnits('30', 6))
      expect(await this.assetUSDC.cash()).to.be.equal(parseUnits('100', 6))
      expect(await this.assetUSDC.liability()).to.be.equal(parseUnits('30', 6))
      expect(await this.assetUSDC.underlyingTokenBalance()).to.be.equal(parseUnits('100', 6))
      expect(await this.assetUSDC.totalSupply()).to.be.equal(parseUnits('30', 6))

      expect(await this.assetDAI.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetDAI.liability()).to.be.equal(parseEther('100'))
      expect(await this.assetDAI.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetDAI.totalSupply()).to.be.equal(parseEther('100'))

      expect(receipt)
        .to.emit(this.pool, 'Withdraw')
        .withArgs(users[0].address, this.DAI.address, parseEther('70'), usdc('70'), users[0].address)
    })

    it('works to withdraw from other asset of same aggregate DAI / USDC', async function () {
      // Here we are using our DAI LP to withdraw USDC!
      const beforeBalance = await this.USDC.balanceOf(users[0].address)

      // add 50 cash to USDC
      await this.assetUSDC.connect(owner).setPool(owner.address)
      await this.assetUSDC.connect(owner).addCash(parseUnits('50', 6))
      await this.USDC.connect(owner).transfer(this.assetUSDC.address, parseUnits('50', 6))
      await this.assetUSDC.connect(owner).setPool(this.pool.address)

      const maxWithdrawableAmount = await this.pool.quoteMaxInitialAssetWithdrawable(
        this.DAI.address,
        this.USDC.address
      )

      expect(maxWithdrawableAmount).to.be.equal(parseUnits('50', 18))

      // quote withdrawal using DAI Asset to withdraw USDC
      const [quotedWithdrawal] = await this.pool.quotePotentialWithdrawFromOtherAsset(
        this.DAI.address,
        this.USDC.address,
        usdc('25')
      )

      const receipt = await this.pool
        .connect(users[0])
        .withdrawFromOtherAsset(
          this.DAI.address,
          this.USDC.address,
          usdc('25'),
          usdc('0'),
          users[0].address,
          this.fiveSecondsSince
        )

      const afterBalance = await this.USDC.balanceOf(users[0].address)

      // check that quoted withdrawal is the same as amount withdrawn
      expect(afterBalance.sub(beforeBalance)).to.be.equal(quotedWithdrawal)

      expect(afterBalance.sub(beforeBalance)).to.be.equal(usdc('25'))
      expect(await this.assetDAI.balanceOf(users[0].address)).to.be.equal(parseEther('75'))
      expect(await this.assetDAI.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetDAI.liability()).to.be.equal(parseEther('75'))
      expect(await this.assetDAI.underlyingTokenBalance()).to.be.equal(parseEther('100'))
      expect(await this.assetDAI.totalSupply()).to.be.equal(parseEther('75'))

      expect(await this.assetUSDC.balanceOf(users[0].address)).to.be.equal(parseUnits('100', 6))
      expect(await this.assetUSDC.cash()).to.be.equal(parseUnits('125', 6))
      expect(await this.assetUSDC.liability()).to.be.equal(parseUnits('100', 6))
      expect(await this.assetUSDC.underlyingTokenBalance()).to.be.equal(parseUnits('125', 6))
      expect(await this.assetUSDC.totalSupply()).to.be.equal(parseUnits('100', 6))

      expect(receipt)
        .to.emit(this.pool, 'Withdraw')
        .withArgs(users[0].address, this.USDC.address, usdc('25'), parseEther('25'), users[0].address)
    })

    it('POO-01S: Improper Unit Conversion. Dust attack: USDC / DAI', async function () {
      // Here we are using our USDC LP to withdraw DAI!
      // add 70 cash to DAI
      await this.assetDAI.connect(owner).setPool(owner.address)
      await this.assetDAI.connect(owner).addCash(parseEther('70'))
      await this.DAI.connect(owner).transfer(this.assetDAI.address, parseEther('70'))
      await this.assetDAI.connect(owner).setPool(this.pool.address)

      // set low amount to try to dust attack.
      const dust = BigNumber.from('100000000000')

      await expect(
        this.pool
          .connect(users[0])
          .withdrawFromOtherAsset(
            this.USDC.address,
            this.DAI.address,
            dust,
            parseEther('0'),
            users[0].address,
            this.fiveSecondsSince
          )
      ).to.be.revertedWith('DUST?')
    })

    it('reverts if assets are not in the same aggregate', async function () {
      await expect(
        this.pool
          .connect(users[0])
          .withdrawFromOtherAsset(
            this.WETHe.address,
            this.DAI.address,
            parseEther('25'),
            parseEther('25'),
            users[0].address,
            this.fiveSecondsSince
          )
      ).to.be.revertedWith('DIFF_AGG_ACC')
    })

    it('reverts if not enough cash', async function () {
      // Adjust coverage ratio to 0.5 of USDC
      await this.assetUSDC.connect(owner).setPool(owner.address)
      await this.assetUSDC.connect(owner).removeCash(usdc('50'))
      await this.assetUSDC.connect(owner).transferUnderlyingToken(owner.address, usdc('50'))
      await this.assetUSDC.connect(owner).setPool(this.pool.address)
      expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(0.5)

      const maxWithdrawableAmount = await this.pool.quoteMaxInitialAssetWithdrawable(
        this.DAI.address,
        this.USDC.address
      )

      expect(maxWithdrawableAmount).to.be.equal('0')

      await expect(
        this.pool
          .connect(users[0])
          .withdrawFromOtherAsset(
            this.DAI.address,
            this.USDC.address,
            usdc('100'),
            usdc('100'),
            users[0].address,
            this.fiveSecondsSince
          )
      ).to.be.revertedWith('NOT_ENOUGH_CASH')
    })

    it('reverts if coverage ratio is < 1 after withdrawal', async function () {
      // Adjust coverage ratio to 0.90 of USDC
      await this.assetUSDC.connect(owner).setPool(owner.address)
      await this.assetUSDC.connect(owner).removeCash(usdc('10'))
      await this.assetUSDC.connect(owner).transferUnderlyingToken(owner.address, usdc('10'))
      await this.assetUSDC.connect(owner).setPool(this.pool.address)
      expect((await this.assetUSDC.cash()) / (await this.assetUSDC.liability())).to.equal(0.9)

      const maxWithdrawableAmount = await this.pool.quoteMaxInitialAssetWithdrawable(
        this.DAI.address,
        this.USDC.address
      )

      expect(maxWithdrawableAmount).to.be.equal('0')

      // quote withdrawal using USDC Asset to withdraw DAI
      await expect(
        this.pool.quotePotentialWithdrawFromOtherAsset(this.DAI.address, this.USDC.address, usdc('50'))
      ).to.be.revertedWith('COV_RATIO_LOW')

      await expect(
        this.pool
          .connect(users[0])
          .withdrawFromOtherAsset(
            this.DAI.address,
            this.USDC.address,
            usdc('50'),
            usdc('0'),
            users[0].address,
            this.fiveSecondsSince
          )
      ).to.be.revertedWith('COV_RATIO_LOW')
    })
  })
})
