"use strict";

var Agent = require("buster-ci-agent"),
    busterServer = require("buster-server-cli"),
    busterTestCli = require("buster-test-cli"),
    formatio = require("formatio"),
    logger = require("stream-logger"),
    faye = require("faye"),
    async = require("async"),
    when = require("when"),
    fs = require('fs'),
    path = require('path'),
    Server = require('./server');

function traverseObject(obj, func) {
    var prop;
    for (prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            func(prop, obj[prop]);
        }
    }
}

function logAgentMessage(logger, agentName, message) {

    if (agentName === "localhost") {
        return;
    }

    var reporter = {
        log: process.stdout,
        info: process.stdout,
        debug: process.stdout,
        warn: process.stderr,
        error: process.stderr
    };

    if (logger.levels.indexOf(message.level)
        <= logger.levels.indexOf(logger.level)) {
        reporter[message.level].write(
            agentName + ": " + message.message + "\n");
    }
}

function startLocalAgent(cb) {
    /*jshint validthis: true */
    if (this._agents.localhost) {
        this._logger.info("start local agent");
        var agentConfig = Object.create(this._agents.localhost.config);
        agentConfig.browsers = this._localBrowsers;
        agentConfig.logLevel = this._logger.level;
        this._localAgent = new Agent(agentConfig);
        this._localAgent.listen(cb);
    } else {
        cb();
    }
}

function transformAgentConfig(config) {
    /*jshint validthis: true */
    var i, id = 0;
    traverseObject(config.agents, function (agentName, agent) {
        this._agents[agentName] = {
            config: agent
        };
        var browsers = {};
        if (agent.browsers) {
            for (i = 0; i < agent.browsers.length; i++) {
                browsers[agent.browsers[i]] = { id: ++id };
            }
        }
        agent.browsers = browsers;
    }.bind(this));
}

function sendMessage(agent, message) {
    /*jshint validthis: true */
    this._logger.debug("sendMessage: " + formatio.ascii(message));
    if (agent.client) {
        agent.client.publish(
            "/messages",
            message
        );
    }
}

function createFayeClientAgent(agentName, agent, cb) {
    /*jshint validthis: true */
    this._logger.info("create faye client for agent: " + agentName);
    var agentUrl = "http://" + agentName + ":" + agent.config.port;
    agent.client = new faye.Client(agentUrl);
    agent.client.on('transport:up', cb);
    agent.client.on('transport:down',
        cb.bind(null, "Agent " + agentUrl + " not accessible!"));
    sendMessage.call(this, agent, { command: "ping" });
}

function validateBrowserConfig(agentName, message, cb) {
    /*jshint validthis: true */
    this._logger.info("validateBrowserConfig");

    var browsersToRun = this._agents[agentName].config.browsers;
    try {
        traverseObject(browsersToRun, function (browserName, browser) {
            if (!message.browsers[browserName]) {
                delete this._agents[agentName].config.browsers[browserName];
                throw "Browser " + browserName +
                        " not configured for agent " + agentName + "!";
            }
        }.bind(this));
        cb();
    } catch (error) {
        cb(error);
    }
}

function welcomeAgent(agentName, agent, cb) {
    /*jshint validthis: true */
    this._logger.info("welcome agent: " + agentName);
    var timeout = setTimeout(
        cb.bind(null, "Agent " + agentName + " is not answering!"), 10000);

    // TODO: move subscription to another place
    var subscription = agent.client.subscribe("/messages", function (message) {
        // ignore own command messages
        if (message.command) {
            return;
        }
        // logging info from agent
        if (message.message) {
            logAgentMessage(this._logger, agentName, message);
            return;
        }

        clearTimeout(timeout);
        this._logger.info(agentName + ": " + formatio.ascii(message));
        validateBrowserConfig.call(this, agentName, message, cb);
    }.bind(this));
    subscription.then(function () {
        sendMessage.call(this, agent, { command: "Welcome" });
    }.bind(this));
}

function captureBrowsers(cb) {
    /*jshint validthis: true */
    this._logger.info("capture browsers");
    var slaveIdsToWaitFor = [];
    traverseObject(this._agents, function (agentName, agent) {
        traverseObject(agent.config.browsers, function (browserName, browser) {
            slaveIdsToWaitFor.push("" + browser.id);
        });
    });
    this._logger.debug(slaveIdsToWaitFor);
    var timeout = setTimeout(function () {
        cb("Not all browsers got ready!: " + slaveIdsToWaitFor);
    }, this._captureTimeout);
    var client = new faye.Client("http://localhost:" +
        (this._serverCfg.port || "1111") + "/messaging");
    var subscription = client.subscribe("/slave_ready", function (message) {
        this._logger.debug("slave ready: " + formatio.ascii(message));
        var indexOfId = slaveIdsToWaitFor.indexOf("" + message.slaveId);
        slaveIdsToWaitFor.splice(indexOfId, 1);
        this._logger.debug(slaveIdsToWaitFor);
        if (slaveIdsToWaitFor.length === 0) {
            clearTimeout(timeout);
            this._logger.info("All browsers are ready.");
            cb();
        }
    }.bind(this));
    subscription.then(function () {
        traverseObject(this._agents, function (agentName, agent) {
            sendMessage.call(this, agent, {
                command: "start",
                browsers: agent.config.browsers,
                url: "http://" +
                    (this._serverCfg.host || "localhost") +
                    ":" +
                    (this._serverCfg.port || "1111") +
                    "/capture"
            });
        }.bind(this));
    }.bind(this));
}

function closeBrowsers(cb) {
    /*jshint validthis: true */
    this._logger.info("close browsers");
    var slaveIdsToWaitFor = [];
    traverseObject(this._agents, function (agentName, agent) {
        traverseObject(agent.config.browsers, function (browserName, browser) {
            slaveIdsToWaitFor.push("" + browser.id);
        });
    });
    this._logger.debug(slaveIdsToWaitFor);
    var timeout = setTimeout(function () {
        cb("Not all browsers could be closed!: " + slaveIdsToWaitFor);
    }, this._closeTimeout);
    var client = new faye.Client("http://localhost:" +
        (this._serverCfg.port || "1111") + "/messaging");

    function browserClosedHandler(logPrefix, message) {
        this._logger.debug(logPrefix + formatio.ascii(message));
        var indexOfId = slaveIdsToWaitFor.indexOf("" + message.slaveId);
        slaveIdsToWaitFor.splice(indexOfId, 1);
        this._logger.debug(slaveIdsToWaitFor);
        if (slaveIdsToWaitFor.length === 0) {
            clearTimeout(timeout);
            this._logger.info("All browsers are closed.");
            cb();
        }
    }
    var subscriptionSlaveDeath = client.subscribe("/slave_death",
        browserClosedHandler.bind(this, "slave timed out: "));
    var subscriptionSlaveDisconnect = client.subscribe("/slave_disconnect",
        browserClosedHandler.bind(this, "slave disconnected gracefully: "));
    when.all([subscriptionSlaveDeath,
              subscriptionSlaveDisconnect]
    ).then(function () {
        traverseObject(this._agents, function (agentName, agent) {
            sendMessage.call(this, agent, {
                command: "stop",
                browsers: agent.config.browsers
            });
        }.bind(this));
    }.bind(this));
}


function BusterCi(config) {

    if (!config.agents) {
        throw new Error("No agents specified in the config!");
    }

    this._server = Server.create();

    var outputStream = config.outputFile ?
        fs.createWriteStream(config.outputFile) : process.stdout;
    this._testCli = busterTestCli.create(outputStream, process.stderr, {
        missionStatement: "Run Buster.JS tests on node, in browsers, or both",
        description: "",
        environmentVariable: "BUSTER_TEST_OPT",
        runners: busterTestCli.runners,
        configBaseName: "buster",
        extensions: {
            browser: [
                require("buster/lib/buster/framework-extension"),
                require("buster/lib/buster/wiring-extension"),
                require("buster-syntax").create({ ignoreReferenceErrors: true })
            ]
        }
    });

    this._serverCfg = config.server || {};
    this._localBrowsers = config.browsers;

    this._agents = {};
    transformAgentConfig.call(this, config);

    var logLevel = config.logLevel !== undefined ? config.logLevel : "info";
    this._logger = logger(process.stdout, process.stderr);
    this._logger.level = logLevel;
    this._captureTimeout = config.captureTimeout ?
        config.captureTimeout * 1000 : 30000;
    this._closeTimeout = config.closeTimeout ?
        config.closeTimeout * 1000 : 30000;
}

BusterCi.prototype = {

    // killServer: function(){
    //     var server = this._server;
    //     if (server) {
    //         // Clean up any attached bound listener.
    //         if (this._killServer) {
    //             process.removeListener("close", this._killServer)
    //             delete this._killServer;
    //         }

    //         delete this._server;

    //         server.kill();
    //     }
    // },

    run: function (args, cb) {

        var tasks = {
            startLocalAgent: startLocalAgent.bind(this),
            // runServer: (function(cb, result){
            //     var server = this._server;
            //     if (server) {
            //         // callback for passing server message to the task callback
            //         var callback = function(response){
            //             // Specifically listen a response containing method == run.
            //             if (response.method == "run") {
            //                 cb(response.error);
            //                 // Clean up by removing the listener
            //                 server.removeListener("message", callback);
            //             }
            //         }

            //         // Handle server process' message that will trigger the tasks' callback
            //         server.on("message", callback);

            //         // Tell the server process to run with port arg
            //         server.send({
            //             method: "run",
            //             args: ["-p" + (this._serverCfg.port || 1111)]
            //         })
            //     } else {
            //         cb(new Error('server is undefined'))
            //     }
                
            // }).bind(this)
            runServer: this._server.run.bind(this._server, ["-p" + (this._serverCfg.port || 1111)])
        };

        var createFayeClientTasks = [];
        traverseObject(this._agents, function (agentName, agent) {
            var createFayeClientTaskName = "createFayeClient_" + agentName;
            createFayeClientTasks.push(createFayeClientTaskName);
            tasks[createFayeClientTaskName] = [
                "startLocalAgent",
                "runServer",
                createFayeClientAgent.bind(this, agentName, agent)
            ];
        }.bind(this));

        var welcomeTasks = [];
        traverseObject(this._agents, function (agentName, agent) {
            var welcomeTaskName = "welcome_" + agentName;
            welcomeTasks.push(welcomeTaskName);
            tasks[welcomeTaskName] = createFayeClientTasks.slice(0);
            tasks[welcomeTaskName].push(
                welcomeAgent.bind(this, agentName, agent));
        }.bind(this));

        tasks["captureBrowsers"] = welcomeTasks.slice(0);
        tasks["captureBrowsers"].push(
            captureBrowsers.bind(this)
        );

        var origExit = this._testCli.exit;
        var exitCode = 1;
        function newExit(code, cb) {
            exitCode = code;
            cb(code);
        }
        this._testCli.exit = newExit;
        tasks["runTests"] = ["captureBrowsers", function (cb) {
            this._logger.info("run tests");
            this._testCli.run(["--server",
                               "http://localhost:" +
                               this._serverCfg.port || 1111,
                               "--reporter", "xml"].concat(args), cb);
        }.bind(this)];


        async.auto(
            tasks,
            function (err, results) {
                if (err) {
                    this._logger.error(err);
                }
                closeBrowsers.call(this, function (err) {
                    // Be sure to kill the server process
                    this._server.kill();

                    if (this._localAgent) {
                        this._localAgent.close();
                    }
                    if (err) {
                        this._logger.error(err);
                    }
                    this._logger.info("All done.");
                    origExit.call(this._testCli,
                        exitCode, cb || function () {});
                }.bind(this));
            }.bind(this)
        );
    }
};

module.exports = BusterCi;