local function get_ruff_config()
	if vim.fn.expand("$USER") == "13lbise" then
		-- Check for andromeda style file
		local style_path = vim.fn.expand("$HOME/andromeda/pyproject.toml")
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
				"folke/lazydev.nvim",
				ft = "lua",
				opts = {
					library = {
						-- See the configuration section for more details
						-- Load luvit types when the `vim.uv` word is found
						{ path = "${3rd}/luv/library", words = { "vim%.uv" } },
					},
				},
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
					local capabilities = require("blink.cmp").get_lsp_capabilities()
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
		"fang2hou/blink-copilot",
		-- Use version just before neovim v0.11 support
		version = "v1.3.8",
	},
	{
		"saghen/blink.cmp",
		-- optional: provides snippets for the snippet source
		dependencies = {
			"rafamadriz/friendly-snippets",
			"L3MON4D3/LuaSnip",
			"fang2hou/blink-copilot",
			version = "v2.*",
		},
		-- use a release tag to download pre-built binaries
		version = "*",
		-- AND/OR build from source, requires nightly: https://rust-lang.github.io/rustup/concepts/channels.html#working-with-nightly-rust
		-- build = 'cargo build --release',
		-- If you use nix, you can build from source using latest nightly rust with:
		-- build = 'nix run .#build-plugin',
		---@module 'blink.cmp'
		---@type blink.cmp.Config
		opts = {
			snippets = { preset = "luasnip" },
			-- 'default' for mappings similar to built-in completion
			-- 'super-tab' for mappings similar to vscode (tab to accept, arrow keys to navigate)
			-- 'enter' for mappings similar to 'super-tab' but with 'enter' to accept
			-- See the full "keymap" documentation for information on defining your own keymap.
			keymap = {
				preset = "default",
				["<C-x>"] = { "show", "show_documentation", "hide_documentation" },
				--["<M-s>"] = {
				--	function(cmp)
				--		cmp.show({ providers = { "snippets" } })
				--	end,
				--},
				--["<C-x>"] = {
				--	function(cmp)
				--		cmp.show()
				--	end,
				--},
			},
			appearance = {
				-- Sets the fallback highlight groups to nvim-cmp's highlight groups
				-- Useful for when your theme doesn't support blink.cmp
				-- Will be removed in a future release
				use_nvim_cmp_as_default = true,
				-- Set to 'mono' for 'Nerd Font Mono' or 'normal' for 'Nerd Font'
				-- Adjusts spacing to ensure icons are aligned
				nerd_font_variant = "mono",
			},
			-- Default list of enabled providers defined so that you can extend it
			-- elsewhere in your config, without redefining it, due to `opts_extend`
			sources = {
				default = { "lsp", "path", "snippets", "buffer", "copilot" },
				providers = {
					copilot = {
						name = "copilot",
						module = "blink-copilot",
						score_offset = 100,
						async = true,
					},
				},
			},
			-- Disable cmdline completions
			cmdline = {
				enabled = false,
			},
		},
		opts_extend = { "sources.default" },
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
				-- Enable to see full command called from log
				-- log_level = vim.log.levels.DEBUG,
				formatters_by_ft = {
					lua = { "stylua" },
					-- Conform will run multiple formatters sequentially
					python = function(bufnr)
						-- use yapf for work
						if vim.fn.expand("$USER") == "13lbise" then
							return { "isort", "ruff_format" }
						else
							--return { "isort", "ruff_lsp" }
							return { "isort", "black" }
						end
					end,
					cpp = { "clang_format" },
					c = { "clang_format" },
				},
				formatters = {
					ruff_format = {
						prepend_args = function()
							local config = get_ruff_config()
							if config ~= "" then
								return { "--config", config }
							end
							return {}
						end,
					},
					clang_format = {
						-- Any additional configuration for Clang Format can go here
						-- Use format from a file
						args = {
							"--style=file:" .. vim.fn.expand("$HOME") .. "/.clang-format",
						},
					},
				},
			})
		end,
	},
}

return config
