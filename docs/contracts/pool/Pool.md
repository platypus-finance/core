# Pool

contracts/pool/Pool.sol

> Title: Pool

> Notice: Manages deposits, withdrawals and swaps. Holds a mapping of assets and parameters.

> Details: The main entry-point of Platypus protocol Note The Pool is ownable and the owner wields power. Note The ownership will be transferred to a governance contract once Platypus community can show to govern itself. The unique features of the Platypus make it an important subject in the study of evolutionary biology.

## *event* AssetAdded

***Pool.AssetAdded(token, asset) ***

> Notice: An event emitted when an asset is added to Pool

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address | indexed |
| asset | address | indexed |



## *event* Deposit

***Pool.Deposit(sender, token, amount, liquidity, to) ***

> Notice: An event emitted when a deposit is made to Pool

Arguments

| **name** | **type** | **description** |
|-|-|-|
| sender | address | indexed |
| token | address | not indexed |
| amount | uint256 | not indexed |
| liquidity | uint256 | not indexed |
| to | address | indexed |



## *event* DevUpdated

***Pool.DevUpdated(previousDev, newDev) ***

> Notice: An event emitted when dev is updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousDev | address | indexed |
| newDev | address | indexed |



## *event* HaircutRateUpdated

***Pool.HaircutRateUpdated(previousHaircut, newHaircut) ***

> Notice: An event emitted when haircut is updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousHaircut | uint256 | not indexed |
| newHaircut | uint256 | not indexed |



## *event* OracleUpdated

***Pool.OracleUpdated(previousOracle, newOracle) ***

> Notice: An event emitted when oracle is updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousOracle | address | indexed |
| newOracle | address | indexed |



## *event* OwnershipTransferred

***Pool.OwnershipTransferred(previousOwner, newOwner) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousOwner | address | indexed |
| newOwner | address | indexed |



## *event* Paused

***Pool.Paused(account) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| account | address | not indexed |



## *event* PriceDeviationUpdated

***Pool.PriceDeviationUpdated(previousPriceDeviation, newPriceDeviation) ***

> Notice: An event emitted when price deviation is updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousPriceDeviation | uint256 | not indexed |
| newPriceDeviation | uint256 | not indexed |



## *event* RetentionRatioUpdated

***Pool.RetentionRatioUpdated(previousRetentionRatio, newRetentionRatio) ***

> Notice: An event emitted when retention ratio is updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousRetentionRatio | uint256 | not indexed |
| newRetentionRatio | uint256 | not indexed |



## *event* SlippageParamsUpdated

***Pool.SlippageParamsUpdated(previousK, newK, previousN, newN, previousC1, newC1, previousXThreshold, newXThreshold) ***

> Notice: An event emitted when slippage params are updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousK | uint256 | not indexed |
| newK | uint256 | not indexed |
| previousN | uint256 | not indexed |
| newN | uint256 | not indexed |
| previousC1 | uint256 | not indexed |
| newC1 | uint256 | not indexed |
| previousXThreshold | uint256 | not indexed |
| newXThreshold | uint256 | not indexed |



## *event* Swap

***Pool.Swap(sender, fromToken, toToken, fromAmount, toAmount, to) ***

> Notice: An event emitted when a swap is made in Pool

Arguments

| **name** | **type** | **description** |
|-|-|-|
| sender | address | indexed |
| fromToken | address | not indexed |
| toToken | address | not indexed |
| fromAmount | uint256 | not indexed |
| toAmount | uint256 | not indexed |
| to | address | indexed |



## *event* Unpaused

***Pool.Unpaused(account) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| account | address | not indexed |



## *event* Withdraw

***Pool.Withdraw(sender, token, amount, liquidity, to) ***

> Notice: An event emitted when a withdrawal is made from Pool

Arguments

| **name** | **type** | **description** |
|-|-|-|
| sender | address | indexed |
| token | address | not indexed |
| amount | uint256 | not indexed |
| liquidity | uint256 | not indexed |
| to | address | indexed |



## *function* addAsset

***Pool.addAsset(token, asset) ***

> Notice: Adds asset to pool, reverts if asset already exists in pool

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address | The address of token |
| asset | address | The address of the platypus Asset contract |



## *function* assetOf

***Pool.assetOf(token) view***

> Notice: Gets Asset corresponding to ERC20 token. Reverts if asset does not exists in Pool.

> Details: to be used externally

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address | The address of ERC20 token |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* deposit

***Pool.deposit(token, amount, to, deadline) ***

> Notice: Deposits amount of tokens into pool ensuring deadline

> Details: Asset needs to be created and added to pool before any operation

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address | The token address to be deposited |
| amount | uint256 | The amount to be deposited |
| to | address | The user accountable for deposit, receiving the platypus assets (lp) |
| deadline | uint256 | The deadline to be respected |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| liquidity | uint256 | Total asset liquidity minted |



## *function* getC1

***Pool.getC1() view***

> Notice: Gets current C1 slippage parameter

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | The current C1 slippage parameter in Pool |



## *function* getDev

***Pool.getDev() view***

> Notice: Gets current Dev address

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address | The current Dev address for Pool |



## *function* getHaircutRate

***Pool.getHaircutRate() view***

> Notice: Gets current Haircut parameter

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | The current Haircut parameter in Pool |



## *function* getMaxPriceDeviation

***Pool.getMaxPriceDeviation() view***

> Notice: Gets current maxPriceDeviation parameter

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | The current _maxPriceDeviation parameter in Pool |



## *function* getPriceOracle

***Pool.getPriceOracle() view***

> Notice: Gets current Price Oracle address

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address | The current Price Oracle address for Pool |



## *function* getRetentionRatio

***Pool.getRetentionRatio() view***

> Notice: Gets current retention ratio parameter

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | The current retention ratio parameter in Pool |



## *function* getSlippageParamK

***Pool.getSlippageParamK() view***

> Notice: Gets current K slippage parameter

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | The current K slippage parameter in Pool |



## *function* getSlippageParamN

***Pool.getSlippageParamN() view***

> Notice: Gets current N slippage parameter

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | The current N slippage parameter in Pool |



## *function* getTokenAddresses

***Pool.getTokenAddresses() view***

> Notice: Gets addresses of underlying token in pool

> Details: To be used externally

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address[] | addresses of assets in the pool |



## *function* getXThreshold

***Pool.getXThreshold() view***

> Notice: Gets current XThreshold slippage parameter

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | The current XThreshold slippage parameter in Pool |



## *function* initialize

***Pool.initialize() ***

> Notice: Initializes pool. Dev is set to be the account calling this function.



## *function* owner

***Pool.owner() view***

> Details: Returns the address of the current owner.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* pause

***Pool.pause() ***

> Details: pause pool, restricting certain operations



## *function* paused

***Pool.paused() view***

> Details: Returns true if the contract is paused, and false otherwise.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* quoteMaxInitialAssetWithdrawable

***Pool.quoteMaxInitialAssetWithdrawable(initialToken, wantedToken) view***

> Notice: Gets max withdrawable amount in initial tokenTaking into account that coverage must be over > 1 in wantedAsset

Arguments

| **name** | **type** | **description** |
|-|-|-|
| initialToken | address | the initial token to be evaluated |
| wantedToken | address | the wanted token to withdraw in |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| maxInitialAssetAmount | uint256 | the maximum amount of initial asset that can be used to withdraw |



## *function* quotePotentialSwap

***Pool.quotePotentialSwap(fromToken, toToken, fromAmount) view***

> Notice: Quotes potential outcome of a swap given current state, taking in account slippage and haircut

> Details: To be used by frontend

Arguments

| **name** | **type** | **description** |
|-|-|-|
| fromToken | address | The initial ERC20 token |
| toToken | address | The token wanted by user |
| fromAmount | uint256 | The amount to quote |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| potentialOutcome | uint256 | The potential amount user would receive |
| haircut | uint256 | The haircut that would be applied |



## *function* quotePotentialWithdraw

***Pool.quotePotentialWithdraw(token, liquidity) view***

> Notice: Quotes potential withdrawal from pool

> Details: To be used by frontend

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address | The token to be withdrawn by user |
| liquidity | uint256 | The liquidity (amount of lp assets) to be withdrawn |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 | The potential amount user would receive |
| fee | uint256 | The fee that would be applied |
| enoughCash | bool | does the pool have enough cash? (cash >= liabilityToBurn - fee) |



## *function* quotePotentialWithdrawFromOtherAsset

***Pool.quotePotentialWithdrawFromOtherAsset(initialToken, wantedToken, liquidity) view***

> Notice: Quotes potential withdrawal from other asset in the same aggregate

> Details: To be used by frontend. Reverts if not possible

Arguments

| **name** | **type** | **description** |
|-|-|-|
| initialToken | address | The users holds LP corresponding to this initial token |
| wantedToken | address | The token to be withdrawn by user |
| liquidity | uint256 | The liquidity (amount of lp assets) to be withdrawn (in wanted token dp). |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 | The potential amount user would receive |
| fee | uint256 | The fee that would be applied |



## *function* removeAsset

***Pool.removeAsset(key) ***

> Notice: Removes asset from asset struct

> Details: Can only be called by owner

Arguments

| **name** | **type** | **description** |
|-|-|-|
| key | address | The address of token to remove |



## *function* renounceOwnership

***Pool.renounceOwnership() ***

> Details: Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner.



## *function* setDev

***Pool.setDev(dev) ***

> Notice: Changes the contract dev. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| dev | address | new contract dev address |



## *function* setHaircutRate

***Pool.setHaircutRate(haircutRate_) ***

> Notice: Changes the pools haircutRate. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| haircutRate_ | uint256 | new pool's haircutRate_ |



## *function* setMaxPriceDeviation

***Pool.setMaxPriceDeviation(maxPriceDeviation_) ***

> Notice: Changes the pools maxPriceDeviation. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| maxPriceDeviation_ | uint256 | new pool's maxPriceDeviation |



## *function* setPriceOracle

***Pool.setPriceOracle(priceOracle) ***

> Notice: Changes the pools priceOracle. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| priceOracle | address | new pool's priceOracle addres |



## *function* setRetentionRatio

***Pool.setRetentionRatio(retentionRatio_) ***

> Notice: Changes the pools retentionRatio. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| retentionRatio_ | uint256 | new pool's retentionRatio |



## *function* setSlippageParams

***Pool.setSlippageParams(k_, n_, c1_, xThreshold_) ***

> Notice: Changes the pools slippage params. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| k_ | uint256 | new pool's slippage param K |
| n_ | uint256 | new pool's slippage param N |
| c1_ | uint256 | new pool's slippage param C1 |
| xThreshold_ | uint256 | new pool's slippage param xThreshold |



## *function* swap

***Pool.swap(fromToken, toToken, fromAmount, minimumToAmount, to, deadline) ***

> Notice: Swap fromToken for toToken, ensures deadline and minimumToAmount and sends quoted amount to `to` address

Arguments

| **name** | **type** | **description** |
|-|-|-|
| fromToken | address | The token being inserted into Pool by user for swap |
| toToken | address | The token wanted by user, leaving the Pool |
| fromAmount | uint256 | The amount of from token inserted |
| minimumToAmount | uint256 | The minimum amount that will be accepted by user as result |
| to | address | The user receiving the result of swap |
| deadline | uint256 | The deadline to be respected |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| actualToAmount | uint256 | The actual amount user receive |
| haircut | uint256 | The haircut that would be applied |



## *function* transferOwnership

***Pool.transferOwnership(newOwner) ***

> Details: Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| newOwner | address |  |



## *function* unpause

***Pool.unpause() ***

> Details: unpause pool, enabling certain operations



## *function* withdraw

***Pool.withdraw(token, liquidity, minimumAmount, to, deadline) ***

> Notice: Withdraws liquidity amount of asset to `to` address ensuring minimum amount required

Arguments

| **name** | **type** | **description** |
|-|-|-|
| token | address | The token to be withdrawn |
| liquidity | uint256 | The liquidity to be withdrawn |
| minimumAmount | uint256 | The minimum amount that will be accepted by user |
| to | address | The user receiving the withdrawal |
| deadline | uint256 | The deadline to be respected |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 | The total amount withdrawn |



## *function* withdrawFromOtherAsset

***Pool.withdrawFromOtherAsset(initialToken, wantedToken, liquidity, minimumAmount, to, deadline) ***

> Notice: Enables withdrawing liquidity from an asset using LP from a different asset in the same aggregate

> Details: initialToken and wantedToken assets' must be in the same aggregateAlso, cov of wantedAsset must be higher than 1 after withdrawal for this to be accepted

Arguments

| **name** | **type** | **description** |
|-|-|-|
| initialToken | address | The corresponding token user holds the LP (Asset) from |
| wantedToken | address | The token wanting to be withdrawn (needs to be well covered) |
| liquidity | uint256 | The liquidity to be withdrawn (in wanted token d.p.) |
| minimumAmount | uint256 | The minimum amount that will be accepted by user |
| to | address | The user receiving the withdrawal |
| deadline | uint256 | The deadline to be respected |

Outputs

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 | The total amount withdrawn |


