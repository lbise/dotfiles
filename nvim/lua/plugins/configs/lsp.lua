local function get_yapf_style()
	if vim.fn.expand("$USER") == "13lbise" then
		-- Check for andromeda style file
		local style_path = vim.fn.expand("$HOME/andromeda/pctools/prj/python_style_lint/style.yapf")
		if vim.fn.filereadable(style_path) then
			return style_path
		end
	end

	-- Simply use pep3 formatting
	return "pep8"
end

local config = {
	{
		"neovim/nvim-lspconfig",
		event = {
			"BufReadPost",
			"BufNewFile",
		},
		-- Plugins setup before nvim-lspconfig
		dependencies = {
			"williamboman/mason.nvim",
			cmd = {
				"Mason",
				"MasonInstall",
				"MasonUpdate",
			},
			"williamboman/mason-lspconfig.nvim",
			{
				-- Neovim setup for init.lua and plugin development with full signature help, docs and completion for the nvim lua API.
				"folke/neodev.nvim",
				event = "LspAttach",
				config = function()
					require("neodev").setup()
				end,
			},
		},
	},
	{
		"williamboman/mason-lspconfig.nvim",
		event = {
			"BufEnter",
		},
		config = function()
			require("mason").setup()
			require("mason-lspconfig").setup({
				ensure_installed = require("core.settings").lsp.ensure_installed,
			})

			for config_server, config_opt in pairs(require("core.settings").lsp.servers) do
				if not config_opt == false then
					local capabilities = vim.lsp.protocol.make_client_capabilities()
					capabilities = require("cmp_nvim_lsp").default_capabilities(capabilities)
					local opts = {
						capabilities = capabilities,
					}

					-- override options if user defines them
					if type(require("core.settings").lsp.servers[config_server]) == "table" then
						local user_opts = require("core.settings").lsp.servers[config_server]
						if user_opts ~= nil then
							opts["settings"] = user_opts["settings"]
						end
					end

					--print('Config LSP: ', config_server)
					--print(require('core.tools').dump_table(opts))

					require("lspconfig")[config_server].setup(opts)
				end
			end
		end,
		dependencies = {
			"williamboman/mason.nvim",
		},
	},
	{
		-- Show diagnostics messages in a window
		"folke/trouble.nvim",
		cmd = "Trouble",
		event = "LspAttach",
		opts = {},
		dependencies = {
			"nvim-tree/nvim-web-devicons",
		},
	},
	{
		"stevearc/conform.nvim",
		event = { "BufWritePre" },
		cmd = { "ConformInfo" },
		config = function()
			require("conform").setup({
				formatters_by_ft = {
					lua = { "stylua" },
					-- Conform will run multiple formatters sequentially
					python = function(bufnr)
						-- use yapf for work
						if vim.fn.expand("$USER") == "13lbise" then
							return { "isort", "yapf" }
						else
							--return { "isort", "ruff_lsp" }
							return { "isort", "black" }
						end
					end,
				},
				formatters = {
					yapf = {
						prepend_args = { "--style=" .. get_yapf_style() },
					},
				},
			})
		end,
	},
}

return config
