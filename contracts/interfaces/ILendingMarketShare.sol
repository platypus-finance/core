// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface ILendingMarketShare {
    function registerLpToken(address _token) external returns (bool);

    function deposit(
        address _user,
        address _token,
        uint256 _amount
    ) external;

    function withdraw(
        address _user,
        address _token,
        uint256 _amount
    ) external;
}
