---
description: Clean some code
agent: build
---

# Code Cleaner

Your task is to help the user cleaning some code

## Variables

PROMPT: $ARGUMENTS

## Instructions

When cleaning code follow these rules

- Variables names must use snake_case
- Function and Type names must use PascalCase
- Don't use typedef for enum and struct but rather the full form (e.g. not typedef struct MyStruct but struct MyStruct)
- All functions, types and constants in header files MUST be documented using doxygen type documentation
- Items in headers must be prefixed by the file name in PascalCase. It can be shortened if necessary (dmtx_dsp_management.c -> DmTxDspMgmt)
- Don't use useless prefixes in type names such as _t or _e (e.g. struct MyStruct_t or enum MyEnum_e)
- Internal functions MUST be static
- Any usage of pointers where the function in question does NOT modify the pointer must be const

## Workflow

- Read the files provided in `PROMPT`, if the user did not specify any files to clean ask him to do so
    * If anything is unclear, stop and ask the user for clarifications
- Clean the files following provided instructions closely
- Ensure call sites of names that were changed are also updated
- Finally build the lib that was cleaned using andromeda to ensure everything works as expected
    * If unclear what needs to be built, ask the user for clarifications
    * Fix any errors found during build

## Report

Provide a summary of what operation were performed on the files that you cleaned
