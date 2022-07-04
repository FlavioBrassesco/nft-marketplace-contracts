const helpers = require("../test/helpers");
require("dotenv").config();
const OWNER_ADDRESS = process.env.OWNER_ADDRESS;

async function main() {
  const nftmanager = await helpers.deployManager();
  const weth = await helpers.deployWeth();
  const unifactory = await helpers.deployUniFactory(OWNER_ADDRESS);
  const unirouter = await helpers.deployUniRouter(
    unifactory.address,
    weth.address
  );
  const salesService = await helpers.deploySalesService(
    OWNER_ADDRESS,
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

  console.log("Manager", nftmanager.address);
  console.log("Weth", weth.address);
  console.log("UniFactory", unifactory.address);
  console.log("UniRouter", unirouter.address);
  console.log("SalesService", salesService.address);
  console.log("Forwarder", forwarder.address);
  console.log("Marketplace", nftmarketplace.address);
  console.log("Auctions", nftauctions.address);
  console.log("BuyOffers", nftbuyoffers.address);

  for (let i = 0; i < 3; i++) {
    const nftminter = await helpers.deployMinter(
      `ERC721-${i}`,
      `ERC-${i}`,
      `https://localhost:3000/erc721-${i}.json`,
      `https://localhost:3000/img-${i}/`,
      5000,
      100000
    );
    console.log(`Collection${i}`, nftminter.address);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
