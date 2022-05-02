// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';

import '../interfaces/ILendingMarketShare.sol';
import '../interfaces/IMasterPlatypus.sol';

/**
 * @title LendingMarketShare
 * @notice Bridge between LendingMarket and MasterPlatypus that handles the rewards from MasterPlatypus.
 * @dev Inside reward calculation logic is same as MasterChef.
 * But total reward is calculated from sum of claimed Ptps from MasterPlatypus
 */
contract LendingMarketShare is OwnableUpgradeable, ReentrancyGuardUpgradeable, ILendingMarketShare {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice An event thats emitted when lending market deposits lp
    event Deposit(address indexed user, address indexed lpToken, uint256 amount);
    /// @notice An event thats emitted when lending market withdraws lp
    event Withdraw(address indexed user, address indexed lpToken, uint256 amount);

    /// @notice A struct to represent pool info for each lp token
    struct PoolInfo {
        uint256 pid;
        uint256 accRewardPerShare; // Accumulated Rewards per share, times 1e36. See below.
        uint256 lastRewardBlock;
        address rewardToken;
    }

    /// @notice A struct to represent user info
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    /// @notice Platypus token address
    address public ptp;
    /// @notice LendingMarket address
    address public lendingMarket;
    /// @notice MasterPlatypus address
    IMasterPlatypus public masterPlatypus;

    /// @notice pool info
    mapping(address => PoolInfo) public poolInfo; // lpToken => poolInfo
    /// @notice user info
    mapping(address => mapping(address => UserInfo)) public userInfo; // lpToken => user => user info
    /// @notice Lp tokens staked on this contract
    mapping(address => uint256) public lpSupplies; // lpToken => lp amount staked
    /// @notice Sum of Ptp rewards claimed and in pending from MasterPlatypus
    mapping(address => uint256) public poolRewards; // lpToken => Ptp rewards

    modifier onlyLendingMarket() {
        require(lendingMarket == _msgSender(), 'LMShare: Caller is not the lending market');
        _;
    }

    modifier onlyRegisteredLp(address _token) {
        require(poolInfo[_token].rewardToken != address(0), 'LMShare: Lp not registered');
        _;
    }

    /**
     * @notice Initializer.
     * @param _ptp Ptp token address
     * @param _masterPlatypus MasterPlatypus address
     */
    function initialize(address _ptp, address _masterPlatypus) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        ptp = _ptp;
        masterPlatypus = IMasterPlatypus(_masterPlatypus);
    }

    /**
     * @notice Update lendingMarket address
     * @dev only owner can call this function
     * @param _market new lending market address
     */
    function setLendingMarket(address _market) external onlyOwner {
        lendingMarket = _market;
    }

    /**
     * @notice register lp token to init PoolInfo
     * @dev only lending market can call this function
     * @param _token lp token address
     * @return The collateral tokens in array format
     */
    function registerLpToken(address _token) external onlyLendingMarket returns (bool) {
        require(poolInfo[_token].rewardToken == address(0), 'LMShare: Lp already registered');
        uint256 mpPoolLength = masterPlatypus.poolLength();
        for (uint256 i = 0; i < mpPoolLength; i++) {
            if (_token == masterPlatypus.poolInfo(i).lpToken) {
                poolInfo[_token] = PoolInfo({pid: i, accRewardPerShare: 0, rewardToken: ptp, lastRewardBlock: 0});
                return true;
            }
        }
        return false;
    }

    /**
     * @notice returns all collateral tokens in array format
     * @param _token lp token address
     * @param _user user address
     * @return pending pending ptp rewards claimable
     */
    function pendingReward(address _token, address _user) external view returns (uint256 pending) {
        PoolInfo storage pool = poolInfo[_token];
        UserInfo storage user = userInfo[_token][_user];
        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 lpSupply = lpSupplies[_token];
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            (uint256 pendingPtp, , , ) = masterPlatypus.pendingTokens(pool.pid, address(this));
            pendingPtp += poolRewards[_token];
            accRewardPerShare += (pendingPtp * 1e12) / lpSupply;
        }
        pending = (user.amount * accRewardPerShare) / 1e12 - user.rewardDebt;
    }

    /**
     * @notice returns all collateral tokens in array format
     * @dev deposit and withdraw functions call this function to update the pool info to the latest one
     * @param _token lp token address
     */
    function updatePool(address _token) internal {
        PoolInfo storage pool = poolInfo[_token];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = lpSupplies[_token];
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        (uint256 pendingPtp, , , ) = masterPlatypus.pendingTokens(pool.pid, address(this));
        pendingPtp += poolRewards[_token];
        pool.accRewardPerShare += (pendingPtp * 1e12) / lpSupply;
        pool.lastRewardBlock = block.number;
    }

    /**
     * @notice deposit lp tokens to MasterPlatypus
     * @dev only lending market can call this function only for registered lp tokens
     * @param _user a user address
     * @param _token lp token address
     * @param _amount amount of lp tokens to deposit
     */
    function deposit(
        address _user,
        address _token,
        uint256 _amount
    ) external onlyLendingMarket onlyRegisteredLp(_token) {
        require(_amount != 0, "LMShare: Can't stake 0");
        PoolInfo storage pool = poolInfo[_token];
        UserInfo storage user = userInfo[_token][_user];

        updatePool(_token);
        if (_amount > 0) {
            IERC20Upgradeable lpToken = IERC20Upgradeable(_token);
            lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            lpToken.safeApprove(address(masterPlatypus), _amount);
            user.amount += _amount;
            lpSupplies[_token] += _amount;
            // TODO: Consider additional rewards later
            (uint256 claimedPtp, ) = masterPlatypus.deposit(pool.pid, _amount);
            poolRewards[_token] += claimedPtp;
        }
        user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
        emit Deposit(_user, _token, _amount);
    }

    /**
     * @notice withdraw lp tokens from MasterPlatypus
     * @dev only lending market can call this function only for registered lp tokens
     * @param _user a user address
     * @param _token lp token address
     * @param _amount amount of lp tokens to withdraw
     */
    function withdraw(
        address _user,
        address _token,
        uint256 _amount
    ) external onlyLendingMarket onlyRegisteredLp(_token) {
        PoolInfo storage pool = poolInfo[_token];
        UserInfo storage user = userInfo[_token][_user];
        require(user.amount >= _amount, 'LMShare: withdraw: not good');

        // Withdraw from MasterPlatypus
        (uint256 claimedPtp, ) = masterPlatypus.withdraw(pool.pid, _amount);
        poolRewards[_token] += claimedPtp;

        updatePool(_token);
        uint256 pending = (user.amount * pool.accRewardPerShare) / 1e12 - user.rewardDebt;
        if (pending > 0) {
            IERC20Upgradeable(ptp).safeTransfer(_user, pending);
        }
        if (_amount > 0) {
            user.amount -= _amount;
            lpSupplies[_token] -= _amount;
            IERC20Upgradeable(_token).safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
        emit Withdraw(msg.sender, _token, _amount);
    }
}
