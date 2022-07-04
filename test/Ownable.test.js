const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMinter } = require("./helpers");

describe("Ownable", () => {
  let nftminter;

  before(async () => {
    nftminter = await deployMinter("NFTMinter", "NM1", "", "", 10000, 10000);
  });

  it("Should pass if owner is owner()", async () => {
    const [owner] = await ethers.getSigners();

    expect(await nftminter.owner()).to.equal(owner.address);
  });

  it("Should pass if new owner is addr1", async () => {
    const [, addr1] = await ethers.getSigners();

    const transferOwnership = await nftminter.transferOwnership(addr1.address);
    transferOwnership.wait();

    expect(await nftminter.owner()).to.equal(addr1.address);
  });

  it("Should revert if old owner tries to transfer ownership", async () => {
    const [owner] = await ethers.getSigners();

    await expect(nftminter.transferOwnership(owner.address)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("Should pass if ownership is effectively renounced", async () => {
    const [, addr1] = await ethers.getSigners();

    const tx = await nftminter.connect(addr1).renounceOwnership();
    tx.wait();

    expect(await nftminter.owner()).to.equal(ethers.constants.AddressZero);
  });
});
