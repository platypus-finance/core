// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import '../interfaces/IUSP.sol';
import '../interfaces/IPriceOracle.sol';

/**
 * @title LendingMarket
 * @notice Lending pools where users can deposit/withdraw collateral and borrow USP.
 * @dev If the user's health factor is below 1, anyone can liquidate his/her position.
 * Protocol will charge debt interest from borrowers and protocol revenue from liquidation.
 */
contract LendingMarket is OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;

    /// @notice A struct to represent the rate in numerator/denominator
    struct Rate {
        uint128 numerator;
        uint128 denominator;
    }

    /// @notice A struct for lending market settings
    struct MarketSettings {
        Rate interestApr; // debt interest rate in APR
        Rate orgFeeRate; // fees that will be charged upon minting USP (0.3% in USP)
        Rate liquidatorFeeRate; // liquidation fee for liquidators. (5% in collateral)
        Rate orgRevenueFeeRate; // liquidation fee for protocol revenue. (3% in collateral)
    }

    /// @notice A struct for collateral settings
    struct CollateralSetting {
        bool isValid; // if collateral is valid or not
        IPriceOracle oracle; // collateral price oracle (returns price in usd: 8 decimals)
        Rate creditLimitRate; // collateral borrow limit (e.g. USDs = 80%, BTCs = 70%, AVAXs=70%)
        Rate liqLimitRate; // collateral liquidation threshold rate (greater than credit limit rate)
        uint8 decimals; // collateral token decimals
    }

    /// @notice A struct for users collateral position
    struct Position {
        uint256 amount; // collateral amount
        uint256 debtPrincipal; // debt amount
        uint256 debtPortion; // accumulated debt interest
    }

    /// @notice An event thats emitted when user deposits collateral
    event Deposit(address indexed user, address indexed token, uint256 amount);
    /// @notice An event thats emitted when user borrows USP
    event Borrowed(address indexed user, uint256 uspAmount);
    /// @notice An event thats emitted when user withdraws collateral
    event Withdraw(address indexed user, address indexed token, uint256 amount);
    /// @notice An event thats emitted when user repays USP
    event Repay(address indexed user, uint256 uspAmount);
    /// @notice An event thats emitted when liquidator liquidates a user's position
    event Liquidate(address indexed user, address indexed token, uint256 amount, address indexed liquidator);

    /// @notice USP token address
    IUSP public usp;
    /// @notice lending market settings
    MarketSettings public settings;
    /// @notice collateral tokens in array
    address[] public collateralTokens;
    /// @notice collateral settings
    mapping(address => CollateralSetting) public collateralSettings; // token => collateral setting
    /// @notice users collateral position
    mapping(address => mapping(address => Position)) internal userPositions; // user => collateral token => position

    /// @notice total borrowed amount accrued so far
    uint256 public totalDebtAmount;
    /// @notice last time of debt accrued
    uint256 public totalDebtAccruedAt;
    /// @notice total borrowed portion
    uint256 public totalDebtPortion;
    /// @notice total protocol fees accrued so far
    uint256 public totalFeeCollected;

    /**
     * @notice Initializer.
     * @param _usp USP token address
     * @param _settings lending market settings
     */
    function initialize(IUSP _usp, MarketSettings memory _settings) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        // validates lending market settings
        _validateRate(_settings.interestApr); // should be updated to use cov ratio
        _validateRate(_settings.orgFeeRate); // 0.3%
        _validateRate(_settings.liquidatorFeeRate); // 5%
        _validateRate(_settings.orgRevenueFeeRate); // 3%

        usp = _usp;
        settings = _settings;
    }

    /**
     * @notice accrue debt interest
     * @dev Updates the contract's state by calculating the additional interest accrued since the last time
     */
    function accrue() public {
        // calculate additional interest from last time
        uint256 additionalInterest = _calculateInterestFromLastTime();

        // set last time accrued
        totalDebtAccruedAt = block.timestamp;

        // plus additional interest
        totalDebtAmount += additionalInterest;
        totalFeeCollected += additionalInterest;
    }

    /**
     * @notice add a new collateral token
     * @dev only owner can call this function
     * @param _token collateral token address
     * @param _oracle collateral token price oracle
     * @param _creditLimitRate borrow limit
     * @param _liqLimitRate liquidation threshold rate
     */
    function addCollateralToken(
        address _token,
        address _oracle,
        Rate memory _creditLimitRate,
        Rate memory _liqLimitRate
    ) external onlyOwner {
        // validates collateral settings
        require(_oracle != address(0), 'invalid oracle address');
        _validateRate(_creditLimitRate);
        _validateRate(_liqLimitRate);

        // check if collateral token already exists
        require(!collateralSettings[_token].isValid, 'collateral token exists');

        // add a new collateral
        collateralSettings[_token] = CollateralSetting({
            isValid: true,
            oracle: IPriceOracle(_oracle),
            creditLimitRate: _creditLimitRate,
            liqLimitRate: _liqLimitRate,
            decimals: IERC20MetadataUpgradeable(_token).decimals()
        });
        collateralTokens.push(_token);
    }

    /**
     * @notice remove an existing collateral token
     * @dev only owner can call this function
     * @param _token collateral token address
     */
    function removeCollateralToken(address _token) external onlyOwner {
        // check if collateral token already exists
        require(collateralSettings[_token].isValid, 'invalid collateral token');

        // add a new collateral
        uint256 index = 0;
        uint256 length = collateralTokens.length;
        for (; index < length; index++) {
            if (collateralTokens[index] == _token) {
                break;
            }
        }

        collateralTokens[index] = collateralTokens[length - 1];
        delete collateralTokens[length - 1];
        collateralTokens.pop();
    }

    /**
     * @notice returns all collateral tokens in array format
     * @return The collateral tokens in array format
     */
    function allCollateralTokens() external view returns (address[] memory) {
        return collateralTokens;
    }

    /**
     * @notice collect protocol fees accrued so far
     * @dev only owner can call this function
     */
    function collectOrgFee() external nonReentrant onlyOwner {
        accrue();

        // collect protocol fees in USP
        usp.mint(msg.sender, totalFeeCollected);
        totalFeeCollected = 0;
    }

    /**
     * @notice deposit collateral
     * @dev user can call this function after approving his/her collateral amount
     * @param _token collateral token address
     * @param _amount collateral amount to deposit
     * @param _onBehalfOf deposit collateral for
     */
    function deposit(
        address _token,
        uint256 _amount,
        address _onBehalfOf
    ) external nonReentrant {
        require(collateralSettings[_token].isValid, 'invalid token');

        // get collateral from depositor
        IERC20MetadataUpgradeable(_token).safeTransferFrom(msg.sender, address(this), _amount);

        // update a user's collateral position
        userPositions[_onBehalfOf][_token].amount += _amount;

        emit Deposit(_onBehalfOf, _token, _amount);
    }

    /**
     * @notice borrow USP
     * @dev user can call this function after depositing his/her collateral
     * @param _token collateral token address
     * @param _uspAmount USP amount to borrow
     */
    function borrow(address _token, uint256 _uspAmount) external nonReentrant {
        // check if collateral is valid
        require(collateralSettings[_token].isValid, 'invalid token');

        accrue();

        // calculate borrow limit in USD
        uint256 creditLimit = _creditLimitUSD(msg.sender, _token);
        // calculate debt amount in USD
        uint256 debtAmount = _debtUSD(msg.sender, _token);

        // check if additional borrow is available
        require(debtAmount + _uspAmount <= creditLimit, 'insufficient collateral');

        // calculate USP mint fee
        uint256 orgFee = (_uspAmount * settings.orgFeeRate.numerator) / settings.orgFeeRate.denominator;
        totalFeeCollected += orgFee;

        // mint USP to user
        usp.mint(msg.sender, _uspAmount - orgFee);

        // update user's collateral position
        Position storage position = userPositions[msg.sender][_token];
        if (totalDebtPortion == 0) {
            totalDebtPortion = _uspAmount;
            position.debtPortion = _uspAmount;
        } else {
            uint256 plusPortion = (totalDebtPortion * _uspAmount) / totalDebtAmount;
            totalDebtPortion += plusPortion;
            position.debtPortion += plusPortion;
        }
        position.debtPrincipal += _uspAmount;
        totalDebtAmount += _uspAmount;

        emit Borrowed(msg.sender, _uspAmount);
    }

    /**
     * @notice withdraw collateral
     * @dev user can call this function after depositing his/her collateral
     * @param _token collateral token address
     * @param _amount collateral amount to withdraw
     */
    function withdraw(address _token, uint256 _amount) external nonReentrant {
        // check if collateral is valid
        require(collateralSettings[_token].isValid, 'invalid token');

        accrue();

        Position storage position = userPositions[msg.sender][_token];

        // check if withdraw amount is more than the collateral amount
        require(position.amount >= _amount, 'insufficient collateral');

        // calculate borrow limit after withdraw in USD
        uint256 creditLimitAfterWithdraw = (_tokenUSD(_token, position.amount - _amount) *
            collateralSettings[_token].creditLimitRate.numerator) /
            collateralSettings[_token].creditLimitRate.denominator;
        // calculate debt amount in USD
        uint256 debtAmount = _debtUSD(msg.sender, _token);

        // check if withdraw is available
        require(debtAmount <= creditLimitAfterWithdraw, 'insufficient collateral');

        // update user's collateral position
        position.amount -= _amount;

        // transfer collateral to user
        IERC20MetadataUpgradeable(_token).safeTransfer(msg.sender, _amount);

        emit Withdraw(msg.sender, _token, _amount);
    }

    /**
     * @notice repay position with USP
     * @dev user can call this function after approving his/her USP amount to repay
     * @param _token collateral token address
     * @param _uspAmount USP amount to repay
     */
    function repay(address _token, uint256 _uspAmount) external nonReentrant {
        // check if collateral is valid
        require(collateralSettings[_token].isValid, 'invalid token');

        accrue();

        require(_uspAmount > 0, 'invalid amount');

        Position storage position = userPositions[msg.sender][_token];

        // calculate debt amount in USD
        uint256 debtAmount = _debtUSD(msg.sender, _token);
        uint256 debtPrincipal = position.debtPrincipal;
        uint256 debtInterest = debtAmount - debtPrincipal;

        // only pays for the debt and returns remainings
        _uspAmount = _uspAmount > debtAmount ? debtAmount : _uspAmount;

        // burn repaid USP
        usp.burnFrom(msg.sender, _uspAmount);

        // update user's collateral position
        uint256 paidPrincipal = _uspAmount > debtInterest ? _uspAmount - debtInterest : 0;
        uint256 minusPortion = paidPrincipal == debtPrincipal
            ? position.debtPortion
            : (totalDebtPortion * _uspAmount) / totalDebtAmount;

        totalDebtAmount -= _uspAmount;
        totalDebtPortion -= minusPortion;
        position.debtPrincipal -= paidPrincipal;
        position.debtPortion -= minusPortion;

        emit Repay(msg.sender, _uspAmount);
    }

    /**
     * @notice liquidate a user's position
     * @dev liquidator can call this function after approving his/her USP amount to repay for (up to 50% avaialble)
     * @param _user a user address
     * @param _token collateral token address
     * @param _uspAmount USP amount to repay
     */
    function liquidate(
        address _user,
        address _token,
        uint256 _uspAmount
    ) external nonReentrant {
        // check if collateral is valid
        require(collateralSettings[_token].isValid, 'invalid token');

        accrue();

        Position storage position = userPositions[_user][_token];
        // calculate debt amount in USD
        uint256 debtAmount = _debtUSD(_user, _token);
        uint256 debtPrincipal = position.debtPrincipal;
        uint256 debtInterest = debtAmount - debtPrincipal;

        // check if liquidation is available
        require(debtAmount > _liquidateLimitUSD(_user, _token), 'not liquidatable');
        // limit repay amount upto 50%
        require(_uspAmount <= debtAmount / 2, 'up to 50% available');

        // burn repaid USP
        usp.burnFrom(msg.sender, _uspAmount);

        // update user's collateral position
        uint256 paidPrincipal = _uspAmount > debtInterest ? _uspAmount - debtInterest : 0;
        uint256 minusPortion = paidPrincipal == debtPrincipal
            ? position.debtPortion
            : (totalDebtPortion * _uspAmount) / totalDebtAmount;

        totalDebtAmount -= _uspAmount;
        totalDebtPortion -= minusPortion;
        position.debtPrincipal -= paidPrincipal;
        position.debtPortion -= minusPortion;

        // returns liquidation fee to liquidator
        uint256 liquidatorFeeUSD = _uspAmount +
            (_uspAmount * settings.liquidatorFeeRate.numerator) /
            settings.liquidatorFeeRate.denominator;
        position.amount -= _returnFeeFromCollateral(msg.sender, _token, liquidatorFeeUSD);

        // returns organization revenue to the owner
        uint256 orgRevenueUSD = (_uspAmount * settings.orgRevenueFeeRate.numerator) /
            settings.orgRevenueFeeRate.denominator;
        position.amount -= _returnFeeFromCollateral(owner(), _token, orgRevenueUSD);

        emit Liquidate(_user, _token, _uspAmount, msg.sender);
    }

    /// @notice A struct to preview a user's collateral position
    struct PositionView {
        address owner;
        address token;
        uint256 amount;
        uint256 amountUSD;
        uint256 creditLimitUSD;
        uint256 debtPrincipal;
        uint256 debtInterest;
        bool liquidatable;
    }

    /**
     * @notice returns a user's collateral position
     * @return position this includes a user's collateral, debt, liquidation data.
     */
    function positionView(address _user, address _token) external view returns (PositionView memory) {
        Position memory position = userPositions[_user][_token];

        // this is a copy from _debtUSD but should include additional-interest calculation
        uint256 debtCalculated = totalDebtPortion == 0
            ? 0
            : ((totalDebtAmount + _calculateInterestFromLastTime()) * userPositions[_user][_token].debtPortion) /
                totalDebtPortion;
        uint256 debtPrincipal = userPositions[_user][_token].debtPrincipal;
        uint256 debtAmount = debtPrincipal > debtCalculated ? debtPrincipal : debtCalculated;

        return
            PositionView({
                owner: _user,
                token: _token,
                amount: position.amount,
                amountUSD: _tokenUSD(_token, position.amount),
                creditLimitUSD: _creditLimitUSD(_user, _token),
                debtPrincipal: position.debtPrincipal,
                debtInterest: debtAmount - position.debtPrincipal,
                liquidatable: debtAmount >= _liquidateLimitUSD(_user, _token)
            });
    }

    /// INTERNAL FUNCTIONS

    /**
     * @notice validate rate denominator and numerator
     */
    function _validateRate(Rate memory rate) internal pure {
        require(rate.denominator > 0 && rate.denominator >= rate.numerator, 'invalid rate');
    }

    /**
     * @notice calculate additional interest accrued from last time
     * @return The interest accrued from last time
     */
    function _calculateInterestFromLastTime() internal view returns (uint256) {
        // calculate elapsed time from last accrued at
        uint256 elapsedTime = block.timestamp - totalDebtAccruedAt;

        // calculate interest based on elapsed time and interest APR
        return
            (elapsedTime * totalDebtAmount * settings.interestApr.numerator) /
            settings.interestApr.denominator /
            365 days;
    }

    /**
     * @notice returns the USD amount
     * @param token collateral token address
     * @param amount token amount
     * @return The USD amount in 18 decimals
     */
    function _tokenUSD(address token, uint256 amount) internal view returns (uint256) {
        // get price from collateral token oracle contract
        uint256 price = collateralSettings[token].oracle.getPrice(token);

        // convert to 18 decimals
        return (amount * price * 10**10) / (10**collateralSettings[token].decimals);
    }

    /**
     * @notice returns the borrow limit amount in USD
     * @param _user user address
     * @param _token collateral token address
     * @return The USD amount in 18 decimals
     */
    function _creditLimitUSD(address _user, address _token) internal view returns (uint256) {
        uint256 amount = userPositions[_user][_token].amount;
        uint256 totalUSD = _tokenUSD(_token, amount);
        return
            (totalUSD * collateralSettings[_token].creditLimitRate.numerator) /
            collateralSettings[_token].creditLimitRate.denominator;
    }

    /**
     * @notice returns the liquidation threshold amount in USD
     * @param _user user address
     * @param _token collateral token address
     * @return The USD amount in 18 decimals
     */
    function _liquidateLimitUSD(address _user, address _token) internal view returns (uint256) {
        uint256 amount = userPositions[_user][_token].amount;
        uint256 totalUSD = _tokenUSD(_token, amount);
        return
            (totalUSD * collateralSettings[_token].liqLimitRate.numerator) /
            collateralSettings[_token].liqLimitRate.denominator;
    }

    /**
     * @notice returns the debt amount in USD
     * @param _user user address
     * @param _token collateral token address
     * @return The USD amount in 18 decimals
     */
    function _debtUSD(address _user, address _token) internal view returns (uint256) {
        uint256 debtCalculated = totalDebtPortion == 0
            ? 0
            : (totalDebtAmount * userPositions[_user][_token].debtPortion) / totalDebtPortion;
        uint256 debtPrincipal = userPositions[_user][_token].debtPrincipal;

        return debtPrincipal > debtCalculated ? debtPrincipal : debtCalculated; // consider of round at debt calculation
    }

    /**
     * @notice transfers fees
     * @param _recipient recipient address
     * @param _token collateral token address
     * @param _returnUSD collateral amount in USD
     * @return collateralReturned collateral amount transfered
     */
    function _returnFeeFromCollateral(
        address _recipient,
        address _token,
        uint256 _returnUSD
    ) internal returns (uint256 collateralReturned) {
        // get price from collateral token oracle contract
        uint256 price = collateralSettings[_token].oracle.getPrice(_token);
        // calculate collateral mount to be transfered (from USD amount)
        collateralReturned = (_returnUSD * (10**collateralSettings[_token].decimals)) / price / 10**10;

        // transfer collateral amount to recipient
        IERC20MetadataUpgradeable(_token).safeTransfer(_recipient, collateralReturned);
    }
}
