const { ethers } = require("hardhat");
const helpers = require("../test/helpers");
const { data } = require("./mockup-data");

async function main() {
  const signers = await ethers.getSigners();
  const signersMap = [
    { name: "owner", signer: signers[0] },
    { name: "address1", signer: signers[1] },
    { name: "address2", signer: signers[2] },
    { name: "address3", signer: signers[3] },
  ];

  const {
    nftmanager,
    weth,
    erc20,
    unifactory,
    unirouter,
    salesService,
    forwarder,
    nftmarketplace,
    nftauctions,
    nftbuyoffers,
    nftminters,
  } = await deploy(signers[0]);

  // Add marketplaces to the sales service contract
  let txAuth = await salesService.addAuthorizedMarketplace(
    nftmarketplace.address
  );
  txAuth.wait();
  console.log("NFTMarketplace authorized");
  txAuth = await salesService.addAuthorizedMarketplace(nftauctions.address);
  txAuth.wait();
  console.log("NFTAuctions authorized");
  txAuth = await salesService.addAuthorizedMarketplace(nftbuyoffers.address);
  txAuth.wait();
  console.log("NFTBuyOffers authorized");

  // Add an approved erc20 token for payments
  const txApprove = await salesService.addApprovedToken(erc20.address);
  txApprove.wait();
  console.log("ERC20 approved");

  // Approve 20eth in erc20 currency to add liquidity in mock uniswap
  const txApproveErc20 = await erc20.approve(
    unirouter.address,
    ethers.utils.parseEther("20.0")
  );
  txApproveErc20.wait();

  const blockTimeStamp = (
    await ethers.provider.getBlock(txApproveErc20.blockNumber)
  ).timestamp;

  // Add collections to nftmanager whitelist & setting fee and floor price for each one
  await Promise.all(
    data.collections.map(async (c) => {
      let tx = await nftmanager.addWhitelistedCollection(
        nftminters[c.id].address,
        true
      );
      tx.wait();
      tx = await nftmanager.setFee(nftminters[c.id].address, c.fee);
      tx.wait();
      tx = await nftmanager.setFloorPrice(
        nftminters[c.id].address,
        c.floorPrice
      );
      tx.wait();
      console.log(`Collection ${c.name} added to NFTCollectionManager`);
    })
  );

  // undefined indexes in collections will be minted to owner
  const toMint = [...Array(data.collections.length)].fill([]);
  data.users.forEach((u) => {
    u.nfts.forEach((c) => {
      c.ids.forEach((id) => {
        toMint[c.collection][id] = u.name;
      });
    });
  });

  await Promise.all(
    toMint.map(async (c, i) => {
      await Promise.all(
        c.map(async (u, id) => {
          let user;
          if (u !== undefined) {
            user = signersMap.filter((s) => s.name === u)[0];
          } else {
            user = signersMap.filter((s) => s.name === "owner")[0];
          }
          const tx = await nftminters[i].mint(
            user.signer.address,
            `${id}.json`,
            {
              gasLimit: 200000,
            }
          );
          tx.wait();

          console.log(
            `Minted token: ${id} in Collection: ${i} for address ${user.signer.address}`
          );
        })
      );
    })
  );

  // Marketplace approval in collections
  await Promise.all(
    nftminters.map(async (m) => {
      await Promise.all(
        signersMap.map(async (s) => {
          await approveMarketplaceInERC721(
            m,
            nftmarketplace,
            nftauctions,
            s.signer
          );
        })
      );
    })
  );

  // Market item creation
  await Promise.all(
    data.users.map(async (u) => {
      const signer = signersMap.filter((s) => s.name === u.name)[0].signer;
      u.items &&
        (await Promise.all(
          u.items.map(async (i) => {
            const nftminter = nftminters[i.collection];

            const txSale = await nftmarketplace
              .connect(signer)
              .createItem(nftminter.address, i.id, i.price);
            txSale.wait();
            console.log(
              `Market item created: Collection: ${i.collection} ID: ${i.id} Price: ${i.price}`
            );
          })
        ));
    })
  );

  // Auction item creation
  await Promise.all(
    data.users.map(async (u) => {
      const signer = signersMap.filter((s) => s.name === u.name)[0].signer;
      u.auctions &&
        (await Promise.all(
          u.auctions.map(async (i) => {
            const nftminter = nftminters[i.collection];

            const txSale = await nftauctions
              .connect(signer)
              .createItem(nftminter.address, i.id, i.price, i.endsAt);
            txSale.wait();
            console.log(
              `Auction created: Collection: ${i.collection} ID: ${i.id} Floor Price: ${i.price} Ends At: ${i.endsAt}days`
            );
          })
        ));
    })
  );

  // Buy offer creation
  await Promise.all(
    data.users.map(async (u) => {
      const signer = signersMap.filter((s) => s.name === u.name)[0].signer;
      u.offers &&
        (await Promise.all(
          u.offers.map(async (i) => {
            const nftminter = nftminters[i.collection];

            const txSale = await nftbuyoffers
              .connect(signer)
              .createOffer(
                nftminter.address,
                i.id,
                ethers.constants.AddressZero,
                i.offer,
                {
                  value: i.offer,
                }
              );
            txSale.wait();
            console.log(
              `Buy Offer created: Collection: ${i.collection} ID: ${i.id} Offer: ${i.offer}`
            );
          })
        ));
    })
  );

  // Bids creation
  await Promise.all(
    data.users.map(async (u) => {
      const signer = signersMap.filter((s) => s.name === u.name)[0].signer;
      u.bids &&
        (await Promise.all(
          u.bids.map(async (i) => {
            const nftminter = nftminters[i.collection];

            const txSale = await nftauctions
              .connect(signer)
              .bid(
                nftminter.address,
                i.id,
                ethers.constants.AddressZero,
                i.bid,
                {
                  value: i.bid,
                }
              );
            txSale.wait();
            console.log(
              `Bid created: Collection: ${i.collection} ID: ${i.id} Bid: ${i.bid}`
            );
          })
        ));
    })
  );

  // Add liquidity to have an exchange price for eth - er20 pair
  const txAddLiquidity = await unirouter.addLiquidityETH(
    erc20.address,
    ethers.utils.parseEther("20.0"),
    ethers.utils.parseEther("10.0"),
    ethers.utils.parseEther("10.0"),
    signers[0].address,
    blockTimeStamp + 10000,
    { value: ethers.utils.parseEther("10.0") }
  );
  txAddLiquidity.wait();
  console.log("Liquidity added");
}

async function approveMarketplaceInERC721(
  nftminter,
  nftmarketplace,
  nftauctions,
  signer
) {
  let txApproveMarketplace = await nftminter
    .connect(signer)
    .setApprovalForAll(nftmarketplace.address, true);
  txApproveMarketplace.wait();

  txApproveMarketplace = await nftminter
    .connect(signer)
    .setApprovalForAll(nftauctions.address, true);
  txApproveMarketplace.wait();

  console.log(
    `erc721:${nftminter.address} approved for user:${signer.address}`
  );
}

async function deploy(owner) {
  const nftmanager = await helpers.deployManager();
  const weth = await helpers.deployWeth();
  const erc20 = await helpers.deployERC20();
  const unifactory = await helpers.deployUniFactory(owner.address);
  const unirouter = await helpers.deployUniRouter(
    unifactory.address,
    weth.address
  );
  const salesService = await helpers.deploySalesService(
    owner.address,
    weth.address,
    unirouter.address
  );
  const forwarder = await helpers.deployForwarder("MarketForwarder", "1.0.0");
  const nftmarketplace = await helpers.deployMarketplace(
    nftmanager.address,
    salesService.address,
    forwarder.address
  );
  const nftauctions = await helpers.deployAuctions(
    7,
    nftmanager.address,
    salesService.address,
    forwarder.address
  );
  const nftbuyoffers = await helpers.deployBuyOffers(
    7,
    nftmanager.address,
    salesService.address,
    forwarder.address
  );

  console.log("manager=", nftmanager.address);
  console.log("weth=", weth.address);
  console.log("erc20=", erc20.address);
  console.log("unifactory=", unifactory.address);
  console.log("unirouter=", unirouter.address);
  console.log("salesservice=", salesService.address);
  console.log("forwarder=", forwarder.address);
  console.log("marketplace=", nftmarketplace.address);
  console.log("auctions=", nftauctions.address);
  console.log("buyoffers=", nftbuyoffers.address);

  const nftminters = [];
  await Promise.all(
    data.collections.map(async (c) => {
      nftminters[c.id] = await helpers.deployMinter(
        c.name,
        c.symbol,
        c.url,
        c.baseUrl,
        5000,
        100000
      );
      console.log(c.name, nftminters[c.id].address);
    })
  );

  return {
    nftmanager,
    weth,
    erc20,
    unifactory,
    unirouter,
    salesService,
    forwarder,
    nftmarketplace,
    nftauctions,
    nftbuyoffers,
    nftminters,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
