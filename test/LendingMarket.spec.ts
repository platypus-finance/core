import { ethers, network, upgrades } from 'hardhat'
import chai, { expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
import { parseUnits } from 'ethers/lib/utils'
import { increase } from './helpers/time'

chai.use(solidity)

// https://docs.platypus.finance/platypus-finance-docs/developers/contract-addresses
const CHAINLINK_PROXY_PRICE_PROVIDER = '0x7b52f4B5C476E7aFD09266C35274737cD0af746b'
const MAIN_POOL = '0x66357dCaCe80431aee0A7507e2E361B7e2402370'
const MAIN_LP_USDC = '0xAEf735B1E7EcfAf8209ea46610585817Dc0a2E16'
const MAIN_LP_USDTE = '0x0D26D103c91F63052Fbca88aAF01d5304Ae40015'

const USDC = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'
const USDTE = '0xc7198437980c041c805A1EDcbA50c1Ce5db95118'

describe('Lending Market Test', function () {
  let user: SignerWithAddress, owner: SignerWithAddress, liquidator: SignerWithAddress
  let pool, usdc, usdte, lpUSDC, lpUSDTE
  let usp, lpPriceOracle, lendingMarket
  let testOracle

  before(async () => {
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: 'https://speedy-nodes-nyc.moralis.io/b95d9c358e95a72ff5b1f402/avalanche/mainnet',
            blockNumber: 13110000,
          },
        },
      ],
    })

    const signers = await ethers.getSigners()
    owner = signers[0]
    user = signers[1]
    liquidator = signers[2]

    pool = await ethers.getContractAt('Pool', MAIN_POOL)
    usdc = await ethers.getContractAt('IERC20', USDC)
    usdte = await ethers.getContractAt('IERC20', USDTE)
    lpUSDC = await ethers.getContractAt('Asset', MAIN_LP_USDC)
    lpUSDTE = await ethers.getContractAt('Asset', MAIN_LP_USDTE)

    const TestLPPriceOracle = await ethers.getContractFactory('TestLPPriceOracle')
    testOracle = await TestLPPriceOracle.deploy()
    await testOracle.deployed()
  })

  after(async () => {
    await network.provider.request({
      method: 'hardhat_reset',
      params: [],
    })
  })

  beforeEach(async () => {
    const USP = await ethers.getContractFactory('USP')
    usp = await USP.deploy()
    await usp.deployed()

    const LPPriceOracle = await ethers.getContractFactory('LPPriceOracle')
    await expect(LPPriceOracle.deploy(ethers.constants.AddressZero)).to.revertedWith(
      'invalid chainlink proxy price provider'
    )
    lpPriceOracle = await LPPriceOracle.deploy(CHAINLINK_PROXY_PRICE_PROVIDER)
    await lpPriceOracle.deployed()

    const LendingMarket = await ethers.getContractFactory('LendingMarket')
    lendingMarket = await upgrades.deployProxy(LendingMarket, [
      usp.address,
      [
        [30, 1000], // interestAPR 3%
        [3, 1000], // orgFeeRate 0.3%
        [50, 1000], // liquidatorFeeRate 5%
        [30, 1000], // orgRevenueFeeRate 3%
      ],
    ])
    await lendingMarket.deployed()

    await usp.grantRole(await usp.MINTER_ROLE(), lendingMarket.address)

    // prepare USP for owners (will be used for repay and liquidation)
    await usp.grantRole(await usp.MINTER_ROLE(), owner.address)
    await usp.mint(owner.address, parseUnits('10000'))

    // prepare pool tokens - LP-USDC / LP-USDT.e
    const amount = parseUnits('10000', 6)

    await getAccountToken(amount, user.address, USDC, 9)
    await usdc.connect(user).approve(pool.address, amount)
    await pool.connect(user).deposit(usdc.address, amount, user.address, ethers.constants.MaxUint256)

    await getAccountToken(amount, user.address, USDTE, 0)
    await usdte.connect(user).approve(pool.address, amount)
    await pool.connect(user).deposit(usdte.address, amount, user.address, ethers.constants.MaxUint256)

    await testOracle.setPrice(lpUSDC.address, parseUnits('1', 8))
    await testOracle.setPrice(lpUSDTE.address, parseUnits('1', 8))
  })

  it('check LP Price Oracle', async () => {
    await expect(lpPriceOracle.connect(user).setChainlinkProxyPriceProvider(lpUSDC.address)).to.revertedWith(
      'Ownable: caller is not the owner'
    )
    await expect(lpPriceOracle.setChainlinkProxyPriceProvider(ethers.constants.AddressZero)).to.revertedWith(
      'invalid chainlink proxy price provider'
    )
    await lpPriceOracle.setChainlinkProxyPriceProvider(lpUSDC.address)
    expect(await lpPriceOracle.chainlinkProxyPriceProvider()).to.equal(lpUSDC.address)

    await lpPriceOracle.setChainlinkProxyPriceProvider(CHAINLINK_PROXY_PRICE_PROVIDER)
    expect(await lpPriceOracle.getPrice(lpUSDC.address)).to.closeTo(parseUnits('1', 8), 1000000)
    expect(await lpPriceOracle.getPrice(lpUSDTE.address)).to.closeTo(parseUnits('1', 8), 1000000)
  })

  it('add collateral token', async () => {
    await expect(
      lendingMarket.addCollateralToken(MAIN_LP_USDC, ethers.constants.AddressZero, [70, 100], [75, 100])
    ).to.revertedWith('invalid oracle address')
    await expect(
      lendingMarket.addCollateralToken(MAIN_LP_USDC, lpPriceOracle.address, [101, 100], [75, 100])
    ).to.revertedWith('invalid rate')
    await expect(
      lendingMarket.addCollateralToken(MAIN_LP_USDC, lpPriceOracle.address, [70, 100], [101, 100])
    ).to.revertedWith('invalid rate')

    await lendingMarket.addCollateralToken(
      MAIN_LP_USDC,
      lpPriceOracle.address,
      [70, 100], // 70% LTV
      [75, 100] // 75% Liq Ratio
    )
    expect(await lendingMarket.allCollateralTokens()).to.deep.equal([MAIN_LP_USDC])
    expect((await lendingMarket.collateralSettings(MAIN_LP_USDC)).decimals).to.equal(6)

    await expect(
      lendingMarket.addCollateralToken(MAIN_LP_USDC, lpPriceOracle.address, [70, 100], [75, 100])
    ).to.revertedWith('collateral token exists')

    await lendingMarket.addCollateralToken(
      MAIN_LP_USDTE,
      lpPriceOracle.address,
      [75, 100], // 75% LTV
      [80, 100] // 80% Liq Ratio
    )
    expect(await lendingMarket.allCollateralTokens()).to.deep.equal([MAIN_LP_USDC, MAIN_LP_USDTE])
    expect((await lendingMarket.collateralSettings(MAIN_LP_USDTE)).decimals).to.equal(6)
  })

  it('remove collateral token', async () => {
    await expect(lendingMarket.removeCollateralToken(MAIN_LP_USDC)).to.revertedWith('invalid collateral token')

    await lendingMarket.addCollateralToken(
      MAIN_LP_USDC,
      lpPriceOracle.address,
      [70, 100], // 70% LTV
      [75, 100] // 75% Liq Ratio
    )
    await lendingMarket.addCollateralToken(
      MAIN_LP_USDTE,
      lpPriceOracle.address,
      [75, 100], // 75% LTV
      [80, 100] // 80% Liq Ratio
    )
    expect(await lendingMarket.allCollateralTokens()).to.deep.equal([MAIN_LP_USDC, MAIN_LP_USDTE])

    await lendingMarket.removeCollateralToken(MAIN_LP_USDTE)
    expect(await lendingMarket.allCollateralTokens()).to.deep.equal([MAIN_LP_USDC])

    await lendingMarket.removeCollateralToken(MAIN_LP_USDC)
    expect(await lendingMarket.allCollateralTokens()).to.deep.equal([])
  })

  describe('after initialization', () => {
    beforeEach(async () => {
      await lendingMarket.addCollateralToken(
        MAIN_LP_USDC,
        testOracle.address,
        [70, 100], // 70% LTV
        [75, 100] // 75% Liq Ratio
      )

      await lendingMarket.addCollateralToken(
        MAIN_LP_USDTE,
        testOracle.address,
        [75, 100], // 75% LTV
        [80, 100] // 80% Liq Ratio
      )
    })

    it('deposit collateral', async () => {
      await expect(lendingMarket.connect(user).deposit(usdc.address, parseUnits('100'), user.address)).to.revertedWith(
        'invalid token'
      )

      const amount = parseUnits('100', 6)
      await lpUSDC.connect(user).approve(lendingMarket.address, amount)
      await lendingMarket.connect(user).deposit(lpUSDC.address, amount, user.address)

      const position = await lendingMarket.positionView(user.address, lpUSDC.address)
      expect(position.owner).to.equal(user.address)
      expect(position.token).to.equal(lpUSDC.address)
      expect(position.amount).to.equal(amount)
      expect(position.amountUSD).to.equal(parseUnits('100'))
      expect(position.creditLimitUSD).to.equal(parseUnits('70'))
      expect(position.debtPrincipal).to.equal(0)
      expect(position.debtInterest).to.equal(0)
      expect(position.liquidatable).to.equal(false)
    })

    it('borrow USP', async () => {
      const amount = parseUnits('100', 6)
      await lpUSDC.connect(user).approve(lendingMarket.address, amount)
      await lendingMarket.connect(user).deposit(lpUSDC.address, amount, user.address)

      await expect(lendingMarket.connect(user).borrow(usdc.address, parseUnits('100'))).to.revertedWith('invalid token')
      await expect(lendingMarket.connect(user).borrow(lpUSDC.address, parseUnits('71'))).to.revertedWith(
        'insufficient collateral'
      )

      await lendingMarket.connect(user).borrow(lpUSDC.address, parseUnits('50'))
      expect(await usp.balanceOf(user.address)).to.closeTo(parseUnits('50'), parseUnits('1'))

      let position = await lendingMarket.positionView(user.address, lpUSDC.address)
      expect(position.owner).to.equal(user.address)
      expect(position.token).to.equal(lpUSDC.address)
      expect(position.amount).to.equal(amount)
      expect(position.amountUSD).to.closeTo(parseUnits('100'), parseUnits('1'))
      expect(position.creditLimitUSD).to.closeTo(parseUnits('70'), parseUnits('1'))
      expect(position.debtPrincipal).to.equal(parseUnits('50'))
      expect(position.debtInterest).to.equal(0)
      expect(position.liquidatable).to.equal(false)

      await lendingMarket.connect(user).borrow(lpUSDC.address, parseUnits('10'))
      expect(await usp.balanceOf(user.address)).to.closeTo(parseUnits('60'), parseUnits('1'))

      position = await lendingMarket.positionView(user.address, lpUSDC.address)
      expect(position.owner).to.equal(user.address)
      expect(position.token).to.equal(lpUSDC.address)
      expect(position.amount).to.equal(amount)
      expect(position.amountUSD).to.closeTo(parseUnits('100'), parseUnits('1'))
      expect(position.creditLimitUSD).to.closeTo(parseUnits('70'), parseUnits('1'))
      expect(position.debtPrincipal).to.equal(parseUnits('60'))
      expect(position.debtInterest).to.closeTo(parseUnits('0'), parseUnits('0.01'))
      expect(position.liquidatable).to.equal(false)
    })

    it('withdraw collateral', async () => {
      const amount = parseUnits('100', 6)
      await lpUSDC.connect(user).approve(lendingMarket.address, amount)
      await lendingMarket.connect(user).deposit(lpUSDC.address, amount, user.address)
      await lendingMarket.connect(user).borrow(lpUSDC.address, parseUnits('50'))

      await expect(lendingMarket.connect(user).withdraw(usdc.address, parseUnits('100'))).to.revertedWith(
        'invalid token'
      )
      await expect(lendingMarket.connect(user).withdraw(lpUSDC.address, parseUnits('110', 6))).to.revertedWith(
        'insufficient collateral'
      )
      await expect(lendingMarket.connect(user).withdraw(lpUSDC.address, parseUnits('29', 6))).to.revertedWith(
        'insufficient collateral'
      )

      await lendingMarket.connect(user).withdraw(lpUSDC.address, parseUnits('20', 6))

      const position = await lendingMarket.positionView(user.address, lpUSDC.address)
      expect(position.owner).to.equal(user.address)
      expect(position.token).to.equal(lpUSDC.address)
      expect(position.amount).to.equal(parseUnits('80', 6))
      expect(position.amountUSD).to.equal(parseUnits('80'))
      expect(position.creditLimitUSD).to.equal(parseUnits('56'))
      expect(position.debtPrincipal).to.equal(parseUnits('50'))
      expect(position.debtInterest).to.closeTo(parseUnits('0'), parseUnits('0.01'))
      expect(position.liquidatable).to.equal(false)
    })

    it('repay USP: partial', async () => {
      const amount = parseUnits('100', 6)
      await lpUSDC.connect(user).approve(lendingMarket.address, amount)
      await lendingMarket.connect(user).deposit(lpUSDC.address, amount, user.address)
      await lendingMarket.connect(user).borrow(lpUSDC.address, parseUnits('50'))

      await expect(lendingMarket.connect(user).repay(usdc.address, parseUnits('20'))).to.revertedWith('invalid token')
      await expect(lendingMarket.connect(user).repay(lpUSDC.address, parseUnits('0'))).to.revertedWith('invalid amount')

      await usp.connect(user).approve(lendingMarket.address, parseUnits('20'))
      await lendingMarket.connect(user).repay(lpUSDC.address, parseUnits('20'))

      const position = await lendingMarket.positionView(user.address, lpUSDC.address)
      expect(position.owner).to.equal(user.address)
      expect(position.token).to.equal(lpUSDC.address)
      expect(position.amount).to.equal(amount)
      expect(position.amountUSD).to.equal(parseUnits('100'))
      expect(position.creditLimitUSD).to.equal(parseUnits('70'))
      expect(position.debtPrincipal).to.closeTo(parseUnits('30'), parseUnits('1'))
      expect(position.debtInterest).to.equal(0)
      expect(position.liquidatable).to.equal(false)
    })

    it('repay USP: full', async () => {
      const amount = parseUnits('100', 6)
      await lpUSDC.connect(user).approve(lendingMarket.address, amount)
      await lendingMarket.connect(user).deposit(lpUSDC.address, amount, user.address)
      await lendingMarket.connect(user).borrow(lpUSDC.address, parseUnits('50'))

      await expect(lendingMarket.connect(user).repay(usdc.address, parseUnits('20'))).to.revertedWith('invalid token')
      await expect(lendingMarket.connect(user).repay(lpUSDC.address, parseUnits('0'))).to.revertedWith('invalid amount')

      await usp.transfer(user.address, parseUnits('100'))
      await usp.connect(user).approve(lendingMarket.address, parseUnits('100'))
      await lendingMarket.connect(user).repay(lpUSDC.address, parseUnits('100'))

      const position = await lendingMarket.positionView(user.address, lpUSDC.address)
      expect(position.owner).to.equal(user.address)
      expect(position.token).to.equal(lpUSDC.address)
      expect(position.amount).to.equal(amount)
      expect(position.amountUSD).to.equal(parseUnits('100'))
      expect(position.creditLimitUSD).to.equal(parseUnits('70'))
      expect(position.debtPrincipal).to.equal(0)
      expect(position.debtInterest).to.equal(0)
      expect(position.liquidatable).to.equal(false)
    })

    it('liquidate position: 50%', async () => {
      const amount = parseUnits('100', 6)
      await lpUSDC.connect(user).approve(lendingMarket.address, amount)
      await lendingMarket.connect(user).deposit(lpUSDC.address, amount, user.address)
      await lendingMarket.connect(user).borrow(lpUSDC.address, parseUnits('70'))

      await expect(
        lendingMarket.connect(liquidator).liquidate(user.address, lpUSDC.address, parseUnits('35'))
      ).to.revertedWith('not liquidatable')

      // dump collateral price
      await testOracle.setPrice(lpUSDC.address, parseUnits('0.9', 8))

      let position = await lendingMarket.positionView(user.address, lpUSDC.address)
      expect(position.liquidatable).to.equal(true)

      await expect(
        lendingMarket.connect(liquidator).liquidate(user.address, usdc.address, parseUnits('35'))
      ).to.revertedWith('invalid token')
      await expect(
        lendingMarket.connect(liquidator).liquidate(user.address, lpUSDC.address, parseUnits('40'))
      ).to.revertedWith('up to 50% available')

      const collateralBalanceOfProtocol = await lpUSDC.balanceOf(owner.address)
      // prepare usp for liquidation
      await usp.transfer(liquidator.address, parseUnits('35'))
      await usp.connect(liquidator).approve(lendingMarket.address, parseUnits('35'))
      await lendingMarket.connect(liquidator).liquidate(user.address, lpUSDC.address, parseUnits('35'))

      position = await lendingMarket.positionView(user.address, lpUSDC.address)
      expect(position.owner).to.equal(user.address)
      expect(position.token).to.equal(lpUSDC.address)
      expect(position.amount).to.closeTo(parseUnits('58', 6), parseUnits('0.01', 6))
      expect(position.amountUSD).to.closeTo(parseUnits('52.2'), parseUnits('0.01'))
      expect(position.creditLimitUSD).to.closeTo(parseUnits('36.54'), parseUnits('0.01'))
      expect(position.debtPrincipal).to.closeTo(parseUnits('35'), parseUnits('0.01'))
      expect(position.debtInterest).to.equal(0)
      expect(position.liquidatable).to.equal(false)

      // check 5% liquidation fee
      expect(await lpUSDC.balanceOf(liquidator.address)).to.equal(40833333) // (35 * 105) / 100 / 0.9

      // check 3% protocol revenue
      expect(await lpUSDC.balanceOf(owner.address)).to.equal(
        collateralBalanceOfProtocol.add(1166666) // (35 * 3) / 100 / 0.9
      )
    })

    it('collect debt interest', async () => {
      const amount = parseUnits('100', 6)
      await lpUSDC.connect(user).approve(lendingMarket.address, amount)
      await lendingMarket.connect(user).deposit(lpUSDC.address, amount, user.address)
      await lendingMarket.connect(user).borrow(lpUSDC.address, parseUnits('70'))

      // pass 1 day
      await increase(60 * 60 * 24)

      await lendingMarket.accrue()

      const fee = await lendingMarket.totalFeeCollected()

      const uspBalanceOfProtocol = await usp.balanceOf(owner.address)
      await lendingMarket.collectOrgFee()
      expect(await usp.balanceOf(owner.address)).to.closeTo(uspBalanceOfProtocol.add(fee), parseUnits('0.000001'))
    })
  })
})

export const toBytes32 = (bn: BigNumber): string => {
  return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32))
}

export const getAccountToken = async (
  amount: BigNumber,
  userAddress: string,
  tokenAddress: string,
  slot: number
): Promise<void> => {
  // Get storage slot index
  const index = ethers.utils.solidityKeccak256(
    ['uint256', 'uint256'],
    [userAddress, slot] // key, slot
  )

  await ethers.provider.send('hardhat_setStorageAt', [tokenAddress, index, toBytes32(amount).toString()])
  await ethers.provider.send('evm_mine', []) // Just mines to the next block
}
