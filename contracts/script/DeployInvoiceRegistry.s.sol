// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {InvoiceRegistry} from "../src/InvoiceRegistry.sol";

contract DeployInvoiceRegistry is Script {
    function run() external returns (InvoiceRegistry registry) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console.log("Deployer:", deployer);
        console.log("Chain id:", block.chainid);
        console.log("Deployer balance (wei):", deployer.balance);

        vm.startBroadcast(pk);
        registry = new InvoiceRegistry();
        vm.stopBroadcast();

        console.log("InvoiceRegistry deployed at:", address(registry));
    }
}
