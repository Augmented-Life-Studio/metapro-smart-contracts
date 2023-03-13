//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./libraries/SpacePad.sol";

//  referral
interface Referral {
    function saveReferralDeposit(
        address _referrer,
        address _depositer,
        address _mainReferred,
        uint8 _level,
        uint256 _referralFeeAmount,
        SpacePad.SpacePadRoundConfiguration memory roundConfiguration
    ) external;

    function setReferral(address _referred, address _referrer) external;

    function getReferral(address _referred) external view returns (address);
}

contract SpacePadFriends is Pausable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct ReferrallDeposits {
        address depositer;
        address mainReferred;
        uint8 level;
        uint256 referralFeeAmount;
    }

    struct ReferralEaarnings {
        uint256 all;
        uint256 level1;
        uint256 level2;
        uint256 level3;
    }

    struct WalletUnits {
        address wallet;
        uint256 units;
    }

    mapping(uint256 => SpacePad.SpacePadRoundConfiguration)
        public spacePadRound;

    uint256 public level1ReferrerFee = 800; // 800 = 8%
    uint256 public level2ReferrerFee = 400; // 400 = 4%
    uint256 public level3ReferrerFee = 300; // 300 = 3%
    //

    mapping(address => uint256) private balances;

    mapping(address => mapping(uint256 => uint256)) public walletRoundUnits;

    mapping(address => uint256) public allWalletUnits;

    mapping(address => ReferrallDeposits[]) private referralDeposits;

    uint256 private currentRoundIndex = 1;

    address public spacePadReferralAddress;

    address public spacePadTreasuryAddress;

    uint256 public activeRoundIndex;

    WalletUnits[] private walletUnits;

    event Deposited(address indexed referrer, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event UpdatedFee(
        uint256 level1ReferrerFee,
        uint256 level2ReferrerFee,
        uint256 level3ReferrerFee
    );
    event UpdatedDepositTokenAddress(address depositTokenAddress);
    event SetSpacePadReferralAddress(
        address indexed sender,
        address indexed spacePadReferralAddress
    );

    event SetSpacePadTreasuryAddress(
        address indexed sender,
        address indexed spacePadTreasuryAddress
    );

    event ActivateRound(uint256 indexed roundIndex);

    event DeactivateRound(uint256 indexed roundIndex);

    constructor(address _referralAddress, address _treasuryAddress) {
        spacePadReferralAddress = _referralAddress;
        spacePadTreasuryAddress = _treasuryAddress;
    }

    function createRound(
        uint256 _roundMaxCap, //maximum amount of all deposits in the round
        uint256 _unitPrice,
        uint256 _nextStepDepositsAmountIncrease, // the number of deposits after which we increase the price of the unit
        uint256 _nextStepUnitPriceIncrease, // the amount by which we increase the unit price in the next step
        uint256 _singleWalletUnitsLimit,
        address _tokenAddress,
        string memory _tokenTicker
    ) public onlyOwner {
        require(_roundMaxCap > 0, "Round maxCap should be greater than0");

        // Create a new SpacePadRoundConfiguration struct
        SpacePad.SpacePadRoundConfiguration memory roundConfiguration = SpacePad
            .SpacePadRoundConfiguration(
                currentRoundIndex,
                _roundMaxCap,
                0,
                0,
                _unitPrice,
                _unitPrice,
                0,
                0,
                _nextStepDepositsAmountIncrease,
                _nextStepUnitPriceIncrease,
                _singleWalletUnitsLimit,
                _tokenAddress,
                _tokenTicker,
                false
            );

        uint256 allUnitsAmount = getAllUnitsValue(roundConfiguration);

        roundConfiguration.roundUnitsLeft = allUnitsAmount;
        roundConfiguration.roundMaxUnits = allUnitsAmount;

        // Add the roundConfiguration to the rounds mapping
        spacePadRound[currentRoundIndex] = roundConfiguration;

        currentRoundIndex++;
    }

    function deactivateRound(uint256 _roundIndex) public onlyOwner {
        activeRoundIndex = 0;
        spacePadRound[_roundIndex].active = false;
        emit DeactivateRound(_roundIndex);
    }

    function activateRound(uint256 _roundIndex) public onlyOwner {
        bool allIsUnactivate = true;
        for (uint256 i = 0; i < currentRoundIndex; i++) {
            if (spacePadRound[i].active) {
                allIsUnactivate = false;
            }
        }

        require(allIsUnactivate, "All rounds should be deactivated first");
        require(
            spacePadRound[_roundIndex].roundIndex > 0,
            "Round with this index doeas not exist"
        );
        activeRoundIndex = _roundIndex;
        spacePadRound[_roundIndex].active = true;
        emit ActivateRound(_roundIndex);
    }

    function deposit(
        uint256 _amount,
        address _referrer
    ) external whenNotPaused nonReentrant {
        require(activeRoundIndex > 0, "No active round at the moment");

        SpacePad.SpacePadRoundConfiguration
            storage currentRound = spacePadRound[activeRoundIndex];

        require(
            walletRoundUnits[msg.sender][currentRound.roundIndex] +
                _amount.div(currentRound.currentUnitPrice) <=
                currentRound.singleWalletUnitsLimit,
            "The unit purchase limit for wallet has been reached"
        );

        bool maxCapReached = currentRound.currentCap + _amount >
            currentRound.roundMaxCap;

        require(!maxCapReached, "Max cap for the round has been reached");

        require(_amount > 0, "Min deposit should be higher that 0");

        require(
            _amount % currentRound.currentUnitPrice == 0,
            "The amount should match the multiplication of the current unit price"
        );

        uint256 currentStepDepositAmountWithCurrentDeposit = currentRound
            .currentStepDepositsAmount +
            (_amount / currentRound.currentUnitPrice);

        require(
            currentStepDepositAmountWithCurrentDeposit <=
                currentRound.nextStepDepositsAmountIncrease,
            "Deposit amount should be lower for the current step"
        );

        IERC20 depositTokenAddress = IERC20(currentRound.tokenAddress);
        balances[msg.sender] += _amount;

        uint256 fee = sendFeesToReferrers(_referrer, _amount, currentRound);

        uint256 depositAmount = _amount - fee;

        depositTokenAddress.safeTransferFrom(
            msg.sender,
            spacePadTreasuryAddress,
            depositAmount
        );

        walletRoundUnits[msg.sender][currentRound.roundIndex] += _amount.div(
            currentRound.currentUnitPrice
        );

        allWalletUnits[msg.sender] += _amount.div(
            currentRound.currentUnitPrice
        );

        addWalletUnits(msg.sender, _amount.div(currentRound.currentUnitPrice));

        currentRound.currentStepDepositsAmount +=
            _amount /
            currentRound.currentUnitPrice;

        currentRound.currentCap += _amount;

        bool capReached = currentRound.currentCap == currentRound.roundMaxCap;

        if (
            currentRound.currentStepDepositsAmount ==
            currentRound.nextStepDepositsAmountIncrease
        ) {
            currentRound.currentStepDepositsAmount = 0;
            if (!capReached)
                currentRound.currentUnitPrice += currentRound
                    .nextStepUnitPriceIncrease;
        }

        if (capReached) currentRound.active = false;

        uint256 roundUnitsSold = getRoundUnitsSold(currentRound);
        currentRound.roundUnitsLeft =
            currentRound.roundMaxUnits -
            roundUnitsSold;

        Referral(spacePadReferralAddress).setReferral(msg.sender, _referrer);
        emit Deposited(_referrer, _amount);
    }

    function sendFeesToReferrers(
        address _referrer,
        uint256 _amount,
        SpacePad.SpacePadRoundConfiguration storage currentRound
    ) private returns (uint256) {
        uint256 fee = 0;
        address referrer = _referrer;
        address spacePadReferrer = Referral(spacePadReferralAddress)
            .getReferral(msg.sender);

        if (spacePadReferrer != address(0)) {
            referrer = spacePadReferrer;
        }
        if (referrer != address(0)) {
            // Level 1
            uint256 level1Fee = depositOnReferrer(
                referrer,
                msg.sender,
                _amount,
                level1ReferrerFee,
                currentRound
            );

            fee += level1Fee;

            // Level 2
            address level2Referrer = Referral(spacePadReferralAddress)
                .getReferral(referrer);
            if (level2Referrer != address(0)) {
                uint256 level2Fee = depositOnReferrer(
                    level2Referrer,
                    referrer,
                    _amount,
                    level2ReferrerFee,
                    currentRound
                );

                fee += level2Fee;

                // Level 3
                address level3Referrer = Referral(spacePadReferralAddress)
                    .getReferral(level2Referrer);
                if (level3Referrer != address(0)) {
                    uint256 level3Fee = depositOnReferrer(
                        level3Referrer,
                        level2Referrer,
                        _amount,
                        level3ReferrerFee,
                        currentRound
                    );

                    fee += level3Fee;
                }
            }
        }
        return fee;
    }

    function withdraw(
        address _recipient,
        uint256 _roundIndex
    ) external whenNotPaused onlyOwner {
        require(_recipient != address(0), "Invalid Recipient Address");
        SpacePad.SpacePadRoundConfiguration
            storage currentRound = spacePadRound[_roundIndex];
        uint256 balance = currentRound.currentCap;

        IERC20(currentRound.tokenAddress).safeTransfer(_recipient, balance);

        emit Withdrawn(_recipient, balance);
    }

    function withdrawAll(
        address payable _recipient
    ) external whenNotPaused onlyOwner {
        require(_recipient != address(0), "Invalid Recipient Address");
        _recipient.transfer(address(this).balance);
    }

    function balanceOf(address _addr) public view returns (uint256) {
        return balances[_addr];
    }

    function depositOnReferrer(
        address _referrer,
        address _mainReferred,
        uint256 _amount,
        uint256 _referralFee,
        SpacePad.SpacePadRoundConfiguration storage roundConfiguration
    ) private returns (uint256) {
        uint256 referralFeeAmount = _amount.mul(_referralFee).div(10000);
        IERC20 depositTokenAddress = IERC20(roundConfiguration.tokenAddress);
        uint8 level = 1;
        if (_referralFee == level2ReferrerFee) {
            level = 2;
        }
        if (_referralFee == level3ReferrerFee) {
            level = 3;
        }

        depositTokenAddress.safeTransferFrom(
            msg.sender,
            _referrer,
            referralFeeAmount
        );

        Referral(spacePadReferralAddress).saveReferralDeposit(
            _referrer,
            msg.sender,
            _mainReferred,
            level,
            referralFeeAmount,
            roundConfiguration
        );
        return referralFeeAmount;
    }

    /**
     * @dev Set fee
     * @param _level1Fee, _level2Fee, _level3Fee percentage (using 2 decimals - 10000 = 100, 0 = 0)
     */
    function setFee(
        uint256 _level1Fee,
        uint256 _level2Fee,
        uint256 _level3Fee
    ) external onlyOwner {
        require(
            _level1Fee < 1000 || _level2Fee < 1000 || _level3Fee < 1000,
            "One of fees is too high, maximum single value is 10% - 1000"
        );
        level1ReferrerFee = _level1Fee;
        level2ReferrerFee = _level2Fee;
        level3ReferrerFee = _level3Fee;
        emit UpdatedFee(
            level1ReferrerFee,
            level2ReferrerFee,
            level3ReferrerFee
        );
    }

    function getRoundUnitsSold(
        SpacePad.SpacePadRoundConfiguration memory currentRound
    ) private pure returns (uint256) {
        uint256 currentCapFromUnitsLeft = 0;
        uint256 unitPrice = currentRound.initialUnitPrice;
        uint256 unitsLeft = 0;
        do {
            if (
                currentRound.currentCap - currentCapFromUnitsLeft <=
                unitPrice * currentRound.nextStepDepositsAmountIncrease
            ) {
                uint256 capLeft = currentRound.currentCap -
                    currentCapFromUnitsLeft;
                unitsLeft += capLeft / unitPrice;
                currentCapFromUnitsLeft += capLeft;
            } else {
                unitsLeft += currentRound.nextStepDepositsAmountIncrease;
                currentCapFromUnitsLeft +=
                    unitPrice *
                    currentRound.nextStepDepositsAmountIncrease;
            }

            unitPrice += currentRound.nextStepUnitPriceIncrease;
        } while (currentCapFromUnitsLeft != currentRound.currentCap);

        return unitsLeft;
    }

    function getAllUnitsValue(
        SpacePad.SpacePadRoundConfiguration memory currentRound
    ) private pure returns (uint256) {
        uint256 currentCap = 0;
        uint256 currentUnitPrice = currentRound.initialUnitPrice;
        uint256 allUnits = 0;
        do {
            if (
                currentRound.roundMaxCap - currentCap <=
                currentUnitPrice * currentRound.nextStepDepositsAmountIncrease
            ) {
                uint256 capLeft = currentRound.roundMaxCap - currentCap;
                allUnits += capLeft / currentUnitPrice;
                currentCap += capLeft;
            } else {
                allUnits += currentRound.nextStepDepositsAmountIncrease;
                currentCap +=
                    currentUnitPrice *
                    currentRound.nextStepDepositsAmountIncrease;
            }
            currentUnitPrice += currentRound.nextStepUnitPriceIncrease;
        } while (currentCap != currentRound.roundMaxCap);

        return allUnits;
    }

    function addWalletUnits(address _depositer, uint256 _units) private {
        bool walletHasUnits = false;
        for (uint256 i = 0; i < walletUnits.length; i++) {
            if (walletUnits[i].wallet == _depositer) {
                walletUnits[i].units += _units;
                walletHasUnits = true;
            }
        }

        if (!walletHasUnits) {
            WalletUnits memory unitsConfiguration = WalletUnits(
                _depositer,
                _units
            );
            walletUnits.push(unitsConfiguration);
        }
    }

    function getAllWalletUnits()
        external
        view
        onlyOwner
        returns (WalletUnits[] memory)
    {
        return walletUnits;
    }

    // Set address of SpacePadReferral contract
    function setSpacePadReferralAddress(
        address _spacePadReferral
    ) external onlyOwner {
        spacePadReferralAddress = _spacePadReferral;
        emit SetSpacePadReferralAddress(msg.sender, _spacePadReferral);
    }

    // Set address of treasury wallet address
    function setSpacePadTreasuryAddress(
        address _spacePadTreasuryAddress
    ) external onlyOwner {
        spacePadTreasuryAddress = _spacePadTreasuryAddress;
        emit SetSpacePadTreasuryAddress(msg.sender, _spacePadTreasuryAddress);
    }

    function pause() external onlyOwner {
        super._pause();
    }

    function unpause() external onlyOwner {
        super._unpause();
    }
}
