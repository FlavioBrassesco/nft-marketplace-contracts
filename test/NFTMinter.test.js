const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMinter, mint } = require("./helpers");

const BASE_URI = "https://ipfs.io/hash/";
const CONTRACT_URI = "https://ipfs.io/hash/contract.json";

describe("NFTMinter", function () {
  let nftminter;
  let owner, addr1;
  const MAX_SUPPLY = 3;
  const FLOOR_PRICE = 1000000;
  beforeEach(async () => {
    [owner, addr1] = await ethers.getSigners();
    nftminter = await deployMinter(
      "NFTMinter1",
      "NM1",
      CONTRACT_URI,
      BASE_URI,
      MAX_SUPPLY,
      FLOOR_PRICE
    );
  });
  describe("Metadata", () => {
    it("Should return contract name", async function () {
      expect(await nftminter.name()).to.equal("NFTMinter1");
    });
    it("Should return contract symbol", async function () {
      expect(await nftminter.symbol()).to.equal("NM1");
    });
    it("Should return contractURI", async function () {
      expect(await nftminter.contractURI()).to.equal(CONTRACT_URI);
    });

    it("Should pass if URI for tokens is correct", async () => {
      await mint(nftminter, addr1.address, 1);
      expect(await nftminter.tokenURI(0)).to.equal(`${BASE_URI}0`);
    });
  });

  describe("Minting", () => {
    it("Should revert if minter is not owner and does not send msg.value", async () => {
      await expect(
        nftminter.connect(addr1).mint(addr1.address, "url")
      ).to.be.revertedWith("Value sent should be equal to floor price");
    });

    it("Should revert if minting more than totalSupply", async () => {
      await mint(nftminter, addr1.address, MAX_SUPPLY);

      await expect(nftminter.mint(addr1.address, "url")).to.be.revertedWith(
        "Maximum supply of tokens already minted."
      );
    });

    it("Should revert if minting to the 0 address", async () => {
      await expect(nftminter.mint(ethers.constants.AddressZero, "url")).to.be.revertedWith(
        "ERC721: mint to the zero address"
      );
    });

    it("Should pass if addr1 successfully mints by sending correct msg.value", async () => {
      const options = {
        value: FLOOR_PRICE,
      };
      const tx = await nftminter
        .connect(addr1)
        .mint(addr1.address, "mintedWithValue", options);
      tx.wait();

      expect(await nftminter.balanceOf(addr1.address)).to.equal(1);
      expect(await nftminter.totalSupply()).to.equal(1);
      expect(await nftminter.ownerOf(0)).to.equal(addr1.address);
      expect(await nftminter.tokenURI(0)).to.equal(
        `${BASE_URI}mintedWithValue`
      );
    });
  });

  describe("Transferring", () => {
    it("Should revert if non approved tries to transfer a token from addr1", async () => {
      const [, addr1, addr2] = await ethers.getSigners();
      await mint(nftminter, addr1.address, 1);

      await expect(
        nftminter.transferFrom(addr1.address, addr2.address, 0)
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("Should revert if addr1 tries to transfer to 0 address", async () => {
      await mint(nftminter, addr1.address, 1);

      await expect(
        nftminter.connect(addr1).transferFrom(addr1.address, ethers.constants.AddressZero, 0)
      ).to.be.revertedWith("ERC721: transfer to the zero address");
    });

    it("Should pass if addr1 successfully transfers with transferFrom", async () => {
      const [, addr1, addr2] = await ethers.getSigners();
      await mint(nftminter, addr1.address, 1);

      const tx = await nftminter
        .connect(addr1)
        .transferFrom(addr1.address, addr2.address, 0);
      tx.wait();

      expect(await nftminter.ownerOf(0)).to.equal(addr2.address);
      expect(await nftminter.balanceOf(addr1.address)).to.equal(0);
      expect(await nftminter.balanceOf(addr2.address)).to.equal(1);
    });

    it("Should revert if addr1 tries to safeTransfer to a contract with no IERC721Receiver support", async () => {
      const DummyContract = await ethers.getContractFactory("EIP712Base");
      const dummycontract = await DummyContract.deploy();
      await dummycontract.deployed();

      await mint(nftminter, addr1.address, 1);

      await expect(
        nftminter
          .connect(addr1)
          ["safeTransferFrom(address,address,uint256)"](
            addr1.address,
            dummycontract.address,
            0
          )
      ).to.be.revertedWith(
        "ERC721: transfer to non ERC721Receiver implementer"
      );
    });

    it("Should pass if addr1 successfully transfers with safeTransferFrom", async () => {
      const [, addr1, addr2] = await ethers.getSigners();
      await mint(nftminter, addr1.address, 1);

      const tx = await nftminter
        .connect(addr1)
        ["safeTransferFrom(address,address,uint256)"](
          addr1.address,
          addr2.address,
          0
        );
      tx.wait();

      expect(await nftminter.ownerOf(0)).to.equal(addr2.address);
      expect(await nftminter.balanceOf(addr1.address)).to.equal(0);
      expect(await nftminter.balanceOf(addr2.address)).to.equal(1);
    });
  });

  describe("Approvals", () => {
    it("Should pass if addr2 is correctly approved to manage tokenId 0", async () => {
      const [, addr1, addr2] = await ethers.getSigners();
      await mint(nftminter, addr1.address, 1);

      const tx = await nftminter.connect(addr1).approve(addr2.address, 0);
      tx.wait();

      expect(await nftminter.getApproved(0)).to.equal(addr2.address);

      const tx2 = await nftminter
        .connect(addr2)
        .transferFrom(addr1.address, addr2.address, 0);
      tx2.wait();

      expect(await nftminter.ownerOf(0)).to.equal(addr2.address);
      expect(await nftminter.getApproved(0)).to.equal(ethers.constants.AddressZero);
    });

    it("Should revert if addr2 tries to approve a token it doesn't own", async () => {
      const [addr2, addr1] = await ethers.getSigners();
      await mint(nftminter, addr1.address, 1);

      await expect(
        nftminter.connect(addr2).approve(addr2.address, 0)
      ).to.be.revertedWith(
        "ERC721: approve caller is not owner nor approved for all"
      );
    });

    it("Should revert if addr1 tries to approve addr1", async () => {
      await mint(nftminter, addr1.address, 1);

      await expect(
        nftminter.connect(addr1).approve(addr1.address, 0)
      ).to.be.revertedWith("ERC721: approval to current owner");
    });

    it("Should revert if trying to getApproved for inexistent tokenID", async () => {
      await expect(nftminter.getApproved(0)).to.be.revertedWith(
        "ERC721: approved query for nonexistent token"
      );
    });

    it("Should revert if addr1 tries to setApprovalForAll to addr1", async () => {
      await expect(
        nftminter.connect(addr1).setApprovalForAll(addr1.address, true)
      ).to.be.revertedWith("ERC721: approve to caller");
    });

    it("Should pass if addr2 is correctly approved to manage all tokens of addr1", async () => {
      const [addr2, addr1] = await ethers.getSigners();

      await mint(nftminter, addr1.address, 2);

      const tx = await nftminter
        .connect(addr1)
        .setApprovalForAll(addr2.address, true);
      tx.wait();

      expect(
        await nftminter.isApprovedForAll(addr1.address, addr2.address)
      ).to.equal(true);

      const tx2 = await nftminter
        .connect(addr2)
        .transferFrom(addr1.address, addr2.address, 0);
      tx2.wait();
      const tx3 = await nftminter
        .connect(addr2)
        .transferFrom(addr1.address, addr2.address, 1);
      tx3.wait();

      expect(await nftminter.ownerOf(0)).to.equal(addr2.address);
      expect(await nftminter.ownerOf(1)).to.equal(addr2.address);
    });
  });

  describe("ERC721Enumerable", () => {
    it("Should pass if tokenOfOwnerByIndex correctly lists all tokens from addr1", async () => {
      await mint(nftminter, addr1.address, MAX_SUPPLY);

      const balance = await nftminter.balanceOf(addr1.address);

      let tokensOfOwner = [];

      for (let i = 0; i < balance; i++) {
        tokensOfOwner.push(
          await nftminter.tokenOfOwnerByIndex(addr1.address, i)
        );
      }
      tokensOfOwner = tokensOfOwner.map((t) => {
        return t.toString();
      });

      expect(tokensOfOwner).to.have.members(["0", "1", "2"]);
    });

    it("Should pass if all tokens get listed correctly", async () => {
      await mint(nftminter, addr1.address, MAX_SUPPLY);

      const totalSupply = await nftminter.totalSupply();

      let tokens = [];

      for (let i = 0; i < totalSupply; i++) {
        tokens.push(await nftminter.tokenByIndex(i));
      }
      tokens = tokens.map((t) => {
        return t.toString();
      });

      expect(tokens).to.have.members(["0", "1", "2"]);
    });
  });

  describe("MetaTransactions", () => {
    it("Should pass if successfully minted with NativeMetaTransactionImproved", async () => {
      const [owner, addr1] = await ethers.getSigners();

      const domain = {
        name: await nftminter.name(),
        version: await nftminter.ERC712_VERSION(),
        verifyingContract: nftminter.address,
        salt: ethers.utils.hexZeroPad(
          (await nftminter.getChainId()).toHexString(),
          32
        ),
      };
      const types = {
        MetaTransaction: [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "functionSignature", type: "bytes" },
        ],
      };
      const MetaTransaction = {
        nonce: await nftminter.getNonce(owner.address),
        from: owner.address,
        functionSignature:
          nftminter.interface.getSighash(`mint(address,string)`),
      };

      const signature = await owner._signTypedData(
        domain,
        types,
        MetaTransaction
      );

      const { r, s, v } = ethers.utils.splitSignature(signature);

      const tx = await nftminter
        .connect(addr1)
        ["executeMetaTransaction(address,bytes,bytes32,bytes32,uint8,bytes)"](
          MetaTransaction.from,
          MetaTransaction.functionSignature,
          r,
          s,
          v,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "string"],
            [addr1.address, "NativeMetaTransactionImproved"]
          )
        );
      tx.wait();

      expect(await nftminter.balanceOf(addr1.address)).to.equal(1);
      expect(await nftminter.tokenURI(0)).to.equal(
        `${BASE_URI}NativeMetaTransactionImproved`
      );
    });

    it("Should revert if called with wrong calldata", async () => {
      const [owner, addr1] = await ethers.getSigners();

      const domain = {
        name: await nftminter.name(),
        version: await nftminter.ERC712_VERSION(),
        verifyingContract: nftminter.address,
        salt: ethers.utils.hexZeroPad(
          (await nftminter.getChainId()).toHexString(),
          32
        ),
      };
      const types = {
        MetaTransaction: [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "functionSignature", type: "bytes" },
        ],
      };
      const MetaTransaction = {
        nonce: await nftminter.getNonce(owner.address),
        from: owner.address,
        functionSignature:
          nftminter.interface.getSighash(`mint(address,string)`),
      };

      const signature = await owner._signTypedData(
        domain,
        types,
        MetaTransaction
      );

      const { r, s, v } = ethers.utils.splitSignature(signature);

      await expect(
        nftminter
          .connect(addr1)
          ["executeMetaTransaction(address,bytes,bytes32,bytes32,uint8,bytes)"](
            MetaTransaction.from,
            MetaTransaction.functionSignature,
            r,
            s,
            v,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "uint256"],
              [addr1.address, 1245]
            )
          )
      ).to.be.reverted;
    });

    // testing for executeMetaTransaction with empty callData
    it("Should pass if owner successfully signed for executing renounceOwnership()", async () => {
      const [owner, addr1] = await ethers.getSigners();

      const domain = {
        name: await nftminter.name(),
        version: await nftminter.ERC712_VERSION(),
        verifyingContract: nftminter.address,
        salt: ethers.utils.hexZeroPad(
          (await nftminter.getChainId()).toHexString(),
          32
        ),
      };
      const types = {
        MetaTransaction: [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "functionSignature", type: "bytes" },
        ],
      };
      const MetaTransaction = {
        nonce: await nftminter.getNonce(owner.address),
        from: owner.address,
        functionSignature:
          nftminter.interface.getSighash(`renounceOwnership()`),
      };

      const signature = await owner._signTypedData(
        domain,
        types,
        MetaTransaction
      );

      const { r, s, v } = ethers.utils.splitSignature(signature);

      const tx = await nftminter
        .connect(addr1)
        ["executeMetaTransaction(address,bytes,bytes32,bytes32,uint8)"](
          MetaTransaction.from,
          MetaTransaction.functionSignature,
          r,
          s,
          v
        );
      tx.wait();

      expect(await nftminter.owner()).to.equal(ethers.constants.AddressZero);
    });
  });
});
