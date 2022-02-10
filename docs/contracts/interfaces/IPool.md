# IPool

contracts/interfaces/IPool.sol

## *function* assetOf

***IPool.assetOf(token) view***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* deposit

***IPool.deposit(token, amount, to, deadline) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address |  |
| amount | uint256 |  |
| to | address |  |
| deadline | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| liquidity | uint256 |  |



## *function* getTokenAddresses

***IPool.getTokenAddresses() view***

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address[] |  |



## *function* quoteMaxInitialAssetWithdrawable

***IPool.quoteMaxInitialAssetWithdrawable(initialToken, wantedToken) view***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| initialToken | address |  |
| wantedToken | address |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| maxInitialAssetAmount | uint256 |  |



## *function* quotePotentialSwap

***IPool.quotePotentialSwap(fromToken, toToken, fromAmount) view***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| fromToken | address |  |
| toToken | address |  |
| fromAmount | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| potentialOutcome | uint256 |  |
| haircut | uint256 |  |



## *function* quotePotentialWithdraw

***IPool.quotePotentialWithdraw(token, liquidity) view***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address |  |
| liquidity | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 |  |
| fee | uint256 |  |
| enoughCash | bool |  |



## *function* quotePotentialWithdrawFromOtherAsset

***IPool.quotePotentialWithdrawFromOtherAsset(initialToken, wantedToken, liquidity) view***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| initialToken | address |  |
| wantedToken | address |  |
| liquidity | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 |  |
| fee | uint256 |  |



## *function* swap

***IPool.swap(fromToken, toToken, fromAmount, minimumToAmount, to, deadline) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| fromToken | address |  |
| toToken | address |  |
| fromAmount | uint256 |  |
| minimumToAmount | uint256 |  |
| to | address |  |
| deadline | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| actualToAmount | uint256 |  |
| haircut | uint256 |  |



## *function* withdraw

***IPool.withdraw(token, liquidity, minimumAmount, to, deadline) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address |  |
| liquidity | uint256 |  |
| minimumAmount | uint256 |  |
| to | address |  |
| deadline | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 |  |



## *function* withdrawFromOtherAsset

***IPool.withdrawFromOtherAsset(initialToken, wantedToken, liquidity, minimumAmount, to, deadline) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| initialToken | address |  |
| wantedToken | address |  |
| liquidity | uint256 |  |
| minimumAmount | uint256 |  |
| to | address |  |
| deadline | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 |  |


