const assert = require("assert");

const bundle = require("../bundle.js");

assert(bundle.pkg2.pkg3.v === 1);
