// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface ILendingMarketShare {
    function registerLpToken(address _token) external returns (bool);
}
