import { ethers } from 'hardhat'
import { parseEther, parseUnits } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants, ContractFactory } from 'ethers'
import {
  setupPool,
  createAndInitializeToken,
  fundUserAndApprovePool,
  setPriceOracle,
  expectAssetValues,
  usdc,
  setupAggregateAccount,
  setupAvaxPool,
} from '../helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('AvaxPool', function () {
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
    const poolSetup = await setupAvaxPool(owner)
    this.pool = poolSetup.pool
    this.WETH = poolSetup.WETH
  })

  describe('Asset WAVAX (weth)', function () {
    beforeEach(async function () {
      const aggregateName = 'Liquid staking AVAX Aggregate'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

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

    describe('swapFromETH', function () {
      it('works (AVAX -> sAVAX)', async function () {
        const beforeFromBalance = await ethers.provider.getBalance(users[0].address)
        const beforeToBalance = await this.sAVAX.balanceOf(users[1].address)
        const receipt = await this.pool
          .connect(users[0])
          .swapFromETH(this.sAVAX.address, parseEther('0'), users[1].address, this.fiveSecondsSince, {
            value: parseEther('1'),
            gasPrice: 69666333,
          })

        // get gas used by transaction
        const gasUsed = await (await ethers.provider.getTransactionReceipt(receipt.hash)).gasUsed

        const gas = BigNumber.from(gasUsed).mul(BigNumber.from('69666333'))
        const afterFromBalance = await ethers.provider.getBalance(users[0].address)
        const afterToBalance = await this.sAVAX.balanceOf(users[1].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance).add(gas)
        const tokenGot = afterToBalance.sub(beforeToBalance)
        expect(tokenSent).to.be.equal(parseEther('-1'))
        expect(tokenGot).to.be.equal(parseEther('0.999588796079664279'))

        await expectAssetValues(this.assetAVAX, 18, { cash: '101', liability: '100' })
        await expectAssetValues(this.assetSAVAX, 18, { cash: '99.000411203920335721', liability: '100' })

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.WETH.address,
            this.sAVAX.address,
            parseEther('1'),
            parseEther('0.999588796079664279'),
            users[1].address
          )

        expect(tokenSent.add(await this.assetAVAX.cash())).to.be.equal(parseEther('100'))
        expect(tokenGot.add(await this.assetSAVAX.cash())).to.be.equal(parseEther('100'))
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swapFromETH(this.sAVAX.address, parseEther('0'), users[0].address, this.fiveSecondsAgo, {
              value: parseEther('1'),
            }),
          'Platypus: EXPIRED'
        ).to.be.reverted
      })

      it('reverts if amount to receive is less than expected', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swapFromETH(this.sAVAX.address, parseEther('10000'), users[0].address, this.fiveSecondsSince, {
              value: parseEther('1'),
            }),
          'Platypus: AMOUNT_TOO_LOW'
        ).to.be.reverted
      })

      it('reverts if pool paused', async function () {
        await this.pool.connect(owner).pause()
        await expect(
          this.pool
            .connect(users[0])
            .swapFromETH(this.sAVAX.address, parseEther('0'), users[0].address, this.fiveSecondsSince, {
              value: parseEther('1'),
            }),
          'Pausable: paused'
        ).to.be.reverted
      })

      it('reverts if zero address provided', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swapFromETH(constants.AddressZero, parseEther('0'), users[0].address, this.fiveSecondsSince, {
              value: parseEther('1'),
            }),
          'Platypus: ZERO_ADDRESS'
        ).to.be.reverted
      })

      it('reverts if WETH address is provided as toToken', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swapFromETH(this.WETH.address, parseEther('0'), users[0].address, this.fiveSecondsSince, {
              value: parseEther('1'),
            }),
          'Platypus: SAME_ADDRESS'
        ).to.be.reverted
      })

      it('reverts if asset not exist', async function () {
        const btc = await TestERC20.connect(owner).deploy('Bitcoin', 'BTC', 8, '0')
        await expect(
          this.pool
            .connect(users[0])
            .swapFromETH(btc.address, parseEther('0'), users[0].address, this.fiveSecondsSince, {
              value: parseEther('1'),
            }),
          'Platypus: ASSET_NOT_EXIST'
        ).to.be.reverted
      })
    })

    describe('swapToETH', function () {
      it('works', async function () {
        const beforeFromBalance = await this.sAVAX.balanceOf(users[0].address)
        const beforeToBalance = await ethers.provider.getBalance(users[1].address)
        // swap to users[1] so can test the exact ETH received (users[0] needs to pay gas)
        const receipt = await this.pool
          .connect(users[0])
          .swapToETH(this.sAVAX.address, parseEther('5'), parseEther('0'), users[1].address, this.fiveSecondsSince)

        const afterFromBalance = await this.sAVAX.balanceOf(users[0].address)
        const afterToBalance = await ethers.provider.getBalance(users[1].address)

        const tokenSent = afterFromBalance.sub(beforeFromBalance)
        const tokenGot = afterToBalance.sub(beforeToBalance)
        expect(tokenSent).to.be.equal(parseEther('-5'))
        expect(tokenGot).to.be.equal(parseEther('4.997714805900923846'))

        expectAssetValues(this.assetSAVAX, 18, { cash: '105', liability: '100' })
        expectAssetValues(this.assetAVAX, 18, { cash: '95.002285194099076154', liability: '100' })

        expect(receipt)
          .to.emit(this.pool, 'Swap')
          .withArgs(
            users[0].address,
            this.sAVAX.address,
            this.WETH.address,
            parseEther('5'),
            parseEther('4.997714805900923846'),
            users[1].address
          )

        expect(tokenSent.add(await this.assetSAVAX.cash())).to.be.equal(parseEther('100'))
        expect(tokenGot.add(await this.assetAVAX.cash())).to.be.equal(parseEther('100'))
      })

      it('reverts if passed deadline', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swapToETH(this.sAVAX.address, parseEther('500'), parseEther('0'), users[0].address, this.fiveSecondsAgo),
          'Platypus: EXPIRED'
        ).to.be.reverted
      })

      it('reverts if amount to receive is less than expected', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swapToETH(this.sAVAX.address, parseEther('500'), parseEther('1'), users[0].address, this.fiveSecondsSince),
          'Platypus: AMOUNT_TOO_LOW'
        ).to.be.reverted
      })

      it('reverts if not have enough from tokens', async function () {
        await expect(
          this.pool
            .connect(users[1])
            .swapToETH(this.sAVAX.address, parseEther('500'), parseEther('0'), users[1].address, this.fiveSecondsSince),
          'ERC20: transfer amount exceeds balance'
        ).to.be.reverted
      })

      it('reverts if pool paused', async function () {
        await this.pool.connect(owner).pause()
        await expect(
          this.pool
            .connect(users[0])
            .swapToETH(this.sAVAX.address, parseEther('500'), parseEther('0'), users[0].address, this.fiveSecondsSince),
          'Pausable: paused'
        ).to.be.reverted
      })

      it('reverts if zero address provided', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swapToETH(
              constants.AddressZero,
              parseEther('500'),
              parseEther('0'),
              users[0].address,
              this.fiveSecondsSince
            ),
          'Platypus: ZERO_ADDRESS'
        ).to.be.reverted
      })

      it('reverts if WETH address is provided as fromToken', async function () {
        await expect(
          this.pool
            .connect(users[0])
            .swapToETH(this.WETH.address, parseEther('500'), parseEther('0'), users[0].address, this.fiveSecondsSince),
          'Platypus: SAME_ADDRESS'
        ).to.be.reverted
      })

      it('reverts if asset not exist', async function () {
        const btc = await TestERC20.connect(owner).deploy('Bitcoin', 'BTC', 8, '0')
        await expect(
          this.pool
            .connect(users[0])
            .swapToETH(btc.address, parseEther('500'), parseEther('0'), users[0].address, this.fiveSecondsSince),
          'Platypus: ASSET_NOT_EXIST'
        ).to.be.reverted
      })
    })
  })
})
