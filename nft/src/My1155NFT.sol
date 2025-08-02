// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract My1155NFT is ERC1155 {
    uint256 public constant TOKEN_ID = 1;
    uint256 public constant PRICE = 0.1 ether;

    constructor() ERC1155("https://example.com/api/token/{id}.json") {}

    function mint() external payable {
        require(msg.value == PRICE, "Wrong ETH amount");
        _mint(msg.sender, TOKEN_ID, 1, "");
    }
}
