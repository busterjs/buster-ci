"use strict";

var buster = require("buster"),
    busterServer = require("buster-server-cli"),
    proxyquire = require("proxyquire"),
    assert = buster.assert,
    refute = buster.refute,
    match = buster.sinon.match;

buster.testCase("buster-ci server process", {
    setUp: function(){
        var server = this.server = busterServer.create(undefined, undefined, {});

        this.stub(busterServer, "create").returns(server)

        proxyquire("../../lib/server/process", {
            "buster-server-cli": busterServer
        });
    },

    tearDown: function(){
        
    },

    "creates server": function(){
        assert.calledOnce(busterServer.create);
    },

    "message runs server": function(done){
        var server = this.server;
        var message = {
            method: "run",
            args: [123]
        }
        var args = message.args.concat([match.func]);

        this.stub(server, "run");

        process.send = done(function(){
            assert.calledOnceWith(server.run, args[0], args[1]);
            delete process.send;
        });

        process.emit("message", message);

        server.run.callArg(1)
    }
})
