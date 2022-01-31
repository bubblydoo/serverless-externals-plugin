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
  assert(fileNames.includes('node_modules/pg/package.json'));

  console.log("Extracting zip");

  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'externals-plugin-test-'));

  zip.extractAllTo(path.join(tmpdir, './handler'));

  const bundle = require(path.join(tmpdir, './handler/bundle'));
  bundle.handler();
  console.log('Handler success');
})();
