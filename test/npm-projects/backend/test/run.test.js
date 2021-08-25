const assert = require("assert");

const bundle = require("../bundle.js");

assert(bundle.Botkit === require("botkit"));
assert(bundle.DocumentClient === require("aws-sdk/clients/dynamodb").DocumentClient);
assert(bundle.path === require("path"));
 // bundled so should not be the same
 // aws-sdk -> uuid@3.3.6, botkit -> uuid@^8, backend -> uuid@^7 so should be bundled
assert(bundle.v4 !== require("uuid").v4);
