import { ethers } from 'hardhat'
import { formatEther, parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ContractFactory } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { setupPool } from './helpers/helper'

const { expect } = chai

chai.use(solidity)

describe('Core', function () {
  let owner: SignerWithAddress
  let CoreTest: ContractFactory

  beforeEach(async function () {
    const [first] = await ethers.getSigners()
    owner = first

    // Get CoreTest
    CoreTest = await ethers.getContractFactory('TestSlippage')
  })

  beforeEach(async function () {
    // First, deploy and initialize pool
    this.coreTest = await CoreTest.connect(owner).deploy()

    // Wait for transaction to be deployed
    await this.coreTest.deployTransaction.wait()

    const poolSetup = await setupPool(owner)
    this.pool = poolSetup.pool
  })

  describe('Slippage Function', async function () {
    it('Should get correct slippage', async function () {
      const k = await this.pool.getSlippageParamK()
      const n = await this.pool.getSlippageParamN()
      const _c1 = await this.pool.getC1()
      const _xThreshold = await this.pool.getXThreshold()

      const xThreshFloat = parseFloat(formatEther(_xThreshold.toString()))

      const xTestValues = [
        '5',
        '2.5',
        '1.3',
        '1',
        '0.5',
        '0.1',
        '0.01',
        '0.001',
        '0',
        (xThreshFloat + 0.001).toString(),
        xThreshFloat.toString(),
        (xThreshFloat - 0.001).toString(),
      ]
      const slippageResults = [
        '256000000',
        '32768000000',
        '3187326323585',
        '20000000000000',
        '2560000000000000',
        '276927610599998308',
        '366927610599998308',
        '375927610599998308',
        '376927610599998308',
        '46127969970959518',
        '47115951324999808',
        '48115951324999808',
      ]

      for (const x of xTestValues) {
        expect(await this.coreTest.testSlippage(k, n, _c1, _xThreshold, parseEther(x))).to.be.equal(
          slippageResults[xTestValues.indexOf(x)]
        )
      }
    })
  })
})
