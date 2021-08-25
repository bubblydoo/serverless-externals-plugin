const assert = require("assert");

const bundle = require("../bundle.js");

assert(bundle.pkg3.v === 2);
assert(bundle.pkg3stuff.v === 2);
assert(bundle.pkg2.pkg3.v === 1);
assert(bundle.pkg2.pkg3stuff.v === 1);
