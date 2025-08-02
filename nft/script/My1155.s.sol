// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/My1155NFT.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        new My1155NFT();
        vm.stopBroadcast();
    }
}


contract Mint is Script {
    function run() external {
        address nft = 0x029B3855f8558B13C61691F703693E2Ac9E46A16;

        vm.startBroadcast();

        My1155NFT(nft).mint{value: 0.1 ether}();

        vm.stopBroadcast();
    }
}

// cast call 0x029B3855f8558B13C61691F703693E2Ac9E46A16 "balanceOf(address,uint256)" 0x8f22F1F08EF83ad6A060d1B01bf2284b162b71d8 1 --rpc-url https://rpc.dev.gblend.xyz

// 0x0000000000000000000000000000000000000000000000000000000000000001