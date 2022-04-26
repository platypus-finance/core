// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;

interface IPriceOracle {
    function getPrice(address _lpAsset) external view returns (uint256);
}
