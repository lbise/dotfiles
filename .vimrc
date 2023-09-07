"###############################################################################
" Leo's vimrc config
" Many things taken from https://github.com/dwmkerr/dotfiles/blob/main/vim/vimrc
" and vim sensible plugin
"###############################################################################
" Enable syntax highlighting
syntax on

" Disable vi compatiblity
set nocompatible

" Show matching braces
set showmatch

" enable file type detection
filetype plugin indent on

set autoindent

" Enable 24 bit colors
set termguicolors

" Set shell as zsh
set shell=/bin/zsh

" Add line number
set number

" Add relative line number
set relativenumber

" No swap files
set noswapfile

" Switch buffers without writing
set hidden

" Lower delay on exit insert mode
set ttimeout
set ttimeoutlen=50

" When in insert mode, highlight the current line.
:autocmd InsertEnter * set cul
:autocmd InsertLeave * set nocul

" Allow backspacing over everything
set backspace=indent,eol,start

" More history
set history=8192

" Convert tabs to space
set expandtab
set tabstop=4
set softtabstop=4
set shiftwidth=4

set hlsearch
set ignorecase

" smart case-sensitive search
set smartcase

" Split window to the right
set splitright

" Split window below
set splitbelow

" Always hide the statusline
set laststatus=0

" Show as much of the last line as possible
set display=lastline

" Show a little more status about running command
set showcmd

" Hide the default mode text
set noshowmode

" Search results as search is typed
set incsearch

" Enable ruler
set ruler

" Command line completion menu
set wildmenu

" Ignore files
set wildignore+=*.o,*.obj,*.so,*.a,*.dll,*.dylib
set wildignore+=*.svn,*.git,*.swp,*.pyc,*.class,*/__pycache__/*
set display+=lastline
let g:netrw_banner = 0

" Always show 1 line above/below curosor
set scrolloff=1

" Turn off all sound on errors
set noerrorbells
set novisualbell
set vb t_vb=

" Saving options in session and view files causes more problems than it
" solves, so disable it.
set sessionoptions-=options
set viewoptions-=options

" Set the window's title, reflecting the file currently being edited
set title

" Change setlist displayed char
if &listchars ==# 'eol:$'
	set listchars=tab:>\ ,trail:-,extends:>,precedes:<,nbsp:+
endif

" Use rg for grepping
if executable('rg')
    set grepprg=rg\ --no-heading\ --vimgrep\ --smart-case
    set grepformat=%f:%l:%c:%m
endif

" Make Rg and Ag not match on file names only on content
command! -bang -nargs=* Rg call fzf#vim#grep("rg --column --line-number --no-heading --color=always --smart-case ".shellescape(<q-args>), 1, {'options': '--delimiter : --nth 4..'}, <bang>0)
command! -bang -nargs=* Ag call fzf#vim#ag(<q-args>, {'options': '--delimiter : --nth 4..'}, <bang>0)

" Delete comment character when joining commented lines.
if v:version > 703 || v:version == 703 && has("patch541")
    set formatoptions+=j
endif

" Save using sudo
command -nargs=0 SaveAsRoot :execute ':silent w !sudo tee % > /dev/null' | :edit!
cnoreabbrev sudow SaveAsRoot
cmap w!! :SaveAsRoot<CR>

"###############################################################################
" Language settings
"###############################################################################
" All languages - no autocommenting on newlines, 4 spaces soft tabs + expand
au FileType * set fo-=c fo-=r fo-=o sw=4 sts=4 et

" Language specific indentation.
au FileType html           setl sw=2 sts=2 et
au FileType javascript     setl sw=2 sts=2 et
au FileType javascript.jsx setl sw=2 sts=2 et
au FileType typescript     setl sw=2 sts=2 et
au FileType typescript.tsx setl sw=2 sts=2 et
au FileType json           setl sw=2 sts=2 et
au FileType ruby           setl sw=2 sts=2 et
au FileType yaml           setl sw=2 sts=2 et
au FileType terraform      setl sw=2 sts=2 et
au FileType make           set noexpandtab shiftwidth=8 softtabstop=0 " makefiles must use tabs
au FileType sshconfig      setl sw=2 sts=2 etc

" Enable spellchecking on git commit
autocmd FileType gitcommit setlocal spell

" Use c syntax for andromeda files
au BufRead,BufNewFile *.unity set filetype=c
au BufRead,BufNewFile *.sid set filetype=c

"###############################################################################
" Mappings
"###############################################################################
let mapleader = " "

map <f5> :Obsession ~/.vimsession/lbise.vim<CR>
map <f6> :source ~/.vimsession/lbise.vim<CR>

"map <f9> :!compile_zephyr %:p:h<CR>
"map <C-f9> :!compile_zephyr %:p:h clean<CR>
"map <S-f9> :!compile_zephyr %:p:h distclean<CR>
"map <f12> :!run_checkpatch %:p:h<CR>
map <f11> :redraw!<CR>
map <f12> :!ctags -R .<CR>

" Next buffer remapping
map <C-Left> :bn<CR>
map <C-Right> :bp<CR>
map <C-h> :bn<CR>
map <C-l> :bp<CR>
nnoremap <C-j> :Bd<CR>

" Clear search highlights
nnoremap <silent> <Leader><Esc> <Esc>:nohlsearch<CR><Esc>

" Remove all trailing and leading whitespaces
map <F4> :%s/\s\+$//e<CR>

" Resize splits
nnoremap <silent> <Leader>+ :exe "resize " . (winheight(0) * 3/2)<CR>
nnoremap <silent> <Leader>- :exe "resize " . (winheight(0) * 2/3)<CR>

" Do not overwrite yanked stuff
xnoremap p pgvy

" Search files
nnoremap <silent> <Leader><space> :Files<CR>

" Search files content
nnoremap <silent> <Leader>f :Rg<CR>

" python docstring
nnoremap <silent> <Leader>ss :Docstring<CR>

" Mappings for vimdiff
if &diff
    map <leader>1 :diffget LOCAL<CR>
    map <leader>2 :diffget BASE<CR>
    map <leader>3 :diffget REMOTE<CR>
endif

" Move and center cursor
nnoremap <C-d> <C-d>zz
nnoremap <C-u> <C-u>zz
nnoremap <C-f> <C-f>zz
nnoremap <C-b> <C-b>zz
nnoremap n nzz
nnoremap N Nzz

" Insert line without leaving normal mode
nnoremap <leader>o o<Esc>0"_D
nnoremap <leader>O O<Esc>0"_D

"###############################################################################
" Plugins
"###############################################################################

    "***************************************************************************
    " Color scheme
    "***************************************************************************
    let g:nord_underline = 1
    let g:nord_cursor_line_number_background = 1
    colorscheme nord

    "***************************************************************************
    " vim-airline
    "***************************************************************************
    let g:airline#extensions#tabline#enabled = 1
    " Disable branch name
    let g:airline#extensions#branch#enabled = 0
    " Disable whitespace extension
    let g:airline#extensions#whitespace#enabled = 0
    " Customize sections
    let g:airline_section_y = ""
    let g:airline_powerline_fonts = 1
    " Disable some stuff"
    let g:airline#extensions#coc#enabled = 0
    " enable/disable showing a summary of changed hunks under source control. >
    let g:airline#extensions#hunks#enabled = 0

    "if !exists('g:airline_symbols')
    "    let g:airline_symbols = {}
    "endif

    "***************************************************************************
    " ultisnips
    "***************************************************************************
    " TODO: Not currently used
    " Trigger configuration. Do not use <tab> if you use https://github.com/Valloric/YouCompleteMe.
    " snippets used are those of the vim-snippets bundle see ~/.vimrc/bundle/vim-snippets
    let g:UltiSnipsExpandTrigger="<tab>"
    let g:UltiSnipsJumpForwardTrigger="<tab>"
    let g:UltiSnipsJumpBackwardTrigger="<c-b>"

    "***************************************************************************
    " dirvish
    "***************************************************************************
    " Replace netrw
    let g:loaded_netrwPlugin = 1
    command! -nargs=? -complete=dir Explore Dirvish <args>
    command! -nargs=? -complete=dir Sexplore belowright split | silent Dirvish <args>
    command! -nargs=? -complete=dir Vexplore leftabove vsplit | silent Dirvish <args>
    " Folder at the top, files at the bottom
    let g:dirvish_mode = ':sort ,^.*[\/],'

    "***************************************************************************
    " fern
    "***************************************************************************
    map <F9> :Fern . -drawer -toggle<CR>

    "***************************************************************************
    " oscyank
    "***************************************************************************
    let g:oscyank_trim = 1 " trim surrounding whitespaces before copy

    "***************************************************************************
    " coc config
    " See https://github.com/neoclide/coc.nvim
    "***************************************************************************
    "let g:coc_global_extensions = [
    "            "\ 'coc-clangd',
    "            \ 'coc-pyright',
    "            "\ 'coc-pairs',
    "            \ 'coc-snippets',
    "            \ 'coc-json',
    "            \ 'coc-sh',
    "            \ ]

    "" May need for Vim (not Neovim) since coc.nvim calculates byte offset by count
    "" utf-8 byte sequence
    "set encoding=utf-8
    "" Some servers have issues with backup files, see #649
    "set nobackup
    "set nowritebackup

    "" Having longer updatetime (default is 4000 ms = 4s) leads to noticeable
    "" delays and poor user experience
    "set updatetime=300

    "" Always show the signcolumn, otherwise it would shift the text each time
    "" diagnostics appear/become resolved
    "set signcolumn=yes

    "" Important: This took a while to get right - the documentation for
    "" COC suggests some tab options that use tab/s-tab to cycle through
    "" results. The behaviour below, from:
    "" https://stackoverflow.com/questions/63337283/how-to-select-first-item-in-popup-menu-and-close-menu-in-a-single-keybind-for-au
    "" is essentially 'what you'd get in VS Code'. Tab selects the first
    "" item in the list. Then use C-P,C-N (prev/next) to cycle.
    "inoremap <expr> <TAB> pumvisible() ? "\<C-y>" : "\<C-g>u\<TAB>"

    "" Use tab for trigger completion with characters ahead and navigate
    "" NOTE: There's always complete item selected by default, you may want to enable
    "" no select by `"suggest.noselect": true` in your configuration file
    "" NOTE: Use command ':verbose imap <tab>' to make sure tab is not mapped by
    "" other plugin before putting this into your config
    ""inoremap <silent><expr> <TAB>
    ""      \ coc#pum#visible() ? coc#pum#next(1) :
    ""      \ CheckBackspace() ? "\<Tab>" :
    ""      \ coc#refresh()
    ""inoremap <expr><S-TAB> coc#pum#visible() ? coc#pum#prev(1) : "\<C-h>"

    "" Make <CR> to accept selected completion item or notify coc.nvim to format
    "" <C-g>u breaks current undo, please make your own choice
    ""inoremap <silent><expr> <CR> coc#pum#visible() ? coc#pum#confirm()
    ""                              \: "\<C-g>u\<CR>\<c-r>=coc#on_enter()\<CR>"

    ""function! CheckBackspace() abort
    ""  let col = col('.') - 1
    ""  return !col || getline('.')[col - 1]  =~# '\s'
    ""endfunction

    "" Use <c-space> to trigger completion
    "if has('nvim')
    "    inoremap <silent><expr> <c-space> coc#refresh()
    "else
    "    inoremap <silent><expr> <c-@> coc#refresh()
    "endif

    "" Use `[g` and `]g` to navigate diagnostics
    "" Use `:CocDiagnostics` to get all diagnostics of current buffer in location list
    "nmap <silent> [g <Plug>(coc-diagnostic-prev)
    "nmap <silent> ]g <Plug>(coc-diagnostic-next)

    "" GoTo code navigation
    "nmap <silent> gd <Plug>(coc-definition)
    "nmap <silent> gy <Plug>(coc-type-definition)
    "nmap <silent> gi <Plug>(coc-implementation)
    "nmap <silent> gr <Plug>(coc-references)

    "" Use K to show documentation in preview window
    "nnoremap <silent> K :call ShowDocumentation()<CR>

    "function! ShowDocumentation()
    "  if CocAction('hasProvider', 'hover')
    "    call CocActionAsync('doHover')
    "  else
    "    call feedkeys('K', 'in')
    "  endif
    "endfunction

    "" Highlight the symbol and its references when holding the cursor
    ""autocmd CursorHold * silent call CocActionAsync('highlight')

    "" Symbol renaming
    "nmap <F2> <Plug>(coc-rename)

    "" Formatting selected code
    "xmap <leader>F  <Plug>(coc-format-selected)
    "nmap <leader>F  <Plug>(coc-format-selected)

    "augroup mygroup
    "  autocmd!
    "  " Setup formatexpr specified filetype(s)
    "  autocmd FileType typescript,json setl formatexpr=CocAction('formatSelected')
    "  " Update signature help on jump placeholder
    "  autocmd User CocJumpPlaceholder call CocActionAsync('showSignatureHelp')
    "augroup end

    "" Applying code actions to the selected code block
    "" Example: `<leader>aap` for current paragraph
    "xmap <leader>a  <Plug>(coc-codeaction-selected)
    "nmap <leader>a  <Plug>(coc-codeaction-selected)

    "" Remap keys for applying code actions at the cursor position
    "nmap <leader>ac  <Plug>(coc-codeaction-cursor)
    "" Remap keys for apply code actions affect whole buffer
    "nmap <leader>as  <Plug>(coc-codeaction-source)
    "" Apply the most preferred quickfix action to fix diagnostic on the current line
    "nmap <leader>qf  <Plug>(coc-fix-current)

    "" Remap keys for applying refactor code actions
    "nmap <silent> <leader>re <Plug>(coc-codeaction-refactor)
    "xmap <silent> <leader>r  <Plug>(coc-codeaction-refactor-selected)
    "nmap <silent> <leader>r  <Plug>(coc-codeaction-refactor-selected)

    "" Run the Code Lens action on the current line
    "nmap <leader>cl  <Plug>(coc-codelens-action)

    "" Map function and class text objects
    "" NOTE: Requires 'textDocument.documentSymbol' support from the language server
    "xmap if <Plug>(coc-funcobj-i)
    "omap if <Plug>(coc-funcobj-i)
    "xmap af <Plug>(coc-funcobj-a)
    "omap af <Plug>(coc-funcobj-a)
    "xmap ic <Plug>(coc-classobj-i)
    "omap ic <Plug>(coc-classobj-i)
    "xmap ac <Plug>(coc-classobj-a)
    "omap ac <Plug>(coc-classobj-a)

    "" Use CTRL-S for selections ranges
    "" Requires 'textDocument/selectionRange' support of language server
    "nmap <silent> <C-s> <Plug>(coc-range-select)
    "xmap <silent> <C-s> <Plug>(coc-range-select)

    "" Add `:Format` command to format current buffer
    "command! -nargs=0 Format :call CocActionAsync('format')

    "" Add `:Fold` command to fold current buffer
    "command! -nargs=? Fold :call     CocAction('fold', <f-args>)

    "" Add `:OR` command for organize imports of the current buffer
    "command! -nargs=0 OR   :call     CocActionAsync('runCommand', 'editor.action.organizeImport')

    " Add (Neo)Vim's native statusline support
    " NOTE: Please see `:h coc-status` for integrations with external plugins that
    " provide custom statusline: lightline.vim, vim-airline
    "set statusline^=%{coc#status()}%{get(b:,'coc_current_function','')}

    " Mappings for CoCList
    " Show all diagnostics
    " FIXME: These mappings use my leader
    "nnoremap <silent><nowait> <space>a  :<C-u>CocList diagnostics<cr>
    "" Manage extensions
    "nnoremap <silent><nowait> <space>e  :<C-u>CocList extensions<cr>
    "" Show commands
    "nnoremap <silent><nowait> <space>c  :<C-u>CocList commands<cr>
    "" Find symbol of current document
    "nnoremap <silent><nowait> <space>o  :<C-u>CocList outline<cr>
    "" Search workspace symbols
    ""nnoremap <silent><nowait> <space>s  :<C-u>CocList -I symbols<cr>
    "" Do default action for next item
    "nnoremap <silent><nowait> <space>j  :<C-u>CocNext<CR>
    "" Do default action for previous item
    "nnoremap <silent><nowait> <space>k  :<C-u>CocPrev<CR>
    "" Resume latest coc list
    "nnoremap <silent><nowait> <space>p  :<C-u>CocListResume<CR>

"###############################################################################
" Misc
"###############################################################################
" Highlight column 80
set colorcolumn=80
highlight ColorColumn ctermbg=darkgray

" Highlight trailing spaces
" http://vim.wikia.com/wiki/Highlight_unwanted_spaces
" HAVE TO BE AFTER COLORSCHEME
highlight ExtraWhitespace ctermbg=red guibg=red
match ExtraWhitespace /\s\+$/
autocmd BufWinEnter * match ExtraWhitespace /\s\+$/
autocmd InsertEnter * match ExtraWhitespace /\s\+\%#\@<!$/
autocmd InsertLeave * match ExtraWhitespace /\s\+$/
autocmd BufWinLeave * call clearmatches()

" This group of autocommands automatically toggles to use normal line
" numbers on insert mode and hybrid on visual. It also handles switching
" if we lose or gain focus.
" We put these autocommands in an autocommand group so that we can turn off
" this behaviour in its entirity if we need to (such as when we enter focus
" mode).
augroup auto_toggle_relative_linenumbers
    autocmd FocusLost * :set number norelativenumber
    autocmd FocusGained * :set number relativenumber
    autocmd InsertEnter * :set number norelativenumber
    autocmd InsertLeave * :set number relativenumber
augroup end

" Create ~/.vimsession if needed
silent !mkdir ~/.vimsession > /dev/null 2>&1

function! IsWsl()
    let uname = substitute(system('uname'),'\n','','')
    if uname == 'Linux'
        let lines = readfile("/proc/version")
        if lines[0] =~ "Microsoft"
            return 1
        endif
    endif

    return 0
endfunction

"###############################################################################
" Clipboard
"###############################################################################
" WSL yank support
if IsWsl()
    let s:clip = '/mnt/c/Windows/System32/clip.exe'  " default location
    if executable(s:clip)
        augroup WSLYank
            autocmd!
            autocmd TextYankPost * call system(s:clip, join(v:event.regcontents, "\<CR>"))
        augroup END
    end
else
    " Use osc yank plugin
    autocmd TextYankPost *
                \ if v:event.operator is 'y' && v:event.regname is '' |
                \ execute 'OSCYankRegister "' |
                \ endif
endif

"###############################################################################
" Plugins managed by vim-Plug
" https://github.com/junegunn/vim-plug
" Run :PlugInstall to install them
"###############################################################################
call plug#begin()
Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
Plug 'junegunn/fzf.vim'
Plug 'vim-airline/vim-airline'
Plug 'justinmk/vim-dirvish'
Plug 'tpope/vim-fugitive'
Plug 'ojroques/vim-oscyank'
Plug 'moll/vim-bbye'
Plug 'tpope/vim-obsession'
Plug 'ludovicchabant/vim-gutentags'
Plug 'pixelneo/vim-python-docstring'
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'airblade/vim-gitgutter'
Plug 'lambdalisue/fern.vim'
call plug#end()
