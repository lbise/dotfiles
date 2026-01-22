---
name: andromeda-buildsystem
description: Build and run tests using the andromeda build system
---

Andromeda is a custom buildsystem used to build and test code developed for the Shannon-p ASIC.

## Andromeda

The ANDROMEDA_ROOT env variable provides the root path to the folder containing all the scripts, source code and tests.

The entry point to the buildsystem is the build.py script.

Important parameters:

* -p <path> : Path to the project you want to build or test to run
* -x : After building the necessary apps, run the tests
* --match-test : Run a single test from a suite

There are two kinds of tests: hardware-in-the-loop and unity based unit tests that can run on the host (unity_host) or on the embedded target (unity_rcu|uart|...)
You should favor running unity_host tests only as they are the fastest.

## Examples

* Building a lib : $ANDROMEDA_ROOT/build.py -p prj/rcu/lib/dmtx
* Build and run all tests : $ANDROMEDA_ROOT/build.py -p prj/tst/unity_host/dmtx/base -x
* Build and run a single test : $ANDROMEDA_ROOT/build.py -p prj/tst/unity_host/dmtx/base -x --match-test my_test
