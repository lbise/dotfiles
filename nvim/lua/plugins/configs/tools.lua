local config = {
	{
		"tpope/vim-fugitive",
	},
	{
		"sindrets/diffview.nvim",
		cmd = {
			"DiffviewOpen",
		},
	},
	{
		"echasnovski/mini.diff",
		enabled = true,
		version = false,
		config = true,
	},
	{
		"danymat/neogen",
		dependencies = {
			"nvim-treesitter/nvim-treesitter",
			{
				"L3MON4D3/LuaSnip",
				config = function()
					require("luasnip.loaders.from_vscode").lazy_load()
				end,
			},
		},
		cmd = {
			"Neogen",
		},
		config = function()
			require("neogen").setup({
				snippet_engine = "luasnip",
			})
		end,
	},
	{
		"rmagatti/auto-session",
		config = function()
			-- Recomended for the plugin
			vim.o.sessionoptions = "blank,buffers,curdir,folds,help,tabpages,winsize,winpos,terminal,localoptions"
			require("auto-session").setup({
				session_lens = {
					load_on_setup = true,
					theme_conf = { border = true },
					previewer = false,
				},
			})
		end,
	},
	{
		"samharju/yeet.nvim",
		dependencies = {
			"stevearc/dressing.nvim", -- optional, provides sane UX
		},
		version = "*", -- use the latest release, remove for master
		cmd = "Yeet",
		opts = {},
	},
}

return config
