const AdmZip = require("adm-zip");
const path = require("path");
const assert = require("assert");

(async () => {
  const zip = new AdmZip(path.resolve(__dirname, "../.serverless/handler.zip"));
  const zipEntries = zip.getEntries();
  const fileNames = zipEntries.map((ze) => ze.entryName);
  assert(fileNames.includes('node_modules/pkg3/index.js'));
  assert(fileNames.includes('node_modules/pkg3/stuff.js'));
  assert(fileNames.includes('node_modules/pkg3/package.json'));
  assert(fileNames.includes('bundle.js'));
  assert(!fileNames.includes('index.js'));
  assert(!fileNames.includes('node_modules/pkg4/package.json'));
})();
