" #############################################################################
" GUI specific
" #############################################################################
set lines=500 columns=500
set guifont=Consolas:h11:cDEFAULT
set guioptions=gt                       " Hide scrollbar and menu
au GUIEnter * simalt ~x                 " Maximize window

set fileformat=unix                     " use LF not CRLF
set fileformats=unix,dos

"" hide these files in File Explorer
let g:explHideFiles='^\.,\.gz$,\.exe$,\.zip$'

if has("terminfo")
    set t_Co=8
    set t_Sf=[3%p1%dm
    set t_Sb=[4%p1%dm
else
    set t_Co=8
    set t_Sf=[3%dm
    set t_Sb=[4%dm
endif