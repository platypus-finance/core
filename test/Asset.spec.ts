import { ethers } from 'hardhat'
import chai from 'chai'
import { BigNumber, BigNumberish, Contract } from 'ethers'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { setupAggregateAccount } from './helpers/helper'

export function toWei(amount: BigNumberish, tokenDecimals: BigNumberish): BigNumber {
  return ethers.utils.parseUnits(amount.toString(), tokenDecimals)
}

chai.use(solidity)
const { expect } = chai

describe('Asset', function () {
  let owner: SignerWithAddress
  let users: SignerWithAddress[]
  let token: Contract
  let wrongToken: Contract
  let asset: Contract
  let aggregateAccount: Contract

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    const AssetFactory = await ethers.getContractFactory('Asset')
    const TestERC20Factory = await ethers.getContractFactory('TestERC20')

    token = await TestERC20Factory.deploy('ERC20 Token', 'ERC', 18, toWei('10000000', 18))
    await token.deployTransaction.wait()

    wrongToken = await TestERC20Factory.deploy('WRONG Token', 'WRONG', 19, toWei('10000000', 19))
    await wrongToken.deployTransaction.wait()

    aggregateAccount = await setupAggregateAccount(owner, 'ERC20 Token', false)
    await aggregateAccount.deployTransaction.wait()

    asset = await AssetFactory.deploy()
    await asset.initialize(token.address, 'test', 'test', aggregateAccount.address)

    await asset.deployTransaction.wait()

    await asset.setPool(users[0].address)
  })

  describe('pool', function () {
    it('works', async function () {
      expect(await asset.pool()).to.equal(users[0].address)
    })
  })

  describe('setPool', function () {
    it('works', async function () {
      expect(await asset.pool()).to.equal(users[0].address)
      const receipt = await asset.setPool(users[1].address)
      expect(await asset.pool()).to.equal(users[1].address)
      expect(receipt).to.emit(asset, 'PoolUpdated').withArgs(users[0].address, users[1].address)
    })

    it('restricts to only owner', async function () {
      await expect((await asset.connect(users[0])).setPool(users[1].address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })

    it('does not let to deploy asset with token > 18 dp', async function () {
      const AssetFactory = await ethers.getContractFactory('Asset')
      const wrongAsset = await AssetFactory.deploy()
      await expect(
        wrongAsset.initialize(wrongToken.address, 'test', 'test', aggregateAccount.address)
      ).to.be.revertedWith('PLT:Decimals must be under 18')
    })
  })

  describe('aggregate account', function () {
    it('works', async function () {
      expect(await asset.aggregateAccount()).to.equal(aggregateAccount.address)
      const aggregateAccount2 = await setupAggregateAccount(owner, 'This is a test', false)
      await aggregateAccount2.deployTransaction.wait()
      await asset.connect(owner).setAggregateAccount(aggregateAccount2.address)
      expect(await asset.aggregateAccount()).to.equal(aggregateAccount2.address)
      expect(await aggregateAccount2.accountName()).to.be.equal('This is a test')

      // change name
      await aggregateAccount2.connect(owner).setAccountName('A different name')
      expect(await aggregateAccount2.accountName()).to.be.equal('A different name')
      expect(await asset.aggregateAccount()).to.equal(aggregateAccount2.address)
    })
  })

  describe('token', function () {
    it('works', async function () {
      expect(await asset.underlyingToken()).to.equal(token.address)
    })
  })

  describe('tokenDecimals', function () {
    it('works', async function () {
      expect(await asset.decimals()).to.equal(18)
    })
  })

  describe('tokenBalance', function () {
    it('works', async function () {
      expect(await asset.underlyingTokenBalance()).to.equal(toWei('0', 18))
      await token.transfer(asset.address, toWei('100', 18))
      expect(await asset.underlyingTokenBalance()).to.equal(toWei('100', 18))
    })
  })

  describe('transferToken', function () {
    it('works', async function () {
      await token.transfer(asset.address, toWei('100', 18))

      expect(await token.balanceOf(users[1].address)).to.equal(toWei('0', 18))
      await (await asset.connect(users[0])).transferUnderlyingToken(users[1].address, toWei('10', 18))
      expect(await token.balanceOf(users[1].address)).to.equal(toWei('10', 18))
      expect(await asset.underlyingTokenBalance()).to.equal(toWei('90', 18))
    })

    it('restricts to only pool', async function () {
      await expect(asset.transferUnderlyingToken(owner.address, toWei('100', 18))).to.be.revertedWith('PTL:FORBIDDEN')
    })
  })

  describe('mint', function () {
    it('works', async function () {
      expect(await asset.balanceOf(users[1].address)).to.equal(toWei('0', 18))
      await (await asset.connect(users[0])).mint(users[1].address, toWei('100', 18))
      expect(await asset.balanceOf(users[1].address)).to.equal(toWei('100', 18))
      expect(await asset.totalSupply()).to.equal(toWei('100', 18))
    })

    it('restricts to only pool', async function () {
      await expect(asset.mint(owner.address, toWei('100', 18))).to.be.revertedWith('PTL:FORBIDDEN')
    })

    it('respects max supply', async function () {
      const receipt = await asset.connect(owner).setMaxSupply(toWei('999', 18))
      expect(receipt).to.emit(asset, 'MaxSupplyUpdated').withArgs('0', toWei('999', 18))
      // console.log(await asset.totalSupply())
      await expect(asset.connect(users[0]).mint(owner.address, toWei('1000', 18))).to.be.revertedWith(
        'PTL:MAX_SUPPLY_REACHED'
      )
      expect(await asset.maxSupply()).to.be.equal(ethers.utils.parseEther('999'))
    })

    it('can mint when maxSupply is (uncaped) == 0', async function () {
      // first set max supply to any number
      const receipt1 = await asset.connect(owner).setMaxSupply(toWei('999', 18))
      expect(receipt1).to.emit(asset, 'MaxSupplyUpdated').withArgs('0', toWei('999', 18))

      // then set max supply to zero
      const receipt2 = await asset.connect(owner).setMaxSupply(toWei('0', 18))
      expect(await asset.maxSupply()).to.be.equal(ethers.utils.parseEther('0'))

      expect(receipt2).to.emit(asset, 'MaxSupplyUpdated').withArgs(toWei('999', 18), '0')

      await expect(asset.connect(users[0]).mint(owner.address, toWei('100000', 18))).to.be.ok
    })
  })

  describe('burn', function () {
    it('works', async function () {
      await (await asset.connect(users[0])).mint(users[1].address, toWei('100', 18))

      expect(await asset.balanceOf(users[1].address)).to.equal(toWei('100', 18))
      await (await asset.connect(users[0])).burn(users[1].address, toWei('50', 18))
      expect(await asset.balanceOf(users[1].address)).to.equal(toWei('50', 18))
      await (await asset.connect(users[0])).burn(users[1].address, toWei('50', 18))
      expect(await asset.balanceOf(users[1].address)).to.equal('0')
      expect(await asset.totalSupply()).to.equal(toWei('0', 18))
    })

    it('restricts to only pool', async function () {
      await expect((await asset.connect(owner)).burn(users[1].address, toWei('100', 18))).to.be.revertedWith(
        'PTL:FORBIDDEN'
      )
    })
  })

  describe('addCash', function () {
    it('works', async function () {
      expect(await asset.cash()).to.equal(toWei('0', 18))
      const receipt = await (await asset.connect(users[0])).addCash(toWei('100', 18))
      expect(await asset.cash()).to.equal(toWei('100', 18))
      expect(receipt).to.emit(asset, 'CashAdded').withArgs('0', toWei('100', 18))
    })

    it('restricts to only pool', async function () {
      await expect((await asset.connect(owner)).addCash(toWei('100', 18))).to.be.revertedWith('PTL:FORBIDDEN')
    })
  })

  describe('removeCash', function () {
    it('works', async function () {
      await (await asset.connect(users[0])).addCash(toWei('100', 18))

      expect(await asset.cash()).to.equal(toWei('100', 18))
      const receipt = await (await asset.connect(users[0])).removeCash(toWei('10', 18))
      expect(await asset.cash()).to.equal(toWei('90', 18))

      expect(receipt).to.emit(asset, 'CashRemoved').withArgs(toWei('100', 18), toWei('10', 18))

      await expect((await asset.connect(users[0])).removeCash(toWei('100', 18))).to.be.revertedWith(
        'PTL:INSUFFICIENT_CASH'
      )
    })

    it('restricts to only pool', async function () {
      await expect(asset.removeCash(toWei('100', 18))).to.be.revertedWith('PTL:FORBIDDEN')
    })
  })

  describe('addLiability', function () {
    it('works', async function () {
      expect(await asset.liability()).to.equal(toWei('0', 18))
      const receipt = await (await asset.connect(users[0])).addLiability(toWei('100', 18))
      expect(await asset.liability()).to.equal(toWei('100', 18))
      expect(receipt).to.emit(asset, 'LiabilityAdded').withArgs(toWei('0', 18), toWei('100', 18))
    })

    it('restricts to only pool', async function () {
      await expect(asset.addLiability(toWei('100', 18))).to.be.revertedWith('PTL:FORBIDDEN')
    })
  })

  describe('removeLiability', function () {
    it('works', async function () {
      const receipt1 = await (await asset.connect(users[0])).addLiability(toWei('100', 18))
      expect(receipt1).to.emit(asset, 'LiabilityAdded').withArgs(toWei('0', 18), toWei('100', 18))

      expect(await asset.liability()).to.equal(toWei('100', 18))
      const receipt2 = await await asset.connect(users[0]).removeLiability(toWei('10', 18))
      expect(await asset.liability()).to.equal(toWei('90', 18))

      expect(receipt2).to.emit(asset, 'LiabilityRemoved').withArgs(toWei('100', 18), toWei('10', 18))

      await expect((await asset.connect(users[0])).removeLiability(toWei('100', 18))).to.be.revertedWith(
        'PTL:INSUFFICIENT_LIABILITY'
      )
    })

    it('restricts to only pool', async function () {
      await expect(asset.removeLiability(toWei('100', 18))).to.be.revertedWith('PTL:FORBIDDEN')
    })
  })
})
