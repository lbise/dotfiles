-- General
-- ??
vim.keymap.set({ "n", "v" }, "<Space>", "<Nop>", { silent = true })

-- Clear search highlight
vim.keymap.set({ "n" }, "<leader><Esc>", "<cmd> nohlsearch <CR>")

-- Switch buffer
vim.keymap.set({ "n" }, "<tab>", "<cmd> bnext <CR>", { desc = "Next buffer" })
vim.keymap.set({ "n" }, "<S-tab>", "<cmd> bprev <CR>", { desc = "Previous buffer" })

-- Window resize
vim.keymap.set("n", "<C-Right>", [[<cmd>vertical resize +5<cr>]])
vim.keymap.set("n", "<C-Left>", [[<cmd>vertical resize -5<cr>]])
vim.keymap.set("n", "<C-Up>", [[<cmd>horizontal resize +2<cr>]])
vim.keymap.set("n", "<C-Down>", [[<cmd>horizontal resize -2<cr>]])

-- Center view after jump or search next
vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")
vim.keymap.set("n", "n", "nzzzv")
vim.keymap.set("n", "N", "Nzzzv")

-- Insert line stay in normal mode
vim.keymap.set("n", "<leader>o", [[o<Esc>0'_D]])
vim.keymap.set("n", "<leader>O", [[O<Esc>0'_D]])

-- Remove all trailing and leading whitespaces
vim.keymap.set("n", "<F4>", [[:%s/\s\+$//e<CR>]])
vim.keymap.set("n", "Q", "<nop>")

-- Yank path
local path_utils = require("core.tools")
local yank_path = function()
    local full_path = vim.fn.expand("%:p")
    path_utils.copy_relative_path(full_path)
end
--vim.keymap.set("n", "<leader>yp", yank_path, { noremap = true, silent = true, desc = "[y]ank full file [p]ath" })
vim.keymap.set("n", "<C-y>", yank_path, { noremap = true, silent = true, desc = "[y]ank full file [p]ath" })

-- Paste last yanked
vim.keymap.set({ 'n', 'v' }, '<leader>p', '"0p', { desc = 'Paste last yanked' })

-- Generate tags manually
vim.keymap.set("n", "<F12>", ':!ctags -R --exclude="*Sim*" --exclude="*scripts" .<CR>')

-- Exit terminal mode
vim.keymap.set(
    { "t" },
    "<Esc>",
    vim.api.nvim_replace_termcodes("<C-\\><C-N>", true, true, true),
    { desc = "Escape terminal mode" }
)

-- Open file browser
vim.keymap.set("n", "<leader>pv", vim.cmd.Ex)

-- diff mode specific mappings
if vim.api.nvim_win_get_option(0, "diff") then
    -- Select changes from LOCAL/BASE/REMOTE
    vim.keymap.set("n", "<leader>1", ":diffget LOCAL<CR>")
    vim.keymap.set("n", "<leader>2", ":diffget BASE<CR>")
    vim.keymap.set("n", "<leader>3", ":diffget REMOTE<CR>")
    -- Save all buffers and quit when done merging
    vim.keymap.set("n", "<leader>4", ":wqa<CR>")
    -- Cancel merge
    vim.keymap.set("n", "<leader>5", ":cq<CR>")
end

-- Plugins
-- *** Fugitive
vim.keymap.set("n", "<leader>gs", vim.cmd.Git)

-- *** Neogen
vim.api.nvim_set_keymap("n", "<Leader>nf", ":lua require('neogen').generate()<CR>", { noremap = true, silent = true })

-- *** Luasnip
-- These mappings are used to jump between snippets fields.
-- Also used when generating comments for functions with neogen
-- They are the same mappings than blink.cmp
local ls = require("luasnip")
vim.keymap.set({ "i", "s" }, "<C-n>", function()
    ls.jump(1)
end, { silent = true })
vim.keymap.set({ "i", "s" }, "<C-p>", function()
    ls.jump(-1)
end, { silent = true })

-- *** LSP
-- Format
--vim.keymap.set("n", "<leader>f", vim.lsp.buf.format)
vim.keymap.set("n", "<leader>f", function()
    require("conform").format({ lsp_fallback = true })
end)

-- *** Harpoon
local harpoon = require("harpoon")
vim.keymap.set("n", "<leader>a", function()
    harpoon:list():add()
end)
vim.keymap.set("n", "<leader>s", function()
    harpoon.ui:toggle_quick_menu(harpoon:list())
end)
vim.keymap.set("n", "<leader>1", function()
    harpoon:list():select(1)
end)
vim.keymap.set("n", "<leader>2", function()
    harpoon:list():select(2)
end)
vim.keymap.set("n", "<leader>3", function()
    harpoon:list():select(3)
end)
vim.keymap.set("n", "<leader>4", function()
    harpoon:list():select(4)
end)
---- Toggle previous & next buffers stored within Harpoon list
--vim.keymap.set("n", "<C-S-P>", function() harpoon:list():prev() end)
--vim.keymap.set("n", "<C-S-N>", function() harpoon:list():next() end)

-- Diagnostic keymaps
vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, { desc = "Go to previous diagnostic message" })
vim.keymap.set("n", "]d", vim.diagnostic.goto_next, { desc = "Go to next diagnostic message" })
vim.keymap.set("n", "<leader>e", vim.diagnostic.open_float, { desc = "Open floating diagnostic message" })
-- Already done by trouble
--vim.keymap.set("n", "<leader>q", vim.diagnostic.setloclist, { desc = "Open diagnostics list" })
vim.keymap.set("n", "<leader>t", "<cmd>Trouble diagnostics toggle focus=false filter.buf=0<CR>")

-- Use LspAttach autocommand to only map the following keys
-- after the language server attaches to the current buffer
vim.api.nvim_create_autocmd("LspAttach", {
    group = vim.api.nvim_create_augroup("UserLspConfig", {}),
    callback = function(ev)
        -- See default mappings: help lsp
        -- CTRL-X -> Trigger completion
        -- CTRL-] -> Jump to definition
        -- "grn" is mapped in Normal mode to |vim.lsp.buf.rename()|
        -- "gra" is mapped in Normal and Visual mode to |vim.lsp.buf.code_action()|
        -- "grr" is mapped in Normal mode to |vim.lsp.buf.references()|
        -- "gri" is mapped in Normal mode to |vim.lsp.buf.implementation()|

        -- Only map for buffer
        local opts = { buffer = ev.buf }

        vim.keymap.set("n", "<leader>wa", vim.lsp.buf.add_workspace_folder, opts)
        vim.keymap.set("n", "<leader>wr", vim.lsp.buf.remove_workspace_folder, opts)
        vim.keymap.set("n", "<leader>wl", function()
            print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
        end, opts)

        vim.api.nvim_buf_create_user_command(ev.buf, "LspFormat", function(_)
            vim.lsp.buf.format()
        end, { desc = "Format current buffer with LSP" })
    end,
})

-- Convert case of word under cursor
local function switch_case()
    local line, col = unpack(vim.api.nvim_win_get_cursor(0))
    local word = vim.fn.expand("<cword>")
    local word_start = vim.fn.matchstrpos(vim.fn.getline("."), "\\k*\\%" .. (col + 1) .. "c\\k*")[2]

    -- Detect camelCase
    if word:find("[a-z][A-Z]") then
        -- Convert camelCase to snake_case
        local snake_case_word = word:gsub("([a-z])([A-Z])", "%1_%2"):lower()
        vim.api.nvim_buf_set_text(0, line - 1, word_start, line - 1, word_start + #word, { snake_case_word })
        -- Detect snake_case
    elseif word:find("_[a-z]") then
        -- Convert snake_case to camelCase
        local camel_case_word = word:gsub("(_)([a-z])", function(_, l)
            return l:upper()
        end)
        vim.api.nvim_buf_set_text(0, line - 1, word_start, line - 1, word_start + #word, { camel_case_word })
    else
        print("Not a snake_case or camelCase word")
    end
end

vim.keymap.set("n", "<Leader>s", function()
    switch_case()
end, { desc = "Switch case (pascal <-> snake)" })
