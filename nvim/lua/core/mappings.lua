-- General
-- ??
vim.keymap.set({ "n", "v" }, "<Space>", "<Nop>", { silent = true })

-- Clear search highlight
vim.keymap.set({ "n" }, "<leader><Esc>", "<cmd> nohlsearch <CR>")

-- Switch buffer
vim.keymap.set({ "n" }, "<tab>", "<cmd> BufferLineCycleNext <CR>", { desc = "Next buffer" })
vim.keymap.set({ "n" }, "<S-tab>", "<cmd> BufferLineCyclePrev <CR>", { desc = "Previous buffer" })

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
vim.keymap.set("n", "<leader>1", function() harpoon:list():select(1) end)
vim.keymap.set("n", "<leader>2", function() harpoon:list():select(2) end)
vim.keymap.set("n", "<leader>3", function() harpoon:list():select(3) end)
vim.keymap.set("n", "<leader>4", function() harpoon:list():select(4) end)
---- Toggle previous & next buffers stored within Harpoon list
--vim.keymap.set("n", "<C-S-P>", function() harpoon:list():prev() end)
--vim.keymap.set("n", "<C-S-N>", function() harpoon:list():next() end)

-- Diagnostic keymaps
vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, { desc = "Go to previous diagnostic message" })
vim.keymap.set("n", "]d", vim.diagnostic.goto_next, { desc = "Go to next diagnostic message" })
vim.keymap.set("n", "<leader>e", vim.diagnostic.open_float, { desc = "Open floating diagnostic message" })
vim.keymap.set("n", "<leader>q", vim.diagnostic.setloclist, { desc = "Open diagnostics list" })
vim.keymap.set("n", "<leader>t", "<cmd>Trouble diagnostics toggle focus=false filter.buf=0<CR>")

-- Use LspAttach autocommand to only map the following keys
-- after the language server attaches to the current buffer
vim.api.nvim_create_autocmd("LspAttach", {
	group = vim.api.nvim_create_augroup("UserLspConfig", {}),
	callback = function(ev)
		-- Only map for buffer
		local opts = { buffer = ev.buf }

		vim.keymap.set("n", "<space>rn", vim.lsp.buf.rename, opts)
		vim.keymap.set({ "n", "v" }, "<space>ca", vim.lsp.buf.code_action, opts)

		vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
		vim.keymap.set("n", "<leader>k", vim.lsp.buf.signature_help, opts)

		vim.keymap.set("n", "gD", vim.lsp.buf.declaration, opts)
		vim.keymap.set("n", "<leader>wa", vim.lsp.buf.add_workspace_folder, opts)
		vim.keymap.set("n", "<leader>wr", vim.lsp.buf.remove_workspace_folder, opts)
		vim.keymap.set("n", "<leader>wl", function()
			print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
		end, opts)

		vim.api.nvim_buf_create_user_command(ev.buf, "Format", function(_)
			vim.lsp.buf.format()
		end, { desc = "Format current buffer with LSP" })
	end,
})
