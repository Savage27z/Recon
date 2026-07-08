// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract DeployMockUSDC is Script {
    function run() external returns (MockUSDC token) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console.log("Deployer:", deployer);

        vm.startBroadcast(pk);
        token = new MockUSDC();
        token.mint(deployer, 1_000_000_000_000); // 1,000,000 mUSDC
        vm.stopBroadcast();

        console.log("MockUSDC deployed at:", address(token));
    }
}
