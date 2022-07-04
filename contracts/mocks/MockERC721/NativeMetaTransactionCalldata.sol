//SPDX-License-Identifier: GPL-3.0-or-later 
pragma solidity ^0.8.0;

import "./EIP712Base.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * Based on:
 * https://github.com/maticnetwork/pos-portal/blob/master/contracts/common/NativeMetaTransaction.sol
 * changed to accept abi.encoded calldata and forward msg.value
 */
contract NativeMetaTransactionCalldata is EIP712Base {
  bytes32 private constant META_TRANSACTION_TYPEHASH =
    keccak256(bytes("MetaTransaction(uint256 nonce,address from,bytes functionSignature)"));
  event MetaTransactionExecuted(
    address userAddress,
    address payable relayerAddress,
    bytes functionSignature
  );
  mapping(address => uint256) internal nonces;

  /*
   * Meta transaction structure.
   * No point of including value field here as if user is doing value transfer then he has the funds to pay for gas
   * He should call the desired function directly in that case.
   */
  struct MetaTransaction {
    uint256 nonce;
    address from;
    bytes functionSignature;
  }

  constructor(string memory name_) {
    _initializeEIP712(name_);
  }

  function executeMetaTransaction(
    address userAddress,
    bytes memory functionSignature,
    bytes32 sigR,
    bytes32 sigS,
    uint8 sigV
  ) public payable returns (bytes memory) {
    return executeMetaTransaction(userAddress, functionSignature, sigR, sigS, sigV, "");
  }

  function executeMetaTransaction(
    address userAddress,
    bytes memory functionSignature,
    bytes32 sigR,
    bytes32 sigS,
    uint8 sigV,
    bytes memory callData
  ) public payable returns (bytes memory) {
    MetaTransaction memory metaTx = MetaTransaction({
      nonce: nonces[userAddress],
      from: userAddress,
      functionSignature: functionSignature
    });
    require(verify(userAddress, metaTx, sigR, sigS, sigV), "Signer and signature do not match");

    // increase nonce for user (to avoid re-use)
    nonces[userAddress] = nonces[userAddress] + 1;

    emit MetaTransactionExecuted(userAddress, payable(msg.sender), functionSignature);

    // Append userAddress and relayer address at the end to extract it from calling context
    return
      Address.functionCallWithValue(
        address(this),
        abi.encodePacked(functionSignature, callData, userAddress),
        msg.value
      );
  }

  function hashMetaTransaction(MetaTransaction memory metaTx) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          META_TRANSACTION_TYPEHASH,
          metaTx.nonce,
          metaTx.from,
          keccak256(metaTx.functionSignature)
        )
      );
  }

  function getNonce(address user) public view returns (uint256 nonce) {
    nonce = nonces[user];
  }

  function verify(
    address signer,
    MetaTransaction memory metaTx,
    bytes32 sigR,
    bytes32 sigS,
    uint8 sigV
  ) internal view returns (bool) {
    require(signer != address(0), "NativeMetaTransaction: INVALID_SIGNER");
    return signer == ecrecover(toTypedMessageHash(hashMetaTransaction(metaTx)), sigV, sigR, sigS);
  }
}
