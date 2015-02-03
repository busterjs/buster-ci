/* global require */
"use strict";

var buster = require("buster"),
    EventEmitter = require("events").EventEmitter,
    ChildProcess = require("child_process"),
    proxyquire = require("proxyquire"),
    Server = proxyquire("../lib/server", {
        "child_process": ChildProcess
    }),
    assert = buster.assert,
    refute = buster.refute,
    childProcessForkMock = new EventEmitter(),
    sandbox;

    childProcessForkMock.send = function(){};
    childProcessForkMock.message = function(){};
    childProcessForkMock.kill = function(){};

function stubChildProcess() {
    sandbox.stub(childProcessForkMock, "kill");

    sandbox.stub(childProcessForkMock, "send", function(msg){
        if (msg.method == "run") {
            childProcessForkMock.emit("message", {
                method: "run",
                error: null
            });
        }
    });
    
    sandbox.stub(ChildProcess, "fork").returns(childProcessForkMock);

    return ChildProcess;
}

buster.testCase("buster-ci server", {
    setUp: function(){
        sandbox = buster.sinon.sandbox.create();
        this.ChildProcess = stubChildProcess.call(this);
    },

    tearDown: function(){
        sandbox.restore();
    },
    "creates a child process fork": function(){
        Server.create();
        assert.calledOnce(this.ChildProcess.fork);
    },

    "run sends a message containing args": function(done){
        var server = Server.create();
        var args = ["-p" + 1111];
        
        server.run(args, done(function(){
            assert.calledWith(childProcessForkMock.send, {
                method: "run",
                args: args
            });
        }));
    },

    "kills child process": function(){
        var server = Server.create();
        assert.defined(server._childProcess);
        assert.defined(server._killProcess);
        server.kill();
        refute.defined(server._childProcess);
        refute.defined(server._killProcess);
        assert.calledOnce(childProcessForkMock.kill);
    }
});
