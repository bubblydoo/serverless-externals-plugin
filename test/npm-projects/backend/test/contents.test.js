const assert = require("assert");
const { promises: fs } = require("fs");
const path = require("path");

(async () => {
  const file = await fs.readFile(path.resolve(__dirname, "../bundle.js"));
  assert(file.includes(` = require('botkit')`) === true);
  assert(file.includes(` = require('aws-sdk/clients/dynamodb')`) === true);
  assert(file.includes(` = require('path')`) === true);
  assert(file.includes(` = require('uuid')`) === false);
})();
