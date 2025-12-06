" https://vim.fandom.com/wiki/Creating_your_own_syntax_files#Install_the_syntax_file

" Vim syntax file
" Language: SID
" Maintainer: 13lbise

if exists("b:current_syntax")
    finish
endif

" syn case noignore

syn match cpmIdentifier "[a-zA-Z0-9_]\+[^:\[)]"
syn match cpmLabel      "^[a-z_][a-zA-Z0-9_]*:"he=e-1
syn match cpmLabel      "@[a-z_][a-zA-Z0-9_]*"

" Numbers:
syn match asmDecimal       "\<0\+[1-7]\=\>"          display
syn match asmDecimal       "\<[1-9]\d*\>"            display
syn match asmHexadecimal   "\<0[xX][0-9a-fA-F]\+\>"  display
syn match asmBinary        "\<0[bB][0-1]\+\>"        display

"syn match cpmFunction "\<[a-zA-Z][a-zA-Z0-9_]*\s*("he=e-1
"syn match cpmFunction "\<[a-zA-Z][a-zA-Z0-9_]*\s\+{"he=e-1

" Dollar variables:
syn match cpmDollarVar "$[a-zA-Z0-9_\.]\+"

" Comments:
syn match cpmComment "\s*#.*" contains=cpmTodo,@Spell

" Todo.
syn keyword cpmTodo TODO FIXME XXX DEBUG NOTE contained

syn match sidInclude "$[a-zA-Z0-9_\.]\+"
syn match cpmCond      "\$ifdef"
syn match cpmCond      "\$ifndef"
syn match cpmCond      "\$else"
syn match cpmCond      "\$endif"

"syn match sidOperator "\^"

syn keyword cpmOpcode alias instructions table period lookup group labels
syn keyword cpmOpcode layout2 mapping include times
syn keyword cpmFunction LATCH_RemoteSched EV_Irq GOTO NOP JUMP FLG_Clear FLG_Set
syn keyword cpmFunction VLP_Allowed EV_G722 RADIO_TxRx EV_IncrLoopCnt

syn keyword sidType time
syn keyword cpmOpcode move load andA swapAB orAB orA store autocopy
syn keyword cpmOpcode set shlA addA end xorA jeq jne jump call
syn match cpmOpcode "critical\s\+section\s\+enter"
syn match cpmOpcode "critical\s\+section\s\+exit"

syn keyword cpmType   uint8 uint16 uint32 bool

syn keyword	cpmStorageClass parameter define public private

syn keyword cpmProcCommand	subroutine return
syn keyword	cpmStructure	structure

syn match cpmUnitHeader	"\<program\>"
syn match cpmUnitHeader	"\<code\>"
syn match cpmUnitHeader	"\<update\>"
syn match cpmUnitHeader	"\<layout\>"

syn match cpmConstant	"\<[A-Z0-9_]\+\>"

" Define the default highlighting.
" For version 5.7 and earlier: only when not done already
" For version 5.8 and later: only when an item doesn't have highlighting yet
if version >= 508 || !exists("did_c_syn_inits")
    if version < 508
        let did_c_syn_inits = 1
        command -nargs=+ HiLink hi link <args>
    else
        command -nargs=+ HiLink hi def link <args>
    endif

    HiLink cpmCond          PreProc
    HiLink cpmUnitHeader    PreCondit
    HiLink cpmStorageClass  StorageClass
    HiLink sidType   Type
    HiLink cpmStructure     Structure

    HiLink cpmComment       Comment
    HiLink cpmLabel         Label
    HiLink cpmIdentifier    Identifier
    HiLink cpmOpcode        Statement
    " HiLink cpmOperator      Operator
    " HiLink cpmSpecial       Special
    " HiLink cpmFloat         Float
    HiLink cpmDollarVar     String
    HiLink cpmConstant      Constant
    " HiLink cpmAssignVar     Identifier
    " HiLink cpmString        String
    " HiLink cpmTodo          Todo
    " HiLink cpmRegisterKeyword Include
    HiLink sidInclude       Include

    HiLink cpmType          Type

    HiLink asmHexadecimal   Number
    HiLink asmDecimal       Number
    HiLink asmBinary        Number
    HiLink cpmFunction      Function
    "HiLink sidOperator      SpecialChar
    " HiLink cpmDefineAlias Define
    " HiLink cpmDeclare Define

    delcommand HiLink
endif

let b:current_syntax = "cpm"



"if exists("b:current_syntax")
"  finish
"endif
"
"syn keyword sidTodo contained TODO FIXME XXX NOTE
"syn match sidComment "#.*$" contains=sidTodo
"
"syn match sidDecimal "\<[1-9]\d*\>" display
"syn match sidDecimal "\<[1-9]\d*\>" display
"
"syn match sidLabel "[a-z_][a-zA-Z0-9_]*:"he=e-1
"
"syn match sidInclude "$[a-zA-Z0-9_\.]\+"
"
"syn keyword sidBlockCmd alias table period lookup group labels
"syn keyword sidBlockCmd layout2 mapping include times
"syn keyword sidFuncCmd LATCH_RemoteSched EV_Irq GOTO NOP JUMP FLG_Clear FLG_Set
"syn keyword sidFuncCmd VLP_Allowed EV_G722 RADIO_TxRx EV_IncrLoopCnt
"
"syn keyword sidType time
"
"syn keyword sidProcCommand instructions
"
"hi def link sidComment				Comment
"hi def link sidBlockCmd				Statement
"hi def link sidFuncCmd				Function
"hi def link sidLabel                Label
"hi def link sidType                 Type
"hi def link sidInclude              Include
"hi def link sidDecimal              Number
"
""hi def link celestiaSSAtmosphCmd   Statement
""hi def link celestiaSSBool         Boolean
""hi def link celestiaSSComment      Comment
""hi def link celestiaSSDescString   PreProc
""hi def link celestiaSSEllOrbitCmd  Statement
""hi def link celestiaSSLocationCmd  Statement
""hi def link celestiaSSHIPNumber    Type
""hi def link celestiaSSMainInnerKw  Special
""hi def link celestiaSSMainKw       Keyword
""hi def link celestiaSSNumber       Constant
""hi def link celestiaSSObjectPath   PreProc
""hi def link celestiaSSStdBlockCmd  Statement
""hi def link celestiaSSString       Constant
""hi def link celestiaSSTodo         Todo
""hi def link celestiaSSUrlStr       Underlined
"
"let b:current_syntax = "sid"
