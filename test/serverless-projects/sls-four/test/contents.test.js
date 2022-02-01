const AdmZip = require("adm-zip");
const path = require("path");
const assert = require("assert");
const { promises: fs } = require("fs");
const os = require("os");

(async () => {
  const zip = new AdmZip(path.resolve(__dirname, "../.serverless/handler.zip"));
  const zipEntries = zip.getEntries();
  const fileNames = zipEntries.map((ze) => ze.entryName);
  assert(fileNames.includes('bundle.js'));
  assert(!fileNames.includes('node_modules/aws-sdk/package.json'));
  assert(!fileNames.includes('node_modules/express/package.json'));
  assert(fileNames.includes('node_modules/uuid/package.json')); // uuid is bundled because it's also a subdependency of aws-sdk

  console.log("Extracting zip");

  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'externals-plugin-test-'));

  zip.extractAllTo(path.join(tmpdir, './handler'));

  const file = await fs.readFile((path.join(tmpdir, './handler/bundle.js')));
  assert(file.includes(` = require('aws-sdk')`) === true);
  assert(file.includes(` = require('express');`) === false);
  assert(file.includes(` = require('uuid')`) === true);
  console.log('Handler success');
})();
