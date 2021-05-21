" #############################################################################
" Syntax and indentation
" #############################################################################
syntax on		" Enable syntax highlighting
set showmatch		" Show matching braces when text indicator is over them
filetype plugin indent on " enable file type detection
set autoindent

" #############################################################################
" Basic config
" #############################################################################
set shell=/bin/zsh	" Set shell as zsh
set number		" Add line number
set relativenumber	" Add relative line number (number + relative = hybrid)

set clipboard=unnamed,unnamedplus " Copy/paste from/to primary and clipboard
set autowrite		" Write buffer on :next, :last etc...
set autoread		" Read file on outside change
set ttimeoutlen=10	" Lower delay on exit insert mode
set cursorline		" Highlight cursor
set ttyfast		" Fast scrolling
set scrolloff=5		" Show lines above and below cursor (when possible)
set backspace=indent,eol,start " allow backspacing over everything
set history=8192	" More history
set tabstop=8
set softtabstop=8
set shiftwidth=8
set hlsearch
" smart case-sensitive search
set ignorecase
set smartcase
set splitright		" When splitting open window to the right
set splitbelow		" When splitting open window below
set laststatus=2
set noshowmode		" Hide the default mode text
set incsearch		" Display search results as search string is typed
set ruler		" Show the line and column number of the cursor position
set wildmode=longest:full,full " tab completion for files/bufferss
set wildmenu		" Command line completion shows menu
set display+=lastline	" Display as much as possible of the last line in a window

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

" You shall learn using vim properly
noremap <Up> <Nop>
noremap <Down> <Nop>
noremap <Left> <Nop>
noremap <Right> <Nop>

map <f5> :Obsession ~/.vimsession/lbise.vim<CR>
map <f6> :source ~/.vimsession/lbise.vim<CR>

map <f9> :!compile_zephyr %:p:h<CR>
map <C-f9> :!compile_zephyr %:p:h clean<CR>
map <S-f9> :!compile_zephyr %:p:h distclean<CR>
map <f12> :!run_checkpatch %:p:h<CR>

map <C-Left> :bn<CR>
map <C-Right> :bp<CR>
map <C-h> :bn<CR>
map <C-l> :bp<CR>

" Clear search highlights
nnoremap <silent> <Leader><Esc> <Esc>:nohlsearch<CR><Esc>
" Remove all trailing and leading whitespaces
map <F4> :%s/\s\+$//e<CR>
" Copy/paste to system clipboard
noremap <Leader>y "*y <bar> :let @+=@*<CR>
noremap <Leader>p "*p

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
" Customize sections
let g:airline_section_y = ""
"let g:airline_powerline_fonts = 1

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
