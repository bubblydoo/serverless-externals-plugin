const rollupPlugin = require("./rollup-plugin").default;
const ExternalsPlugin = require("./serverless-plugin").default;

module.exports = ExternalsPlugin;
module.exports.rollupPlugin = rollupPlugin
