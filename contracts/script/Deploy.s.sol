// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {APPolicy} from "../src/APPolicy.sol";

/// @notice Deploys APPolicy and seeds the demo vendors in a single broadcast.
/// @dev Run with:
///      forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        APPolicy policy = new APPolicy(deployer);

        // Seed demo vendors. Caps are USDC 6-decimals.
        policy.setVendor(keccak256("acme-corp"), 2000e6);
        policy.setVendor(keccak256("globex"), 5000e6);
        policy.setVendor(keccak256("initech"), 1000e6);

        vm.stopBroadcast();

        console.log("");
        console.log("=======================================================");
        console.log("  APPolicy deployed");
        console.log("=======================================================");
        console.log("  Network       : Monad testnet (chain 10143)");
        console.log("  Deployer/owner:", deployer);
        console.log("");
        console.log("  POLICY_CONTRACT_ADDRESS=%s", address(policy));
        console.log("");
        console.log("  Explorer: https://testnet.monadexplorer.com/address/%s", address(policy));
        console.log("=======================================================");
        console.log("  Seeded vendors (cap in USDC 6dp):");
        console.log("    acme-corp  2000000000  (=$2,000)");
        console.log("    globex     5000000000  (=$5,000)");
        console.log("    initech    1000000000  (=$1,000)");
        console.log("=======================================================");
    }
}
