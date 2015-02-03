"use strict";

var buster = require("buster"),
    async = require("async"),
    Agent = require("buster-ci-agent"),
    ChildProcess = require("child_process"),
    proxyquire = require("proxyquire"),
    EventEmitter = require('events').EventEmitter,
    AgentStub = buster.sinon.stub(),
    busterServer = {},
    busterTestCli = {},
    faye = {},
    fs = {},
    childProcessStub = buster.sinon.stub(),
    childProcessForkMock = new EventEmitter,
    path = require("path"),
    Server = proxyquire("../lib/server", {
        "child_process": ChildProcess
    }),
    BusterCi = proxyquire("../lib/buster-ci", {
        "./server": Server,
        "buster-ci-agent": AgentStub,
        "buster-test-cli": busterTestCli,
        "faye": faye,
        "fs": fs,
        "child_process": ChildProcess
    }),
    sandbox;

childProcessForkMock.send = function(){};
childProcessForkMock.message = function(){};
childProcessForkMock.kill = function(){};

function stubChildProcess() {
    
    sandbox.stub(childProcessForkMock, "kill");

    sandbox.stub(childProcessForkMock, "send", function(msg){
        if (msg.method == 'run') {
            childProcessForkMock.emit('message', {
                method: 'run',
                error: null
            });
        }
    });

    sandbox.stub(ChildProcess, "fork").returns(childProcessForkMock);

    return ChildProcess;
}

function stubServer() {
    var server = Server.create();
    sandbox.stub(server, "run");
    sandbox.stub(Server, "create").returns(server);
    
    return server;
}

function stubAgent(config) {

    config = config || {};
    var agent = new Agent(config);
    sandbox.stub(agent, "listen");
    sandbox.stub(agent, "close");
    AgentStub.returns(agent);
    
    return agent;
}

    
function stubFayeClient(url) {
    
    var emptyFunc = function () {};
    var fayeClient = { accessible: true };
    fayeClient.publish = emptyFunc;
    sandbox.stub(fayeClient, "publish");
    faye.Client.withArgs(url).returns(fayeClient);
    fayeClient.on = function (event, cb) {
        if (event === "transport:up" && fayeClient.accessible) {
            cb();
        }
        if (event === "transport:down" && !fayeClient.accessible) {
            cb();
        }
    }

    return fayeClient;
}

function stubAgentFayeClient(url, answer) {
    
    var fayeClient = stubFayeClient(url);
    
    function welcomeBack(channel, cb) {
        if (answer.browsers) {
            setTimeout(cb.bind(null, answer), 0);
        }
        return {
            then: function (cb) { cb(); }
        };
    }

    fayeClient.subscribe = welcomeBack;
    sandbox.spy(fayeClient, "subscribe");
    
    return fayeClient;
}
 
function stubServerFayeClient(url, slaveIds) {
    
    var fayeClient = stubFayeClient(url);
    
    var stub = {};
    stub.slaveIds = slaveIds.map(function (slaveId) {
        return { slaveId: slaveId };
    });
    stub.slaveReadyMessages = stub.slaveIds.slice(0);
    stub.slaveDeathMessages = stub.slaveIds.slice(0);
    
    fayeClient.subscribe = function (channel, cb) {
        
        setTimeout(function () {
            if (channel === "/slave_ready") {
                if (stub.slaveReadyMessageHandlerRegistrationListener) {
                    stub.slaveReadyMessageHandlerRegistrationListener(
                        channel, cb);
                }
                if (stub.slaveReadyMessages) {
                    stub.slaveReadyMessages.forEach(cb);
                }
            }
            
            if (channel === "/slave_death") {
                if (stub.slaveDeathMessageHandlerRegistrationListener) {
                    stub.slaveDeathMessageHandlerRegistrationListener(
                        channel, cb);
                }
                if (stub.slaveDeathMessages) {
                    stub.slaveDeathMessages.forEach(cb);
                }
            }
            if (channel === "/slave_disconnect") {
                if (stub.slaveDisconnectMessages) {
                    stub.slaveDisconnectMessages.forEach(cb);
                }
            }
        }, 0);

        return {
            then: function (cb) { cb(); }
        };
    };
    
    return stub;
}

function stubTestCli() {

    var testCli = busterTestCli.create(undefined, undefined, {});
    sandbox.stub(testCli, "run");
    sandbox.stub(testCli, "exit", function (exitCode, callback) {
        callback(exitCode);
    });
    sandbox.stub(busterTestCli, "create").returns(testCli);
    
    return testCli;
}


module.exports = {
    
    AgentStub: AgentStub,
    BusterCi: BusterCi,
    busterServer: Server,
    faye: faye,
    fs: fs,
    childProcessStub: childProcessStub,
    childProcessForkMock: childProcessForkMock,
    ChildProcess: ChildProcess,

    setUp: function () {
        async.setImmediate = function (fn) {
            fn();
        };
        sandbox = buster.sinon.sandbox.create();
        this.ChildProcess = stubChildProcess.call(this);
        this.server = stubServer.call(this);
        this.server.run.callsArg(1);
        this.agent = stubAgent.call(this);
        this.agent.listen.callsArg(0);
        this.testCli = stubTestCli.call(this);
        this.testCli.run.callsArg(1);
        sandbox.stub(faye, "Client");
        sandbox.stub(fs, "createWriteStream");
    },
    
    tearDown: function () {
        this.server.kill();
        AgentStub.reset();
        sandbox.restore();
    },
    
    stubAgentFayeClient: stubAgentFayeClient,
    stubServerFayeClient: stubServerFayeClient,
    
    fixSinon: function () {
        // FIX for sinon.js bug:
        // https://github.com/cjohansen/Sinon.JS/commit/
        // 335b48c795d6d21a7d1a442af7837ec2e1ff7c36
        var origClearTimeout = global.clearTimeout;
        sandbox.stub(global, "clearTimeout", function (timerId) {
            if (typeof timerId === 'object') {
                timerId = timerId.id
            }
            origClearTimeout(timerId);
        });
        // End of FIX
    }
};
