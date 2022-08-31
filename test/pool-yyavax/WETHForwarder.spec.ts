import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, ContractFactory } from 'ethers'

chai.use(solidity)
const { expect } = chai

describe('WETHForwarder', function () {
  let owner, users
  let WETH, WETHForwarder: ContractFactory
  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    WETH = await ethers.getContractFactory('TestWAVAX')
    WETHForwarder = await ethers.getContractFactory('WETHForwarder')
  })

  beforeEach(async function () {
    this.WETH = await WETH.connect(owner).deploy()
    this.forwarder = await WETHForwarder.connect(owner).deploy(this.WETH.address)
    await this.forwarder.connect(owner).setPool(users[0].address)
  })

  describe('setPool', function () {
    it('restricts to only owner', async function () {
      await expect(this.forwarder.connect(users[0]).setPool(users[1].address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })

    it('updates pool', async function () {
      const receipt = await this.forwarder.connect(owner).setPool(users[1].address)
      expect(await this.forwarder.pool()).to.be.equal(users[1].address)
      expect(receipt).to.emit(this.forwarder, 'PoolUpdated').withArgs(users[0].address, users[1].address)
    })
  })

  describe('unwrapAndTransfer', function () {
    beforeEach(async function () {
      await this.WETH.connect(users[1]).deposit({ value: parseEther('1') })
      await this.WETH.connect(users[1]).transfer(this.forwarder.address, parseEther('1'))
    })

    it('works', async function () {
      const beforeBalance: BigNumber = await users[1].getBalance()
      await this.forwarder.connect(users[0]).unwrapAndTransfer(users[1].address, parseEther('0.1'))
      const afterBalance: BigNumber = await users[1].getBalance()

      expect(afterBalance.sub(beforeBalance)).to.be.equal(parseEther('0.1'))
      expect(await this.WETH.balanceOf(this.forwarder.address)).to.be.equal(parseEther('0.9'))
    })

    it('reverts if not enough WETH', async function () {
      await expect(
        this.forwarder.connect(users[0]).unwrapAndTransfer(owner.address, parseEther('100'))
      ).to.be.revertedWith('INSUFFICIENT_WETH')
    })

    it('restricts to only pool', async function () {
      await expect(this.forwarder.connect(owner).unwrapAndTransfer(owner.address, parseEther('1'))).to.be.revertedWith(
        'FORBIDDEN'
      )
    })
  })
})
