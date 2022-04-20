// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;

import '../interfaces/IAsset.sol';
import '../interfaces/IPriceOracle.sol';
import '../interfaces/IPriceOracleGetter.sol';

contract TestLPPriceOracle is IPriceOracle {
    mapping(address => uint256) public override getPrice;

    function setPrice(address _lpAsset, uint256 price) public {
        getPrice[_lpAsset] = price;
    }
}
