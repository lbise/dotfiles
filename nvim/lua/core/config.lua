-------------------------------------- General ------------------------------------------
--  NOTE: Must happen before plugins are required (otherwise wrong leader will be used)
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- global statusline
vim.opt.laststatus = 3

-- Show matching braces
vim.opt.showmatch = true

-- Enable autoindent
vim.opt.autoindent = true

-- Show a little more status about running command
vim.opt.showcmd = true

-- Hide the default mode text
vim.opt.showmode = false

-- Set shell
vim.opt.shell = '/bin/zsh'

-- Set highlight on search
vim.opt.hlsearch = true

-- Make relative line numbers default
vim.wo.number = true
vim.wo.relativenumber = true
vim.wo.numberwidth = 2

-- Do not use swap files
vim.opt.swapfile = false

-- Sync clipboard between OS and Neovim.
--  Remove this option if you want your OS clipboard to remain independent.
--  See `:help 'clipboard'`
vim.opt.clipboard = 'unnamedplus'

-- Enable break indent
vim.opt.breakindent = true

-- Save undo history
vim.opt.undofile = true

-- Case-insensitive searching UNLESS \C or capital in search
vim.opt.ignorecase = true
vim.opt.smartcase = true

-- Keep signcolumn on by default
vim.wo.signcolumn = 'yes'

-- Decrease update time
vim.opt.updatetime = 250
vim.opt.timeoutlen = 300

-- Set completeopt to have a better completion experience
vim.opt.completeopt = 'menuone,noselect'

-- NOTE: You should make sure your terminal supports this
vim.opt.termguicolors = true

-- Indenting
vim.opt.expandtab = true
vim.opt.smartindent = true
vim.opt.shiftwidth = 4
vim.opt.tabstop = 4
vim.opt.softtabstop = 4

-- Split
vim.opt.splitbelow = true
vim.opt.splitright = true

-- Always show 1 line above/below curosor
vim.opt.scrolloff = 1

-- Backspace over everything
vim.opt.backspace = {'eol', 'start', 'indent'}

-- Ignore files in wildmenu
vim.opt.wildignore:append{'*.o' ,'*.obj', '*.so', '*.a', '*.dll', '*.dylib', '*.svn'}
vim.opt.wildignore:append{'*.git', '*.swp', '*.pyc', '*.class', '*/__pycache__/*'}

-- Use rg for grepping
if vim.fn.executable('rg') then
    vim.o.grepprg =
    [[rg --hidden --glob "!.git" --no-heading --smart-case --vimgrep --follow $*]]
    vim.o.grepformat = '%f:%l:%c:%m'
end

-- go to previous/next line with h,l,left arrow and right arrow
-- when cursor reaches end/beginning of line
vim.opt.whichwrap:append "<>[]hl"

-- Highlight whitespaces
vim.api.nvim_set_hl(0, 'fullHighlight', { standout = true })
vim.fn.matchadd('fullHighlight', [[\s\+$]])

-- Prevent adding comment leader on new line
-- Use augroup to ensure no other plugin overwrite the setting
local formatoptions_group = vim.api.nvim_create_augroup('FormatOptions', { clear = true })
vim.api.nvim_create_autocmd('FileType', {
    callback = function()
        vim.opt.formatoptions:remove { "c", "r", "o" }
    end,
    group = formatoptions_group,
    pattern = '*',
})

-- [[ Highlight on yank ]]
-- See `:help vim.highlight.on_yank()`
local highlight_group = vim.api.nvim_create_augroup('YankHighlight', { clear = true })
vim.api.nvim_create_autocmd('TextYankPost', {
    callback = function()
        vim.highlight.on_yank({
            higroup = 'IncSearch',
            timeout = 40,
        })
    end,
    group = highlight_group,
    pattern = '*',
})

-- When in insert mode, highlight the current line.
vim.api.nvim_create_autocmd('InsertEnter', {
    callback = function()
        vim.opt.cursorline = true
    end,
    pattern = '*',
})
vim.api.nvim_create_autocmd('InsertLeave', {
    callback = function()
        vim.opt.cursorline = false
    end,
    pattern = '*',
})

-- Save file with sudo
vim.api.nvim_create_user_command('SaveAsRoot', function()
    vim.api.nvim_exec('w !sudo tee % > /dev/null', true)
    vim.cmd('e!')
end, {})
vim.cmd('cnoreabbrev sudow SaveAsRoot')

-- Clear whitespace on write
vim.api.nvim_create_autocmd('BufWritePre', {command = '%s/\\s\\+$//e'})
