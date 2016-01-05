# buster-ci

[![Build status](https://secure.travis-ci.org/busterjs/buster-ci.png?branch=master)](http://travis-ci.org/busterjs/buster-ci)
[![Build status](https://ci.appveyor.com/api/projects/status/github/busterjs/buster-ci?branch=master&svg=true)](https://ci.appveyor.com/project/dominykas/buster-ci)

This module provides a way to easily use **Buster.JS** in the continues integration process.
With command `buster-ci` the buster server will be started, browsers started and captured, the tests executed
and finally the browsers closed and the server stopped. Using [buster agents](https://github.com/busterjs/buster-ci-agent)
even allows starting browsers on remote machines.


## Installation

To use this module you have to install **Buster.JS**

`npm install buster`


## Usage

Have a look at the **Buster.JS** [ documentation](http://docs.busterjs.org/en/latest/modules/buster-ci/),
to see how **buster-ci** is used.


## Changelog

**0.3.0** (2016-Jan-05)

* Dependency updates
* BREAKING: added an engine requirement (node LTS) in package.json

**0.2.3** (2015-Jul-15)

* [Config option `errorOnDownAgent` added](http://docs.busterjs.org/en/latest/modules/buster-ci/#errorondownagent)

**0.2.2** (2015-Mar-16)

* [Capture headless browser](http://docs.busterjs.org/en/latest/modules/buster-ci/#capturing-headless-browser)

**0.2.1** (2015-Jan-30)

* Fix for issue [#448 - buster-ci should pass the server url to buster test cli](https://github.com/busterjs/buster/issues/448)

**0.2.0** (2014-Dec-17)

* arguments for test run can now be passed (breaking change, new version of buster.js is needed)
* timeouts for capturing and closing browsers can now be overwritten via config options

**0.1.1** (2014-Oct-21)

* can now handle gracefully disconnect of slave
