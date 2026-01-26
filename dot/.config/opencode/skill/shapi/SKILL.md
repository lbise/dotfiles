---
name: shapi
description: Create or edit SHAPI requests and indications
---

The Shannon-P Host Application Programming Interface (SHAPI) is a communication protocol that enables host devices to control Shannon-P chips. This guide provides comprehensive information on how to add SHAPI primitives and types, understand the code generation process, and implement both C and Python code using the framework.

It is always assumed that the SYS core is the one handling the SHAPI interface on the shannon-p side.

## SHAPI

SHAPI uses XML files to define both types and primitives:

1. **TypeDefinitions tag** - Defines data types (enums, structs, constants, mux types)
2. **ShapiCommands tag** - Defines SHAPI commands (requests, confirmations, indications, responses)
    * Request and confirmation: Host -> Shannon-p direction
    * Indication and response: Shannon-p -> Host direction

Example definition snippet:
```xml
<TypeDefinitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" PackedTreatment="ThreeTypeRepresentations" xsi:noNamespaceSchemaLocation="Types.xsd">
    <!-- Simple Enum Type -->
    <EnumType Name="MY_ENUM_T" ReprType="UInt8">
        <Description>My example enum</Description>
        <EnumMember Name="ENUM_VALUE_0" Value="0x00">
            <Description>First value</Description>
        </EnumMember>
        <EnumMember Name="ENUM_VALUE_1" Value="0x01">
            <Description>Second value</Description>
        </EnumMember>
    </EnumType>

    <!-- Struct Type -->
    <StructType Name="MY_SIMPLE_STRUCT_T">
        <Description>My example struct</Description>
        <EnumTypeRef Name="enum_field" Type="MY_ENUM_T">
            <Description>Enum field</Description>
        </EnumTypeRef>
        <SimpleTypeRef Name="int_field" Type="UInt8">
            <Description>Integer field</Description>
        </SimpleTypeRef>
    </StructType>

    <!-- Fixed Length Array -->
    <StructType Name="MY_FIXED_ARRAY_T">
        <Description>Fixed length array example</Description>
        <FixedLengthArraySimpleTypeRef Name="data" Length="4" Type="UInt8">
            <Description>Fixed array data</Description>
        </FixedLengthArraySimpleTypeRef>
    </StructType>

    <!-- Variable Length Array -->
    <StructType Name="MY_VAR_ARRAY_T">
        <Description>Variable length array example</Description>
        <SimpleTypeRef Name="count" Type="UInt8">
            <Description>Array count</Description>
        </SimpleTypeRef>
        <ExpVarLengthArraySimpleTypeRef Name="data" LenDefParam="count" MaxLength="16" Type="UInt8">
            <Description>Variable array data</Description>
        </ExpVarLengthArraySimpleTypeRef>
    </StructType>

    <!-- Mux Type (Union) -->
    <MuxType Name="MY_MUX_T" DataName="MY_MUX_DATA_T" ReprType="UInt8">
        <Description>Mux type example</Description>
        <SimpleTypeRef Name="TYPE_0" Type="UInt8">
            <Description>Type 0 data</Description>
        </SimpleTypeRef>
        <StructTypeRef Name="TYPE_1" Type="MY_SIMPLE_STRUCT_T">
            <Description>Type 1 data</Description>
        </StructTypeRef>
    </MuxType>
</TypeDefinitions>
```

Primitives definition snippet:
```xml
<ShapiCommands xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" PackedTreatment="VerifyNaturallyAligned" xsi:noNamespaceSchemaLocation="CommandsShapi.xsd">
<!-- Request with optional Confirmation -->
    <Command Name="MyRequestWithConfirmation" Variant="0">
        <Description>Example request with confirmation</Description>
        <Request>
            <Description>Request parameters</Description>
            <StructParam Name="header" Type="HEADER_T">
                <Description>SHAPI header</Description>
            </StructParam>
            <StructParam Name="my_struct" Type="MY_SIMPLE_STRUCT_T">
                <Description>Example struct parameter</Description>
            </StructParam>
            <EnumParam Name="enum_param" Type="MY_ENUM_T">
                <Description>Example enum parameter</Description>
            </EnumParam>
            <SimpleParam Name="int_param" Type="UInt8">
                <Description>Example integer parameter</Description>
            </SimpleParam>
        </Request>
        <Confirmation>
            <Description>Confirmation parameters</Description>
            <StructParam Name="header" Type="HEADER_T">
                <Description>SHAPI header</Description>
            </StructParam>
            <EnumParam Name="return_code" Type="MY_RETURN_CODE_T">
                <Description>Return code</Description>
            </EnumParam>
            <SimpleParam Name="int_param" Type="UInt8">
                <Description>Response integer</Description>
            </SimpleParam>
        </Confirmation>
    </Command>

    <!-- Indication with optional Response -->
    <Command Name="MyIndicationWithResponse" Variant="0">
        <Description>Example indication with response</Description>
        <Indication>
            <Description>Indication parameters</Description>
            <StructParam Name="header" Type="HEADER_T">
                <Description>SHAPI header</Description>
            </StructParam>
            <SimpleParam Name="int_param" Type="UInt8">
                <Description>Indication data</Description>
            </SimpleParam>
            <EnumParam Name="enum_param" Type="MY_ENUM_T">
                <Description>Indication enum</Description>
            </EnumParam>
        </Indication>
        <Response>
            <Description>Response parameters</Description>
            <StructParam Name="header" Type="HEADER_T">
                <Description>SHAPI header</Description>
            </StructParam>
            <StructParam Name="response_struct" Type="MY_SIMPLE_STRUCT_T">
                <Description>Response data</Description>
            </StructParam>
            <SimpleParam Name="response_int" Type="UInt8">
                <Description>Response integer</Description>
            </SimpleParam>
        </Response>
    </Command>
</ShapiCommands>
```
All the necessary infrastructure code is generated by the andromeda build system when parsing the XML file.

## Workflow

In order to implement a new SHAPI command the user must do the following operations:

* Add new SHAPI commands to the appropriate xml file
* For a request: Implement the function handling the request on the target. The name must follow a strict format.

For example
```
// SHAPI command with explicit response
void shapiProtoAdapterMyTestCommand_REQ(SHAPI_MYTESTCOMMAND_REQ* req, srvCallbackShapiConf cb, void* arg) {
    T_NOARG_INFO("--> Received MyTestCommand");

    uint8_t resp = HandleMyTestCommand(req->param1);
    // Free SHAPI command
    shapiFree(req);
    // Send the confirmation using the provided callback function
    SHAPI_MYTESTCOMMAND_CONF* conf = shapiUtilCreateMyTestCommand_CONF(resp);
    cb(arg, conf, sizeof(SHAPI_MYTESTCOMMAND_CONF));
}
```
* For an indication: Implement the function handling the message and sending a spontaneous indication.
```
void MyTestIndication(uint8_t param1) {
    T_NOARG_INFO("<-- Sending MyTestIndication");

    // Allocate indication
    SHAPI_MYTESTINDICATION_IND* ind = shapiUtilCreateMyTestIndication_IND(param1);
    // Send indication
    shapiProtoServiceSendMyTestIndication_IND(ind, NULL, NULL);
}
```
* Create python helpers to wrap the python generated code
    * To send a request from the host to shannon-p:
    ```
    async def send_my_test_command(shapi, param1):
        return await shapi.asend(shapi.MyTestCommandReq(param1))
    ```
    * To expect an indication from shannon-p to the host:
    ```
    async def expect_my_test_indication(shapi):
        return await shapi.expect(shapi.MyTestIndicationInd())
    ```
* If you are missing any information from the user be sure to ask
