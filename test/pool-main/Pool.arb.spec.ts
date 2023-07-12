import { ethers } from 'hardhat'
import { parseEther, parseUnits } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ContractFactory } from 'ethers'
import {
  setupPool,
  createAndInitializeToken,
  fundUserAndApprovePool,
  setPriceOracle,
  expectAssetValues,
  usdc,
  setupAggregateAccount,
  initAssetWithValues,
} from '../helpers/helper'
import { formatEther, formatUnits } from 'ethers/lib/utils'

const { expect } = chai
chai.use(solidity)

describe('PoolArb', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let TestERC20: ContractFactory
  let attacker: SignerWithAddress

  before(async () => {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest
    attacker = users[9]

    TestERC20 = await ethers.getContractFactory('TestERC20')
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

  describe('Asset USDT (6 decimals) and USDC (6 decimals)', function () {
    beforeEach(async function () {
      // Setup aggregate account
      const aggregateName = 'USD-Stablecoins'
      const aggregateAccount = await setupAggregateAccount(owner, aggregateName, true)
      await aggregateAccount.deployTransaction.wait()

      const tokenSetUSDT = await createAndInitializeToken('USDT', 6, owner, this.pool, aggregateAccount)
      const tokenSetUSDC = await createAndInitializeToken('USDC', 6, owner, this.pool, aggregateAccount)

      this.USDT = tokenSetUSDT.token
      this.assetUSDT = tokenSetUSDT.asset

      this.USDC = tokenSetUSDC.token
      this.assetUSDC = tokenSetUSDC.asset

      // Set price oracle
      await setPriceOracle(this.pool, owner, this.lastBlockTime, [
        { address: this.USDT.address, initialRate: parseUnits('1', 8).toString() },
        { address: this.USDC.address, initialRate: parseUnits('1', 8).toString() },
      ])

      // fund user with 100 k
      await fundUserAndApprovePool(this.USDT, owner, parseEther('10000000000000000000000').toString(), this.pool, owner)
      await fundUserAndApprovePool(this.USDC, owner, parseEther('10000000000000000000000').toString(), this.pool, owner)

      // fund attacker with 5k usdc
      await this.USDC.connect(owner).transfer(attacker.address, usdc('5000'))

      await initAssetWithValues(
        this.USDT,
        this.assetUSDT,
        owner,
        this.pool,
        usdc('428491.997999'),
        usdc('585268.528249'),
        usdc('428470.175659')
      )

      await initAssetWithValues(
        this.USDC,
        this.assetUSDC,
        owner,
        this.pool,
        usdc('920270.929028'), // total supply
        usdc('771551.875499'), // cash
        usdc('916403.145845') // liability
      )

      expect(await this.assetUSDT.cash()).to.be.eq(usdc('585268.528249'))
      expect(await this.assetUSDT.liability()).to.be.eq(usdc('428470.175659'))

      expect(await this.assetUSDC.cash()).to.be.eq(usdc('771551.875499'))
      expect(await this.assetUSDC.liability()).to.be.eq(usdc('916403.145845'))

      // Approve USDC and LP-USDC to be spent by the pool
      await this.USDC.connect(attacker).approve(this.pool.address, ethers.constants.MaxUint256)
      await this.assetUSDC.connect(attacker).approve(this.pool.address, ethers.constants.MaxUint256)

      // fund attacker with 1,000,000 usdc
      await this.USDC.connect(owner).transfer(attacker.address, usdc('1000000'))

      // lp values
      const lpValueUSDC = (await this.assetUSDC.liability()) / (await this.assetUSDC.totalSupply())
      const lpValueUSDT = (await this.assetUSDT.liability()) / (await this.assetUSDT.totalSupply())

      // convert big number to number lpValueUSDC
      let USDTtoUSDCConv = lpValueUSDT / lpValueUSDC
      let USDTtoUSDC = USDTtoUSDCConv.toFixed(6) // convert to 6 d.p.

      // console.log('lpValueUSDC', lpValueUSDC.toString())
      // console.log('lpValueUSDT', lpValueUSDT.toString())
      // console.log('USDTtoUSDC', USDTtoUSDC.toString())

      expect(USDTtoUSDC.toString()).to.be.eq(
        formatUnits(
          await this.pool.convertLp(this.assetUSDT.address, this.assetUSDC.address, parseUnits('1', 6).toString()),
          6
        )
      )
    })

    describe('arbitrage', function () {
      it('should not be possible to arb by depositing USDC and withdrawing USDT', async function () {
        const INITIAL_AMOUNT = usdc('10000')

        // usdt balance after
        let usdtBalanceBefore = await this.USDT.balanceOf(attacker.address)
        // usdc balance after
        let usdcBalanceBefore = await this.USDC.balanceOf(attacker.address)

        // Taking tx 0xbe62bb3814362fc222323fec10973eeb076b86e3b83dde6814110c062af55b5d as an example
        // Deposit 10,000 USDC in the pool
        await this.pool
          .connect(attacker)
          .deposit(this.USDC.address, INITIAL_AMOUNT, attacker.address, this.fiveSecondsSince)

        // the attacker tries to withdraw using LP-USDC balance
        let assetUSDCBalance = await this.assetUSDC.balanceOf(attacker.address)
        // console.log('assetUSDCBalance', formatUnits(assetUSDCBalance.toString(), 6))

        // expect to revert with message 'ERC20: transfer amount exceeds balance' because the contract asks for more LP-USDC than the attacker has
        await expect(
          this.pool
            .connect(attacker)
            .withdrawFromOtherAsset(
              this.USDC.address,
              this.USDT.address,
              assetUSDCBalance,
              0,
              attacker.address,
              this.fiveSecondsSince
            )
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance')

        await this.pool
          .connect(attacker)
          .withdrawFromOtherAsset(
            this.USDC.address,
            this.USDT.address,
            INITIAL_AMOUNT,
            0,
            attacker.address,
            this.fiveSecondsSince
          )

        // usdt balance after
        let usdtBalanceAfter = await this.USDT.balanceOf(attacker.address)
        // usdc balance after
        let usdcBalanceAfter = await this.USDC.balanceOf(attacker.address)

        // compute total gains
        let usdcGains = usdcBalanceAfter.sub(usdcBalanceBefore)
        let usdtGains = usdtBalanceAfter.sub(usdtBalanceBefore)
        let totalGains = usdcGains.add(usdtGains)
        expect(totalGains).to.be.lt(0)
      })
    })
  })
})
