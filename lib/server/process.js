/* global require, process */
"use strict";

var busterServer = require("buster-server-cli");
var server = busterServer.create(process.stdout, process.stderr, {
    binary: "buster-ci-server",
    unexpectedErrorMessage: ""
});

var handleError = function(method, error) {
    process.send({
        method: method,
        error: error || new Error(method + " not found")
    });
};

process.on("message", function(request) {
    var method = request.method;
    var args = request.args || [];

    if (method == "run") {
        // Make sure to catch any errors in case the server seems to crash.
        try {
            server.run.apply(server, args.concat([function(err) {
                // Let the parent process know the server is running
                process.send({
                    method: "run",
                    error: err
                });
            }]));
        } catch (error) {
            handleError(method, error);
        }
    } else {
        handleError(method);
    }
});
