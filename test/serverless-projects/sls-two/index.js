module.exports = {
  handler: () => {
    console.log({
      pkg2: require("pkg2"),
      pkg5: require("pkg5"),
    });
  },
  devOnly: async () => {
    console.log({
      pkg5devonly: await import("pkg5/dev-only.js"),
    });
  }
}
