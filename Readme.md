# buster-ci (POC)


The idea of this module is to provide a way of starting the **Buster.JS** server,
capture the browsers, run the tests and close the browsers at once.

The current approach is to have agents running on every system, where browsers should be started for the test run.
For a first try, the implementation can handle only one agent and that agent can only start the chrome browser.

## Installation

For now the module is only tested checked out in the development environment of **Buster.JS**.


## Usage

If you want to try out the module copy `agent.js` on a remote linux or `agent-win.js` on a remote windows system an run:
```
node agent.js  // or node agent-win.js
```    

On the machine with **Buster.JS** development environment, move to a project configured for **Buster.JS** browser tests.
Instead of running `buster-test`, type:

```
node [path\to\buster-dev]\buster-ci\lib\buster-ci [IP_OF_THIS_MACHINE] [IP_OF_AGENT_MACHINE]
```  

Good luck!
