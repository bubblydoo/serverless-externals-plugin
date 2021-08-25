module.exports = {
  handler: () => {
    console.log({
      pkg2: require("pkg2"),
      pkg3: require("pkg3"),
      pkg3stuff: require("pkg3/stuff"),
    });
  }
}
