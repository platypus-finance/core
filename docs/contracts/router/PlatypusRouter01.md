# PlatypusRouter01

contracts/router/PlatypusRouter01.sol

> Title: PlatypusRouter01

> Notice: Allows routing on different platypus pools

> Details: Owner is allowed and required to approve token spending by pools via approveSpendingByPool function

## *event* OwnershipTransferred

***PlatypusRouter01.OwnershipTransferred(previousOwner, newOwner) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousOwner | address | indexed |
| newOwner | address | indexed |



## *function* approveSpendingByPool

***PlatypusRouter01.approveSpendingByPool(tokens, pool) ***

> Notice: approve spending of router tokens by pool

> Details: needs to be done after asset deployment for router to be able to support the tokens

Arguments

| **name** | **type** | **description** |
|-|-|-|
| tokens | address[] | array of tokens to be approved |
| pool | address | to be approved to spend |



## *function* owner

***PlatypusRouter01.owner() view***

> Details: Returns the address of the current owner.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* renounceOwnership

***PlatypusRouter01.renounceOwnership() ***

> Details: Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner.



## *function* swapTokensForTokens

***PlatypusRouter01.swapTokensForTokens(tokenPath, poolPath, fromAmount, minimumToAmount, to, deadline) ***

> Notice: swapExactTokensForTokens swaps

Arguments

| **name** | **type** | **description** |
|-|-|-|
| tokenPath | address[] | The first element of the path is the input token, the last element is the output token. |
| poolPath | address[] | An array of pool addresses. The pools where the pathTokens are contained in order. |
| fromAmount | uint256 | the amount in |
| minimumToAmount | uint256 | the minimum amount to get for user |
| to | address | the user to send the tokens to |
| deadline | uint256 | the deadline to respect |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amountOut | uint256 | received by user |
| haircut | uint256 | total fee charged by pool |



## *function* transferOwnership

***PlatypusRouter01.transferOwnership(newOwner) ***

> Details: Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| newOwner | address |  |


