" #############################################################################
" Syntax and indentation
" #############################################################################
syntax on		                            " Enable syntax highlighting
set showmatch		                        " Show matching braces
filetype plugin indent on                   " enable file type detection
set autoindent

" #############################################################################
" Basic config
" #############################################################################
set termguicolors	                        " Enable 24 bit colors
set shell=/bin/zsh	                        " Set shell as zsh
set number		                            " Add line number
set relativenumber	                        " Add relative line number
set noswapfile                              " No swap files
set hidden                                  " Switch buffers without writing
set autowrite		                        " Write buffer on :next, :last etc
set autoread		                        " Read file on outside change
set ttimeoutlen=10	                        " Lower delay on exit insert mode
set cursorline		                        " Highlight cursor
set ttyfast		                            " Fast scrolling
set backspace=indent,eol,start              " Allow backspacing over everything
set history=8192	                        " More history
set tabstop=4
set softtabstop=4
set shiftwidth=4
set expandtab		                        " Convert tabs to space
set hlsearch
set ignorecase
set smartcase                               " smart case-sensitive search
set splitright		                        " Split window to the right
set splitbelow		                        " Split window below
set laststatus=2
set noshowmode		                        " Hide the default mode text
set incsearch		                        " Search results as search is typed
set ruler
set wildmode=longest:full,full              " Tab completion for files/buffers
set wildmenu		                        " Command line completion menu
set display+=lastline
let g:netrw_banner = 0

if &listchars ==# 'eol:$' " Change setlist displayed char
	set listchars=tab:>\ ,trail:-,extends:>,precedes:<,nbsp:+
endif

" save read-only files
command -nargs=0 Sudow w !sudo tee % >/dev/null

" #############################################################################
" Mappings
" #############################################################################
" Key mappings
let mapleader = " "

map <f5> :Obsession ~/.vimsession/lbise.vim<CR>
map <f6> :source ~/.vimsession/lbise.vim<CR>

"map <f9> :!compile_zephyr %:p:h<CR>
"map <C-f9> :!compile_zephyr %:p:h clean<CR>
"map <S-f9> :!compile_zephyr %:p:h distclean<CR>
"map <f12> :!run_checkpatch %:p:h<CR>
map <f12> :!ctags -R .<CR>

" Next buffer remapping
map <C-Left> :bn<CR>
map <C-Right> :bp<CR>
map <C-h> :bn<CR>
map <C-l> :bp<CR>
nnoremap <C-j> :BD<CR>

" Clear search highlights
nnoremap <silent> <Leader><Esc> <Esc>:nohlsearch<CR><Esc>
" Remove all trailing and leading whitespaces
map <F4> :%s/\s\+$//e<CR>
" Copy/paste to system clipboard
noremap <Leader>y "*y <bar> :let @+=@*<CR>
noremap <Leader>p "*p

" Remap jump to tag because windows is shitty...
noremap <C-m> <C-]>

" Resize splits
nnoremap <silent> <Leader>+ :exe "resize " . (winheight(0) * 3/2)<CR>
nnoremap <silent> <Leader>- :exe "resize " . (winheight(0) * 2/3)<CR>

" Do not overwrite yanked stuff
xnoremap p pgvy

" Browse FZF files
nnoremap <silent> <Leader><space> :Files<CR>
" Change session
nnoremap <silent> <Leader>f :!tmux-sessionizer<CR><CR>
" #############################################################################
" Plugins
" #############################################################################
"
" Color scheme
let g:nord_underline = 1
let g:nord_cursor_line_number_background = 1
colorscheme nord

" vim-airline
let g:airline#extensions#tabline#enabled = 1
" Disable branch name
let g:airline#extensions#branch#enabled = 0
" Disable whitespace extension
let g:airline#extensions#whitespace#enabled = 0
" Customize sections
let g:airline_section_y = ""
let g:airline_powerline_fonts = 1
if !exists('g:airline_symbols')
    let g:airline_symbols = {}
endif

" ultisnips
" Trigger configuration. Do not use <tab> if you use https://github.com/Valloric/YouCompleteMe.
" snippets used are those of the vim-snippets bundle see ~/.vimrc/bundle/vim-snippets
let g:UltiSnipsExpandTrigger="<tab>"
let g:UltiSnipsJumpForwardTrigger="<tab>"
let g:UltiSnipsJumpBackwardTrigger="<c-b>"

" #############################################################################
" Misc
" #############################################################################
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

" Toggle between relative / norelative when changing window
" HAVE TO BE AFTER COLORSCHEME
augroup numbertoggle
  autocmd!
  autocmd BufEnter,FocusGained,InsertLeave * set relativenumber
  autocmd BufLeave,FocusLost,InsertEnter   * set norelativenumber
augroup END

" Use c syntax for unity files
au BufRead,BufNewFile *.unity set filetype=c
" Use c syntax for sid files
au BufRead,BufNewFile *.sid set filetype=sid

" #############################################################################
" Clipboard
" #############################################################################
" Setting this under Linux cause registers to get filled with garbage
"set clipboard=unnamed,unnamedplus " Copy/paste from/to primary and clipboard

" https://www.reddit.com/r/vim/comments/ac9eyh/talk_i_gave_on_going_mouseless_with_vim_tmux/
" function! Osc52Yank()
"     let buffer=system('base64 -w0', @0)
"     let buffer=substitute(buffer, "\n$", "", "")
"     let buffer='\e]52;c;'.buffer.'\x07'
"     silent exe "!echo -ne ".shellescape(buffer)." > ".shellescape("/dev/tty")
" endfunction
" command! Osc52CopyYank call Osc52Yank()
" augroup Example
"     autocmd!
"     autocmd TextYankPost * if v:event.operator ==# 'y' | call Osc52Yank() | endif
" augroup END

" WSL yank support
let uname = substitute(system('uname'),'\n','','')
if uname == 'Linux'
    let lines = readfile("/proc/version")
    if lines[0] =~ "Microsoft"
		let s:clip = '/mnt/c/Windows/System32/clip.exe'  " default location
		if executable(s:clip)
		    augroup WSLYank
		        autocmd!
			"autocmd TextYankPost * call system('echo '.shellescape(join(v:event.regcontents, "\<CR>")).' | '.s:clip)
			autocmd TextYankPost * call system(s:clip, join(v:event.regcontents, "\<CR>"))
		    augroup END
		end
    endif
endif

" Use osc yank plugin
autocmd TextYankPost * if v:event.operator is 'y' && v:event.regname is '' | execute 'OSCYankReg "' | endif

" Create ~/.vimsession if needed
silent !mkdir ~/.vimsession > /dev/null 2>&1

" Make Rg and Ag not match on file names
command! -bang -nargs=* Rg call fzf#vim#grep("rg --column --line-number --no-heading --color=always --smart-case ".shellescape(<q-args>), 1, {'options': '--delimiter : --nth 4..'}, <bang>0)
command! -bang -nargs=* Ag call fzf#vim#ag(<q-args>, {'options': '--delimiter : --nth 4..'}, <bang>0)
" #############################################################################
" Plugins
" #############################################################################
call plug#begin()
Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
Plug 'junegunn/fzf.vim'
Plug 'vim-airline/vim-airline'
call plug#end()
