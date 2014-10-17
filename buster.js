var config = module.exports;

config["unit"] = {
    environment: "node",
    tests: ["test/**/*-test.js", "!test/integration/**/*-test.js"]
};

//config["integration"] = {
//    environment: "node",
//    tests: ["test/integration/**/*-test.js"]
//};
