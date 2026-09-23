// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import { ERC20 } from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract CGToken is ERC20 {

    error InvalidBatchLength();

    constructor() ERC20("CG Token", "CGT") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function mintBatch(address[] memory to, uint256[] memory amounts) public {
        if (to.length != amounts.length) {
            revert InvalidBatchLength();
        }
        for (uint256 i = 0; i < to.length; i++) {
            _mint(to[i], amounts[i]);
        }
    }

    function transferBatch(address[] memory to, uint256[] memory amounts) public {
        if (to.length != amounts.length) {
            revert InvalidBatchLength();
        }
        for (uint256 i = 0; i < to.length; i++) {
            _transfer(_msgSender(), to[i], amounts[i]);
        }
    }
}
