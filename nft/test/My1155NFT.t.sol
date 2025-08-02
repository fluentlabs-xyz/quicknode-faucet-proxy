// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/My1155NFT.sol";

contract My1155NFTTest is Test {
    My1155NFT nft;
    address user = address(0x123);

    function setUp() public {
        nft = new My1155NFT();
        vm.deal(user, 1 ether);
    }

    function testMintWithCorrectEth() public {
        vm.prank(user);
        nft.mint{value: 0.1 ether}();
        assertEq(nft.balanceOf(user, nft.TOKEN_ID()), 1);
    }

    function testMintWithWrongEth() public {
        vm.prank(user);
        vm.expectRevert("Wrong ETH amount");
        nft.mint{value: 0.01 ether}();
    }
}
