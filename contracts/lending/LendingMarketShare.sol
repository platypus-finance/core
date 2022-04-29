// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';

import '../interfaces/ILendingMarketShare.sol';
import '../interfaces/IMasterPlatypus.sol';

contract LendingMarketShare is OwnableUpgradeable, ReentrancyGuardUpgradeable, ILendingMarketShare {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event Deposit(address indexed user, address indexed lpToken, uint256 amount);
    event Withdraw(address indexed user, address indexed lpToken, uint256 amount);

    struct PoolInfo {
        uint256 pid;
        uint256 accRewardPerShare; // Accumulated Rewards per share, times 1e36. See below.
        uint256 lastRewardBlock;
        address rewardToken;
    }

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    address public ptp;
    address public lendingMarket;
    IMasterPlatypus public masterPlatypus;

    mapping(address => PoolInfo) public poolInfo;
    mapping(address => mapping(address => UserInfo)) public userInfo;
    mapping(address => uint256) public lpSupplies;

    modifier onlyLendingMarket() {
        require(lendingMarket == _msgSender(), 'LMShare: Caller is not the lending market');
        _;
    }

    modifier onlyRegisteredLp(address _token) {
        require(poolInfo[_token].rewardToken != address(0), 'LMShare: Lp not registered');
        _;
    }

    function initialize(address _ptp, address _masterPlatypus) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        ptp = _ptp;
        masterPlatypus = IMasterPlatypus(_masterPlatypus);
    }

    function setLendingMarket(address _market) external onlyOwner {
        lendingMarket = _market;
    }

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

    function totalReward(uint256 _pid) public view returns (uint256) {
        (uint256 pendingPtp, , , ) = masterPlatypus.pendingTokens(_pid, address(this));
        return pendingPtp;
    }

    function pendingReward(address _token, address _user) external view returns (uint256 pending) {
        PoolInfo storage pool = poolInfo[_token];
        UserInfo storage user = userInfo[_token][_user];
        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 lpSupply = lpSupplies[_token];
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            // TODO: Calculate accurate total reward for this pool
            // uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            // uint256 cakeReward = multiplier.mul(cakePerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            uint256 pendingPtp;
            accRewardPerShare += (pendingPtp * 1e12) / lpSupply;
        }
        return (user.amount * accRewardPerShare) / 1e12 - user.rewardDebt;
    }

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
        pool.accRewardPerShare += (pendingPtp * 1e12) / lpSupply;
        pool.lastRewardBlock = block.number;
    }

    function deposit(
        address _user,
        address _token,
        uint256 _amount
    ) external onlyLendingMarket onlyRegisteredLp(_token) {
        require(_amount != 0, "Can't stake 0");
        PoolInfo storage pool = poolInfo[_token];
        UserInfo storage user = userInfo[_token][_user];

        updatePool(_token);
        if (_amount > 0) {
            IERC20Upgradeable lpToken = IERC20Upgradeable(_token);
            lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            lpToken.safeApprove(address(masterPlatypus), _amount);
            user.amount += _amount;
            lpSupplies[_token] += _amount;
            masterPlatypus.deposit(pool.pid, _amount);
        }
        user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
        emit Deposit(_user, _token, _amount);
    }

    function withdraw(
        address _user,
        address _token,
        uint256 _amount
    ) external onlyLendingMarket onlyRegisteredLp(_token) {
        PoolInfo storage pool = poolInfo[_token];
        UserInfo storage user = userInfo[_token][_user];
        require(user.amount >= _amount, 'withdraw: not good');

        // Withdraw from MasterPlatypus
        masterPlatypus.withdraw(pool.pid, _amount);

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
