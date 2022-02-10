# Timelock

contracts/governance/Timelock.sol

## *constructor*

***constructor(minDelay, proposers, executors)***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| minDelay | uint256 |  |
| proposers | address[] |  |
| executors | address[] |  |



## *event* CallExecuted

***Timelock.CallExecuted(id, index, target, value, data) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 | indexed |
| index | uint256 | indexed |
| target | address | not indexed |
| value | uint256 | not indexed |
| data | bytes | not indexed |



## *event* CallScheduled

***Timelock.CallScheduled(id, index, target, value, data, predecessor, delay) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 | indexed |
| index | uint256 | indexed |
| target | address | not indexed |
| value | uint256 | not indexed |
| data | bytes | not indexed |
| predecessor | bytes32 | not indexed |
| delay | uint256 | not indexed |



## *event* Cancelled

***Timelock.Cancelled(id) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 | indexed |



## *event* MinDelayChange

***Timelock.MinDelayChange(oldDuration, newDuration) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| oldDuration | uint256 | not indexed |
| newDuration | uint256 | not indexed |



## *event* RoleAdminChanged

***Timelock.RoleAdminChanged(role, previousAdminRole, newAdminRole) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| role | bytes32 | indexed |
| previousAdminRole | bytes32 | indexed |
| newAdminRole | bytes32 | indexed |



## *event* RoleGranted

***Timelock.RoleGranted(role, account, sender) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| role | bytes32 | indexed |
| account | address | indexed |
| sender | address | indexed |



## *event* RoleRevoked

***Timelock.RoleRevoked(role, account, sender) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| role | bytes32 | indexed |
| account | address | indexed |
| sender | address | indexed |



## *function* DEFAULT_ADMIN_ROLE

***Timelock.DEFAULT_ADMIN_ROLE() view***

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bytes32 |  |



## *function* EXECUTOR_ROLE

***Timelock.EXECUTOR_ROLE() view***

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bytes32 |  |



## *function* PROPOSER_ROLE

***Timelock.PROPOSER_ROLE() view***

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bytes32 |  |



## *function* TIMELOCK_ADMIN_ROLE

***Timelock.TIMELOCK_ADMIN_ROLE() view***

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bytes32 |  |



## *function* cancel

***Timelock.cancel(id) ***

> Details: Cancel an operation. Requirements: - the caller must have the 'proposer' role.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 |  |



## *function* execute

***Timelock.execute(target, value, data, predecessor, salt) payable***

> Details: Execute an (ready) operation containing a single transaction. Emits a {CallExecuted} event. Requirements: - the caller must have the 'executor' role.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| target | address |  |
| value | uint256 |  |
| data | bytes |  |
| predecessor | bytes32 |  |
| salt | bytes32 |  |



## *function* executeBatch

***Timelock.executeBatch(targets, values, datas, predecessor, salt) payable***

> Details: Execute an (ready) operation containing a batch of transactions. Emits one {CallExecuted} event per transaction in the batch. Requirements: - the caller must have the 'executor' role.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| targets | address[] |  |
| values | uint256[] |  |
| datas | bytes[] |  |
| predecessor | bytes32 |  |
| salt | bytes32 |  |



## *function* getMinDelay

***Timelock.getMinDelay() view***

> Details: Returns the minimum delay for an operation to become valid. This value can be changed by executing an operation that calls `updateDelay`.

Outputs

| **name** | **type** | **description** |
|-|-|-|
| duration | uint256 |  |



## *function* getRoleAdmin

***Timelock.getRoleAdmin(role) view***

> Details: Returns the admin role that controls `role`. See {grantRole} and {revokeRole}. To change a role's admin, use {_setRoleAdmin}.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| role | bytes32 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bytes32 |  |



## *function* getTimestamp

***Timelock.getTimestamp(id) view***

> Details: Returns the timestamp at with an operation becomes ready (0 for unset operations, 1 for done operations).

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| timestamp | uint256 |  |



## *function* grantRole

***Timelock.grantRole(role, account) ***

> Details: Grants `role` to `account`. If `account` had not been already granted `role`, emits a {RoleGranted} event. Requirements: - the caller must have ``role``'s admin role.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| role | bytes32 |  |
| account | address |  |



## *function* hasRole

***Timelock.hasRole(role, account) view***

> Details: Returns `true` if `account` has been granted `role`.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| role | bytes32 |  |
| account | address |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* hashOperation

***Timelock.hashOperation(target, value, data, predecessor, salt) ***

> Details: Returns the identifier of an operation containing a single transaction.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| target | address |  |
| value | uint256 |  |
| data | bytes |  |
| predecessor | bytes32 |  |
| salt | bytes32 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| hash | bytes32 |  |



## *function* hashOperationBatch

***Timelock.hashOperationBatch(targets, values, datas, predecessor, salt) ***

> Details: Returns the identifier of an operation containing a batch of transactions.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| targets | address[] |  |
| values | uint256[] |  |
| datas | bytes[] |  |
| predecessor | bytes32 |  |
| salt | bytes32 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| hash | bytes32 |  |



## *function* isOperation

***Timelock.isOperation(id) view***

> Details: Returns whether an id correspond to a registered operation. This includes both Pending, Ready and Done operations.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| pending | bool |  |



## *function* isOperationDone

***Timelock.isOperationDone(id) view***

> Details: Returns whether an operation is done or not.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| done | bool |  |



## *function* isOperationPending

***Timelock.isOperationPending(id) view***

> Details: Returns whether an operation is pending or not.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| pending | bool |  |



## *function* isOperationReady

***Timelock.isOperationReady(id) view***

> Details: Returns whether an operation is ready or not.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| id | bytes32 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| ready | bool |  |



## *function* renounceRole

***Timelock.renounceRole(role, account) ***

> Details: Revokes `role` from the calling account. Roles are often managed via {grantRole} and {revokeRole}: this function's purpose is to provide a mechanism for accounts to lose their privileges if they are compromised (such as when a trusted device is misplaced). If the calling account had been granted `role`, emits a {RoleRevoked} event. Requirements: - the caller must be `account`.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| role | bytes32 |  |
| account | address |  |



## *function* revokeRole

***Timelock.revokeRole(role, account) ***

> Details: Revokes `role` from `account`. If `account` had been granted `role`, emits a {RoleRevoked} event. Requirements: - the caller must have ``role``'s admin role.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| role | bytes32 |  |
| account | address |  |



## *function* schedule

***Timelock.schedule(target, value, data, predecessor, salt, delay) ***

> Details: Schedule an operation containing a single transaction. Emits a {CallScheduled} event. Requirements: - the caller must have the 'proposer' role.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| target | address |  |
| value | uint256 |  |
| data | bytes |  |
| predecessor | bytes32 |  |
| salt | bytes32 |  |
| delay | uint256 |  |



## *function* scheduleBatch

***Timelock.scheduleBatch(targets, values, datas, predecessor, salt, delay) ***

> Details: Schedule an operation containing a batch of transactions. Emits one {CallScheduled} event per transaction in the batch. Requirements: - the caller must have the 'proposer' role.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| targets | address[] |  |
| values | uint256[] |  |
| datas | bytes[] |  |
| predecessor | bytes32 |  |
| salt | bytes32 |  |
| delay | uint256 |  |



## *function* supportsInterface

***Timelock.supportsInterface(interfaceId) view***

> Details: See {IERC165-supportsInterface}.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| interfaceId | bytes4 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* updateDelay

***Timelock.updateDelay(newDelay) ***

> Details: Changes the minimum timelock duration for future operations. Emits a {MinDelayChange} event. Requirements: - the caller must be the timelock itself. This can only be achieved by scheduling and later executing an operation where the timelock is the target and the data is the ABI-encoded call to this function.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| newDelay | uint256 |  |


