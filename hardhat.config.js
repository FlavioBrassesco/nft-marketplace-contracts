require("@nomiclabs/hardhat-waffle");
require("dotenv").config();
require("@nomiclabs/hardhat-etherscan");
require("hardhat-contract-sizer");

const privateKey = process.env.PRIVATE_KEY;
const maticUrl = process.env.MATIC_APP_ID;
const polyScan = process.env.POLYGONSCAN;
const from = process.env.OWNER_ADDRESS;
const mnemonic = process.env.MNEMONIC;

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      // loggingEnabled: true
    },
    ganache: {
      from: from,
      chainId: 1337,
      url: "HTTP://127.0.0.1:7545",
      accounts: {
        mnemonic: mnemonic,
      },
    },
    matic: {
      from: from,
      chainId: 137,
      url: `https://rpc-mainnet.maticvigil.com/v1/${maticUrl}`,
      accounts: [privateKey],
    },
    mumbai: {
      from: from,
      chainId: 80001,
      url: `https://rpc-mumbai.maticvigil.com/v1/${maticUrl}`,
      accounts: [privateKey],
    },
    bsctestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic },
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic },
    },
  },
  //* Keep name as 'etherscan' to avoid errors.
  etherscan: {
    url: "https://polygonscan.com/",
    apiKey: polyScan,
  },
};
