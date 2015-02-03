/* global module, require, process, __dirname */
"use strict";

var ChildProcess = require("child_process");
var path = require("path");
var serverProcessPath = path.join(__dirname, "./server/process");

var Server = function() {
    // Create a server child process fork to communicate with the server.
    // This will prevent long processes in this parent process to stall
    // the server child process from responding to slave browsers.
    this._childProcess = ChildProcess.fork(serverProcessPath);
    this._killProcess = this.kill.bind(this);

    // Be sure to kill the server process when this parent process closes
    // Creating a new bound function so that the event can be removed during testing for cleanup
    process.on("close", this._killProcess);

    return this;
};

Server.prototype = {
    create: function(){
        return new Server();
    },

    run: function(args, cb) {
        var childProcess = this._childProcess;
        if (childProcess) {
            // callback for passing server message to the task callback
            var callback = function(response) {
                // Specifically listen a response containing method == run.
                if (response.method == "run") {
                    cb(response.error);
                    // Clean up by removing the listener
                    childProcess.removeListener("message", callback);
                }
            };

            // Handle server process' message that will trigger the tasks' callback
            childProcess.on("message", callback);

            // Tell the server process to run with port arg
            childProcess.send({
                method: "run",
                args: args
            });
        } else {
            cb(new Error("_childProcess is undefined"));
        }
    },

    kill: function() {
        var killProccess = this._killProcess;
        // Clean up any attached bound listener.
        if (killProccess) {
            process.removeListener("close", killProccess);
            delete this._killProcess;
        }

        var childProccess = this._childProcess;
        if (childProccess) {
            delete this._childProcess;

            childProccess.kill();
        }
    }
};

module.exports = Server.prototype;
