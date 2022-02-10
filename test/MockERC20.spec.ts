import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ContractFactory } from '@ethersproject/contracts'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

chai.use(solidity)
const { expect } = chai

describe('Core', function () {
  let OwnableTestERC20: ContractFactory
  let TestERC20: ContractFactory
  let owner: SignerWithAddress
  let users: SignerWithAddress[]

  before(async function () {
    OwnableTestERC20 = await ethers.getContractFactory('OwnableTestERC20')
    TestERC20 = await ethers.getContractFactory('TestERC20')

    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest
  })

  beforeEach(async function () {
    // First, deploy and initialize pool
    this.ownableErc20 = await OwnableTestERC20.connect(owner).deploy('ownable test erc 20', 'OERC20', 18, 0)
    this.erc20 = await TestERC20.connect(owner).deploy('test erc 20', 'ERC20', 18, 0)

    // Wait for transaction to be deployed
    await this.ownableErc20.deployTransaction.wait()
    await this.erc20.deployTransaction.wait()
  })

  it('erc20 faucets with owner', async function () {
    const beforeBalanceOwnable = await this.ownableErc20.balanceOf(owner.address)
    const beforeBalanceStandard = await this.erc20.balanceOf(owner.address)

    await this.ownableErc20.connect(owner).faucet(owner.address, parseEther('25'))
    await this.erc20.connect(owner).faucet(parseEther('100'))

    const afterBalanceOwnable = await this.ownableErc20.balanceOf(owner.address)
    const afterBalanceStandard = await this.erc20.balanceOf(owner.address)

    const standardGot = afterBalanceStandard.sub(beforeBalanceStandard)
    const ownableGot = afterBalanceOwnable.sub(beforeBalanceOwnable)

    expect(standardGot).to.be.equal(parseEther('100'))
    expect(ownableGot).to.be.equal(parseEther('25'))
  })

  it('ownableErc20 faucets to another user', async function () {
    const beforeBalanceOwnable = await this.ownableErc20.balanceOf(users[2].address)

    await this.ownableErc20.connect(owner).faucet(users[2].address, parseEther('25'))

    const afterBalanceOwnable = await this.ownableErc20.balanceOf(users[2].address)

    const ownableGot = afterBalanceOwnable.sub(beforeBalanceOwnable)

    expect(ownableGot).to.be.equal(parseEther('25'))
  })

  it('ownableErc20 setsBalances correctly to another user', async function () {
    // set balance to 12345
    await this.ownableErc20.connect(owner).setBalance(users[3].address, parseEther('12345'))

    let afterBalanceOwnable = await this.ownableErc20.balanceOf(users[3].address)

    expect(afterBalanceOwnable).to.be.equal(parseEther('12345'))

    // set balance to 0
    await this.ownableErc20.connect(owner).setBalance(users[3].address, parseEther('0'))

    afterBalanceOwnable = await this.ownableErc20.balanceOf(users[3].address)

    expect(afterBalanceOwnable).to.be.equal(parseEther('0'))
  })

  it('it should revert if faucet is called by not owner', async function () {
    await expect(
      this.ownableErc20.connect(users[0]).faucet(users[0].address, parseEther('100')),
      'Ownable: caller is not the owner'
    ).to.be.reverted
  })

  it('it should faucet standard token from any user', async function () {
    const beforeBalanceStandard = await this.erc20.balanceOf(users[0].address)

    await this.erc20.connect(users[0]).faucet(parseEther('100'))

    const afterBalanceStandard = await this.erc20.balanceOf(users[0].address)

    const standardGot = afterBalanceStandard.sub(beforeBalanceStandard)

    expect(standardGot).to.be.equal(parseEther('100'))
  })
})
