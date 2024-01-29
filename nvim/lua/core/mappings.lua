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

-- Generate tags manually
vim.keymap.set('n', '<F12>', ':!ctags -R --exclude="*Sim*" .<CR>')

-- Exit terminal mode
vim.keymap.set({ 't' }, '<C-x>', vim.api.nvim_replace_termcodes('<C-\\><C-N>', true, true, true),
    { desc = 'Escape terminal mode' })

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

-- TODO
--vim.keymap.set('n', '<leader>fd', function()
--    --require('telescope.builtin').find_files({
--    --    find_command = { 'find', '/home/13lbise', '-type d' }
--    --})
--    --require('telescope.builtin').find_files({
--    --    cwd = vim.fn.input("Cwd > ")
--    --})
--
--    -- First fuzzy find the directory we want to search in
--    -- TODO
--    -- Then search from directory provided
--end, { desc = '[F]ind in [D]irectory' })

-- First show a telescope window to select among a list of items
-- Then open a new one concatening opts['dirname'] and selection
function _G.select_and_find(opts)
    local pickers = require "telescope.pickers"
    local finders = require "telescope.finders"
    local conf = require("telescope.config").values
    local actions = require "telescope.actions"
    local action_state = require "telescope.actions.state"

    pickers.new(opts, {
        prompt_title = opts['prompt'],
        finder = finders.new_table(opts['items']),
        --finder = finders.new_oneshot_job({ "find", opts['dirname'], "-type", "d" }, opts),
        sorter = conf.generic_sorter(opts),
        attach_mappings = function(prompt_bufnr, map)
            actions.select_default:replace(function()
                local selection = action_state.get_selected_entry()
                if selection ~= nil then
                    actions.close(prompt_bufnr)
                    -- Open regular telescope with selected cwd
                    require('telescope.builtin').find_files({
                        cwd = opts['dirname'] .. '/' .. selection[1]
                    })
                end
            end)
            return true
        end,
    }):find()
end

-- Select then find in Andromeda
vim.keymap.set('n', '<leader>fa', function()
    select_and_find({ prompt = 'Select andromeda directory',
                      dirname = os.getenv('HOME') .. '/andromeda',
                      items = { 'apps', 'rom', 'executer', 'stmf4', 'raspi4', 'dsp', 'pctools', 'tstenv', 'bt', 'cf6', 'tx', 'dsp' }})
end, { desc = '[F]ind in [A]ndromeda' })

-- *** Fugitive
vim.keymap.set('n', '<leader>gs', vim.cmd.Git)

-- *** nvim-tree
vim.keymap.set({ 'n' }, '<C-p>', '<cmd> Neotree toggle <CR>', { desc = 'Toggle tree' })

-- *** Neogen
vim.api.nvim_set_keymap("n", "<Leader>nf", ":lua require('neogen').generate()<CR>", { noremap = true, silent = true })

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

-- Use LspAttach autocommand to only map the following keys
-- after the language server attaches to the current buffer
vim.api.nvim_create_autocmd('LspAttach', {
    group = vim.api.nvim_create_augroup('UserLspConfig', {}),
    callback = function(ev)
        -- Only map for buffer
        local opts = { buffer = ev.buf }

        vim.keymap.set('n', '<space>rn', vim.lsp.buf.rename, opts)
        vim.keymap.set({ 'n', 'v' }, '<space>ca', vim.lsp.buf.code_action, opts)

        vim.keymap.set('n', 'gd', require('telescope.builtin').lsp_definitions, opts)
        vim.keymap.set('n', 'gr', require('telescope.builtin').lsp_references, opts)
        vim.keymap.set('n', 'gI', require('telescope.builtin').lsp_implementations, opts)
        vim.keymap.set('n', '<leader>D', require('telescope.builtin').lsp_type_definitions, opts)
        vim.keymap.set('n', '<leader>ds', require('telescope.builtin').lsp_document_symbols, opts)
        vim.keymap.set('n', '<leader>ws', require('telescope.builtin').lsp_dynamic_workspace_symbols, opts)

        vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts)
        vim.keymap.set('n', '<leader>k', vim.lsp.buf.signature_help, opts)

        vim.keymap.set('n', 'gD', vim.lsp.buf.declaration, opts)
        vim.keymap.set('n', '<leader>wa', vim.lsp.buf.add_workspace_folder, opts)
        vim.keymap.set('n', '<leader>wr', vim.lsp.buf.remove_workspace_folder, opts)
        vim.keymap.set('n', '<leader>wl', function()
            print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
        end, opts)

        vim.api.nvim_buf_create_user_command(ev.buf, 'Format', function(_)
            vim.lsp.buf.format()
        end, { desc = 'Format current buffer with LSP' })
    end,
})
