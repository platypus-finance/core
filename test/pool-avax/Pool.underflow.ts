import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { setPriceOracle, usdc } from '../helpers/helper'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ContractFactory } from '@ethersproject/contracts'
import { setupAggregateAccount } from '../helpers/helper'
import { parseUnits } from 'ethers/lib/utils'
import { BigNumber } from 'ethers'

const { expect } = chai
chai.use(solidity)

describe('Pool', function () {
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
    Pool = await ethers.getContractFactory('PoolAvax')
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
    await this.pool.connect(owner).initialize(this.TestWAVAX.address)

    this.DAI = await TestERC20.connect(owner).deploy('Dai Stablecoin', 'DAI', 18, parseEther('10000000'))
    await this.DAI.deployTransaction.wait()

    this.USDC = await TestERC20.deploy('USD Coin', 'USDC', 6, usdc('10000000000'))
    await this.USDC.deployTransaction.wait()

    // Set price oracle
    await setPriceOracle(this.pool, owner, this.lastBlockTime, [
      { address: this.DAI.address, initialRate: parseUnits('1', 8).toString() },
      { address: this.USDC.address, initialRate: parseUnits('1', 8).toString() },
    ])
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

      console.log('setting big numbers')

      const cash = BigNumber.from('252755640300230')
      const liability = BigNumber.from('253540414089043')

      console.log('setting asset')

      await this.USDC.connect(owner).transfer(users[0].address, usdc('452755640'))
      await this.USDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.pool.connect(users[0]).deposit(this.USDC.address, liability, users[0].address, this.fiveSecondsSince)
      await this.asset.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

      console.log('accomodating values')

      await this.asset.setPool(owner.address)
      await this.asset.transferUnderlyingToken(owner.address, liability.sub(cash))
      await this.asset.removeCash(liability.sub(cash))
      await this.asset.setPool(this.pool.address)
      expect(await this.asset.cash()).to.be.equal(cash)
      expect(await this.asset.liability()).to.be.equal(liability)

      // expect((await this.asset.cash()).div(await this.asset.liability())).to.be.equal('0.9969047388692148')
    })

    describe('quotePotentialWithdraw', function () {
      it('works', async function () {
        await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('22.51509'))
        await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('22.51509'))
        await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('22.27'))
        await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('22.22'))
        await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('22.17'))
        await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('22.12'))
        await this.pool.quotePotentialWithdraw(this.USDC.address, usdc('22.07'))
      })
    })
  })
})
