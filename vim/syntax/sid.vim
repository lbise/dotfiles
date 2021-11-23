" https://vim.fandom.com/wiki/Creating_your_own_syntax_files#Install_the_syntax_file

if exists("b:current_syntax")
  finish
endif

syn keyword sidTodo contained TODO FIXME XXX NOTE
syn match sidComment "#.*$" contains=sidTodo
syn keyword sidBlockCmd time alias table instructions period lookup group labels
syn keyword sidBlockCmd layout2 mapping include times
syn keyword sidFuncCmd LATCH_RemoteSched EV_Irq GOTO NOP JUMP FLG_Clear FLG_Set
syn keyword sidFuncCmd VLP_Allowed EV_G722 RADIO_TxRx EV_IncrLoopCnt

let b:current_syntax = "sid"

hi def link sidComment				Comment
hi def link sidBlockCmd				Statement
hi def link sidFuncCmd				Function
"hi def link celestiaSSAtmosphCmd   Statement
"hi def link celestiaSSBool         Boolean
"hi def link celestiaSSComment      Comment
"hi def link celestiaSSDescString   PreProc
"hi def link celestiaSSEllOrbitCmd  Statement
"hi def link celestiaSSLocationCmd  Statement
"hi def link celestiaSSHIPNumber    Type
"hi def link celestiaSSMainInnerKw  Special
"hi def link celestiaSSMainKw       Keyword
"hi def link celestiaSSNumber       Constant
"hi def link celestiaSSObjectPath   PreProc
"hi def link celestiaSSStdBlockCmd  Statement
"hi def link celestiaSSString       Constant
"hi def link celestiaSSTodo         Todo
"hi def link celestiaSSUrlStr       Underlined
