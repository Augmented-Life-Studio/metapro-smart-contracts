//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Define the struct in the SharedStruct contract
contract SpacePad {
    struct SpacePadRoundConfiguration {
        uint256 roundIndex;
        uint256 roundMaxCap;
        uint256 roundMaxUnits;
        uint256 roundUnitsLeft;
        uint256 initialUnitPrice;
        uint256 currentUnitPrice;
        uint256 currentCap;
        uint256 currentStepDepositsAmount;
        uint256 nextStepDepositsAmountIncrease;
        uint256 nextStepUnitPriceIncrease;
        uint256 singleWalletUnitsLimit;
        address tokenAddress;
        string tokenTicker;
        bool active;
    }
}
