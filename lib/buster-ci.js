"use strict";

var Agent = require("buster-ci-agent"),
    busterServer = require("buster-server-cli"),
    busterTestCli = require("buster-test-cli"),
    formatio = require("formatio"),
    faye = require("faye"),
    async = require("async"),
    fs = require('fs');

function traverseObject(obj, func) {
    var prop;
    for (prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            func(prop, obj[prop]);
        }
    }
}

function startLocalAgent(cb) {
    console.log("startLocalAgent");
    /*jshint validthis: true */
    if (this._agents.localhost) {
        var agentConfig = Object.create(this._agents.localhost.config);
        agentConfig.browsers = this._localBrowsers;
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
    
    console.log("sendMessage: " + formatio.ascii(message));
    if (agent.client) {
        agent.client.publish(
            "/messages",
            message
        );
    }
}

function createFayeClientAgent(agentName, agent, cb) {
    console.log("create faye client for agent: " + agentName);
    /*jshint validthis: true */
    var agentUrl = "http://" + agentName + ":" + agent.config.port;
    agent.client = new faye.Client(agentUrl);
    agent.client.on('transport:up', cb);
    agent.client.on('transport:down',
        cb.bind(null, "Agent " + agentUrl + " not accessible!"));
    sendMessage(agent, "ping");
}

function validateBrowserConfig(agentName, message, cb) {
    /*jshint validthis: true */
    console.log("validateBrowserConfig");

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
    console.log("welcome agent: " + agentName);
    /*jshint validthis: true */
    var timeout = setTimeout(
        cb.bind(null, "Agent " + agentName + " is not answering!"), 10000);
    var subscription = agent.client.subscribe("/messages", function (message) {
        if (message.command) {
            return;
        }
        clearTimeout(timeout);
        console.log(agentName + ": " + formatio.ascii(message));
        validateBrowserConfig.call(this, agentName, message, cb);
    }.bind(this));
    subscription.then(function () {
        sendMessage(agent, { command: "Welcome" });
    });
}

function captureBrowsers(cb) {
    console.log("captureBrowsers");
    /*jshint validthis: true */
    var slaveIdsToWaitFor = [];
    traverseObject(this._agents, function (agentName, agent) {
        traverseObject(agent.config.browsers, function (browserName, browser) {
            slaveIdsToWaitFor.push(browser.id);
        });
    });
    console.log(slaveIdsToWaitFor);
    var timeout = setTimeout(function () {
        cb("Not all browsers got ready!: " + slaveIdsToWaitFor);
    }, 10000);
    var client = new faye.Client("http://localhost:" +
        (this._serverCfg.port || "1111") + "/messaging");
    var subscription = client.subscribe("/slave_ready", function (message) {
        console.log("slave ready: " + formatio.ascii(message));
        var indexOfId = slaveIdsToWaitFor.indexOf(message.slaveId);
        slaveIdsToWaitFor.splice(indexOfId, 1);
        console.log(slaveIdsToWaitFor);
        if (slaveIdsToWaitFor.length === 0) {
            clearTimeout(timeout);
            console.log("All browsers are ready");
            cb();
        }
    });
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
    console.log("closeBrowsers");
    /*jshint validthis: true */
    var slaveIdsToWaitFor = [];
    traverseObject(this._agents, function (agentName, agent) {
        traverseObject(agent.config.browsers, function (browserName, browser) {
            slaveIdsToWaitFor.push(browser.id);
        });
    });
    console.log(slaveIdsToWaitFor);
    var timeout = setTimeout(function () {
        cb("Not all browsers could be closed!: " + slaveIdsToWaitFor);
    }, 30000);
    var client = new faye.Client("http://localhost:" +
        (this._serverCfg.port || "1111") + "/messaging");
    var subscription = client.subscribe("/slave_death", function (message) {
        console.log("slave timed out: " + formatio.ascii(message));
        var indexOfId = slaveIdsToWaitFor.indexOf(message.slaveId);
        slaveIdsToWaitFor.splice(indexOfId, 1);
        console.log(slaveIdsToWaitFor);
        if (slaveIdsToWaitFor.length === 0) {
            clearTimeout(timeout);
            console.log("All browsers are closed");
            cb();
        }
    });
    subscription.then(function () {
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

    this._server = busterServer.create(process.stdout, process.stderr, {
        binary: "buster-ci-server",
        unexpectedErrorMessage: ""
    });
    
    
    var outputStream = config.output_file ?
        fs.createWriteStream(config.output_file) : process.stdout;
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
}

BusterCi.prototype = {

    run: function (cb) {
        
        var tasks = {
            startLocalAgent: startLocalAgent.bind(this),
            runServer: this._server.run.bind(
                this._server,
                ["-v", "-p" + (this._serverCfg.port || 1111)]
            )
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
        tasks["runTests"] = ["captureBrowsers",
            this._testCli.run.bind(this._testCli, ["--reporter", "xml"])];
        
        async.auto(
            tasks,
            function (err, results) {
                if (err) {
                    console.log(err);
                }
                closeBrowsers.call(this, function (err) {
                    if (this._localAgent) {
                        this._localAgent.close();
                    }
                    if (err) {
                        console.log(err);
                    }
                    console.log("all done");
                    origExit.call(this._testCli,
                        exitCode, cb || function () {});
                }.bind(this));
            }.bind(this)
        );
    }
};

module.exports = BusterCi;