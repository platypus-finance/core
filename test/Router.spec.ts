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
} from './helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { setupAggregateAccount } from './helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('Router01', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let Asset: ContractFactory
  let Router: ContractFactory

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    // Get contracts for Pool, Asset
    Asset = await ethers.getContractFactory('Asset')
    Router = await ethers.getContractFactory('PlatypusRouter01')
  })

  beforeEach(async function () {
    // Deploy and initialize pool 1, pool 2 and pool 3
    this.pool1 = (await setupPool(owner)).pool
    this.pool2 = (await setupPool(owner)).pool
    this.pool3 = (await setupPool(owner)).pool

    // setup times
    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp
    this.fiveSecondsAgo = this.lastBlockTime - 5 * 1000
    this.fiveSecondsSince = this.lastBlockTime + 5 * 1000

    // setup aggregates
    this.aggregate1 = await setupAggregateAccount(owner, 'Aggregate 1', true)
    this.aggregate2 = await setupAggregateAccount(owner, 'Aggregate 2', true)
    this.aggregate3 = await setupAggregateAccount(owner, 'Aggregate 3', true)

    await this.aggregate1.deployTransaction.wait()
    await this.aggregate2.deployTransaction.wait()
    await this.aggregate3.deployTransaction.wait()

    // Pool 1
    const tokenSetDAI = await createAndInitializeToken('DAI', 18, owner, this.pool1, this.aggregate1)
    this.DAI = tokenSetDAI.token
    this.assetDAI = tokenSetDAI.asset

    const tokenSetMIM = await createAndInitializeToken('MIM', 18, owner, this.pool1, this.aggregate1)
    this.MIM = tokenSetMIM.token
    this.assetMIM = tokenSetMIM.asset

    const tokenSetUSDC = await createAndInitializeToken('USDC', 6, owner, this.pool1, this.aggregate1)
    this.USDC = tokenSetUSDC.token
    this.assetUSDC1 = tokenSetUSDC.asset

    const tokenSetUSDT = await createAndInitializeToken('USDT', 6, owner, this.pool1, this.aggregate1)
    this.USDT = tokenSetUSDT.token
    this.assetUSDT = tokenSetUSDT.asset

    await fundUserAndApprovePool(this.DAI, users[0], parseEther('100000').toString(), this.pool1, owner)
    await fundUserAndApprovePool(this.MIM, users[0], parseEther('100000').toString(), this.pool1, owner)
    await fundUserAndApprovePool(this.USDC, users[0], parseUnits('100000', 6).toString(), this.pool1, owner)
    await fundUserAndApprovePool(this.USDT, users[0], parseUnits('100000', 6).toString(), this.pool1, owner)

    // Pool 2
    // USDC here is special, we must use the same underlying token but a different asset for each pool
    this.assetUSDC2 = await Asset.connect(owner).deploy()
    this.assetUSDC2.initialize(this.USDC.address, 'test', 'test', this.aggregate2.address)
    await this.assetUSDC2.deployTransaction.wait()
    await this.assetUSDC2.connect(owner).setPool(this.pool2.address)
    await this.pool2.connect(owner).addAsset(this.USDC.address, this.assetUSDC2.address)

    const tokenSetTSD = await createAndInitializeToken('TSD', 18, owner, this.pool2, this.aggregate2)
    this.TSD = tokenSetTSD.token
    this.assetTSD = tokenSetTSD.asset

    const tokenSetFRAX = await createAndInitializeToken('FRAX', 18, owner, this.pool2, this.aggregate2)
    this.FRAX = tokenSetFRAX.token
    this.assetFRAX = tokenSetFRAX.asset

    const tokenSetAVAI = await createAndInitializeToken('AVAI', 18, owner, this.pool2, this.aggregate2)
    this.AVAI = tokenSetAVAI.token
    this.assetAVAI1 = tokenSetAVAI.asset

    await fundUserAndApprovePool(this.TSD, users[0], parseEther('100000').toString(), this.pool2, owner)
    await fundUserAndApprovePool(this.FRAX, users[0], parseEther('100000').toString(), this.pool2, owner)
    await fundUserAndApprovePool(this.AVAI, users[0], parseEther('100000').toString(), this.pool2, owner)
    await fundUserAndApprovePool(this.USDC, users[0], parseEther('100000').toString(), this.pool2, owner)

    // pool 3
    const tokenSetxUSD = await createAndInitializeToken('xUSD', 18, owner, this.pool3, this.aggregate3)
    this.xUSD = tokenSetxUSD.token
    this.assetxUSD = tokenSetxUSD.asset

    await fundUserAndApprovePool(this.xUSD, users[0], parseEther('100000').toString(), this.pool3, owner)

    // AVAI here is special, we must use the same underlying token but a different asset for each pool
    // let's say we have AVAI as routing asset
    this.assetAVAI2 = await Asset.connect(owner).deploy()
    this.assetAVAI2.initialize(this.AVAI.address, 'test', 'test', this.aggregate3.address)
    await this.assetAVAI2.deployTransaction.wait()
    await this.assetAVAI2.connect(owner).setPool(this.pool3.address)
    await this.pool3.connect(owner).addAsset(this.AVAI.address, this.assetAVAI2.address)

    // setup price oracles
    await setPriceOracle(this.pool1, owner, this.lastBlockTime, [
      { address: this.MIM.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.DAI.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.USDC.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.USDT.address, initialRate: parseUnits('1', 8).toString() },
    ])

    await setPriceOracle(this.pool2, owner, this.lastBlockTime, [
      { address: this.USDC.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.TSD.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.FRAX.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.AVAI.address, initialRate: parseUnits('1', 8).toString() },
    ])

    await setPriceOracle(this.pool3, owner, this.lastBlockTime, [
      { address: this.xUSD.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.AVAI.address, initialRate: parseUnits('1', 8).toString() },
    ])

    // pool1
    // deposit 10 k dai
    await this.pool1
      .connect(users[0])
      .deposit(this.DAI.address, parseEther('10000'), users[0].address, this.fiveSecondsSince)

    // deposit 10 k usdc
    await this.pool1
      .connect(users[0])
      .deposit(this.USDC.address, usdc('10000'), users[0].address, this.fiveSecondsSince)

    // pool2
    // deposit 10 k avai
    await this.pool2
      .connect(users[0])
      .deposit(this.AVAI.address, parseEther('10000'), users[0].address, this.fiveSecondsSince)

    // deposit 10 k dai
    await this.pool2
      .connect(users[0])
      .deposit(this.TSD.address, parseEther('10000'), users[0].address, this.fiveSecondsSince)

    // deposit 10 k usdc
    await this.pool2
      .connect(users[0])
      .deposit(this.USDC.address, usdc('10000'), users[0].address, this.fiveSecondsSince)

    // pool 3
    // deposit 10 k xUSD
    await this.pool3
      .connect(users[0])
      .deposit(this.xUSD.address, parseEther('10000'), users[0].address, this.fiveSecondsSince)

    // deposit 10k avai
    // approve first
    await this.AVAI.connect(users[0]).approve(this.pool3.address, ethers.constants.MaxUint256)
    await this.AVAI.transfer(users[0].address, parseEther('100000'))
    await this.pool3
      .connect(users[0])
      .deposit(this.AVAI.address, parseEther('10000'), users[0].address, this.fiveSecondsSince)

    // Finally, deploy router
    this.router = await Router.deploy()
    await this.router.deployTransaction.wait()

    // IMPORTANT FOR THE ROUTER TO WORK EFFICIENTLY
    // approve pool spending tokens from router
    await this.router
      .connect(owner)
      .approveSpendingByPool(
        [this.DAI.address, this.MIM.address, this.USDC.address, this.USDT.address],
        this.pool1.address
      )
    await this.router
      .connect(owner)
      .approveSpendingByPool(
        [this.USDC.address, this.TSD.address, this.FRAX.address, this.AVAI.address],
        this.pool2.address
      )
    await this.router.connect(owner).approveSpendingByPool([this.AVAI.address, this.xUSD.address], this.pool3.address)
  })

  describe('Router Swap', function () {
    it('Should swap using only 1 pool (DAI -> USDC)', async function () {
      const beforeFromBalance = await this.DAI.balanceOf(users[0].address)
      const beforeToBalance = await this.USDC.balanceOf(users[0].address)
      // approve
      await this.DAI.connect(users[0]).approve(this.router.address, ethers.constants.MaxUint256)
      // await this.USDC.connect(users[0]).approve(this.router.address, ethers.constants.MaxUint256);

      const [quotedAmount] = await this.router
        .connect(users[0])
        .quotePotentialSwaps([this.DAI.address, this.USDC.address], [this.pool1.address], parseEther('100'))
      // swap via router
      const receipt = await this.router.connect(users[0]).swapTokensForTokens(
        [this.DAI.address, this.USDC.address],
        [this.pool1.address],
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
      expect(tokenGot).to.be.equal(usdc('99.958879'))

      //check if token got is equal to token quoted
      expect(tokenGot).to.be.equal(quotedAmount)

      await expectAssetValues(this.assetDAI, 18, { cash: '10100', liability: '10000' })
      await expectAssetValues(this.assetUSDC1, 6, { cash: '9900.041121', liability: '10000' })

      expect(receipt)
        .to.emit(this.pool1, 'Swap')
        .withArgs(
          this.router.address,
          this.DAI.address,
          this.USDC.address,
          parseEther('100'),
          usdc('99.958879'),
          users[0].address
        )

      expect(tokenSent.add(await this.assetDAI.cash())).to.be.equal(parseEther('10000'))
      expect(tokenGot.add(await this.assetUSDC1.cash())).to.be.equal(usdc('10000'))
    })

    it('Should swap using 2 pools (DAI -> USDC -> TSD)', async function () {
      const beforeFromBalance = await this.DAI.balanceOf(users[0].address)
      const beforeToBalance = await this.TSD.balanceOf(users[0].address)
      await this.DAI.connect(users[0]).approve(this.router.address, ethers.constants.MaxUint256)

      expect(await this.assetDAI.cash()).to.be.equal(parseEther('10000'))
      expect(await this.assetUSDC2.cash()).to.be.equal(usdc('10000'))
      expect(await this.assetUSDC1.cash()).to.be.equal(usdc('10000'))
      expect(await this.assetTSD.cash()).to.be.equal(parseEther('10000'))

      const [quoteAmount] = await this.router
        .connect(users[0])
        .quotePotentialSwaps(
          [this.DAI.address, this.USDC.address, this.TSD.address],
          [this.pool1.address, this.pool2.address],
          parseEther('100')
        )

      // swap via router
      const receipt = await this.router.connect(users[0]).swapTokensForTokens(
        [this.DAI.address, this.USDC.address, this.TSD.address],
        [this.pool1.address, this.pool2.address],
        parseEther('100'),
        parseEther('90'), //expect at least 90% of ideal quoted amount
        users[0].address,
        this.fiveSecondsSince
      )

      const afterFromBalance = await this.DAI.balanceOf(users[0].address)
      const afterToBalance = await this.TSD.balanceOf(users[0].address)
      const tokenSent = afterFromBalance.sub(beforeFromBalance)
      const tokenGot = afterToBalance.sub(beforeToBalance)

      expect(tokenSent).to.be.equal(parseEther('-100'))
      expect(tokenGot).to.be.equal(parseEther('99.917775978300246768'))

      //check if token got is equal to token quoted
      expect(tokenGot).to.be.equal(quoteAmount)

      await expectAssetValues(this.assetDAI, 18, { cash: '10100', liability: '10000' })
      await expectAssetValues(this.assetUSDC1, 6, { cash: '9900.041121', liability: '10000' })
      await expectAssetValues(this.assetUSDC2, 6, { cash: '10099.958879', liability: '10000' })
      await expectAssetValues(this.assetTSD, 18, { cash: '9900.082224021699753232', liability: '10000' })

      expect(receipt)
        .to.emit(this.pool1, 'Swap')
        .withArgs(
          this.router.address,
          this.DAI.address,
          this.USDC.address,
          parseEther('100'),
          usdc('99.958879'),
          this.router.address
        )

      expect(receipt)
        .to.emit(this.pool2, 'Swap')
        .withArgs(
          this.router.address,
          this.USDC.address,
          this.TSD.address,
          usdc('99.958879'),
          parseEther('99.917775978300246768'),
          users[0].address
        )

      expect(tokenSent.add(await this.assetDAI.cash())).to.be.equal(parseEther('10000'))
      expect(tokenGot.add(await this.assetTSD.cash())).to.be.equal(parseEther('10000'))
    })

    it('Should swap using 3 pools (DAI -> USDC -> AVAI -> xUSD)', async function () {
      const beforeFromBalance = await this.DAI.balanceOf(users[0].address)
      const beforeToBalance = await this.xUSD.balanceOf(users[0].address)

      await this.DAI.connect(users[0]).approve(this.router.address, ethers.constants.MaxUint256)

      expect(await this.assetDAI.cash()).to.be.equal(parseEther('10000'))
      expect(await this.assetUSDC2.cash()).to.be.equal(usdc('10000'))
      expect(await this.assetUSDC1.cash()).to.be.equal(usdc('10000'))
      expect(await this.assetAVAI1.cash()).to.be.equal(parseEther('10000'))
      expect(await this.assetAVAI2.cash()).to.be.equal(parseEther('10000'))
      expect(await this.assetTSD.cash()).to.be.equal(parseEther('10000'))

      const [quoteAmount] = await this.router
        .connect(users[0])
        .quotePotentialSwaps(
          [this.DAI.address, this.USDC.address, this.AVAI.address, this.xUSD.address],
          [this.pool1.address, this.pool2.address, this.pool3.address],
          parseEther('100')
        )

      // swap via router
      const receipt = await this.router.connect(users[0]).swapTokensForTokens(
        [this.DAI.address, this.USDC.address, this.AVAI.address, this.xUSD.address],
        [this.pool1.address, this.pool2.address, this.pool3.address],
        parseEther('100'),
        parseEther('90'), //expect at least 90% of ideal quoted amount
        users[0].address,
        this.fiveSecondsSince
      )

      const afterFromBalance = await this.DAI.balanceOf(users[0].address)
      const afterToBalance = await this.xUSD.balanceOf(users[0].address)
      const tokenSent = afterFromBalance.sub(beforeFromBalance)
      const tokenGot = afterToBalance.sub(beforeToBalance)

      expect(tokenSent).to.be.equal(parseEther('-100'))
      expect(tokenGot).to.be.equal(parseEther('99.876690318959845749'))

      //check if token got is equal to token quoted
      expect(tokenGot).to.be.equal(quoteAmount)

      await expectAssetValues(this.assetDAI, 18, { cash: '10100', liability: '10000' })
      await expectAssetValues(this.assetUSDC1, 6, { cash: '9900.041121', liability: '10000' })
      await expectAssetValues(this.assetUSDC2, 6, { cash: '10099.958879', liability: '10000' })

      await expectAssetValues(this.assetAVAI1, 18, { cash: '9900.082224021699753232', liability: '10000' })
      await expectAssetValues(this.assetAVAI2, 18, { cash: '10099.917775978300246768', liability: '10000' })
      await expectAssetValues(this.assetxUSD, 18, { cash: '9900.123309681040154251', liability: '10000' })

      expect(receipt)
        .to.emit(this.pool1, 'Swap')
        .withArgs(
          this.router.address,
          this.DAI.address,
          this.USDC.address,
          parseEther('100'),
          usdc('99.958879'),
          this.router.address
        )

      expect(receipt)
        .to.emit(this.pool2, 'Swap')
        .withArgs(
          this.router.address,
          this.USDC.address,
          this.AVAI.address,
          usdc('99.958879'),
          parseEther('99.917775978300246768'),
          this.router.address
        )

      expect(receipt)
        .to.emit(this.pool3, 'Swap')
        .withArgs(
          this.router.address,
          this.AVAI.address,
          this.xUSD.address,
          parseEther('99.917775978300246768'),
          parseEther('99.876690318959845749'),
          users[0].address
        )

      expect(tokenSent.add(await this.assetDAI.cash())).to.be.equal(parseEther('10000'))
      expect(tokenGot.add(await this.assetxUSD.cash())).to.be.equal(parseEther('10000'))
    })
  })
})
