import { ethers } from 'hardhat'
import { parseEther, parseUnits } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ContractFactory } from 'ethers'
import {
  createAndInitializeToken,
  expectAssetValues,
  fundUserAndApprovePool,
  setPriceOracle,
  setupPool,
  usdc,
} from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { setupAggregateAccount } from '../helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('AVAX Pool', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let TestERC20: ContractFactory
  let TestWAVAX: ContractFactory

  let Asset: ContractFactory
  let Router: ContractFactory
  let AVAXPool: ContractFactory
  let MainPool: ContractFactory
  let WETHForwarder: ContractFactory

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    // Get contracts for Pool, Asset
    Asset = await ethers.getContractFactory('Asset')
    Router = await ethers.getContractFactory('PlatypusRouter01')
    TestERC20 = await ethers.getContractFactory('TestERC20')
    TestWAVAX = await ethers.getContractFactory('TestWAVAX')
    AVAXPool = await ethers.getContractFactory('PoolAvax')
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

    this.pool = await AVAXPool.connect(owner).deploy()

    await this.pool.deployTransaction.wait()
    await this.pool.connect(owner).initialize(this.WETH.address)

    this.forwarder = await WETHForwarder.connect(owner).deploy(this.WETH.address)
    await this.forwarder.deployTransaction.wait()

    await this.forwarder.connect(owner).setPool(this.pool.address)
    await this.pool.connect(owner).setWETHForwarder(this.forwarder.address)
    const aggregateName = 'Liquid staking AVAX Aggregate'
    const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
    await aggregateAccount.deployTransaction.wait()

    // get some WETH for owner
    await this.WETH.deposit({ value: parseEther('1000') })

    this.assetAVAX = await Asset.connect(owner).deploy()
    await this.assetAVAX.connect(owner).initialize(this.WETH.address, 'AVAX Asset', 'LP-AVAX', aggregateAccount.address)
    await this.assetAVAX.connect(owner).setPool(this.pool.address)
    await this.pool.connect(owner).addAsset(this.WETH.address, this.assetAVAX.address)

    const tokenSetSAvax = await createAndInitializeToken('sAVAX', 18, owner, this.pool, aggregateAccount)

    this.sAVAX = tokenSetSAvax.token
    this.assetSAVAX = tokenSetSAvax.asset

    await fundUserAndApprovePool(this.sAVAX, users[0], parseEther('100000').toString(), this.pool, owner)

    const tokenSetqiAvax = await createAndInitializeToken('qiAVAX', 18, owner, this.pool, aggregateAccount)

    this.qiAVAX = tokenSetqiAvax.token
    this.assetqiAVAX = tokenSetqiAvax.asset

    await fundUserAndApprovePool(this.qiAVAX, users[0], parseEther('100000').toString(), this.pool, owner)

    // 100 AVAX, 100 sAVAX, 100 qiAVAX
    await this.pool.connect(users[0]).depositETH(users[0].address, this.fiveSecondsSince, { value: parseEther('100') })
    await this.pool
      .connect(users[0])
      .deposit(this.sAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince)
    await this.pool
      .connect(users[0])
      .deposit(this.qiAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince)

    // Finally, deploy router
    this.router = await Router.deploy()
    await this.router.deployTransaction.wait()

    // IMPORTANT FOR THE ROUTER TO WORK EFFICIENTLY
    // approve pool spending tokens from router
    await this.router
      .connect(owner)
      .approveSpendingByPool([this.sAVAX.address, this.WETH.address, this.qiAVAX.address], this.pool.address)
  })

  describe('Router Swap', function () {
    beforeEach(async function () {
      this.pool2 = await AVAXPool.connect(owner).deploy()

      await this.pool2.deployTransaction.wait()
      await this.pool2.connect(owner).initialize(this.WETH.address)

      this.forwarder = await WETHForwarder.connect(owner).deploy(this.WETH.address)
      await this.forwarder.deployTransaction.wait()

      await this.forwarder.connect(owner).setPool(this.pool2.address)
      await this.pool2.connect(owner).setWETHForwarder(this.forwarder.address)
      const aggregateName = 'Liquid staking AVAX Aggregate 2'
      const aggregateAccount2 = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount2.deployTransaction.wait()

      // get some WETH for owner
      await this.WETH.deposit({ value: parseEther('1000') })

      this.assetAVAX2 = await Asset.connect(owner).deploy()
      await this.assetAVAX2
        .connect(owner)
        .initialize(this.WETH.address, 'AVAX Asset 2', 'LP-AVAX 2', aggregateAccount2.address)
      await this.assetAVAX2.connect(owner).setPool(this.pool2.address)
      await this.pool2.connect(owner).addAsset(this.WETH.address, this.assetAVAX2.address)

      const tokenSetrAvax = await createAndInitializeToken('rAVAX', 18, owner, this.pool2, aggregateAccount2)

      this.rAVAX = tokenSetrAvax.token
      this.assetRAVAX = tokenSetrAvax.asset

      await fundUserAndApprovePool(this.rAVAX, users[0], parseEther('100000').toString(), this.pool2, owner)

      // 100 AVAX, 100 sAVAX, 100 qiAVAX
      await this.pool2
        .connect(users[0])
        .depositETH(users[0].address, this.fiveSecondsSince, { value: parseEther('100') })
      await this.pool2
        .connect(users[0])
        .deposit(this.rAVAX.address, parseEther('100'), users[0].address, this.fiveSecondsSince)

      // IMPORTANT FOR THE ROUTER TO WORK EFFICIENTLY
      // approve pool spending tokens from router
      await this.router
        .connect(owner)
        .approveSpendingByPool([this.rAVAX.address, this.WETH.address], this.pool2.address)
    })
    it('Should swap using only 1 pool (sAVAX -> qiAVAX)', async function () {
      const beforeFromBalance = await this.sAVAX.balanceOf(users[0].address)
      const beforeToBalance = await this.qiAVAX.balanceOf(users[0].address)
      // approve
      await this.sAVAX.connect(users[0]).approve(this.router.address, ethers.constants.MaxUint256)
      // await this.USDC.connect(users[0]).approve(this.router.address, ethers.constants.MaxUint256);

      const [quotedAmount] = await this.router
        .connect(users[0])
        .quotePotentialSwaps([this.sAVAX.address, this.qiAVAX.address], [this.pool.address], parseEther('1'))
      // swap via router
      const receipt = await this.router.connect(users[0]).swapTokensForTokens(
        [this.sAVAX.address, this.qiAVAX.address],
        [this.pool.address],
        parseEther('1'),
        parseEther('0.9'), //expect at least 90% of ideal quoted amount
        users[0].address,
        this.fiveSecondsSince
      )

      const afterFromBalance = await this.sAVAX.balanceOf(users[0].address)
      const afterToBalance = await this.qiAVAX.balanceOf(users[0].address)
      const tokenSent = afterFromBalance.sub(beforeFromBalance)
      const tokenGot = afterToBalance.sub(beforeToBalance)
      expect(tokenSent).to.be.equal(parseEther('-1'))
      expect(tokenGot).to.be.equal(parseEther('0.999588796079664279'))

      //check if token got is equal to token quoted
      expect(tokenGot).to.be.equal(quotedAmount)

      await expectAssetValues(this.assetSAVAX, 18, { cash: '101', liability: '100' })
      await expectAssetValues(this.assetqiAVAX, 18, { cash: '99.000411203920335721', liability: '100' })

      expect(receipt)
        .to.emit(this.pool, 'Swap')
        .withArgs(
          this.router.address,
          this.sAVAX.address,
          this.qiAVAX.address,
          parseEther('1'),
          parseEther('0.999588796079664279'),
          users[0].address
        )

      expect(tokenSent.add(await this.assetSAVAX.cash())).to.be.equal(parseEther('100'))
      expect(tokenGot.add(await this.assetqiAVAX.cash())).to.be.equal(parseEther('100'))
    })

    it('Should swap using 2 pool (sAVAX -> WETH -> rAVAX', async function () {
      const beforeFromBalance = await this.sAVAX.balanceOf(users[0].address)
      const beforeToBalance = await this.rAVAX.balanceOf(users[0].address)

      await this.sAVAX.connect(users[0]).approve(this.router.address, ethers.constants.MaxUint256)

      expect(await this.assetSAVAX.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetAVAX2.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetAVAX.cash()).to.be.equal(parseEther('100'))
      expect(await this.assetRAVAX.cash()).to.be.equal(parseEther('100'))

      const [quoteAmount] = await this.router
        .connect(users[0])
        .quotePotentialSwaps(
          [this.sAVAX.address, this.WETH.address, this.rAVAX.address],
          [this.pool.address, this.pool2.address],
          parseEther('1')
        )

      // swap via router
      const receipt = await this.router.connect(users[0]).swapTokensForTokens(
        [this.sAVAX.address, this.WETH.address, this.rAVAX.address],
        [this.pool.address, this.pool2.address],
        parseEther('1'),
        parseEther('0.9'), //expect at least 90% of ideal quoted amount
        users[0].address,
        this.fiveSecondsSince
      )

      const afterFromBalance = await this.sAVAX.balanceOf(users[0].address)
      const afterToBalance = await this.rAVAX.balanceOf(users[0].address)
      const tokenSent = afterFromBalance.sub(beforeFromBalance)
      const tokenGot = afterToBalance.sub(beforeToBalance)

      expect(tokenSent).to.be.equal(parseEther('-1'))
      expect(tokenGot).to.be.equal(parseEther('0.999177765860098537'))

      expect(tokenGot).to.be.equal(quoteAmount)

      await expectAssetValues(this.assetSAVAX, 18, { cash: '101', liability: '100' })
      await expectAssetValues(this.assetAVAX, 18, { cash: '99.000411203920335721', liability: '100' })
      await expectAssetValues(this.assetAVAX2, 18, { cash: '100.999588796079664279', liability: '100' })
      await expectAssetValues(this.assetRAVAX, 18, { cash: '99.000822234139901463', liability: '100' })

      expect(receipt)
        .to.emit(this.pool, 'Swap')
        .withArgs(
          this.router.address,
          this.sAVAX.address,
          this.WETH.address,
          parseEther('1'),
          parseEther('0.999588796079664279'),
          this.router.address
        )

      expect(receipt)
        .to.emit(this.pool2, 'Swap')
        .withArgs(
          this.router.address,
          this.WETH.address,
          this.rAVAX.address,
          parseEther('0.999588796079664279'),
          parseEther('0.999177765860098537'),
          users[0].address
        )

      expect(tokenSent.add(await this.assetSAVAX.cash())).to.be.equal(parseEther('100'))
      expect(tokenGot.add(await this.assetRAVAX.cash())).to.be.equal(parseEther('100'))
    })
    describe('Router interact with main pool', function () {
      beforeEach(async function () {
        this.mainPool = (await setupPool(owner)).pool
        this.aggregateUSD = await setupAggregateAccount(owner, 'Aggregate USD', true)

        await this.aggregateUSD.deployTransaction.wait()
        const tokenSetDAI = await createAndInitializeToken('DAI', 18, owner, this.mainPool, this.aggregateUSD)
        this.DAI = tokenSetDAI.token
        this.assetDAI = tokenSetDAI.asset

        const tokenSetMIM = await createAndInitializeToken('MIM', 18, owner, this.mainPool, this.aggregateUSD)
        this.MIM = tokenSetMIM.token
        this.assetMIM = tokenSetMIM.asset

        const tokenSetUSDC = await createAndInitializeToken('USDC', 6, owner, this.mainPool, this.aggregateUSD)
        this.USDC = tokenSetUSDC.token
        this.assetUSDC = tokenSetUSDC.asset

        const tokenSetUSDT = await createAndInitializeToken('USDT', 6, owner, this.mainPool, this.aggregateUSD)
        this.USDT = tokenSetUSDT.token
        this.assetUSDT = tokenSetUSDT.asset

        await fundUserAndApprovePool(this.DAI, users[0], parseEther('100000').toString(), this.mainPool, owner)
        await fundUserAndApprovePool(this.MIM, users[0], parseEther('100000').toString(), this.mainPool, owner)
        await fundUserAndApprovePool(this.USDC, users[0], parseUnits('100000', 6).toString(), this.mainPool, owner)
        await fundUserAndApprovePool(this.USDT, users[0], parseUnits('100000', 6).toString(), this.mainPool, owner)

        await setPriceOracle(this.mainPool, owner, this.lastBlockTime, [
          { address: this.MIM.address, initialRate: parseUnits('1', 8).toString() },
          { address: this.DAI.address, initialRate: parseUnits('1', 8).toString() },
          { address: this.USDC.address, initialRate: parseUnits('1', 8).toString() },
          { address: this.USDT.address, initialRate: parseUnits('1', 8).toString() },
        ])
        await this.USDT.connect(owner).transfer(users[0].address, parseEther('100000'))
        await this.USDT.connect(users[0]).approve(this.mainPool.address, ethers.constants.MaxUint256)
        await this.assetUSDT.connect(users[0]).approve(this.mainPool.address, ethers.constants.MaxUint256)
        await this.mainPool
          .connect(users[0])
          .deposit(this.USDT.address, parseEther('100'), users[0].address, this.fiveSecondsSince)

        await this.router
          .connect(owner)
          .approveSpendingByPool(
            [this.DAI.address, this.MIM.address, this.USDC.address, this.USDT.address],
            this.mainPool.address
          )
      })
      it('Should revert with non AVAX pool', async function () {
        await this.USDT.connect(users[0]).approve(this.router.address, ethers.constants.MaxUint256)
        await expect(
          this.router.connect(users[0]).swapTokensForTokens(
            [this.USDT.address, this.qiAVAX.address, this.sAVAX.address],
            [this.mainPool.address, this.pool.address],
            parseEther('1'),
            parseEther('0.9'), //expect at least 90% of ideal quoted amount
            users[0].address,
            this.fiveSecondsSince
          )
        ).to.be.revertedWith('ASSET_NOT_EXIST')
      })
    })
  })
})
