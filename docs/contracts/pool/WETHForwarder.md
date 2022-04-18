# WETHForwarder

contracts/pool/WETHForwarder.sol

> Title: WETHForwarder

> Notice: Temporary WAVAX holder

> Details: Unwraps and forwards actual AVAX to userAllows transfer of WAVAX (called `weth` here).

## *constructor*

***constructor(weth_)***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| weth_ | address |  |



## *event* OwnershipTransferred

***WETHForwarder.OwnershipTransferred(previousOwner, newOwner) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousOwner | address | indexed |
| newOwner | address | indexed |



## *event* PoolUpdated

***WETHForwarder.PoolUpdated(previousPool, newPool) ***

> Notice: An event thats emitted when pool is updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousPool | address | indexed |
| newPool | address | indexed |



## *function* owner

***WETHForwarder.owner() view***

> Details: Returns the address of the current owner.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* pool

***WETHForwarder.pool() view***

> Notice: Pool address

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* renounceOwnership

***WETHForwarder.renounceOwnership() ***

> Details: Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner.



## *function* setPool

***WETHForwarder.setPool(pool_) ***

> Notice: Changes the pool. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| pool_ | address | new contract pool address |



## *function* transferOwnership

***WETHForwarder.transferOwnership(newOwner) ***

> Details: Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| newOwner | address |  |



## *function* unwrapAndTransfer

***WETHForwarder.unwrapAndTransfer(to, amount) ***

> Notice: Unwrap and transfer eth. Can only be called by pool

Arguments

| **name** | **type** | **description** |
|-|-|-|
| to | address | address receiving |
| amount | uint256 | total amount to be transferred |



## *function* weth

***WETHForwarder.weth() view***

> Notice: Weth (or wavax in our case) address

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |


