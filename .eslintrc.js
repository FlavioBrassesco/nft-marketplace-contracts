module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    mocha: true
  },
  extends: [
    "standard",
    "prettier"
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module"
  },
  rules: {
    "no-unused-vars": "off",
  },
};
