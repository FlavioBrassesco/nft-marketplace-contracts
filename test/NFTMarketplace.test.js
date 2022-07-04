const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const {
  deployMinter,
  mint,
  deployMarketplace,
  deploySalesService,
  deployManager,
  deployUniRouter,
  deployUniFactory,
  deployWeth,
  eth$,
} = require("./helpers");

describe("NFTMarketplace", () => {
  let nftmarketplace,
    nftminter,
    salesservice,
    unirouter,
    unifactory,
    weth,
    manager;
  let owner, addr1, addr2, forwarder;

  beforeEach(async () => {
    [owner, addr1, addr2, forwarder] = await ethers.getSigners();

    weth = await deployWeth();
    manager = await deployManager();
    unifactory = await deployUniFactory(owner.address);
    unirouter = await deployUniRouter(unifactory.address, weth.address);
    salesservice = await deploySalesService(
      owner.address,
      weth.address,
      unirouter.address
    );

    nftmarketplace = await deployMarketplace(
      manager.address,
      salesservice.address,
      forwarder.address
    );

    nftminter = await deployMinter("NFTMinter", "NM1", "", "", 1000, 1000);

    const txAuthorize = await salesservice.addAuthorizedMarketplace(
      nftmarketplace.address
    );
    txAuthorize.wait();
  });

  describe("ERC721Holder", function () {
    it("Should pass if IERC721Receiver is implemented", async () => {
      expect(
        await nftmarketplace.callStatic.onERC721Received(
          owner.address,
          addr1.address,
          0,
          "0xffffffff"
        )
      ).to.equal("0x150b7a02");
    });
  });

  describe("createItem", () => {
    it("Should revert if panic switch true", async () => {
      const txPanic = await nftmarketplace.setPanicSwitch(true);
      txPanic.wait();

      await expect(
        nftmarketplace
          .connect(addr1)
          .createItem(nftminter.address, 0, eth$("1.0"))
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should revert if addr1 tries to create an MarketItem for a non whitelisted contract", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      await expect(
        nftmarketplace
          .connect(addr1)
          .createItem(nftminter.address, 0, eth$("1.0"))
      ).to.be.revertedWith("Contract is not whitelisted");
    });

    it("Should revert if addr1 tries to create a MarketItem with price 0", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      await expect(
        nftmarketplace.connect(addr1).createItem(nftminter.address, 0, 0)
      ).to.be.revertedWith("Price must be at least 1 wei");
    });

    it.only("Should pass if addr1 successfully creates a MarketItem", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      const tx3 = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, eth$("1.0"));
      tx3.wait();

      expect(
        await nftmarketplace.getUserItemsCount(addr1.address, nftminter.address)
      ).to.equal(1);
      expect(await nftmarketplace.getAllItemsCount(nftminter.address)).to.equal(
        1
      );
      expect(await nftminter.ownerOf(0)).to.equal(nftmarketplace.address);
    });
  });

  describe("updateItem", () => {
    it("Should revert if addr1 tries to update a MarketItem", async () => {
      await expect(
        nftmarketplace
          .connect(addr1)
          .updateItem(nftminter.address, 0, eth$("1.0"))
      ).to.be.revertedWith("Only seller allowed");
    });

    it("Should revert if addr1 tries to update a MarketItem with price 0", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      const tx3 = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, eth$("1.0"));
      tx3.wait();

      await expect(
        nftmarketplace.connect(addr1).updateItem(nftminter.address, 0, 0)
      ).to.be.revertedWith("Price must be at least 1 wei");
    });

    it("Should pass if addr1 successfully updates a MarketItem", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      const tx3 = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, eth$("0.50"));
      tx3.wait();

      const tx4 = await nftmarketplace
        .connect(addr1)
        .updateItem(nftminter.address, 0, eth$("1.0"));
      tx4.wait();

      expect(
        (
          await nftmarketplace.itemOfUserByIndex(
            addr1.address,
            nftminter.address,
            0
          )
        ).price
      ).to.equal(eth$("1.0"));
    });
  });

  describe("cancelItem", () => {
    it("Should revert if addr2 tries to cancel a MarketItem of addr1", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      const tx3 = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, 10000);
      tx3.wait();

      await expect(
        nftmarketplace.connect(addr2).cancelItem(nftminter.address, 0)
      ).to.be.revertedWith("Only seller allowed");
    });

    it("Should pass if addr1 successfully cancels a MarketItem", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      const tx3 = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, eth$("1.0"));
      tx3.wait();

      const tx4 = await nftmarketplace
        .connect(addr1)
        .cancelItem(nftminter.address, 0);
      tx4.wait();

      expect(await nftminter.ownerOf(0)).to.equal(addr1.address);
      expect(
        await nftmarketplace.getUserItemsCount(addr1.address, nftminter.address)
      ).to.equal(0);
      expect(await nftmarketplace.getAllItemsCount(nftminter.address)).to.equal(
        0
      );
    });
  });

  describe("buy", () => {
    it("Should revert if panic switch true", async () => {
      const txPanic = await nftmarketplace.setPanicSwitch(true);
      txPanic.wait();

      await expect(
        nftmarketplace
          .connect(addr1)
          .buy(nftminter.address, 0, ethers.constants.AddressZero, 0, {
            value: eth$("1.0"),
          })
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should revert if addr2 tries to buy with msg.value != price", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const txFee = await manager.setFee(nftminter.address, 10);
      txFee.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      const tx3 = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, eth$("1.0"));
      tx3.wait();

      const options = {
        value: eth$("0.5"),
      };
      await expect(
        nftmarketplace
          .connect(addr2)
          .buy(nftminter.address, 0, ethers.constants.AddressZero, 0, options)
      ).to.be.revertedWith("Not enough funds");
    });

    it("Should revert if addr2 tries to buy a MarketItem that is not for sale", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const txFloorPrice = await manager.setFloorPrice(
        nftminter.address,
        eth$("1.0")
      );
      txFloorPrice.wait();

      await expect(
        nftmarketplace
          .connect(addr2)
          .buy(nftminter.address, 0, ethers.constants.AddressZero, 0, {
            value: eth$("1.0"),
          })
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("Should revert if addr1 tries to buy his own MarketItem", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const txFee = await manager.setFee(nftminter.address, 10);
      txFee.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      const tx3 = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, eth$("1.0"));
      tx3.wait();

      const options = {
        value: eth$("1.0"),
      };
      await expect(
        nftmarketplace
          .connect(addr1)
          .buy(nftminter.address, 0, ethers.constants.AddressZero, 0, options)
      ).to.be.revertedWith("Seller not allowed");
    });

    it("Should pass if addr2 successfully buys a MarketItem", async () => {
      await mint(nftminter, addr1.address, 1);

      const tx = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      tx.wait();

      const txFee = await manager.setFee(nftminter.address, 10);
      txFee.wait();

      const tx2 = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      tx2.wait();

      const price = eth$("1.0");
      const tx3 = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, price);
      tx3.wait();

      const options = {
        value: price,
      };

      const tx4 = await nftmarketplace
        .connect(addr2)
        .buy(nftminter.address, 0, ethers.constants.AddressZero, 0, options);
      tx4.wait();

      // enumeration
      expect(
        await nftmarketplace.getUserItemsCount(addr1.address, nftminter.address)
      ).to.equal(0);
      expect(await nftmarketplace.getAllItemsCount(nftminter.address)).to.equal(
        0
      );

      // ownership
      expect(await nftminter.ownerOf(0)).to.equal(addr2.address);

      const fee = price.mul(await manager.getFee(nftminter.address)).div(100);
      // payment
      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(
        price.sub(fee)
      );
      expect(await salesservice.getPendingRevenue(owner.address)).to.equal(fee);
    });
  });

  describe("MarketItem Enumeration", () => {
    it("Should return proper marketItem for address/tokenId combination", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApprove = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      txApprove.wait();

      const price = eth$("1.0");

      const txCreate = await nftmarketplace
        .connect(addr1)
        .createItem(nftminter.address, 0, price);
      txCreate.wait();

      const marketItem = await nftmarketplace.items(nftminter.address, 0);

      expect(marketItem.seller).to.equal(addr1.address);
      expect(marketItem.price).to.equal(price);
    });

    it("Should pass if enumeration of all MarketItems for addr1 is ok", async () => {
      const qty = 3;
      await mint(nftminter, addr1.address, qty);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApprove = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      txApprove.wait();

      const price = eth$("1.0");
      for (let i = 0; i < qty; i++) {
        const txCreate = await nftmarketplace
          .connect(addr1)
          .createItem(nftminter.address, i, price.add(i));
        txCreate.wait();
      }

      const userItemsCount = await nftmarketplace.getUserItemsCount(
        addr1.address,
        nftminter.address
      );

      const userItems = [];
      for (let i = 0; i < userItemsCount; i++) {
        const item = await nftmarketplace.itemOfUserByIndex(
          addr1.address,
          nftminter.address,
          i
        );
        userItems.push(item);
      }

      userItems.forEach((it, i) => {
        console.log(it);
        expect(it.seller).to.equal(addr1.address);
        expect(it.price).to.equal(price.add(i));
      });
    });

    it("Should pass if enumeration of all MarketItems is ok", async () => {
      const qty = 2;
      await mint(nftminter, addr1.address, qty);
      await mint(nftminter, addr2.address, qty);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApprove = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftmarketplace.address, true);
      txApprove.wait();

      const txApprove2 = await nftminter
        .connect(addr2)
        .setApprovalForAll(nftmarketplace.address, true);
      txApprove2.wait();

      const price = eth$("1.0");
      for (let i = 0; i < qty; i++) {
        const txCreate = await nftmarketplace
          .connect(addr1)
          .createItem(nftminter.address, i, price.add(i));
        txCreate.wait();
      }

      const price2 = eth$("2.0");
      for (let i = 2; i < qty + 2; i++) {
        const txCreate = await nftmarketplace
          .connect(addr2)
          .createItem(nftminter.address, i, price2.add(i));
        txCreate.wait();
      }

      const allItemsCount = await nftmarketplace.getAllItemsCount(
        nftminter.address
      );

      const allItems = [];
      for (let i = 0; i < allItemsCount; i++) {
        const item = await nftmarketplace.itemByIndex(nftminter.address, i);
        allItems.push(item);
      }

      for (let i = 0; i < qty; i++) {
        expect(allItems[i].seller).to.equal(addr1.address);
        expect(allItems[i].price).to.equal(price.add(i));
      }
      for (let i = 2; i < qty + 2; i++) {
        expect(allItems[i].seller).to.equal(addr2.address);
        expect(allItems[i].price).to.equal(price2.add(i));
      }
    });
  });
});
