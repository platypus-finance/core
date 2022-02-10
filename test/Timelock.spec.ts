import { constants } from '@openzeppelin/test-helpers'
import { ethers } from 'hardhat'
import { solidity } from 'ethereum-waffle'
import chai from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Contract, ContractFactory } from 'ethers'
import { BigNumber, BigNumberish } from 'ethers'
import { latest, increase, increaseTo } from './helpers/time'
import { parseEther } from '@ethersproject/units'
import { describe } from 'mocha'
import { setupAggregateAccount } from './helpers/helper'

export function toWei(amount: BigNumberish, tokenDecimals: BigNumberish): BigNumber {
  return ethers.utils.parseUnits(amount.toString(), tokenDecimals)
}
chai.use(solidity)
const { ZERO_BYTES32 } = constants
const { expect } = chai
const MINDELAY = 300 // 5min for testnet
const AbiCoder = new ethers.utils.AbiCoder()
function genOperation(target, value, data, predecessor, salt) {
  const id = ethers.utils.keccak256(
    AbiCoder.encode(['address', 'uint256', 'bytes', 'uint256', 'bytes32'], [target, value, data, predecessor, salt])
  )
  return { id, target, value, data, predecessor, salt }
}

function genOperationBatch(targets, values, datas, predecessor, salt) {
  const id = ethers.utils.keccak256(
    AbiCoder.encode(
      ['address[]', 'uint256[]', 'bytes[]', 'uint256', 'bytes32'],
      [targets, values, datas, predecessor, salt]
    )
  )
  return { id, targets, values, datas, predecessor, salt }
}
describe('Timelock', function () {
  //const [ admin, proposer, executor, other ] = accounts;
  let admin: SignerWithAddress
  let proposer: SignerWithAddress[]
  let executor: SignerWithAddress[]
  let other: SignerWithAddress
  let Timelock: ContractFactory

  beforeEach(async function () {
    // Deploy new timelock
    const signers = await ethers.getSigners()
    admin = signers[0]
    proposer = [signers[1]]
    executor = [signers[3], signers[4]]
    other = signers[5]
    Timelock = await ethers.getContractFactory('Timelock')
  })
  beforeEach(async function () {
    this.timelock = await Timelock.connect(admin).deploy(MINDELAY, [proposer[0].address], [executor[0].address])
    this.TIMELOCK_ADMIN_ROLE = await this.timelock.TIMELOCK_ADMIN_ROLE()
    this.PROPOSER_ROLE = await this.timelock.PROPOSER_ROLE()
    this.EXECUTOR_ROLE = await this.timelock.EXECUTOR_ROLE()
    await this.timelock.deployTransaction.wait()
  })

  it('initial state', async function () {
    expect(await this.timelock.getMinDelay()).to.be.equal(MINDELAY)
  })

  describe('methods', function () {
    describe('operation hashing', function () {
      it('hashOperation', async function () {
        this.operation = genOperation(
          '0x29cebefe301c6ce1bb36b58654fea275e1cacc83',
          '0xf94fdd6e21da21d2',
          '0xa3bc5104',
          '0xba41db3be0a9929145cfe480bd0f1f003689104d275ae912099f925df424ef94',
          '0x60d9109846ab510ed75c15f979ae366a8a2ace11d34ba9788c13ac296db50e6e'
        )
        expect(
          await this.timelock.hashOperation(
            this.operation.target,
            this.operation.value,
            this.operation.data,
            this.operation.predecessor,
            this.operation.salt
          )
        ).to.be.equal(this.operation.id)
      })

      it('hashOperationBatch', async function () {
        this.operation = genOperationBatch(
          Array(8).fill('0x2d5f21620e56531c1d59c2df9b8e95d129571f71'),
          Array(8).fill('0x2b993cfce932ccee'),
          Array(8).fill('0xcf51966b'),
          '0xce8f45069cc71d25f71ba05062de1a3974f9849b004de64a70998bca9d29c2e7',
          '0x8952d74c110f72bfe5accdf828c74d53a7dfb71235dfa8a1e8c75d8576b372ff'
        )
        expect(
          await this.timelock.hashOperationBatch(
            this.operation.targets,
            this.operation.values,
            this.operation.datas,
            this.operation.predecessor,
            this.operation.salt
          )
        ).to.be.equal(this.operation.id)
      })
    })

    describe('simple', function () {
      describe('schedule', function () {
        beforeEach(async function () {
          this.operation = genOperation(
            '0x31754f590B97fD975Eb86938f18Cc304E264D2F2',
            0,
            '0x3bf92ccc',
            ZERO_BYTES32,
            '0x025e7b0be353a74631ad648c667493c0e1cd31caa4cc2d3520fdc171ea0cc726'
          )
        })
        it('proposer can schedule', async function () {
          const receipt = await this.timelock
            .connect(proposer[0])
            .schedule(
              this.operation.target,
              this.operation.value,
              this.operation.data,
              this.operation.predecessor,
              this.operation.salt,
              MINDELAY
            )
          expect(receipt)
            .to.emit(this.timelock, 'CallScheduled')
            .withArgs(
              this.operation.id,
              BigNumber.from(0),
              this.operation.target,
              BigNumber.from,
              this.operation.data,
              this.operation.predecessor,
              MINDELAY
            )

          const block = await ethers.provider.getBlock(receipt.blockHash)

          expect(await this.timelock.getTimestamp(this.operation.id)).to.be.equal(
            BigNumber.from(block.timestamp).add(MINDELAY)
          )
        })

        it('prevent overwritting active operation', async function () {
          await this.timelock
            .connect(proposer[0])
            .schedule(
              this.operation.target,
              this.operation.value,
              this.operation.data,
              this.operation.predecessor,
              this.operation.salt,
              MINDELAY
            )

          await expect(
            this.timelock
              .connect(proposer[0])
              .schedule(
                this.operation.target,
                this.operation.value,
                this.operation.data,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY
              )
          ).to.be.revertedWith('TimelockController: operation already scheduled')
        })

        it('prevent non-proposer from commiting', async function () {
          await expect(
            this.timelock
              .connect(other)
              .schedule(
                this.operation.target,
                this.operation.value,
                this.operation.data,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY
              )
          ).to.be.revertedWith(
            `AccessControl: account ${other.address.toLowerCase()} is missing role ${this.PROPOSER_ROLE}`
          )
        })

        it('enforce minimum delay', async function () {
          await expect(
            this.timelock
              .connect(proposer[0])
              .schedule(
                this.operation.target,
                this.operation.value,
                this.operation.data,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY - 1
              )
          ).to.be.revertedWith('TimelockController: insufficient delay')
        })
      })
      describe('execute', function () {
        beforeEach(async function () {
          this.operation = genOperation(
            '0xAe22104DCD970750610E6FE15E623468A98b15f7',
            0,
            '0x13e414de',
            ZERO_BYTES32,
            '0xc1059ed2dc130227aa1d1d539ac94c641306905c020436c636e19e3fab56fc7f'
          )
        })

        it('revert if operation is not scheduled', async function () {
          await expect(
            this.timelock
              .connect(executor[0])
              .execute(
                this.operation.target,
                this.operation.value,
                this.operation.data,
                this.operation.predecessor,
                this.operation.salt
              )
          ).to.be.revertedWith('TimelockController: operation is not ready')
        })

        describe('with scheduled operation', function () {
          beforeEach(async function () {
            ;({ receipt: this.receipt, logs: this.logs } = await this.timelock
              .connect(proposer[0])
              .schedule(
                this.operation.target,
                this.operation.value,
                this.operation.data,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY
              ))
          })
          it('revert if execution comes too early 1/2', async function () {
            await expect(
              this.timelock
                .connect(executor[0])
                .execute(
                  this.operation.target,
                  this.operation.value,
                  this.operation.data,
                  this.operation.predecessor,
                  this.operation.salt
                )
            ).to.be.revertedWith('TimelockController: operation is not ready')
          })

          it('revert if execution comes too early 2/2', async function () {
            const timestamp = await this.timelock.getTimestamp(this.operation.id)
            const _now = await latest()
            await increase(Number(_now) - timestamp)
            await expect(
              this.timelock
                .connect(executor[0])
                .execute(
                  this.operation.target,
                  this.operation.value,
                  this.operation.data,
                  this.operation.predecessor,
                  this.operation.salt
                )
            ).to.be.revertedWith('TimelockController: operation is not ready')
          })
          describe('on time', function () {
            beforeEach(async function () {
              const timestamp = await this.timelock.getTimestamp(this.operation.id)
              await increaseTo(timestamp)
            })

            it('executor can reveal', async function () {
              const receipt = await this.timelock
                .connect(executor[0])
                .execute(
                  this.operation.target,
                  this.operation.value,
                  this.operation.data,
                  this.operation.predecessor,
                  this.operation.salt
                )
              expect(receipt)
                .to.be.emit(this.timelock, 'CallExecuted')
                .withArgs(
                  this.operation.id,
                  BigNumber.from(0),
                  this.operation.target,
                  BigNumber.from(this.operation.value),
                  this.operation.data
                )
            })

            it('prevent non-executor from revealing', async function () {
              await expect(
                this.timelock
                  .connect(other)
                  .execute(
                    this.operation.target,
                    this.operation.value,
                    this.operation.data,
                    this.operation.predecessor,
                    this.operation.salt
                  )
              ).to.be.revertedWith(
                `AccessControl: account ${other.address.toLowerCase()} is missing role ${this.EXECUTOR_ROLE}`
              )
            })
          })
        })
      })
    })

    describe('batch', function () {
      describe('schedule', function () {
        beforeEach(async function () {
          this.operation = genOperationBatch(
            Array(8).fill('0xEd912250835c812D4516BBD80BdaEA1bB63a293C'),
            Array(8).fill(0),
            Array(8).fill('0x2fcb7a88'),
            ZERO_BYTES32,
            '0x6cf9d042ade5de78bed9ffd075eb4b2a4f6b1736932c2dc8af517d6e066f51f5'
          )
        })

        it('proposer can schedule', async function () {
          const receipt = await this.timelock
            .connect(proposer[0])
            .scheduleBatch(
              this.operation.targets,
              this.operation.values,
              this.operation.datas,
              this.operation.predecessor,
              this.operation.salt,
              MINDELAY
            )
          for (const i in this.operation.targets) {
            expect(receipt)
              .to.be.emit(this.timelock, 'CallScheduled')
              .withArgs(
                this.operation.id,
                BigNumber.from(i),
                this.operation.targets[i],
                BigNumber.from(this.operation.values[i]),
                this.operation.datas[i],
                this.operation.predecessor,
                MINDELAY
              )
          }

          const block = await ethers.provider.getBlock(receipt.blockHash)

          expect(await this.timelock.getTimestamp(this.operation.id)).to.be.equal(
            BigNumber.from(block.timestamp).add(MINDELAY)
          )
        })

        it('prevent overwritting active operation', async function () {
          await this.timelock
            .connect(proposer[0])
            .scheduleBatch(
              this.operation.targets,
              this.operation.values,
              this.operation.datas,
              this.operation.predecessor,
              this.operation.salt,
              MINDELAY
            )

          await expect(
            this.timelock
              .connect(proposer[0])
              .scheduleBatch(
                this.operation.targets,
                this.operation.values,
                this.operation.datas,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY
              )
          ).to.be.revertedWith('TimelockController: operation already scheduled')
        })

        it('length of batch parameter must match #1', async function () {
          await expect(
            this.timelock
              .connect(proposer[0])
              .scheduleBatch(
                this.operation.targets,
                [],
                this.operation.datas,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY
              )
          ).to.be.revertedWith('TimelockController: length mismatch')
        })

        it('length of batch parameter must match #1', async function () {
          await expect(
            this.timelock
              .connect(proposer[0])
              .scheduleBatch(
                this.operation.targets,
                this.operation.values,
                [],
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY
              )
          ).to.be.revertedWith('TimelockController: length mismatch')
        })

        it('prevent non-proposer from commiting', async function () {
          await expect(
            this.timelock
              .connect(other)
              .scheduleBatch(
                this.operation.targets,
                this.operation.values,
                this.operation.datas,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY
              )
          ).to.be.revertedWith(
            `AccessControl: account ${other.address.toLowerCase()} is missing role ${this.PROPOSER_ROLE}`
          )
        })

        it('enforce minimum delay', async function () {
          await expect(
            this.timelock
              .connect(proposer[0])
              .scheduleBatch(
                this.operation.targets,
                this.operation.values,
                this.operation.datas,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY - 1
              )
          ).to.be.revertedWith('TimelockController: insufficient delay')
        })
      })

      describe('execute', function () {
        beforeEach(async function () {
          this.operation = genOperationBatch(
            Array(8).fill('0x76E53CcEb05131Ef5248553bEBDb8F70536830b1'),
            Array(8).fill(0),
            Array(8).fill('0x58a60f63'),
            ZERO_BYTES32,
            '0x9545eeabc7a7586689191f78a5532443698538e54211b5bd4d7dc0fc0102b5c7'
          )
        })
        it('revert if operation is not scheduled', async function () {
          await expect(
            this.timelock
              .connect(executor[0])
              .executeBatch(
                this.operation.targets,
                this.operation.values,
                this.operation.datas,
                this.operation.predecessor,
                this.operation.salt
              )
          ).to.be.revertedWith('TimelockController: operation is not ready')
        })
        describe('with scheduled operation', function () {
          beforeEach(async function () {
            ;({ receipt: this.receipt, logs: this.logs } = await this.timelock
              .connect(proposer[0])
              .scheduleBatch(
                this.operation.targets,
                this.operation.values,
                this.operation.datas,
                this.operation.predecessor,
                this.operation.salt,
                MINDELAY
              ))
          })

          it('revert if execution comes too early 1/2', async function () {
            await expect(
              this.timelock
                .connect(executor[0])
                .executeBatch(
                  this.operation.targets,
                  this.operation.values,
                  this.operation.datas,
                  this.operation.predecessor,
                  this.operation.salt
                )
            ).to.be.revertedWith('TimelockController: operation is not ready')
          })

          it('revert if execution comes too early 2/2', async function () {
            const timestamp = await this.timelock.getTimestamp(this.operation.id)
            await increaseTo(timestamp - 5)
            await expect(
              this.timelock
                .connect(executor[0])
                .executeBatch(
                  this.operation.targets,
                  this.operation.values,
                  this.operation.datas,
                  this.operation.predecessor,
                  this.operation.salt
                )
            ).to.be.revertedWith('TimelockController: operation is not ready')
          })
          describe('on time', function () {
            beforeEach(async function () {
              const timestamp = await this.timelock.getTimestamp(this.operation.id)
              await increaseTo(timestamp)
            })

            it('executor can reveal', async function () {
              const receipt = await this.timelock
                .connect(executor[0])
                .executeBatch(
                  this.operation.targets,
                  this.operation.values,
                  this.operation.datas,
                  this.operation.predecessor,
                  this.operation.salt
                )

              for (const i in this.operation.targets) {
                expect(receipt, this.timelock)
                  .to.be.emit(this.timelock, 'CallExecuted')
                  .withArgs(
                    this.operation.id,
                    BigNumber.from(i),
                    this.operation.targets[i],
                    BigNumber.from(this.operation.values[i]),
                    this.operation.datas[i]
                  )
              }
            })

            it('prevent non-executor from revealing', async function () {
              await expect(
                this.timelock
                  .connect(other)
                  .executeBatch(
                    this.operation.targets,
                    this.operation.values,
                    this.operation.datas,
                    this.operation.predecessor,
                    this.operation.salt
                  )
              ).to.be.revertedWith(
                `AccessControl: account ${other.address.toLowerCase()} is missing role ${this.EXECUTOR_ROLE}`
              )
            })

            it('length mismatch #1', async function () {
              await expect(
                this.timelock
                  .connect(executor[0])
                  .executeBatch(
                    [],
                    this.operation.values,
                    this.operation.datas,
                    this.operation.predecessor,
                    this.operation.salt
                  )
              ).to.be.revertedWith('TimelockController: length mismatch')
            })

            it('length mismatch #2', async function () {
              await expect(
                this.timelock
                  .connect(executor[0])
                  .executeBatch(
                    this.operation.targets,
                    [],
                    this.operation.datas,
                    this.operation.predecessor,
                    this.operation.salt
                  )
              ).to.be.revertedWith('TimelockController: length mismatch')
            })

            it('length mismatch #3', async function () {
              await expect(
                this.timelock
                  .connect(executor[0])
                  .executeBatch(
                    this.operation.targets,
                    this.operation.values,
                    [],
                    this.operation.predecessor,
                    this.operation.salt
                  )
              ).to.be.revertedWith('TimelockController: length mismatch')
            })
          })
        })
      })
    })
    describe('cancel', function () {
      beforeEach(async function () {
        this.operation = genOperation(
          '0xC6837c44AA376dbe1d2709F13879E040CAb653ca',
          0,
          '0x296e58dd',
          ZERO_BYTES32,
          '0xa2485763600634800df9fc9646fb2c112cf98649c55f63dd1d9c7d13a64399d9'
        )
        ;({ receipt: this.receipt, logs: this.logs } = await this.timelock
          .connect(proposer[0])
          .schedule(
            this.operation.target,
            this.operation.value,
            this.operation.data,
            this.operation.predecessor,
            this.operation.salt,
            MINDELAY
          ))
      })

      it('proposer can cancel', async function () {
        const receipt = await this.timelock.connect(proposer[0]).cancel(this.operation.id)
        expect(receipt).to.be.emit(this.timelock, 'Cancelled').withArgs(this.operation.id)
      })

      it('cannot cancel invalid operation', async function () {
        await expect(this.timelock.connect(proposer[0]).cancel(constants.ZERO_BYTES32)).to.be.revertedWith(
          'TimelockController: operation cannot be cancelled'
        )
      })

      it('prevent non-proposer from canceling', async function () {
        await expect(this.timelock.connect(other).cancel(this.operation.id)).to.be.revertedWith(
          `AccessControl: account ${other.address.toLowerCase()} is missing role ${this.PROPOSER_ROLE}`
        )
      })
    })
  })

  describe('maintenance', function () {
    it('prevent unauthorized maintenance', async function () {
      await expect(this.timelock.connect(other).updateDelay(0)).to.be.revertedWith(
        'TimelockController: caller must be timelock'
      )
    })

    it('timelock scheduled maintenance', async function () {
      const newDelay = 60 * 60 * 6

      const callData = this.timelock.interface.encodeFunctionData('updateDelay', [BigNumber.from(newDelay)])
      const operation = genOperation(
        this.timelock.address,
        0,
        callData,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )

      await this.timelock
        .connect(proposer[0])
        .schedule(operation.target, operation.value, operation.data, operation.predecessor, operation.salt, MINDELAY)
      await increase(MINDELAY)

      const receipt = await this.timelock
        .connect(executor[0])
        .execute(operation.target, operation.value, operation.data, operation.predecessor, operation.salt)
      expect(receipt).to.be.emit(this.timelock, 'MinDelayChange').withArgs(MINDELAY, newDelay)
      expect(await this.timelock.getMinDelay()).to.be.equal(newDelay)
    })
  })

  describe('dependency', function () {
    beforeEach(async function () {
      this.operation1 = genOperation(
        '0xdE66bD4c97304200A95aE0AadA32d6d01A867E39',
        0,
        '0x01dc731a',
        ZERO_BYTES32,
        '0x64e932133c7677402ead2926f86205e2ca4686aebecf5a8077627092b9bb2feb'
      )
      this.operation2 = genOperation(
        '0x3c7944a3F1ee7fc8c5A5134ba7c79D11c3A1FCa3',
        0,
        '0x8f531849',
        this.operation1.id,
        '0x036e1311cac523f9548e6461e29fb1f8f9196b91910a41711ea22f5de48df07d'
      )
      await this.timelock
        .connect(proposer[0])
        .schedule(
          this.operation1.target,
          this.operation1.value,
          this.operation1.data,
          this.operation1.predecessor,
          this.operation1.salt,
          MINDELAY
        )
      await this.timelock
        .connect(proposer[0])
        .schedule(
          this.operation2.target,
          this.operation2.value,
          this.operation2.data,
          this.operation2.predecessor,
          this.operation2.salt,
          MINDELAY
        )
      // await time.increase(MINDELAY)
      await increase(MINDELAY)
    })

    it('cannot execute before dependency', async function () {
      await expect(
        this.timelock
          .connect(executor[0])
          .execute(
            this.operation2.target,
            this.operation2.value,
            this.operation2.data,
            this.operation2.predecessor,
            this.operation2.salt
          )
      ).to.be.revertedWith('TimelockController: missing dependency')
    })

    it('can execute after dependency', async function () {
      await this.timelock
        .connect(executor[0])
        .execute(
          this.operation1.target,
          this.operation1.value,
          this.operation1.data,
          this.operation1.predecessor,
          this.operation1.salt
        )
      await this.timelock
        .connect(executor[0])
        .execute(
          this.operation2.target,
          this.operation2.value,
          this.operation2.data,
          this.operation2.predecessor,
          this.operation2.salt
        )
    })
  })
})
describe('Pool', function () {
  let Pool: ContractFactory
  let TestWAVAX: ContractFactory
  let Timelock: ContractFactory
  let signers: SignerWithAddress[]
  let owner: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let carol: SignerWithAddress
  let proposer: SignerWithAddress[]
  let executor: SignerWithAddress[]

  beforeEach(async function () {
    Pool = await ethers.getContractFactory('Pool')
    TestWAVAX = await ethers.getContractFactory('TestWAVAX')
    Timelock = await ethers.getContractFactory('Timelock')
    signers = await ethers.getSigners()
    owner = signers[0]
    alice = signers[1]
    bob = signers[2]
    carol = signers[3]
    proposer = [signers[4]]
    executor = [signers[5]]
  })
  beforeEach(async function () {
    this.timelock = await Timelock.connect(owner).deploy(MINDELAY, [proposer[0].address], [executor[0].address])
    this.TIMELOCK_ADMIN_ROLE = await this.timelock.TIMELOCK_ADMIN_ROLE()
    this.PROPOSER_ROLE = await this.timelock.PROPOSER_ROLE()
    this.EXECUTOR_ROLE = await this.timelock.EXECUTOR_ROLE()
    await this.timelock.deployTransaction.wait()
  })
  beforeEach(async function () {
    this.pool = await Pool.deploy()
    this.TestWAVAX = await TestWAVAX.deploy()
    await this.pool.deployTransaction.wait()
    await this.pool.connect(owner).initialize()
  })
  describe('simple', async function () {
    it('should not allow non-owner to do operation', async function () {
      await this.pool.transferOwnership(this.timelock.address)
      await expect(this.pool.transferOwnership(alice.address)).to.be.revertedWith('Ownable: caller is not the owner')
      await expect(this.pool.connect(alice).transferOwnership(carol.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
      const callData = this.pool.interface.encodeFunctionData('transferOwnership', [carol.address])
      const operation = genOperation(
        this.pool.address,
        0,
        callData,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )
      await expect(
        this.timelock
          .connect(alice)
          .schedule(operation.target, operation.value, operation.data, operation.predecessor, operation.salt, MINDELAY)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${this.PROPOSER_ROLE}`
      )
    })
    it('should do timelock thing 1/3', async function () {
      await this.pool.transferOwnership(this.timelock.address)
      const callData = this.pool.interface.encodeFunctionData('transferOwnership', [bob.address])
      const operation = genOperation(
        this.pool.address,
        0,
        callData,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )
      this.timelock
        .connect(proposer[0])
        .schedule(operation.target, operation.value, operation.data, operation.predecessor, operation.salt, MINDELAY)
      const eta = Number(await latest()) + MINDELAY
      await increaseTo(eta)
      await this.timelock
        .connect(executor[0])
        .execute(operation.target, operation.value, operation.data, operation.predecessor, operation.salt)
      expect(await this.pool.owner()).to.equal(bob.address)
    })
    it('should do timelock thing 2/3', async function () {
      const receipt = await this.pool.connect(owner).setHaircutRate(parseEther('0.3'))
      expect(await this.pool.connect(owner).getHaircutRate()).to.be.equal(parseEther('0.3'))
      expect(receipt).to.emit(this.pool, 'HaircutRateUpdated').withArgs(parseEther('0.0004'), parseEther('0.3'))
      await this.pool.connect(owner).transferOwnership(this.timelock.address)
      await expect(this.pool.connect(owner).setHaircutRate(parseEther('0.3'))).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })
    it('should do timelock thing 3/3', async function () {
      await this.pool.transferOwnership(this.timelock.address)
      expect(await this.pool.owner()).to.equal(this.timelock.address)
      const callData = this.pool.interface.encodeFunctionData('setDev', [bob.address])
      const operation = genOperation(
        this.pool.address,
        0,
        callData,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )
      this.timelock
        .connect(proposer[0])
        .schedule(operation.target, operation.value, operation.data, operation.predecessor, operation.salt, MINDELAY)
      const eta = Number(await latest()) + MINDELAY
      await increaseTo(eta)
      await this.timelock
        .connect(executor[0])
        .execute(operation.target, operation.value, operation.data, operation.predecessor, operation.salt)
      expect(await this.pool.getDev()).to.equal(bob.address)
      const callData2 = this.pool.interface.encodeFunctionData('setHaircutRate', [parseEther('0.3')])
      const operation2 = genOperation(
        this.pool.address,
        0,
        callData2,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )
      this.timelock
        .connect(proposer[0])
        .schedule(
          operation2.target,
          operation2.value,
          operation2.data,
          operation2.predecessor,
          operation2.salt,
          MINDELAY
        )
      const eta2 = Number(await latest()) + MINDELAY
      await increaseTo(eta2)
      const receipt = await this.timelock
        .connect(executor[0])
        .execute(operation2.target, operation2.value, operation2.data, operation2.predecessor, operation2.salt)
      expect(receipt).to.be.emit(this.pool, 'HaircutRateUpdated').withArgs(parseEther('0.0004'), parseEther('0.3'))
      expect(await this.pool.getHaircutRate()).to.equal(parseEther('0.3'))
    })
  })
})

describe('Asset', function () {
  let token: Contract
  let asset: Contract
  let aggregateAccount: Contract
  let Timelock: ContractFactory
  let signers: SignerWithAddress[]
  let owner: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let carol: SignerWithAddress
  let proposer: SignerWithAddress[]
  let executor: SignerWithAddress[]
  beforeEach(async function () {
    signers = await ethers.getSigners()
    owner = signers[0]
    alice = signers[1]
    bob = signers[2]
    carol = signers[3]
    proposer = [signers[4]]
    executor = [signers[5]]

    const AssetFactory = await ethers.getContractFactory('Asset')
    const TestERC20Factory = await ethers.getContractFactory('TestERC20')
    Timelock = await ethers.getContractFactory('Timelock')
    token = await TestERC20Factory.deploy('ERC20 Token', 'ERC', 18, toWei('10000000', 18))

    await token.deployTransaction.wait()

    aggregateAccount = await setupAggregateAccount(owner, 'ERC20 Token', false)
    await aggregateAccount.deployTransaction.wait()

    asset = await AssetFactory.deploy()
    await asset.initialize(token.address, 'test', 'test', aggregateAccount.address)

    await asset.deployTransaction.wait()

    await asset.setPool(owner.address)
  })
  beforeEach(async function () {
    this.timelock = await Timelock.connect(owner).deploy(MINDELAY, [proposer[0].address], [executor[0].address])
    this.TIMELOCK_ADMIN_ROLE = await this.timelock.TIMELOCK_ADMIN_ROLE()
    this.PROPOSER_ROLE = await this.timelock.PROPOSER_ROLE()
    this.EXECUTOR_ROLE = await this.timelock.EXECUTOR_ROLE()
    await this.timelock.deployTransaction.wait()
  })
  describe('simple', async function () {
    it('show not allow non-owner to do operation', async function () {
      await asset.connect(owner).transferOwnership(this.timelock.address)
      await expect(asset.connect(owner).transferOwnership(alice.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
      await expect(asset.connect(alice).transferOwnership(carol.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
      const callData = asset.interface.encodeFunctionData('transferOwnership', [carol.address])
      const operation = genOperation(
        asset.address,
        0,
        callData,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )
      await expect(
        this.timelock
          .connect(alice)
          .schedule(operation.target, operation.value, operation.data, operation.predecessor, operation.salt, MINDELAY)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${this.PROPOSER_ROLE}`
      )
    })
    it('should do timelock thing 1/3', async function () {
      await asset.transferOwnership(this.timelock.address)
      const callData = asset.interface.encodeFunctionData('transferOwnership', [bob.address])
      const operation = genOperation(
        asset.address,
        0,
        callData,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )
      this.timelock
        .connect(proposer[0])
        .schedule(operation.target, operation.value, operation.data, operation.predecessor, operation.salt, MINDELAY)
      const eta = Number(await latest()) + MINDELAY
      await increaseTo(eta)
      await this.timelock
        .connect(executor[0])
        .execute(operation.target, operation.value, operation.data, operation.predecessor, operation.salt)
      expect(await asset.owner()).to.equal(bob.address)
    })
    it('should do timelock thing 2/3', async function () {
      const receipt = await asset.setPool(alice.address)
      expect(await asset.pool()).to.equal(alice.address)
      expect(receipt).to.emit(asset, 'PoolUpdated').withArgs(owner.address, alice.address)
      await asset.connect(owner).transferOwnership(this.timelock.address)
      await expect(asset.connect(owner).setPool(bob.address)).to.be.revertedWith('Ownable: caller is not the owner')
    })
    it('should do timelock thing 3/3', async function () {
      await asset.transferOwnership(this.timelock.address)
      expect(await asset.owner()).to.equal(this.timelock.address)
      const callData = asset.interface.encodeFunctionData('setPool', [bob.address])
      const operation = genOperation(
        asset.address,
        0,
        callData,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )
      this.timelock
        .connect(proposer[0])
        .schedule(operation.target, operation.value, operation.data, operation.predecessor, operation.salt, MINDELAY)
      const eta = Number(await latest()) + MINDELAY
      await increaseTo(eta)
      await this.timelock
        .connect(executor[0])
        .execute(operation.target, operation.value, operation.data, operation.predecessor, operation.salt)
      expect(await asset.pool()).to.equal(bob.address)
      const callData2 = asset.interface.encodeFunctionData('setPool', [carol.address])
      const operation2 = genOperation(
        asset.address,
        0,
        callData2,
        ZERO_BYTES32,
        '0xf8e775b2c5f4d66fb5c7fa800f35ef518c262b6014b3c0aee6ea21bff157f108'
      )
      this.timelock
        .connect(proposer[0])
        .schedule(
          operation2.target,
          operation2.value,
          operation2.data,
          operation2.predecessor,
          operation2.salt,
          MINDELAY
        )
      const eta2 = Number(await latest()) + MINDELAY
      await increaseTo(eta2)
      const receipt = await this.timelock
        .connect(executor[0])
        .execute(operation2.target, operation2.value, operation2.data, operation2.predecessor, operation2.salt)
      expect(receipt).to.be.emit(asset, 'PoolUpdated').withArgs(bob.address, carol.address)
      expect(await asset.pool()).to.equal(carol.address)
    })
  })
})
