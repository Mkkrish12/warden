// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {APPolicy} from "../src/APPolicy.sol";

/// @notice Seeds (or re-seeds) the demo vendors on an already-deployed APPolicy.
/// @dev Deploy.s.sol already seeds on first deploy; use this to reset caps later.
///      Run with:
///      forge script script/Seed.s.sol:Seed --rpc-url monad_testnet --broadcast
contract Seed is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        APPolicy policy = APPolicy(vm.envAddress("POLICY_CONTRACT_ADDRESS"));

        vm.startBroadcast(deployerKey);

        policy.setVendor(keccak256("acme-corp"), 2000e6);
        policy.setVendor(keccak256("globex"), 5000e6);
        policy.setVendor(keccak256("initech"), 1000e6);

        vm.stopBroadcast();

        console.log("Seeded vendors on APPolicy at:", address(policy));
        console.log("  acme-corp cap:", policy.approvedVendors(keccak256("acme-corp")));
        console.log("  globex    cap:", policy.approvedVendors(keccak256("globex")));
        console.log("  initech   cap:", policy.approvedVendors(keccak256("initech")));
    }
}
