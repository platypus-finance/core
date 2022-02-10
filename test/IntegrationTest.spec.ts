import { ethers } from 'hardhat'
import chai, { expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

chai.use(solidity)

describe('Integration Test', function () {
  let owner: SignerWithAddress
  let IntegrationTest, integrationTest

  before(async () => {
    const [first] = await ethers.getSigners()
    owner = first

    IntegrationTest = await ethers.getContractFactory('IntegrationTest')
    integrationTest = await IntegrationTest.connect(owner).deploy()

    await integrationTest.deployTransaction.wait()
  })

  it('deploys successfully', async function () {
    expect(await integrationTest.echidna_total_supply()).to.be.true
    expect(await integrationTest.echidna_cash()).to.be.true
  })
})
