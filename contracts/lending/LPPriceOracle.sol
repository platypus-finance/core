// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;

import '@openzeppelin/contracts/access/Ownable.sol';

import '../interfaces/IAsset.sol';
import '../interfaces/IPriceOracle.sol';
import '../interfaces/IPriceOracleGetter.sol';

/**
 * @title LPPriceOracle
 * @notice Price oracle for LP tokens
 * @dev Owner can update chainlink proxy price provider address
 */
contract LPPriceOracle is IPriceOracle, Ownable {
    address public chainlinkProxyPriceProvider;

    constructor(address _chainlinkProxyPriceProvider) Ownable() {
        require(_chainlinkProxyPriceProvider != address(0), 'invalid chainlink proxy price provider');
        chainlinkProxyPriceProvider = _chainlinkProxyPriceProvider;
    }

    function setChainlinkProxyPriceProvider(address _chainlinkProxyPriceProvider) external onlyOwner {
        require(_chainlinkProxyPriceProvider != address(0), 'invalid chainlink proxy price provider');
        chainlinkProxyPriceProvider = _chainlinkProxyPriceProvider;
    }

    function getPrice(address _lpAsset) external view override returns (uint256) {
        return IPriceOracleGetter(chainlinkProxyPriceProvider).getAssetPrice(IAsset(_lpAsset).underlyingToken());
    }
}
