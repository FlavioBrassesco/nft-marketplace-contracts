const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const {
  deploySalesService,
  deployERC20,
  deployWeth,
  deployUniFactory,
  deployUniRouter,
  eth$,
} = require("./helpers");

describe("SalesService", () => {
  let owner, addr1, addr2;
  let salesservice;
  let erc20, weth;
  let unifactory, unirouter;

  before(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();

    erc20 = await deployERC20();
    weth = await deployWeth();
    unifactory = await deployUniFactory(owner.address);
    unirouter = await deployUniRouter(unifactory.address, weth.address);

    const txWeth = await weth.connect(owner).deposit({ value: eth$("5.0") });
    txWeth.wait();

    const blockTimeStamp = (await waffle.provider.getBlock(txWeth.blockNumber))
      .timestamp;

    const txApproveErc20 = await erc20.approve(unirouter.address, eth$("20.0"));
    txApproveErc20.wait();

    const txAddLiquidity = await unirouter.addLiquidityETH(
      erc20.address,
      eth$("20.0"),
      eth$("10.0"),
      eth$("10.0"),
      owner.address,
      blockTimeStamp + 10000,
      { value: eth$("10.0") }
    );
    txAddLiquidity.wait();

    const txApproveErc202 = await erc20.approve(unirouter.address, eth$("1.0"));
    txApproveErc202.wait();
  });

  beforeEach(async () => {
    salesservice = await deploySalesService(
      owner.address,
      weth.address,
      unirouter.address
    );
    // mocking marketplace address as owner.address
    const txAuthorize = await salesservice.addAuthorizedMarketplace(
      owner.address
    );
    txAuthorize.wait();

    const txApprove = await salesservice.addApprovedToken(erc20.address);
    txApprove.wait();
  });

  describe("approvePayment", () => {
    it("Should revert if trying to call from a non authorized marketplace", async () => {
      await expect(
        salesservice
          .connect(addr1)
          .approvePayment(addr1.address, eth$("0.50"), 10)
      ).to.be.revertedWith("Sender not allowed");
    });

    it("Should revert if msg.value is not equal to price", async () => {
      await expect(
        salesservice.approvePayment(addr1.address, eth$("0.50"), 10, {
          value: eth$("0.25"),
        })
      ).to.be.revertedWith("Not enough funds");
    });

    it("Should return msg.value if successfully approved", async () => {
      const result = await salesservice.callStatic.approvePayment(
        addr1.address,
        eth$("0.50"),
        10,
        { value: eth$("0.50") }
      );
      expect(result).to.equal(eth$("0.50"));
    });

    it("Should pass if successfully updated user & treasury pending revenue", async () => {
      const txPayment = await salesservice.approvePayment(
        addr1.address,
        eth$("1.0"),
        10,
        { value: eth$("1.0") }
      );
      txPayment.wait();

      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(
        eth$("0.90")
      );
      expect(await salesservice.getPendingRevenue(owner.address)).to.equal(
        eth$("0.10")
      );
    });
  });

  describe("approvePaymentERC20", () => {
    it("Should revert if trying to call from a non authorized marketplace", async () => {
      await expect(
        salesservice
          .connect(addr1)
          .approvePaymentERC20(
            owner.address,
            addr1.address,
            erc20.address,
            eth$("1.0"),
            eth$("0.50"),
            10
          )
      ).to.be.revertedWith("Sender not allowed");
    });

    it("Should revert if token is not approved for the marketplace", async () => {
      // mocking token address with addr2.address
      await expect(
        salesservice.approvePaymentERC20(
          owner.address,
          addr1.address,
          addr2.address,
          eth$("1.0"),
          eth$("0.50"),
          10
        )
      ).to.be.revertedWith("Token not allowed");
    });

    it("Should revert if amount provided is not enough", async () => {
      const price = eth$("1.0"); // price in erc20
      const amounts = await unirouter.getAmountsIn(price, [
        erc20.address,
        weth.address,
      ]);
      const amountIn = amounts[0];
      
      await expect(
        salesservice.approvePaymentERC20(
          owner.address,
          addr1.address,
          erc20.address,
          amountIn.sub(1),
          price,
          10
        )
      ).to.be.revertedWith("Not enough funds");
    });

    it("Should revert if there was a problem with the transfer of funds", async () => {
      const price = eth$("1.0");

      const amounts = await unirouter.getAmountsIn(price, [
        erc20.address,
        weth.address,
      ]);

      await expect(
        salesservice.approvePaymentERC20(
          owner.address,
          addr1.address,
          erc20.address,
          amounts[0],
          price,
          10
        )
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should return amount > price if successfully approved", async () => {
      const price = eth$("1.0");

      const amounts = await unirouter.getAmountsIn(price, [
        erc20.address,
        weth.address,
      ]);

      // We must add allowance to SalesService
      const txApproveErc20 = await erc20.approve(
        salesservice.address,
        amounts[0]
      );
      txApproveErc20.wait();

      const result = await salesservice.callStatic.approvePaymentERC20(
        owner.address,
        addr1.address,
        erc20.address,
        amounts[0],
        price,
        10
      );

      expect(result).to.equal(amounts[1]);
    });

    it("Should pass if successfully updated user & treasury pending revenue", async () => {
      const price = eth$("1.0");

      const amounts = await unirouter.getAmountsIn(price, [
        erc20.address,
        weth.address,
      ]);

      // We must add allowance to SalesService
      const txApproveErc20 = await erc20.approve(
        salesservice.address,
        amounts[0]
      );
      txApproveErc20.wait();

      const txPayment = await salesservice.approvePaymentERC20(
        owner.address,
        addr1.address,
        erc20.address,
        amounts[0],
        price,
        10
      );
      txPayment.wait();

      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(
        eth$("0.90")
      );
      expect(await salesservice.getPendingRevenue(owner.address)).to.equal(
        eth$("0.10")
      );
    });
  });

  describe("unlockPendingRevenue", () => {
    it("Should revert if trying to call from a non authorized marketplace", async () => {
      await expect(
        salesservice
          .connect(addr1)
          .unlockPendingRevenue(addr1.address, eth$("0.50"), 10)
      ).to.be.revertedWith("Sender not allowed");
    });
    it("Should pass if successfully updated user & treasury pending revenue", async () => {
      const txUnlock = await salesservice.unlockPendingRevenue(
        addr1.address,
        eth$("1.00"),
        10
      );
      txUnlock.wait();

      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(
        eth$("0.90")
      );
      expect(await salesservice.getPendingRevenue(owner.address)).to.equal(
        eth$("0.10")
      );
    });
  });

  describe("Marketplace authorization", () => {
    it("Should pass if it succesfully lists all the authorized marketplaces", async () => {
      // owner.address is added in beforeEach()
      const txRemove = await salesservice.removeAuthorizedMarketplace(
        owner.address
      );
      txRemove.wait();

      const txAdd = await salesservice.addAuthorizedMarketplace(addr1.address);
      txAdd.wait();

      const txAdd2 = await salesservice.addAuthorizedMarketplace(addr2.address);
      txAdd2.wait();

      const marketplaces = await salesservice.getAuthorizedMarketplaces();

      expect(marketplaces.length).to.equal(2);
      expect(marketplaces).to.have.members([addr1.address, addr2.address]);
    });
  });

  describe("Token approval", () => {
    it("Should pass if it succesfully lists all the approved tokens", async () => {
      // erc20.address is added in beforeEach()
      const txRemove = await salesservice.removeApprovedToken(erc20.address);
      txRemove.wait();

      const txAdd = await salesservice.addApprovedToken(weth.address);
      txAdd.wait();

      const txAdd2 = await salesservice.addApprovedToken(addr1.address);
      txAdd2.wait();

      const marketplaces = await salesservice.getApprovedTokens();

      expect(marketplaces.length).to.equal(2);
      expect(marketplaces).to.have.members([weth.address, addr1.address]);
    });
  });

  describe("Pending revenue", () => {
    it("Should pass if pending revenue is listed correctly", async () => {
      const txUnlock = await salesservice.unlockPendingRevenue(
        addr1.address,
        eth$("1.00"),
        10
      );
      txUnlock.wait();

      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(
        eth$("0.90")
      );
      expect(await salesservice.getPendingRevenue(owner.address)).to.equal(
        eth$("0.10")
      );
    });

    it("Should revert if there is no pending revenue to retrieve", async () => {
      await expect(
        salesservice.connect(addr1).retrievePendingRevenue()
      ).to.be.revertedWith("No pending revenue");
    });

    it("Should pass if pending revenue is retrieved successfully", async () => {
      const txPayment = await salesservice.approvePayment(
        addr1.address,
        eth$("1.0"),
        10,
        { value: eth$("1.0") }
      );
      txPayment.wait();

      const addr1BalanceBefore = await ethers.provider.getBalance(
        addr1.address
      );

      const txRetrieve = await salesservice
        .connect(addr1)
        .retrievePendingRevenue();
      txRetrieve.wait();

      const gasUsed =
        (await ethers.provider.getTransactionReceipt(txRetrieve.hash))
          .cumulativeGasUsed *
        (await ethers.provider.getTransactionReceipt(txRetrieve.hash))
          .effectiveGasPrice;

      const addr1BalanceAfter = await ethers.provider.getBalance(addr1.address);

      expect(addr1BalanceAfter).to.equal(
        addr1BalanceBefore.add(eth$("0.90").sub(gasUsed))
      );
    });
  });

  describe("Treasury address", () => {
    it("Should revert if trying to set treasury address to address(0)", async () => {
      await expect(
        salesservice.setTreasuryAddress(ethers.constants.AddressZero)
      ).to.be.revertedWith("treasury address(0) is not allowed");
    });
    it("Should pass if treasury address is changed", async () => {
      const txTreasury = await salesservice.setTreasuryAddress(addr1.address);
      txTreasury.wait();

      const txUnlock = await salesservice.unlockPendingRevenue(addr2.address, eth$("1.0"), 10);
      txUnlock.wait();

      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(eth$("0.10"));
    });
  });
});
