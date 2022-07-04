const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const {
  deployMinter,
  mint,
  deployBuyOffers,
  deploySalesService,
  deployManager,
  deployWeth,
  deployUniRouter,
  deployUniFactory,
  eth$,
} = require("./helpers");

const MAX_DAYS = 7;
const MAX_SUPPLY = 1000;
const FLOOR_PRICE = eth$("1.0");

describe("NFTMarketplaceBuyOffers", () => {
  let nftbuyoffers,
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

    nftbuyoffers = await deployBuyOffers(
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

    const txAuthorize = await salesservice.addAuthorizedMarketplace(
      nftbuyoffers.address
    );
    txAuthorize.wait();
  });

  describe("createOffer", () => {
    it("Should revert if panic switch activated", async () => {
      const txPanic = await nftbuyoffers.setPanicSwitch(true);
      txPanic.wait();

      await expect(
        nftbuyoffers
          .connect(addr1)
          .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, {
            value: eth$("1.0"),
          })
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should revert if making an offer for a token of non-whitelisted contract", async () => {
      await expect(
        nftbuyoffers
          .connect(addr1)
          .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, {
            value: eth$("1.0"),
          })
      ).to.be.revertedWith("Contract is not whitelisted");
    });

    it("Should revert if offer is 0", async () => {
      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      await expect(
        nftbuyoffers
          .connect(addr1)
          .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0)
      ).to.be.revertedWith("Bid must be at least 1 wei");
    });

    it("Should revert if addr2 already has an offer for addr1 item", async () => {
      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const options = { value: eth$("1.0") };
      const txCBOffer = await nftbuyoffers
        .connect(addr1)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, options);
      txCBOffer.wait();

      await expect(
        nftbuyoffers
          .connect(addr1)
          .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, options)
      ).to.be.revertedWith("You already have an offer for this item");
    });

    it("Should pass if addr1 successfully creates a buy offer for an item", async () => {
      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const options = { value: eth$("1.0") };
      const txCBOffer = await nftbuyoffers
        .connect(addr1)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, options);
      txCBOffer.wait();

      expect(
        await nftbuyoffers.getUserOffersCount(addr1.address, nftminter.address)
      ).to.equal(1);
      expect(
        await nftbuyoffers.offerOfUserByIndex(addr1.address, nftminter.address, 0)
      ).to.equal(options.value);
    });

    it("Should pass if two users successfully create a buy offer for same item", async () => {
      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const options = { value: eth$("1.0") };
      const txCBOffer = await nftbuyoffers
        .connect(addr1)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, options);
      txCBOffer.wait();

      const options2 = { value: eth$("1.5") };
      const txCBOffer2 = await nftbuyoffers
        .connect(addr2)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, options2);
      txCBOffer2.wait();

      expect(
        await nftbuyoffers.getUserOffersCount(addr1.address, nftminter.address)
      ).to.equal(1);
      expect(
        await nftbuyoffers.offerOfUserByIndex(addr1.address, nftminter.address, 0)
      ).to.equal(options.value);
      expect(
        await nftbuyoffers.getUserOffersCount(addr2.address, nftminter.address)
      ).to.equal(1);
      expect(
        await nftbuyoffers.offerOfUserByIndex(addr2.address, nftminter.address, 0)
      ).to.equal(options2.value);
    });
  });

  describe("cancelOffer", () => {
    it("Should revert if addr1 has no active offer for the specified item", async () => {
      await expect(
        nftbuyoffers.connect(addr1).cancelOffer(nftminter.address, 0)
      ).to.be.revertedWith("No active offer found");
    });

    it("Should pass if addr2 successfully cancels a buy offer for addr1 item", async () => {
      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const options = { value: eth$("1.0") };
      const txCBOffer = await nftbuyoffers
        .connect(addr1)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, options);
      txCBOffer.wait();

      expect(
        await nftbuyoffers.getUserOffersCount(addr1.address, nftminter.address)
      ).to.equal(1);
      expect(
        await nftbuyoffers.offerOfUserByIndex(addr1.address, nftminter.address, 0)
      ).to.equal(options.value);

      const txCBCancel = await nftbuyoffers
        .connect(addr1)
        .cancelOffer(nftminter.address, 0);
      txCBCancel.wait();

      expect(
        await nftbuyoffers.getUserOffersCount(addr1.address, nftminter.address)
      ).to.equal(0);
      await expect(
        nftbuyoffers.offerOfUserByIndex(addr1.address, nftminter.address, 0)
      ).to.be.revertedWith("User Bid index out of bounds");
    });
  });

  describe("acceptOffer", () => {
    it("Should revert if offer is not found", async () => {
      await expect(
        nftbuyoffers
          .connect(addr1)
          .acceptOffer(nftminter.address, 0, addr2.address)
      ).to.be.revertedWith("No active offer found");
    });

    it("Should pass if addr1 successfully accepts addr2 buy offer", async () => {
      await mint(nftminter, addr1.address, 1);

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txSetApproval = await nftminter
        .connect(addr1)
        .setApprovalForAll(nftbuyoffers.address, true);
      txSetApproval.wait();

      const txFee = await manager.setFee(nftminter.address, 10);
      txFee.wait();

      const price = eth$("1.0");
      const fee = price
        .mul(await manager.getFee(nftminter.address))
        .div(100);

      const options = { value: price };
      const txCBOffer = await nftbuyoffers
        .connect(addr2)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, options);
      txCBOffer.wait();

      const txAccept = await nftbuyoffers
        .connect(addr1)
        .acceptOffer(nftminter.address, 0, addr2.address);
      txAccept.wait();

      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(
        price.sub(fee)
      );
      expect(await salesservice.getPendingRevenue(owner.address)).to.equal(fee);
    });
  });

  describe("BuyOffer Enumeration", () => {
    it("Should pass if all buy offers of addr1 are ok", async () => {
      const qty = 3;

      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      for (let i = 0; i < qty; i++) {
        const txCBOffer = await nftbuyoffers
          .connect(addr1)
          .createOffer(nftminter.address, i, ethers.constants.AddressZero, 0, { value: 1000 + i });
        txCBOffer.wait();
      }

      const count = await nftbuyoffers.getUserOffersCount(
        addr1.address,
        nftminter.address
      );

      for (let i = 0; i < count; i++) {
        const bid = await nftbuyoffers.offerOfUserByIndex(
          addr1.address,
          nftminter.address,
          i
        );

        expect(bid).to.equal(1000 + i);
      }
    });

    it("Should pass if all buy offers of token 0 are ok", async () => {
      const txWhitelist = await manager.addWhitelistedCollection(
        nftminter.address,
        true
      );
      txWhitelist.wait();

      const txCBOffer = await nftbuyoffers
        .connect(addr1)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, { value: 1000 });
      txCBOffer.wait();
      const txCBOffer2 = await nftbuyoffers
        .connect(addr2)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, { value: 1000 + 1 });
      txCBOffer2.wait();
      const txCBOffer3 = await nftbuyoffers
        .connect(addr3)
        .createOffer(nftminter.address, 0, ethers.constants.AddressZero, 0, { value: 1000 + 2 });
      txCBOffer3.wait();

      const count = await nftbuyoffers.getAllOffersCount(nftminter.address, 0);

      for (let i = 0; i < count; i++) {
        const bid = await nftbuyoffers.offerByIndex(nftminter.address, 0, i);

        expect(bid.bid).to.equal(1000 + i);
      }
    });
  });
});
