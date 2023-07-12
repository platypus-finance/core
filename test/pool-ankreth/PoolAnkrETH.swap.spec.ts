import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants, ContractFactory } from 'ethers'
import {
  createAndInitializeToken,
  fundUserAndApprovePool,
  expectAssetValues,
  setupAggregateAccount,
  setupAnkrETHPool,
  setupAnkrETHPriceFeed,
} from '../helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('AnkrETH Swap', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let TestERC20: ContractFactory
  let Asset: ContractFactory

  before(async () => {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    TestERC20 = await ethers.getContractFactory('TestERC20')
    Asset = await ethers.getContractFactory('Asset')
  })

  beforeEach(async function () {
    this.lastBlock = await ethers.provider.getBlock('latest')
    this.lastBlockTime = this.lastBlock.timestamp
    this.fiveSecondsSince = this.lastBlockTime + 5 * 1000
    this.fiveSecondsAgo = this.lastBlockTime - 5 * 1000

    // avax pool
    const poolSetup = await setupAnkrETHPool(owner)
    this.pool = poolSetup.pool

    const testOracle = await setupAnkrETHPriceFeed(this.pool)
    await testOracle.setRate(parseEther('0.9'))
  })

  describe('Asset WETH.e', function () {
    beforeEach(async function () {
      const aggregateName = 'Liquid staking ETH Aggregate'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      const tokenSetAnkrETH = await createAndInitializeToken('aAvaxc', 18, owner, this.pool, aggregateAccount)
      const tokenSetWETHe = await createAndInitializeToken('WETH.e', 18, owner, this.pool, aggregateAccount)

      this.WETHe = tokenSetWETHe.token
      this.assetWETHe = tokenSetWETHe.asset

      this.ankrETH = tokenSetAnkrETH.token
      this.assetAnkrETH = tokenSetAnkrETH.asset

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

    describe('swap', function () {
      it('works (WETHe -> ankrETH)', async function () {
        const beforeFromBalance = await this.WETHe.balanceOf(users[0].address)
        const beforeToBalance = await this.ankrETH.balanceOf(users[1].address)
        const receipt = await this.pool
          .connect(users[0])
          .swap(this.WETHe.address, this.ankrETH.address, parseEther('1'), 0, users[1].address, this.fiveSecondsSince)

        const afterFromBalance = await this.WETHe.balanceOf(users[0].address)
        const afterToBalance = await this.ankrETH.balanceOf(users[1].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance)
        const tokenGot = afterToBalance.sub(beforeToBalance)

        expect(tokenSent).to.be.equal(parseEther('-1'))
        expect(tokenGot).to.be.equal(parseEther('0.899630450039859691'))

        await expectAssetValues(this.assetWETHe, 18, { cash: '101', liability: '100' })
        await expectAssetValues(this.assetAnkrETH, 18, { cash: '99.100369549960140309', liability: '100' })

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.WETHe.address,
            this.ankrETH.address,
            parseEther('1'),
            parseEther('0.899630450039859691'),
            users[1].address
          )

        expect(tokenSent.add(await this.assetWETHe.cash())).to.be.equal(parseEther('100'))
        expect(tokenGot.add(await this.assetAnkrETH.cash())).to.be.equal(parseEther('100'))
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swap(this.ankrETH.address, this.WETHe.address, parseEther('0'), users[0].address, this.fiveSecondsAgo, {
              value: parseEther('1'),
            }),
          'Platypus: EXPIRED'
        ).to.be.reverted
      })

      it('reverts if amount to receive is less than expected', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swap(
              this.ankrETH.address,
              this.WETHe.address,
              parseEther('10000'),
              users[0].address,
              this.fiveSecondsSince,
              {
                value: parseEther('1'),
              }
            ),
          'Platypus: AMOUNT_TOO_LOW'
        ).to.be.reverted
      })

      it('reverts if pool paused', async function () {
        await this.pool.connect(owner).pause()
        await expect(
          this.pool
            .connect(users[0])
            .swap(this.ankrETH.address, this.WETHe.address, parseEther('0'), users[0].address, this.fiveSecondsSince, {
              value: parseEther('1'),
            }),
          'Pausable: paused'
        ).to.be.reverted
      })

      it('reverts if zero address provided', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swap(constants.AddressZero, this.WETHe.address, parseEther('0'), users[0].address, this.fiveSecondsSince, {
              value: parseEther('1'),
            }),
          'Platypus: ZERO_ADDRESS'
        ).to.be.reverted
      })

      it('reverts if asset not exist', async function () {
        const btc = await TestERC20.connect(owner).deploy('Bitcoin', 'BTC', 8, '0')
        await expect(
          this.pool
            .connect(users[0])
            .swap(btc.address, this.WETHe.address, parseEther('0'), users[0].address, this.fiveSecondsSince, {
              value: parseEther('1'),
            }),
          'Platypus: ASSET_NOT_EXIST'
        ).to.be.reverted
      })

      it('works (ankrETH -> WETHe)', async function () {
        const beforeFromBalance = await this.ankrETH.balanceOf(users[0].address)
        const beforeToBalance = await this.WETHe.balanceOf(users[1].address)
        const receipt = await this.pool
          .connect(users[0])
          .swap(this.ankrETH.address, this.WETHe.address, parseEther('1'), 0, users[1].address, this.fiveSecondsSince)

        const afterFromBalance = await this.ankrETH.balanceOf(users[0].address)
        const afterToBalance = await this.WETHe.balanceOf(users[1].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance)
        const tokenGot = afterToBalance.sub(beforeToBalance)

        expect(tokenSent).to.be.equal(parseEther('-1'))
        expect(tokenGot).to.be.equal(parseEther('1.110653481226965872'))

        await expectAssetValues(this.assetAnkrETH, 18, { cash: '101', liability: '100' })
        await expectAssetValues(this.assetWETHe, 18, { cash: '98.889346518773034128', liability: '100' })

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.ankrETH.address,
            this.WETHe.address,
            parseEther('1'),
            parseEther('1.110653481226965872'),
            users[1].address
          )

        expect(tokenSent.add(await this.assetAnkrETH.cash())).to.be.equal(parseEther('100'))
        expect(tokenGot.add(await this.assetWETHe.cash())).to.be.equal(parseEther('100'))
      })
    })
  })
})
