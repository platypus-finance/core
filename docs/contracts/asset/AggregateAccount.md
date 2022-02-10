# AggregateAccount

contracts/asset/AggregateAccount.sol

> Title: AggregateAccount

> Notice: AggregateAccount represents groups of assets

> Details: Aggregate Account has to be set for Asset

## *event* OwnershipTransferred

***AggregateAccount.OwnershipTransferred(previousOwner, newOwner) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousOwner | address | indexed |
| newOwner | address | indexed |



## *stateVariable* isStable

***AggregateAccount.isStable() view***

> Notice: true if the assets represented by the aggregate are stablecoins

> Details: will be needed for interpool swapping

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* accountName

***AggregateAccount.accountName() view***

> Notice: name of the account. E.g BTC for aggregate account containing zBTC, BTC.e, ETH etc.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | string |  |



## *function* initialize

***AggregateAccount.initialize(accountName_, isStable_) ***

> Notice: Initializer.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| accountName_ | string | The name of the aggregate account |
| isStable_ | bool | Tells if this aggregate holds stable assets or not |



## *function* owner

***AggregateAccount.owner() view***

> Details: Returns the address of the current owner.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* renounceOwnership

***AggregateAccount.renounceOwnership() ***

> Details: Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner.



## *function* setAccountName

***AggregateAccount.setAccountName(accountName_) ***

> Notice: Changes Account Name. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| accountName_ | string | the new name |



## *function* transferOwnership

***AggregateAccount.transferOwnership(newOwner) ***

> Details: Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| newOwner | address |  |


