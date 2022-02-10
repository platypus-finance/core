# Asset

contracts/asset/Asset.sol

> Title: Asset

> Notice: Contract presenting an asset in a pool

> Details: Expect to be owned by Timelock for management, and _pool links to Pool for coordination

## *event* Approval

***Asset.Approval(owner, spender, value) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| owner | address | indexed |
| spender | address | indexed |
| value | uint256 | not indexed |



## *event* CashAdded

***Asset.CashAdded(previousCashPosition, cashBeingAdded) ***

> Notice: An event thats emitted when cash is addedd

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousCashPosition | uint256 | not indexed |
| cashBeingAdded | uint256 | not indexed |



## *event* CashRemoved

***Asset.CashRemoved(previousCashPosition, cashBeingRemoved) ***

> Notice: An event thats emitted when cash is removed

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousCashPosition | uint256 | not indexed |
| cashBeingRemoved | uint256 | not indexed |



## *event* LiabilityAdded

***Asset.LiabilityAdded(previousLiabilityPosition, liabilityBeingAdded) ***

> Notice: An event thats emitted when liability is added

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousLiabilityPosition | uint256 | not indexed |
| liabilityBeingAdded | uint256 | not indexed |



## *event* LiabilityRemoved

***Asset.LiabilityRemoved(previousLiabilityPosition, liabilityBeingRemoved) ***

> Notice: An event thats emitted when liability is removed

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousLiabilityPosition | uint256 | not indexed |
| liabilityBeingRemoved | uint256 | not indexed |



## *event* MaxSupplyUpdated

***Asset.MaxSupplyUpdated(previousMaxSupply, newMaxSupply) ***

> Notice: An event thats emitted when max supply is updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousMaxSupply | uint256 | not indexed |
| newMaxSupply | uint256 | not indexed |



## *event* OwnershipTransferred

***Asset.OwnershipTransferred(previousOwner, newOwner) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousOwner | address | indexed |
| newOwner | address | indexed |



## *event* PoolUpdated

***Asset.PoolUpdated(previousPool, newPool) ***

> Notice: An event thats emitted when pool is updated

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousPool | address | indexed |
| newPool | address | indexed |



## *event* Transfer

***Asset.Transfer(from, to, value) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| from | address | indexed |
| to | address | indexed |
| value | uint256 | not indexed |



## *function* addCash

***Asset.addCash(amount) ***

> Notice: Adds cash, expects actual ERC20 underlyingToken got transferred in. Can only be called by Pool.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 | amount to add |



## *function* addLiability

***Asset.addLiability(amount) ***

> Notice: Adds deposit or dividend, expect LP underlyingToken minted in case of deposit. Can only be called by Pool.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 | amount to add |



## *function* aggregateAccount

***Asset.aggregateAccount() view***

> Notice: Returns the address of the Aggregate Account 'holding' this asset

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address | The current Aggregate Account address for Asset |



## *function* allowance

***Asset.allowance(owner, spender) view***

> Details: See {IERC20-allowance}.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| owner | address |  |
| spender | address |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 |  |



## *function* approve

***Asset.approve(spender, amount) ***

> Details: See {IERC20-approve}. Requirements: - `spender` cannot be the zero address.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| spender | address |  |
| amount | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* balanceOf

***Asset.balanceOf(account) view***

> Details: See {IERC20-balanceOf}.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| account | address |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 |  |



## *function* burn

***Asset.burn(to, amount) ***

> Notice: Burn Asset Token, expect pool coordinates other state updates. Can only be called by Pool.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| to | address | address holding the tokens |
| amount | uint256 | amount to burn |



## *function* cash

***Asset.cash() view***

> Notice: Returns the amount of underlyingToken transferrable, expect to match underlyingTokenBalance()

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 |  |



## *function* decimals

***Asset.decimals() view***

> Notice: Returns the decimals of ERC20 underlyingToken

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint8 | The current decimals for underlying token |



## *function* decreaseAllowance

***Asset.decreaseAllowance(spender, subtractedValue) ***

> Details: Atomically decreases the allowance granted to `spender` by the caller. This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}. Emits an {Approval} event indicating the updated allowance. Requirements: - `spender` cannot be the zero address. - `spender` must have allowance for the caller of at least `subtractedValue`.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| spender | address |  |
| subtractedValue | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* increaseAllowance

***Asset.increaseAllowance(spender, addedValue) ***

> Details: Atomically increases the allowance granted to `spender` by the caller. This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}. Emits an {Approval} event indicating the updated allowance. Requirements: - `spender` cannot be the zero address.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| spender | address |  |
| addedValue | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* initialize

***Asset.initialize(underlyingToken_, name_, symbol_, aggregateAccount_) ***

> Notice: Initializer.

> Details: _ suffix to avoid shadowing underlyingToken() name and  symbolmax decimal points for underlying token is 18.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| underlyingToken_ | address | The token represented by the asset |
| name_ | string | The name of the asset |
| symbol_ | string | The symbol of the asset |
| aggregateAccount_ | address | The aggregate account to which the the asset belongs |



## *function* liability

***Asset.liability() view***

> Notice: Returns the amount of liability, the total deposit and dividend

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 |  |



## *function* maxSupply

***Asset.maxSupply() view***

> Notice: Gets current asset max supply

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | The current max supply of asset |



## *function* mint

***Asset.mint(to, amount) ***

> Notice: Mint Asset Token, expect pool coordinates other state updates. Can only be called by Pool.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| to | address | address to transfer the token to |
| amount | uint256 | amount to transfer |



## *function* name

***Asset.name() view***

> Details: Returns the name of the token.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | string |  |



## *function* owner

***Asset.owner() view***

> Details: Returns the address of the current owner.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* pool

***Asset.pool() view***

> Notice: Gets current Pool address

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address | The current Pool address for Asset |



## *function* removeCash

***Asset.removeCash(amount) ***

> Notice: Deducts cash, expect actual ERC20 got transferred out (by transferUnderlyingToken()). Can only be called by Pool.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 | amount to remove |



## *function* removeLiability

***Asset.removeLiability(amount) ***

> Notice: Removes deposit and dividend earned, expect LP underlyingToken burnt. Can only be called by Pool.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| amount | uint256 | amount to remove |



## *function* renounceOwnership

***Asset.renounceOwnership() ***

> Details: Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner.



## *function* setAggregateAccount

***Asset.setAggregateAccount(aggregateAccount_) ***

> Notice: Changes the aggregate account. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| aggregateAccount_ | address | new aggregate account address |



## *function* setMaxSupply

***Asset.setMaxSupply(maxSupply_) ***

> Notice: Changes asset max supply. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| maxSupply_ | uint256 | the new asset's max supply |



## *function* setPool

***Asset.setPool(pool_) ***

> Notice: Changes the pool. Can only be set by the contract owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| pool_ | address | new pool's address |



## *function* symbol

***Asset.symbol() view***

> Details: Returns the symbol of the token, usually a shorter version of the name.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | string |  |



## *function* totalSupply

***Asset.totalSupply() view***

> Details: See {IERC20-totalSupply}.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 |  |



## *function* transfer

***Asset.transfer(recipient, amount) ***

> Details: See {IERC20-transfer}. Requirements: - `recipient` cannot be the zero address. - the caller must have a balance of at least `amount`.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| recipient | address |  |
| amount | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* transferFrom

***Asset.transferFrom(sender, recipient, amount) ***

> Details: See {IERC20-transferFrom}. Emits an {Approval} event indicating the updated allowance. This is not required by the EIP. See the note at the beginning of {ERC20}. Requirements: - `sender` and `recipient` cannot be the zero address. - `sender` must have a balance of at least `amount`. - the caller must have allowance for ``sender``'s tokens of at least `amount`.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| sender | address |  |
| recipient | address |  |
| amount | uint256 |  |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | bool |  |



## *function* transferOwnership

***Asset.transferOwnership(newOwner) ***

> Details: Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| newOwner | address |  |



## *function* transferUnderlyingToken

***Asset.transferUnderlyingToken(to, amount) ***

> Notice: Transfers ERC20 underlyingToken from this contract to another account. Can only be called by Pool.

> Details: Not to be confused with transferring platypus Assets.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| to | address | address to transfer the token to |
| amount | uint256 | amount to transfer |



## *function* underlyingToken

***Asset.underlyingToken() view***

> Notice: Returns the address of ERC20 underlyingToken represented by this asset

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address | The current address of ERC20 underlyingToken for Asset |



## *function* underlyingTokenBalance

***Asset.underlyingTokenBalance() view***

> Notice: Get underlying Token Balance

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 | Returns the actual balance of ERC20 underlyingToken |


