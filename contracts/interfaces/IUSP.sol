// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IUSP is IERC20 {
    function mint(address _to, uint256 _value) external;

    function burn(uint256 _value) external;

    function burnFrom(address _from, uint256 _value) external;
}
