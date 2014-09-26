'use strict';

var sys = require("sys"),
    http = require("http"),
    url = require("url"),
    child = require("child_process");

function getProcessIds(imageName, cb) {
    
    var process = child.exec('tasklist /FO CSV /NH /FI "IMAGENAME eq ' + imageName, function (error, stdout, stderr) {
        var lines = stdout.split("\n").filter(function (line) {
            return line.length > 0;
        });
        var pids = lines.map(function (line) {
           return line.split(",")[1].replace(/"/g, '');
        });
        cb(pids);
    });
}

http.createServer(function (req, res) {

    try {
        res.writeHeader(200, {"Content-Type": "text/plain"});
    
        if (req.url.match(/\/?command=/)) {
            var query = url.parse(req.url, true).query;
            res.write(query.command);
            
            switch(query.command) {
                case "start":
                    console.log("start chrome browser");
                    child.exec("start chrome --new-window http://" + query.host + ":" + query.port + "/capture");
                    break;
                case "stop":
                    console.log("stop (all) chrome browser");
                    getProcessIds("chrome.exe", function (processIdsToKill) {
                        processIdsToKill.forEach(function (pid) {
                            child.exec('taskkill /PID ' + pid + ' /T /F');
                        });
                    });
                    break;
            }
        } else {
            res.write("Command please...");
        }
    
        res.end();
    } catch (e) {
        console.log(e);
    }

}).listen(8888);
sys.puts("Agent Running, waiting for commands on port 8888");