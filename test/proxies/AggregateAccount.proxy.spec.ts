import { ethers, upgrades } from 'hardhat'
import chai from 'chai'
import { expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber } from 'ethers'

chai.use(solidity)

describe('Aggregate Account (proxy)', function () {
  let owner, users

  beforeEach(async function () {
    const [first, ...rest] = await ethers.getSigners()
    owner = first
    users = rest

    this.accountName = 'Example aggregate account name'
    this.isStable = true
  })

  describe('deploy', async function () {
    it('should deploy with correct name and isStable bool', async function () {
      const AggregateAccount = await ethers.getContractFactory('AggregateAccount')
      this.aggregateAccount = await upgrades.deployProxy(AggregateAccount, [this.accountName, this.isStable])
      await this.aggregateAccount.deployTransaction.wait()
      expect(await this.aggregateAccount.accountName()).to.equal(this.accountName)
      expect(await this.aggregateAccount.isStable()).to.equal(this.isStable)
    })

    it('should deploy with correct contract owner address', async function () {
      const AggregateAccount = await ethers.getContractFactory('AggregateAccount')
      this.aggregateAccount = await upgrades.deployProxy(AggregateAccount, [this.accountName, this.isStable])
      await this.aggregateAccount.deployTransaction.wait()
      expect(await this.aggregateAccount.owner()).to.equal(owner.address)
    })
  })

  describe('upgrade', async function () {
    it('should upgrade to keep correct smart contract address', async function () {
      const { aggregateAccount, aggregateAccount99 } = await deployAndUpgradeAggregate.call(this)
      expect(aggregateAccount.address).to.be.equal(aggregateAccount99.address)
    })

    it('should upgrade to keep contract owner address', async function () {
      const { aggregateAccount99 } = await deployAndUpgradeAggregate.call(this)
      expect(await aggregateAccount99.owner()).to.equal(users[0].address)
    })

    it('should upgrade to keep correct name', async function () {
      const { aggregateAccount99 } = await deployAndUpgradeAggregate.call(this)
      expect((await aggregateAccount99.accountName()).toString()).to.be.equal('Different')
    })

    it('should upgrade to correct asset contract version', async function () {
      const { aggregateAccount99 } = await deployAndUpgradeAggregate.call(this)
      expect((await aggregateAccount99.version()).toString()).to.be.equal(BigNumber.from(99))
    })

    async function deployAndUpgradeAggregate() {
      const { aggregateAccount } = await deployAggregate.call(this)
      const TestAggregateAccount99 = await ethers.getContractFactory('TestAggregateAccount99')
      const aggregateAccount99 = await upgrades.upgradeProxy(aggregateAccount.address, TestAggregateAccount99)
      return { aggregateAccount, aggregateAccount99 }
    }

    async function deployAggregate() {
      const AggregateAccount = await ethers.getContractFactory('AggregateAccount')
      const aggregateAccount = await upgrades.deployProxy(AggregateAccount, [this.accountName, true])
      await aggregateAccount.connect(owner).setAccountName('Different')
      await aggregateAccount.connect(owner).transferOwnership(users[0].address)

      return { aggregateAccount }
    }
  })
})
