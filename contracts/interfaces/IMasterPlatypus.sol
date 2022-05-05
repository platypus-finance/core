// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/**
 * @dev Interface of the MasterPlatypusV4
 */
interface IMasterPlatypus {
    struct PoolInfo {
        address lpToken;
        uint96 baseAllocPoint;
        address rewarder;
        uint128 sumOfFactors;
        uint128 adjustedAllocPoint;
        uint104 accPtpPerShare;
        uint104 accPtpPerFactorShare;
        uint48 lastRewardTimestamp;
    }
    struct UserInfo {
        uint128 amount;
        uint128 claimablePtp;
        uint128 factor;
        uint128 rewardDebt;
    }

    function poolLength() external view returns (uint256);

    function poolInfo(uint256) external view returns (PoolInfo memory);

    function userInfo(uint256 pid, address user) external view returns (UserInfo memory);

    function pendingTokens(uint256 _pid, address _user)
        external
        view
        returns (
            uint256 pendingPtp,
            address bonusTokenAddress,
            string memory bonusTokenSymbol,
            uint256 pendingBonusToken
        );

    function rewarderBonusTokenInfo(uint256 _pid)
        external
        view
        returns (address bonusTokenAddress, string memory bonusTokenSymbol);

    function massUpdatePools() external;

    function updatePool(uint256 _pid) external;

    function poolAdjustFactor(uint256 pid) external view returns (uint256);

    function deposit(uint256 _pid, uint256 _amount) external returns (uint256, uint256);

    function depositFor(
        uint256 _pid,
        uint256 _amount,
        address _user
    ) external;

    function multiClaim(uint256[] memory _pids)
        external
        returns (
            uint256,
            uint256[] memory,
            uint256[] memory
        );

    function withdraw(uint256 _pid, uint256 _amount) external returns (uint256, uint256);

    function withdrawFor(
        uint256 _pid,
        uint256 _amount,
        address _user
    ) external returns (uint256, uint256);

    function emergencyWithdraw(uint256 _pid) external;

    function migrate(uint256[] calldata _pids) external;

    function updateFactor(address _user, uint256 _newVePtpBalance) external;
}
