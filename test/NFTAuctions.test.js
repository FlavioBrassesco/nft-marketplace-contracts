const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  deployMinter,
  mint,
  deployAuctions,
  deploySalesService,
  deployManager,
  deployWeth,
  deployUniRouter,
  deployUniFactory,
  eth$
} = require("./helpers");

const MAX_DAYS = 7;
const MAX_SUPPLY = 1000;
const FLOOR_PRICE = eth$("1.0");

describe("NFTAuctions", () => {
  let nftauctions,
    nftminter,
    salesservice,
    unirouter,
    unifactory,
    weth,
    manager;
  let owner, addr1, addr2, addr3, forwarder;
  beforeEach(async () => {
    [owner, addr1, addr2, addr3, forwarder] = await ethers.getSigners();

    weth = await deployWeth();
    manager = await deployManager();
    unifactory = await deployUniFactory(owner.address);
    unirouter = await deployUniRouter(unifactory.address, weth.address);
    salesservice = await deploySalesService(
      owner.address,
      weth.address,
      unirouter.address
    );

    nftauctions = await deployAuctions(
      MAX_DAYS,
      manager.address,
      salesservice.address,
      forwarder.address
    );

    nftminter = await deployMinter(
      "NFTMinter",
      "NM1",
      "",
      "",
      MAX_SUPPLY,
      FLOOR_PRICE
    );

    const txAuthorize = await salesservice.addAuthorizedMarketplace(nftauctions.address);
    txAuthorize.wait();
  });

  describe("createItem", () => {
    it("Should revert if panic switch true", async () => {
      
      console.log("Owner", await nftauctions.owner());
      console.log("owner.address", owner.address);
      const txPanic = await nftauctions.connect(owner).setPanicSwitch(true);
      txPanic.wait();


      await expect(
        nftauctions
          .connect(addr1)
          .createItem(nftminter.address, 0, eth$("0.1"), 1)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should revert if addr1 tries to create an AuctionItem for a non whitelisted contract", async () => {
      await mint(nftminter, addr1.address, 1);

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      await expect(
        nftauctions
          .connect(addr1)
          .createItem(nftminter.address, 0, eth$("0.1"), 1)
      ).to.be.revertedWith("Contract is not whitelisted");
    });

    it("Should revert if addr1 tries to create an AuctionItem with floor price 0", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      await expect(
        nftauctions.connect(addr1).createItem(nftminter.address, 0, 0, 1)
      ).to.be.revertedWith("Floor price must be > 0");
    });

    it("Should revert if addr1 tries to create an AuctionItem with days out of bounds", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      await expect(
        nftauctions
          .connect(addr1)
          .createItem(nftminter.address, 0, eth$("0.1"), 0)
      ).to.be.revertedWith("Duration out of bounds");

      await expect(
        nftauctions
          .connect(addr1)
          .createItem(nftminter.address, 0, eth$("0.1"), 8)
      ).to.be.revertedWith("Duration out of bounds");
    });

    it("Should pass if addr1 successfully creates an AuctionItem", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, eth$("0.1"), 1);
      txCreateAuction.wait();

      const blockTimeStamp = (
        await ethers.provider.getBlock(txCreateAuction.blockNumber)
      ).timestamp;

      const auctionItem = await nftauctions.itemOfUserByIndex(
        addr1.address,
        nftminter.address,
        0
      );

      expect(auctionItem.seller).to.equal(addr1.address);
      expect(auctionItem.currentBidder).to.equal(ethers.constants.AddressZero);
      expect(auctionItem.currentBid).to.equal(eth$("0.1"));
      expect(auctionItem.endsAt).to.equal(blockTimeStamp + 1 * 24 * 60 * 60);

      expect(
        await nftauctions.getUserItemsCount(addr1.address, nftminter.address)
      ).to.equal(1);
      expect(await nftauctions.getAllItemsCount(nftminter.address)).to.equal(1);

      expect(await nftminter.ownerOf(0)).to.equal(nftauctions.address);
    });
  });

  describe("bid", () => {
    it("Should revert if panic switch true", async () => {
      const txPanic = await nftauctions.setPanicSwitch(true);
      txPanic.wait();

      await expect(
        nftauctions.connect(addr1).bid(nftminter.address, 0, ethers.constants.AddressZero, eth$("0.1"), { value: eth$("0.1") })
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should revert if addr1 tries to create a bid for its own item", async () => {
      await mint(nftminter, addr1.address, 1);
      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("0.1");
      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      const options = { value: price };

      await expect(
        nftauctions.connect(addr1).bid(nftminter.address, 0, ethers.constants.AddressZero, price, options)
      ).to.be.revertedWith("Seller is not authorized");
    });

    it("Should revert if addr2 tries to create a second bid for addr1 item", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("0.1");
      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      const options = { value: price };
      const txbid = await nftauctions
        .connect(addr2)
        .bid(nftminter.address, 0, ethers.constants.AddressZero, price, options);
      txbid.wait();

      const options2 = { value: price };
      await expect(
        nftauctions.connect(addr2).bid(nftminter.address, 0, ethers.constants.AddressZero, price, options2)
      ).to.be.revertedWith("Current bidder is not authorized");
    });

    it("Should revert if addr2 tries to create a bid when addr1 auction has finished", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txFee = await manager.setFee(nftminter.address, 10);
      txFee.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("0.1");
      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      await ethers.provider.send("evm_increaseTime", [86500]);

      const options = { value: price };
      await expect(
        nftauctions.connect(addr2).bid(nftminter.address, 0, ethers.constants.AddressZero, price, options)
      ).to.be.revertedWith("Timestamp out of range");
    });

    it("Should revert if addr2 tries to create a bid lower than floor price", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txFee = await manager.setFee(nftminter.address, 10);
      txFee.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("0.1");
      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      const options = { value: price.sub(1) };
      await expect(
        nftauctions.connect(addr2).bid(nftminter.address, 0, ethers.constants.AddressZero, price.sub(1), options)
      ).to.be.revertedWith("Your bid must be >= than floor price");
    });

    it("Should revert if addr3 tries to bid lower than addr2", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txFee = await manager.setFee(nftminter.address, 10);
      txFee.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("0.1");
      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      const options = { value: price.mul(4) };
      const txBid1 = await nftauctions
        .connect(addr2)
        .bid(nftminter.address, 0, ethers.constants.AddressZero, price.mul(4), options);
      txBid1.wait();

      const options2 = { value: price.div(2) };
      await expect(
        nftauctions.connect(addr3).bid(nftminter.address, 0, ethers.constants.AddressZero, price.div(2), options2)
      ).to.be.revertedWith("Your bid must be higher than last bid");
    });

    it("Should pass if addr2 successfully creates a bid", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("0.1");

      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      const options = { value: price };

      const txbid = await nftauctions
        .connect(addr2)
        .bid(nftminter.address, 0, ethers.constants.AddressZero, price, options);
      txbid.wait();

      const blockTimeStamp = (await ethers.provider.getBlock(txbid.blockNumber))
        .timestamp;

      const auctionItem = await nftauctions.itemOfUserByIndex(
        addr1.address,
        nftminter.address,
        0
      );

      expect(auctionItem.currentBidder).to.equal(addr2.address);
      expect(auctionItem.currentBid).to.equal(price);
      expect(auctionItem.endsAt).to.equal(blockTimeStamp + 1 * 24 * 60 * 60);
    });
  });

  describe("finishAuction", () => {
    it("Should revert if addr2 tries to finish an auction sale of addr1", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("1.0");
      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      const options = { value: price };
      const txbid = await nftauctions
        .connect(addr3)
        .bid(nftminter.address, 0, ethers.constants.AddressZero, price, options);
      txbid.wait();

      await ethers.provider.send("evm_increaseTime", [86500]);

      await expect(
        nftauctions.connect(addr2).finishAuction(nftminter.address, 0)
      ).to.be.revertedWith("Only Auction participants allowed");
    });

    it("Should revert if addr1 tries to finish an auction sale before auction ended", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("1.0");
      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      const options = { value: price };
      const txbid = await nftauctions
        .connect(addr2)
        .bid(nftminter.address, 0, ethers.constants.AddressZero, price, options);
      txbid.wait();

      await expect(
        nftauctions.connect(addr1).finishAuction(nftminter.address, 0)
      ).to.be.revertedWith("Auction must be finished");
    });

    it("Should pass if addr1 successfully finish an auction sale", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txFee = await manager.setFee(nftminter.address, 10);
      txFee.wait();

      const txApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApproval.wait();

      const price = eth$("1.0");
      const fee = price.mul(await manager.getFee(nftminter.address)).div(100);

      const txCreateAuction = await nftauctions
        .connect(addr1)
        .createItem(nftminter.address, 0, price, 1);
      txCreateAuction.wait();

      const options = { value: price };

      const txBid = await nftauctions
        .connect(addr2)
        .bid(nftminter.address, 0, ethers.constants.AddressZero, price, options);
      txBid.wait();

      await ethers.provider.send("evm_increaseTime", [86500]);

      const txFinishAuctionSale = await nftauctions
        .connect(addr1)
        .finishAuction(nftminter.address, 0);
      txFinishAuctionSale.wait();

      // enumeration
      expect(
        await nftauctions.getUserItemsCount(addr1.address, nftminter.address)
      ).to.equal(0);
      expect(await nftauctions.getAllItemsCount(nftminter.address)).to.equal(0);

      // ownership
      expect(await nftminter.ownerOf(0)).to.equal(addr2.address);

      // payment
      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(price.sub(fee));
      expect(await salesservice.getPendingRevenue(owner.address)).to.equal(fee);
    });
  });

  describe("AuctionItem Enumeration", () => {
    it("Should pass if enumeration of all AuctionItems for addr1 is ok", async () => {
      const qty = 3;
      await mint(nftminter, addr1.address, qty);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txApprove = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftauctions.address, true);
      txApprove.wait();

      const price = eth$("1.0");
      const timestamps = [];
      for (let i = 0; i < qty; i++) {
        const txCreate = await nftauctions
          .connect(addr1)
          .createItem(nftminter.address, i, price.add(i), i + 1);
        txCreate.wait();
        timestamps[i] = (
          await ethers.provider.getBlock(txCreate.blockNumber)
        ).timestamp;
      }

      const userItemsCount = await nftauctions.getUserItemsCount(
        addr1.address,
        nftminter.address
      );

      const userItems = [];
      for (let i = 0; i < userItemsCount; i++) {
        const item = await nftauctions.itemOfUserByIndex(
          addr1.address,
          nftminter.address,
          i
        );
        userItems.push(item);
      }

      userItems.forEach((it, i) => {
        expect(it.seller).to.equal(addr1.address);
        expect(it.currentBidder).to.equal(ethers.constants.AddressZero);
        expect(it.currentBid).to.equal(price.add(i));
        expect(it.endsAt).to.equal(timestamps[i] + (i + 1)*24*60*60);
      });
    });

    it("Should pass if enumeration of all AuctionItems is ok", async () => {
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
        .setApprovalForAll(nftauctions.address, true);
      txApprove.wait();

      const txApprove2 = await nftminter
        .connect(addr2)
        .setApprovalForAll(nftauctions.address, true);
      txApprove2.wait();

      const price = eth$("1.0");
      const timestamps = [];
      for (let i = 0; i < qty; i++) {
        const txCreate = await nftauctions
          .connect(addr1)
          .createItem(nftminter.address, i, price.add(i), i + 1);
        txCreate.wait();
        timestamps[i] = (
          await ethers.provider.getBlock(txCreate.blockNumber)
        ).timestamp;
      }

      const price2 = eth$("1.0");
      for (let i = 2; i < qty + 2; i++) {
        const txCreate = await nftauctions
          .connect(addr2)
          .createItem(nftminter.address, i, price2.add(i), i + 1);
        txCreate.wait();
        timestamps[i] = (
          await ethers.provider.getBlock(txCreate.blockNumber)
        ).timestamp;
      }

      const allItemsCount = await nftauctions.getAllItemsCount(
        nftminter.address
      );

      const allItems = [];
      for (let i = 0; i < allItemsCount; i++) {
        const item = await nftauctions.itemByIndex(nftminter.address, i);
        allItems.push(item);
      }

      for (let i = 0; i < qty; i++) {
        expect(allItems[i].seller).to.equal(addr1.address);
        expect(allItems[i].currentBidder).to.equal(ethers.constants.AddressZero);
        expect(allItems[i].currentBid).to.equal(price.add(i));
        expect(allItems[i].endsAt).to.equal(
          timestamps[i] + (i + 1)*24*60*60
        );
      }
      for (let i = 2; i < qty + 2; i++) {
        expect(allItems[i].seller).to.equal(addr2.address);
        expect(allItems[i].currentBidder).to.equal(ethers.constants.AddressZero);
        expect(allItems[i].currentBid).to.equal(price2.add(i));
        expect(allItems[i].endsAt).to.equal(
          timestamps[i] + (i + 1)*24*60*60
        );
      }
    });
  });
});
