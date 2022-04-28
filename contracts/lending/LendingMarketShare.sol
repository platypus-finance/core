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

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event ClaimAll(address indexed user);
    event Claim(address indexed user, uint256[] pids);

    struct PoolData {
        uint256 pid;
        uint256 accRewardPerShare; // Accumulated Rewards per share, times 1e36. See below.
        address rewardToken;
    }

    address public ptp;
    address public lendingMarket;
    IMasterPlatypus public masterPlatypus;

    // BENT tokens reward settings
    uint256 public rewardPerBlock;
    uint256 public maxRewardPerBlock;
    uint256 public lastRewardBlock;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => PoolData) public rewardPools;

    mapping(uint256 => mapping(address => uint256)) internal userRewardDebt;
    mapping(uint256 => mapping(address => uint256)) internal userPendingRewards;

    modifier onlyLendingMarket() {
        require(lendingMarket == _msgSender(), 'Caller is not the lending market');
        _;
    }

    function initialize(address _ptp, address _masterPlatypus) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        ptp = _ptp;
        masterPlatypus = IMasterPlatypus(_masterPlatypus);

        lastRewardBlock = block.number;
    }

    function setLendingMarket(address _market) external onlyOwner {
        lendingMarket = _market;
    }

    function getPoolId(address _token) public view returns (uint256) {
        for (uint256 i = 0; i < masterPlatypus.poolLength(); i++) {
            if (_token == masterPlatypus.poolInfo(i).lpToken) {
                return i;
            }
        }
        revert('Invalid Pool');
    }

    function totalReward(uint256 _pid) public view returns (uint256) {
        (uint256 pendingPtp, , , ) = masterPlatypus.pendingTokens(_pid, address(this));
        return pendingPtp;
    }

    function pendingReward(address user) external view returns (uint256[] memory pending) {
        uint256 _rewardPoolsCount = rewardPoolsCount;
        pending = new uint256[](_rewardPoolsCount);

        if (totalSupply != 0) {
            for (uint256 i = 0; i < _rewardPoolsCount; ++i) {
                PoolData memory pool = rewardPools[i];
                if (pool.rewardToken == address(0)) {
                    continue;
                }
                uint256 bentReward = (block.number - lastRewardBlock) * rewardPerBlock;
                uint256 newAccRewardPerShare = pool.accRewardPerShare + ((bentReward * 1e36) / totalSupply);

                pending[i] =
                    userPendingRewards[i][user] +
                    ((balanceOf[user] * newAccRewardPerShare) / 1e36) -
                    userRewardDebt[i][user];
            }
        }
    }

    function registerLpToken(address _token) external onlyLendingMarket returns (bool) {
        require(rewardPools[_token].rewardToken == address(0), 'LMShare: Lp Already registered');
        uint256 mpPoolLength = masterPlatypus.poolLength();
        for (uint256 i = 0; i < mpPoolLength; i++) {
            if (_token == masterPlatypus.poolInfo(i).lpToken) {
                rewardPools[_token] = PoolData({pid: i, accRewardPerShare: 0, rewardToken: ptp});
                return true;
            }
        }
        return false;
    }

    function deposit(
        address _user,
        address _token,
        uint256 _amount
    ) external onlyLendingMarket {
        require(_amount != 0, "Can't stake 0");
        uint256 pId = getPoolId(_token);

        _updateAccPerShare(true, _user);

        _mint(_user, _amount);

        _updateUserRewardDebt(_user);

        IERC20Upgradeable(ptp).approve(address(masterPlatypus), _amount);
        masterPlatypus.deposit(pId, _amount);

        emit Deposit(_user, _amount);
    }

    function withdraw(
        address _user,
        address _token,
        uint256 _amount
    ) external onlyLendingMarket {
        require(balanceOf[_user] >= _amount && _amount != 0, 'Invalid withdraw amount');
        uint256 pId = getPoolId(_token);

        _updateAccPerShare(true, _user);
        _burn(_user, _amount);
        _updateUserRewardDebt(_user);

        masterPlatypus.withdraw(pId, _amount);
        IERC20Upgradeable(_token).safeTransfer(lendingMarket, _amount);

        emit Withdraw(_user, _amount);
    }

    function claim(address _user, uint256[] memory _pids)
        external
        nonReentrant
        onlyLendingMarket
        returns (bool claimed)
    {
        _updateAccPerShare(true, _user);

        masterPlatypus.multiClaim(_pids);
        for (uint256 i = 0; i < _pids.length; ++i) {
            uint256 claimAmount = _claim(_pids[i], _user);
            if (claimAmount > 0) {
                claimed = true;
            }
        }

        _updateUserRewardDebt(_user);

        emit Claim(_user, _pids);
    }

    // Internal Functions

    function _updateAccPerShare(bool withdrawReward, address user) internal {
        uint256 _rewardPoolsCount = rewardPoolsCount;
        for (uint256 i = 0; i < _rewardPoolsCount; ++i) {
            PoolData storage pool = rewardPools[i];
            if (pool.rewardToken == address(0)) {
                continue;
            }

            if (totalSupply == 0) {
                pool.accRewardPerShare = block.number;
            } else {
                uint256 bentReward = (block.number - lastRewardBlock) * rewardPerBlock;
                pool.accRewardPerShare += (bentReward * (1e36)) / totalSupply;
            }

            if (withdrawReward) {
                uint256 pending = ((balanceOf[user] * pool.accRewardPerShare) / 1e36) - userRewardDebt[i][user];

                if (pending > 0) {
                    userPendingRewards[i][user] += pending;
                }
            }
        }

        lastRewardBlock = block.number;
    }

    function _updateUserRewardDebt(address user) internal {
        uint256 _rewardPoolsCount = rewardPoolsCount;
        for (uint256 i = 0; i < _rewardPoolsCount; ++i) {
            if (rewardPools[i].rewardToken != address(0)) {
                userRewardDebt[i][user] = (balanceOf[user] * rewardPools[i].accRewardPerShare) / 1e36;
            }
        }
    }

    function _claim(uint256 pid, address user) internal returns (uint256 claimAmount) {
        require(pid < rewardPoolsCount, 'Invalid poolid');

        if (rewardPools[pid].rewardToken != address(0)) {
            claimAmount = userPendingRewards[pid][user];
            if (claimAmount > 0) {
                IERC20Upgradeable(rewardPools[pid].rewardToken).safeTransfer(user, claimAmount);
                userPendingRewards[pid][user] = 0;
            }
        }
    }

    function _mint(address _user, uint256 _amount) internal {
        balanceOf[_user] += _amount;
        totalSupply += _amount;
    }

    function _burn(address _user, uint256 _amount) internal {
        balanceOf[_user] -= _amount;
        totalSupply -= _amount;
    }

    // owner can force withdraw bent tokens
    function forceWithdrawPtp(uint256 _amount) external onlyOwner {
        // bent reward index is zero
        IERC20Upgradeable(ptp).safeTransfer(msg.sender, _amount);
    }
}
