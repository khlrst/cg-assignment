// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {CGToken} from "../src/CGToken.sol";

contract CGTokenScript is Script {
    CGToken public token;

    function setUp() public {}

    function run() public {
        vm.startBroadcast(vm.envUint("PK"));

        token = new CGToken();

        vm.stopBroadcast();
    }
}
