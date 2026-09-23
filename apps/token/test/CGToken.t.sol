// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {CGToken} from "../src/CGToken.sol";

contract CGTokenTest is Test {
   CGToken public token;
   address public alice = makeAddr("alice");
   address public bob = makeAddr("bob");
   address public charlie = makeAddr("charlie");

    function setUp() public {
        token = new CGToken();
    }

    function test_freeMint() public {
        vm.prank(charlie);
        token.mint(alice, 100);
        assertEq(token.balanceOf(alice), 100);
    }

    function test_freeMintBatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100;
        amounts[1] = 200;
        vm.prank(charlie);
        token.mintBatch(recipients, amounts);
        assertEq(token.balanceOf(alice), 100);
        assertEq(token.balanceOf(bob), 200);
    }

    function test_transferBatch() public {
        token.mint(charlie, 300);
        assertEq(token.balanceOf(charlie), 300);
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100;
        amounts[1] = 200;

        vm.prank(charlie);

        token.transferBatch(recipients, amounts);
        assertEq(token.balanceOf(alice), 100);
        assertEq(token.balanceOf(bob), 200);
        assertEq(token.balanceOf(charlie), 0);
    }
}
