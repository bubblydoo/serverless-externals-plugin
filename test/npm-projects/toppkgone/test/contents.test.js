const assert = require("assert");
const { promises: fs } = require("fs");
const path = require("path");

(async () => {
  const file = await fs.readFile(path.resolve(__dirname, "../bundle.js"));
  assert(file.includes(` = require('pkg2')`) === false);
  assert(file.includes(` = require('pkg2/node_modules/pkg3')`) === true);
  assert(file.includes(` = require('pkg3')`) === true);
  assert(file.includes(` = require('pkg3/stuff')`) === true);
})();
