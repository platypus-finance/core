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
  setupSAvaxPoolTestERC20,
  setupSAvaxPriceFeed,
} from '../helpers/helper'

const { expect } = chai
chai.use(solidity)

describe('AvaxPool Arb', function () {
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
    const poolSetup = await setupSAvaxPoolTestERC20(owner)
    this.pool = poolSetup.pool
    this.WETH = poolSetup.WETH

    await setupSAvaxPriceFeed(this.pool)
  })

  describe('Arb pool', function () {
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

      await this.pool.setSAvax(this.sAVAX.address)

      await fundUserAndApprovePool(this.sAVAX, owner, parseEther('100000000000').toString(), this.pool, owner)
      await fundUserAndApprovePool(this.WETH, owner, parseEther('100000000000').toString(), this.pool, owner)

      // SAVAX SETUP
      const sAvaxCash = parseEther('1478053.383')
      const sAvaxLiability = parseEther('747812.6418')

      await this.pool.deposit(this.sAVAX.address, sAvaxLiability, owner.address, this.fiveSecondsSince)

      await this.assetSAVAX.setPool(owner.address)
      await this.assetSAVAX.addCash(sAvaxCash.sub(sAvaxLiability))
      await this.sAVAX.transfer(this.assetSAVAX.address, sAvaxCash.sub(sAvaxLiability))
      await this.assetSAVAX.setPool(this.pool.address)

      await expectAssetValues(this.assetSAVAX, 18, { cash: '1478053.383', liability: '747812.6418' })

      // AVAX SETUP
      const avaxCash = parseEther('801521.1967')
      const avaxLiability = parseEther('1592988.997')

      await this.pool.deposit(this.WETH.address, avaxLiability, owner.address, this.fiveSecondsSince)
      await this.assetAVAX.setPool(owner.address)
      await this.assetAVAX.removeCash(avaxLiability.sub(avaxCash))
      await this.assetAVAX.transferUnderlyingToken(owner.address, avaxLiability.sub(avaxCash))
      // await this.WETH.transfer(this.assetAVAX.address, avaxCash.sub(avaxLiability))
      await this.assetAVAX.setPool(this.pool.address)

      await expectAssetValues(this.assetAVAX, 18, { cash: '801521.1967', liability: '1592988.997' })
    })

    describe('Withdraw Fee test', function () {
      it('Withdraw test', async function () {
        // this.WETH balance before and after
        const avaxBalanceBefore = await this.WETH.balanceOf(owner.address)

        await this.pool.withdraw(this.WETH.address, parseEther('1020000'), 0, owner.address, this.fiveSecondsSince)
        const avaxBalanceAfter = await this.WETH.balanceOf(owner.address)

        const delta = avaxBalanceAfter.sub(avaxBalanceBefore)
        // console.log('delta', ethers.utils.formatEther(delta))
        expect(delta).to.be.eq(ethers.utils.parseEther('589427.781262942888425645'))
      })
    })
  })
})
