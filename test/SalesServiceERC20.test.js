const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const {
  deployERC20,
  deployWeth,
  deployUniFactory,
  deployUniRouter,
  eth$,
  deploySalesServiceERC20,
} = require("./helpers");

describe("SalesServiceERC20", () => {
  let owner, addr1, addr2;
  let salesservice;
  let erc20, altErc20, weth;
  let unifactory, unirouter;

  before(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();

    erc20 = await deployERC20();
    altErc20 = await deployERC20();
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
      blockTimeStamp + 60000,
      { value: eth$("10.0") }
    );
    txAddLiquidity.wait();

    const txApproveAltErc20 = await altErc20.approve(
      unirouter.address,
      eth$("10.0")
    );
    txApproveAltErc20.wait();

    const txAddLiquidity2 = await unirouter.addLiquidityETH(
      altErc20.address,
      eth$("10.0"),
      eth$("10.0"),
      eth$("12.0"),
      owner.address,
      blockTimeStamp + 120000,
      { value: eth$("12.0") }
    );
    txAddLiquidity2.wait();
  });

  beforeEach(async () => {
    salesservice = await deploySalesServiceERC20(
      owner.address,
      weth.address,
      erc20.address,
      unirouter.address
    );
    // mocking marketplace address as owner.address
    const txAuthorize = await salesservice.addAuthorizedMarketplace(
      owner.address
    );
    txAuthorize.wait();

    const txApprove = await salesservice.addApprovedToken(altErc20.address);
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
      const price = eth$("1.0"); // price in erc20
      const amounts = await unirouter.getAmountsIn(price, [
        weth.address,
        erc20.address,
      ]);
      const amountIn = amounts[0];

      await expect(
        salesservice.approvePayment(addr1.address, price, 10, {
          value: amountIn.sub(1),
        })
      ).to.be.revertedWith("Not enough funds");
    });

    it("Should return msg.value if successfully approved", async () => {
      const price = eth$("1.0"); // price in erc20
      const amounts = await unirouter.getAmountsIn(price, [
        weth.address,
        erc20.address,
      ]);
      const amountIn = amounts[0];

      const result = await salesservice.callStatic.approvePayment(
        addr1.address,
        price,
        10,
        {
          value: amountIn,
        }
      );

      expect(result).to.equal(price);
    });

    it("Should pass if successfully updated user & treasury pending revenue", async () => {
      const price = eth$("1.0"); // price in erc20
      const amounts = await unirouter.getAmountsIn(price, [
        weth.address,
        erc20.address,
      ]);
      const amountIn = amounts[0];

      const txApprove = await salesservice.approvePayment(
        addr1.address,
        price,
        10,
        {
          value: amountIn,
        }
      );
      txApprove.wait();

      expect(await salesservice.getPendingRevenue(addr1.address)).to.equal(
        eth$("0.9")
      );
      expect(await salesservice.getPendingRevenue(owner.address)).to.equal(
        eth$("0.1")
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
            altErc20.address,
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
        altErc20.address,
        weth.address,
        erc20.address,
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
      const price = eth$("1.0"); // price in erc20     
      const amounts = await unirouter.getAmountsIn(price, [
        altErc20.address,
        weth.address,
        erc20.address,
      ]);
      const amountIn = amounts[0];

      await expect(
        salesservice.approvePaymentERC20(
          owner.address,
          addr1.address,
          altErc20.address,
          amountIn,
          price,
          10
        )
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should return amount > price if successfully approved", async () => {
      const price = eth$("1.0"); // price in erc20     
      const amounts = await unirouter.getAmountsIn(price, [
        altErc20.address,
        weth.address,
        erc20.address,
      ]);
      const amountIn = amounts[0];

      const txApprove = await altErc20.approve(salesservice.address, amountIn);
      txApprove.wait();

      const result = await salesservice.callStatic.approvePaymentERC20(
        owner.address,
        addr1.address,
        altErc20.address,
        amountIn,
        price,
        10
      );

      expect(result).to.equal(amounts[2]);
    });

    it("Should pass if successfully updated user & treasury pending revenue", async () => {
      const price = eth$("1.0"); // price in erc20     
      const amounts = await unirouter.getAmountsIn(price, [
        altErc20.address,
        weth.address,
        erc20.address,
      ]);
      const amountIn = amounts[0];

      const txApprove = await altErc20.approve(salesservice.address, amountIn);
      txApprove.wait();

      const txPayment = await salesservice.approvePaymentERC20(
        owner.address,
        addr1.address,
        altErc20.address,
        amountIn,
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

      const txAdd = await salesservice.addApprovedToken(weth.address);
      txAdd.wait();

      const txAdd2 = await salesservice.addApprovedToken(addr1.address);
      txAdd2.wait();

      const txRemove = await salesservice.removeApprovedToken(altErc20.address);
      txRemove.wait();

      const marketplaces = await salesservice.getApprovedTokens();

      expect(marketplaces.length).to.equal(3);
      expect(marketplaces).to.have.members([erc20.address, weth.address, addr1.address]);
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

      const price = eth$("1.0"); // price in erc20
      const amounts = await unirouter.getAmountsIn(price, [
        weth.address,
        erc20.address,
      ]);
      const amountIn = amounts[0];

      const txPayment = await salesservice.approvePayment(
        addr1.address,
        eth$("1.0"),
        10,
        { value: amountIn }
      );
      txPayment.wait();

      const txRetrieve = await salesservice
        .connect(addr1)
        .retrievePendingRevenue();
      txRetrieve.wait();

      expect(await erc20.balanceOf(addr1.address)).to.equal(eth$("0.90"));
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
