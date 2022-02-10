import { ethers } from 'hardhat'
import { parseEther, parseUnits } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ContractFactory } from '@ethersproject/contracts'

chai.use(solidity)
const { expect } = chai

let DSMath: ContractFactory
before(async function () {
  DSMath = await ethers.getContractFactory('TestDSMath')
})

describe('DSMath', function () {
  beforeEach(async function () {
    this.cal = await DSMath.deploy()
  })

  // notWAD.wmul(WAD) => notWAD
  it('566_893424.wmul(0.5 WAD) = 283_446712', async function () {
    expect(await this.cal.wmul(566_893424, parseEther('0.5'))).to.be.equal(283_446712)
  })

  // notWAD.wdiv(notWAD) => WAD
  it('100_000000.wdiv(200_000000) = 0.5 WAD', async function () {
    expect(await this.cal.wdiv(100_000000, 200_000000)).to.be.equal(parseEther('0.5'))
  })

  // WAD.wmul(WAD) => WAD
  it('(1 WAD).wmul(2 WAD) = 2 WAD', async function () {
    expect(await this.cal.wmul(parseEther('1'), parseEther('2'))).to.be.equal(parseEther('2'))
  })

  // WAD.reciprocal() => WAD
  it('(2 WAD).reciprocal() = 1/2 WAD', async function () {
    expect(await this.cal.reciprocal(parseEther('2'))).to.be.equal(parseEther('0.5'))
  })

  // RAY.rpow(int) => RAY
  it('(2 RAY).rpow(5) = 32 RAY', async function () {
    expect(await this.cal.rpow(parseUnits('2', 27), 5)).to.be.equal(parseUnits('32', 27))
  })
})
