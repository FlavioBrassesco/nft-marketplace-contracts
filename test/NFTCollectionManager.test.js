const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployManager, deployMinter } = require("./helpers");

describe("NFTCollectionManager", () => {
  let nftcollectionmanager;
  let nftminter;
  let owner, addr1, addr2;
  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();
    nftcollectionmanager = await deployManager();
    nftminter = await deployMinter("NFTMinter", "NM1", "", "", 10000, 10000);
  });

  describe("addWhitelistedCollection & isWhitelistedCollection", () => {
    it("Should revert if calling from addr1", async () => {
      await expect(
        nftcollectionmanager
          .connect(addr1)
          .addWhitelistedCollection(nftminter.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("Should revert if trying to whitelist a not IERC165 & IERC721 compliant address", async () => {
      // test could be made to use revertedWith("Address is not IERC721 compliant")
      // if calling a contract that implements IERC165 but no IERC721.
      // if calling a contract that does not implements IERC165, transaction reverts silently
      await expect(
        nftcollectionmanager.addWhitelistedCollection(
          nftcollectionmanager.address,
          true
        )
      ).to.be.reverted;
    });

    it("Should return true if nftminter address is succesfully whitelisted", async () => {
      const addWhitelistedNFTContract =
        await nftcollectionmanager.addWhitelistedCollection(
          nftminter.address,
          true
        );
      await addWhitelistedNFTContract.wait();

      expect(
        await nftcollectionmanager.isWhitelistedCollection(nftminter.address)
      ).to.equal(true);
    });
    it("Should return false if nftminter address is succesfully removed from whitelist", async () => {
      const tx = await nftcollectionmanager.addWhitelistedCollection(
        nftminter.address,
        false
      );
      await tx.wait();

      expect(
        await nftcollectionmanager.isWhitelistedCollection(nftminter.address)
      ).to.equal(false);
    });
  });

  describe("getCollectionsCount & collectionByIndex", () => {
    it("Should return proper number of collections", async () => {
      const tx = await nftcollectionmanager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      await tx.wait();

      expect(await nftcollectionmanager.getCollectionsCount()).to.equal(1);
    });
    it("Should return correct contract at index 0", async () => {
      const tx = await nftcollectionmanager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      await tx.wait();

      expect(await nftcollectionmanager.collectionByIndex(0)).to.equal(
        nftminter.address
      );
    });
  });

  describe("setFee & getFee", function () {
    it("Should revert if trying to set fee for a collection not added to the marketplace", async () => {
      await expect(
        nftcollectionmanager.setFee(nftminter.address, 30)
      ).to.be.revertedWith("Collection does not exists in marketplace");
    });

    it("Should revert if trying to set fee higher than 5000", async () => {
      const txWhitelist = await nftcollectionmanager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      await expect(
        nftcollectionmanager.setFee(nftminter.address, 51)
      ).to.be.revertedWith("Can't set fee higher than 50.00%");
    });

    it("Should pass if fee succesfully setted", async () => {
      const txWhitelist = await nftcollectionmanager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const tx = await nftcollectionmanager.setFee(nftminter.address, 30);
      tx.wait();

      expect(await nftcollectionmanager.getFee(nftminter.address)).to.equal(30);
    });
  });

  describe("setFloorPrice & getFloorPrice", function () {
    it("Should revert if trying to set floor price for a collection not added to the marketplace", async () => {
      await expect(
        nftcollectionmanager.setFloorPrice(nftminter.address, 30)
      ).to.be.revertedWith("Collection does not exists in marketplace");
    });
    it("Should revert if trying to set floor price to 0", async () => {
      const txWhitelist = await nftcollectionmanager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();
      await expect(
        nftcollectionmanager.setFloorPrice(nftminter.address, 0)
      ).to.be.revertedWith("Floor price must be at least 1 wei");
    });

    it("Should pass if floor price is succesfully setted", async () => {
      const txWhitelist = await nftcollectionmanager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();
      const tx = await nftcollectionmanager.setFloorPrice(
        nftminter.address,
        50000
      );
      tx.wait();

      expect(
        await nftcollectionmanager.getFloorPrice(nftminter.address)
      ).to.equal(50000);
    });
  });
});
