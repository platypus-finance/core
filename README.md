[![Lint](https://github.com/platypus-finance/core/workflows/lint/badge.svg)](https://github.com/platypus-finance/core/workflows/lint.yml)
[![Tests](https://github.com/platypus-finance/core/workflows/test/badge.svg)](https://github.com/platypus-finance/core/workflows/test.yml)
[![Slither](https://github.com/platypus-finance/core/workflows/slither/badge.svg)](https://github.com/platypus-finance/core/workflows/slither.yml)
[![codecov](https://codecov.io/gh/platypus-finance/core/branch/master/graph/badge.svg?token=87VTYEYVVI)](https://codecov.io/gh/platypus-finance/core)

# Platypus Finance v1 Core
Core smart contracts of Platypus Finance. 

Before getting started with this repo, please read:
* The [Platypus docs](https://platypus-finance.gitbook.io/platypus-finance-docs/)
* The [Platypus AMM yellow paper](https://cdn.platypus.finance/Platypus_AMM_Yellow_Paper.pdf)
* The [Platypus liquidity mining yellow paper](https://cdn.platypus.finance/Platypus_Liquidity_Mining_Paper.pdf)

## Overview
Platypus has devised a whole new kind of StableSwap for enhanced capital efficiency, scalability and user experience in the Avalanche ecosystem.

### Contracts
We detail a few of the core contracts for the Platypus Finance Protocol.

#### Core.sol
<dl>
  <dd>Handles most of the math: fees, slippage and haircut as defined in the yellow paper.</dd>
</dl>


#### Pool.sol
<dl>
  <dd>Handles deposits, withdrawals and swaps with an open and extendable pool design.</dd>
</dl>


## Testing and Development
### Local Development

Requires `node@>=14` 

#### Install dependencies

`yarn`

#### Compile Contracts

`yarn compile`

#### Run tests

`yarn test`

## Slither

### Run

We use a mirror of slither to guarantee consistency and compatibility.
It is located in this [repository](https://hub.docker.com/r/platypusfinance/eth-security-toolbox).

```
docker run --rm -it -v "$PWD":/src platypusfinance/eth-security-toolbox
# Inside container
cd /src
slither .
```

Slither may generate false positives that may break CI. To suppress these false positives :

```
docker run --rm -it -v "$PWD":/src platypusfinance/eth-security-toolbox
# Inside container
cd /src
slither . --triage
# An interactive prompt will be invoked for suppressing the warnings
```

A new `slither.db.json` will be created and should be commited.

## Echidna fuzzer

To launch echidna fuzzer, first cd into the core directory. 

```
rm -rf crytic-export/; yarn compile; docker run -it -v "$PWD":/src platypusfinance/eth-security-toolbox
# Inside container
solc-select 0.8.9; cd /src/; echidna-test . --contract IntegrationTest --config echidna.yaml
```

## UML Diagram 
<img src="https://github.com/platypus-finance/core/blob/master/core.svg" width="100%" height="256">

## Audits and Security
- [Hacken core audit](https://hacken.io/wp-content/uploads/2021/12/PlatypusFinance_22122021SCAudit_Report_2.pdf)
- [Omniscia core audit](https://omniscia.io/platypus-finance-core-implementation/)

Read our [bug bounty program details](https://github.com/platypus-finance/core/blob/master/bug-bounty.md) and [SECURITY](https://github.com/platypus-finance/core/blob/master/SECURITY.md) disclosure.

## Licensing

The primary license for Platypus Finance Core v1 is the Business Source License 1.1 (`BUSL-1.1`), see [`LICENSE`](https://github.com/platypus-finance/core/blob/master/LICENSE).
