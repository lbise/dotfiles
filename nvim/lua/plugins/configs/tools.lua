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
		"folke/which-key.nvim",
		event = "VeryLazy",
		cmd = {
			"WhichKey",
		},
	},
	{
		"danymat/neogen",
		dependencies = {
            "nvim-treesitter/nvim-treesitter",
            {
                'L3MON4D3/LuaSnip',
                config = function()
                    require("luasnip.loaders.from_vscode").lazy_load()
                end
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
	{ "jokajak/keyseer.nvim", version = false },
}

return config
