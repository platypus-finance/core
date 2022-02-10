# ChainlinkProxyPriceProvider

contracts/oracle/ChainlinkProxyPriceProvider.sol

> Notice: Proxy smart contract to get the price of an asset from a price source, with Chainlink Aggregator         smart contracts as primary option - If the returned price by a Chainlink aggregator is <= 0, the transaction will be reverted - Can be owned by the governance system, allowed to add sources for assets, replace them

## *constructor*

***constructor(assets, sources)***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| assets | address[] |  |
| sources | address[] |  |



## *event* AssetSourceUpdated

***ChainlinkProxyPriceProvider.AssetSourceUpdated(asset, source) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| asset | address | indexed |
| source | address | indexed |



## *event* OwnershipTransferred

***ChainlinkProxyPriceProvider.OwnershipTransferred(previousOwner, newOwner) ***

Arguments

| **name** | **type** | **description** |
|-|-|-|
| previousOwner | address | indexed |
| newOwner | address | indexed |



## *function* getAssetPrice

***ChainlinkProxyPriceProvider.getAssetPrice(asset) view***

> Notice: Gets an asset price by address

Arguments

| **name** | **type** | **description** |
|-|-|-|
| asset | address | The asset address |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 |  |



## *function* getAssetPriceReciprocal

***ChainlinkProxyPriceProvider.getAssetPriceReciprocal(asset) view***

> Notice: Gets reciprocal of price

Arguments

| **name** | **type** | **description** |
|-|-|-|
| asset | address | The asset address |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256 |  |



## *function* getAssetsPrices

***ChainlinkProxyPriceProvider.getAssetsPrices(assets) view***

> Notice: Gets a list of prices from a list of assets addresses

Arguments

| **name** | **type** | **description** |
|-|-|-|
| assets | address[] | The list of assets addresses |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | uint256[] |  |



## *function* getSourceOfAsset

***ChainlinkProxyPriceProvider.getSourceOfAsset(asset) view***

> Notice: Gets the address of the source for an asset address

Arguments

| **name** | **type** | **description** |
|-|-|-|
| asset | address | The address of the asset |

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address | address The address of the source |



## *function* owner

***ChainlinkProxyPriceProvider.owner() view***

> Details: Returns the address of the current owner.

Outputs

| **name** | **type** | **description** |
|-|-|-|
|  | address |  |



## *function* renounceOwnership

***ChainlinkProxyPriceProvider.renounceOwnership() ***

> Details: Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner.



## *function* setAssetSources

***ChainlinkProxyPriceProvider.setAssetSources(assets, sources) ***

> Notice: External function called by the owner to set or replace sources of assets

Arguments

| **name** | **type** | **description** |
|-|-|-|
| assets | address[] | The addresses of the assets |
| sources | address[] | The address of the source of each asset |



## *function* transferOwnership

***ChainlinkProxyPriceProvider.transferOwnership(newOwner) ***

> Details: Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.

Arguments

| **name** | **type** | **description** |
|-|-|-|
| newOwner | address |  |


