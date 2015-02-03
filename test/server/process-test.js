/* global require, process */
"use strict";

var buster = require("buster"),
    busterServer = require("buster-server-cli"),
    proxyquire = require("proxyquire"),
    assert = buster.assert,
    refute = buster.refute,
    match = buster.sinon.match,
    sandbox = buster.sinon.sandbox.create(),
    server,
    processSend;

server = busterServer.create(undefined, undefined, {});
sandbox.stub(server, "run");
sandbox.stub(busterServer, "create").returns(server);

proxyquire("../../lib/server/process", {
    "buster-server-cli": busterServer
});

buster.testCase("buster-ci server process", {
    setUp: function(){
        processSend = process.send;
    },

    tearDown: function(){
        if (processSend) {
            process.send = processSend;
        } else {
            delete process.send;
        }
    },

    "creates server": function(){
        assert.calledOnce(busterServer.create);
    },

    "message runs server": function(done){
        var message = {
            method: "run",
            args: ["-p1111"]
        };
        var args = message.args.concat([match.func]);

        process.send = done(function(){
            assert.calledOnceWith(server.run, args[0], args[1]);
        });

        process.emit("message", message);

        server.run.callArg(1);
    },

    "unhandled message sends error": function(done){
        var message = {
            method: "abc"
        };

        process.send = done(function(msg){
            assert.match(msg, message);
            assert.hasPrototype(msg.error, Error.prototype);
        });

        process.emit("message", message);
    }
});
