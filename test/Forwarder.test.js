const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  deployMinter,
  mint,
  deployMarketplace,
  deploySalesService,
  deployManager,
  deployUniRouter,
  deployUniFactory,
  deployForwarder,
  deployWeth,
  eth$,
} = require("./helpers");

const makeSignature = async (signer, to, value, gas, data, forwarder) => {
  // Meta transaction preparation
  const domain = {
    name: await forwarder.name(),
    version: await forwarder.version(),
    chainId: 31337,
    verifyingContract: forwarder.address,
  };
  const types = {
    ForwardRequest: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "gas", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  };
  const ForwardRequest = {
    from: signer.address,
    to: to,
    value: value,
    gas: gas,
    nonce: await forwarder.getNonce(signer.address),
    data: data,
  };

  // Meta transaction signing
  const signature = await signer._signTypedData(domain, types, ForwardRequest);

  return [signature, ForwardRequest];
};

describe("Forwarder", () => {
  let nftminter,
    nftmarketplace,
    salesservice,
    unirouter,
    unifactory,
    forwarder,
    manager,
    weth;
  let owner, addr1;

  beforeEach(async () => {
    [owner, addr1] = await ethers.getSigners();

    weth = await deployWeth();
    manager = await deployManager();
    unifactory = await deployUniFactory(owner.address);
    unirouter = await deployUniRouter(unifactory.address, weth.address);
    salesservice = await deploySalesService(
      owner.address,
      weth.address,
      unirouter.address
    );

    forwarder = await deployForwarder("Forwarder", "1.0");

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

  it("Should pass if addr1 successfully buys an item through MetaTransaction", async () => {
    mint(nftminter, owner.address, 1);

    const tx = await manager.addWhitelistedCollection(nftminter.address, true);
    tx.wait();

    const tx2 = await nftminter
      .connect(owner)
      .setApprovalForAll(nftmarketplace.address, true);
    tx2.wait();

    const price = eth$("1.0");
    const txFloorPrice = await manager.setFloorPrice(nftminter.address, price);
    txFloorPrice.wait();

    const abi = ["function buy(address,uint256,address,uint256)"];
    const iface = new ethers.utils.Interface(abi);

    const data = iface.encodeFunctionData(
      "buy(address,uint256,address,uint256)",
      [nftminter.address, 0, ethers.constants.AddressZero, 0]
    );

    const [signature, ForwardRequest] = await makeSignature(
      addr1,
      nftmarketplace.address,
      price,
      500000,
      data,
      forwarder
    );

    const { r, s, v } = ethers.utils.splitSignature(signature);

    const options = {
      value: price,
    };
    const txForward = await forwarder
      .connect(owner)
      .execute(ForwardRequest, signature, options);
    txForward.wait();

    expect(await nftminter.ownerOf(0)).to.equal(addr1.address);
  });
});
