"use strict";

var sys = require("sys"),
    http = require("http"),
    faye = require("faye"),
    busterServer = require("buster-server-cli"),
    busterTestCli = require("buster-test-cli"),
    path = require("path"),
    busterPath = path.join("buster", "lib", "buster");
    

busterServer.create(process.stdout, process.stderr, {
    name: "Buster.<span>JS</span>",
    binary: "buster-server",
    description: "buster-server [options]",
    missionStatement: "Server for automating Buster.JS test runs across browsers",
    unexpectedErrorMessage: "Something went horribly wrong. This is most likely " +
                            "a bug, please report at\n" +
                            "http://github.com/busterjs/buster/issues\n"
}).run(["-v"], function (err, server) {
    sys.puts("instruct agents...");
    
    var options = {
        host: process.argv[3],
        port: "8888",
        path: "/?command=start&host=" + process.argv[2] + "&port=1111"
    };

    function callback(response) {
        var str = "";

        //another chunk of data has been recieved, so append it to `str`
        response.on("data", function (chunk) {
          str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on("end", function () {
          sys.puts(str);
              
          sys.puts("agent started");
          
          var client = new faye.Client("http://127.0.0.1:1111/messaging");
          client.subscribe("/slave_ready", function (message) {
              
              console.log(message);
          
              sys.puts("running tests...");
              
              busterTestCli.create(process.stdout, process.stderr, {
                  missionStatement: "Run Buster.JS tests on node, in browsers, or both",
                  description: "",
                  environmentVariable: "BUSTER_TEST_OPT",
                  runners: busterTestCli.runners,
                  configBaseName: "buster",
                  extensions: {
                      browser: [
                          require(path.join(busterPath, "framework-extension")),
                          require(path.join(busterPath, "wiring-extension")),
                          require("buster-syntax").create({ ignoreReferenceErrors: true })
                      ]
                  }
              }).run([], function (err) {
                  sys.puts("test run finished");
                  options.path = "/?command=stop";
                  http.request(options, function () {}).end();
                  if (err) { setTimeout(process.exit.bind(null, 1), 5); }
              });
          });
        });
      }

      http.request(options, callback).end();
});
