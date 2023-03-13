// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

contract BUSDToken is ERC20 {
    using SafeMath for uint256;

    uint256 private _totalSupply;
    uint8 public _decimals = 18;
    string public _name = "BUSD Token";
    string public _symbol = "BUSD";

    constructor(address[] memory _getters) ERC20(_name, _symbol) {
        uint256 deployerSupply = 15 * 10e8 * 10e18; // 1.5B
        uint256 gettersSupply = 15 * 10e8 * 10e18 * _getters.length;
        for (uint256 i = 0; i < _getters.length; i++) {
            _mint(_getters[i], gettersSupply / _getters.length);
        }

        _mint(msg.sender, deployerSupply);
        _totalSupply = deployerSupply + gettersSupply;
    }
}
