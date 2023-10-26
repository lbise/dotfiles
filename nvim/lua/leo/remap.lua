-- General
-- ??
vim.keymap.set({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

-- Clear search highlight
vim.keymap.set({ 'n' }, '<leader><Esc>', '<cmd> nohlsearch <CR>')

-- Switch between windows
vim.keymap.set({ 'n' }, '<C-h>', '<C-w>h', { desc = 'Window left' })
vim.keymap.set({ 'n' }, '<C-l>', '<C-w>l', { desc = 'Window right' })
vim.keymap.set({ 'n' }, '<C-j>', '<C-w>j', { desc = 'Window down' })
vim.keymap.set({ 'n' }, '<C-k>', '<C-w>k', { desc = 'Window up' })

-- Close current buffer
vim.keymap.set({ 'n' }, '<leader>x', '<cmd> BufDel <CR>', { desc = 'Close current buffer' })

-- Switch buffer
vim.keymap.set({ 'n' }, '<tab>', '<cmd> BufferLineCycleNext <CR>', { desc = 'Next buffer' })
vim.keymap.set({ 'n' }, '<S-tab>', '<cmd> BufferLineCyclePrev <CR>', { desc = 'Previous buffer' })

-- Window resize
vim.keymap.set('n', '<C-Right>', [[<cmd>vertical resize +5<cr>]])
vim.keymap.set('n', '<C-Left>', [[<cmd>vertical resize -5<cr>]])
vim.keymap.set('n', '<C-Up>', [[<cmd>horizontal resize +2<cr>]])
vim.keymap.set('n', '<C-Down>', [[<cmd>horizontal resize -2<cr>]])

-- Center view after jump or search next
vim.keymap.set('n', '<C-d>', '<C-d>zz')
vim.keymap.set('n', '<C-u>', '<C-u>zz')
vim.keymap.set('n', 'n', 'nzzzv')
vim.keymap.set('n', 'N', 'Nzzzv')

-- Insert line stay in normal mode
vim.keymap.set('n', '<leader>o', [[o<Esc>0'_D]])
vim.keymap.set('n', '<leader>O', [[O<Esc>0'_D]])

-- Remove all trailing and leading whitespaces
vim.keymap.set('n', '<F4>', [[:%s/\s\+$//e<CR>]])
vim.keymap.set('n', 'Q', '<nop>')

-- Exit terminal mode
vim.keymap.set({ 't' }, '<C-x>', vim.api.nvim_replace_termcodes('<C-\\><C-N>', true, true, true), { desc = 'Escape terminal mode' })

-- Open file browser
vim.keymap.set('n', '<leader>pv', vim.cmd.Ex)

-- Plugins
-- *** Telescope
local builtin = require('telescope.builtin')
-- Find in all files
vim.keymap.set('n', '<leader>ff', function()
    builtin.find_files({ no_ignore = true })
end, { desc = '[F]ind [F]iles' })
-- Find in all git files
vim.keymap.set('n', '<leader>fg', builtin.git_files, { desc = '[F]ind [G]it Files' })
-- Find current word in files
vim.keymap.set('n', '<leader>fw', require('telescope.builtin').grep_string, { desc = '[F]ind current [W]ord' })
-- Find string in files
vim.keymap.set('n', '<leader>fs', builtin.live_grep, { desc = '[F]ind [S]tring' })
-- Find recently opened files
vim.keymap.set('n', '<leader>fr', require('telescope.builtin').oldfiles, { desc = '[F]ind [r]ecently opened files' })
vim.keymap.set('n', '<leader>fc', function()
  -- You can pass additional configuration to telescope to change theme, layout, etc.
  require('telescope.builtin').current_buffer_fuzzy_find(require('telescope.themes').get_dropdown {
    winblend = 10,
    previewer = false,
  })
end, { desc = '[F]ind in [C]urrent buffer' })
-- Find in help
vim.keymap.set('n', '<leader>fh', require('telescope.builtin').help_tags, { desc = '[F]ind [H]elp' })

-- *** Fugitive
vim.keymap.set('n', '<leader>gs', vim.cmd.Git)

-- *** nvim-tree
vim.keymap.set({ 'n' }, '<C-p>', '<cmd> NvimTreeToggle <CR>', { desc = 'Toggle nvim-tree' })

-- *** LSP
-- Format
vim.keymap.set("n", "<leader>f", vim.lsp.buf.format)
-- Diagnostic keymaps
vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, { desc = 'Go to previous diagnostic message' })
vim.keymap.set('n', ']d', vim.diagnostic.goto_next, { desc = 'Go to next diagnostic message' })
vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Open floating diagnostic message' })
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostics list' })
vim.keymap.set('n', '<leader>t', function() require('trouble').toggle() end)
--vim.keymap.set("n", "<leader>xw", function() require("trouble").toggle("workspace_diagnostics") end)
--vim.keymap.set("n", "<leader>xd", function() require("trouble").toggle("document_diagnostics") end)
--vim.keymap.set("n", "<leader>xq", function() require("trouble").toggle("quickfix") end)
--vim.keymap.set("n", "<leader>xl", function() require("trouble").toggle("loclist") end)
--vim.keymap.set("n", "gR", function() require("trouble").toggle("lsp_references") end)
