import Fuzzer = require('./helpers/fuzzer.js')
import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
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

    const poolSetup = await setupPool(owner)
    this.pool = poolSetup.pool
    this.WETH = await TestWAVAX.deploy()
  })

  describe('fuzzer', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const aggregateName = 'USD-Stablecoins'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      const tokenSetDAI = await createAndInitializeToken('DAI', 18, owner, this.pool, aggregateAccount)
      const tokenSetUSDC = await createAndInitializeToken('USDC', 6, owner, this.pool, aggregateAccount)

      this.DAI = tokenSetDAI.token
      this.assetDAI = tokenSetDAI.asset

      this.USDC = tokenSetUSDC.token
      this.assetUSDC = tokenSetUSDC.asset
      await setPriceOracle(this.pool, owner, this.lastBlockTime, [
        { address: this.DAI.address, initialRate: parseEther('1').toString() },
        { address: this.USDC.address, initialRate: parseEther('1').toString() },
      ])

      // fund user with 100 k
      await fundUserAndApprovePool(this.DAI, users[0], parseEther('100000').toString(), this.pool, owner)
      await fundUserAndApprovePool(this.USDC, users[0], usdc('100000').toString(), this.pool, owner)

      // deposit 100 k dai - we want all swaps to succeed.
      await this.pool
        .connect(users[0])
        .deposit(this.DAI.address, parseEther('100000'), users[0].address, this.fiveSecondsSince)
      // deposit 10 k usdc
      await this.pool
        .connect(users[0])
        .deposit(this.USDC.address, usdc('10000'), users[0].address, this.fiveSecondsSince)
    })

    it('USDC deposit/swap/withdraw', async function () {
      // Approve spending by pool
      await this.assetDAI.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.assetUSDC.connect(users[0]).approve(this.pool.address, ethers.constants.MaxUint256)

      const actions = {
        DEPOSIT: async (amount: number) => {
          return await this.pool
            .connect(users[0])
            .deposit(this.USDC.address, usdc(amount.toString()), users[0].address, this.fiveSecondsSince)
        },
        SWAP: async (amount: number) => {
          return await this.pool.connect(users[0]).swap(
            this.USDC.address,
            this.DAI.address,
            usdc(amount.toString()),
            parseEther((0.9 * amount).toString()), //expect at least 90% of ideal quoted amount
            users[0].address,
            this.fiveSecondsSince
          )
        },
        WITHDRAW: async (amount: number) => {
          return await this.pool
            .connect(users[0])
            .withdraw(
              this.USDC.address,
              usdc(amount.toString()),
              usdc(amount.toString()),
              users[0].address,
              this.fiveSecondsSince
            )
        },
      }

      // Return a value in [a, b).
      const uniform = (a, b): number => {
        return Math.random() * (b - a) + a
      }

      const constraintsState = { balance: 10000, wallet: 90000 }

      const constraints = {
        DEPOSIT: (state) => {
          const amount = +uniform(0, 0.3 * state.wallet).toFixed()
          state.balance += amount
          state.wallet -= amount
          return [amount]
        },
        SWAP: (state) => {
          const amount = +uniform(0, 0.1 * state.wallet).toFixed()
          state.wallet -= amount
          return [amount]
        },
        WITHDRAW: (state) => {
          const amount = +uniform(0, 0.7 * state.balance).toFixed()
          state.balance -= amount
          state.wallet += amount
          return [amount]
        },
      }

      async function assetCheck(asset) {
        return (
          (await asset.liability()) >= 0 && (await asset.cash()) >= 0 && (await asset.underlyingTokenBalance()) >= 0
        )
      }

      const invariants = [
        function balanceCheck() {
          return constraintsState.balance >= 0
        },
        assetCheck.bind(undefined, this.assetUSDC),
        assetCheck.bind(undefined, this.assetDAI),
      ]

      const fuzzer = new Fuzzer(actions, constraintsState, constraints, invariants)
      await fuzzer.execute(20)
      // Uncomment to get history
      // fuzzer.printHistory()
    })
  })
})
