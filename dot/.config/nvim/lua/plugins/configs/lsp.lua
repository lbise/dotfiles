local function get_ruff_config()
	if vim.fn.expand("$USER") == "13lbise" then
		-- Check for andromeda style file
		local style_path = vim.fn.expand("$ANDROMEDA_ROOT/pyproject.toml")
		if vim.fn.filereadable(style_path) then
			return style_path
		end
	end

	return ""
end

local function get_clang_format_config()
	local user_path = vim.fn.expand("$HOME") .. "/.clang-format"

	if vim.fn.expand("$USER") == "13lbise" then
		local andromeda_path = vim.fn.expand("$ANDROMEDA_ROOT/hooks/.clang-format")
		if vim.fn.filereadable(andromeda_path) then
			return andromeda_path
		end
	end

	return user_path
end

local config = {
	{
		"neovim/nvim-lspconfig",
		dependencies = {
			"williamboman/mason.nvim",
			{
				"folke/lazydev.nvim",
				ft = "lua", -- only load on lua files
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
		"mason-org/mason.nvim",
		cmd = {
			"Mason",
			"MasonInstall",
			"MasonUpdate",
		},
		config = function()
			-- Setup mason so LSPs are added to the PATH
			require("mason").setup()

			vim.diagnostic.config({
				virtual_text = false,
				underline = true,
				update_in_insert = true,
				severity_sort = true,
				signs = {
					text = {
						[vim.diagnostic.severity.ERROR] = "",
						[vim.diagnostic.severity.WARN] = "",
						[vim.diagnostic.severity.INFO] = "󰋽",
						[vim.diagnostic.severity.HINT] = "",
						--[vim.diagnostic.severity.ERROR] = " ",
						--[vim.diagnostic.severity.WARN] = " ",
						--[vim.diagnostic.severity.INFO] = " ",
						--[vim.diagnostic.severity.HINT] = " ",
					},
				},
				float = {
					border = "rounded",
					source = "if_many",
				},
			})

			--local registry = require("mason-registry")
			--for i, package in pairs(require("core.settings").lsp.ensure_installed) do
			--    local pkg = registry.get_package(package)
			--	--vim.notify("Package " .. package, vim.log.levels.ERROR)
			--    if not pkg:is_installed() then
			--	    vim.notify("Not installed " .. package, vim.log.levels.ERROR)
			--    end
			--end

			for config_server, config_opt in pairs(require("core.settings").lsp.servers) do
				if not config_opt == false then
					if type(config_opt) == "table" then
						-- Add extra configuration
						vim.lsp.config(config_server, config_opt)
					end

					vim.lsp.enable(config_server)
				end
			end
		end,
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
		"rachartier/tiny-inline-diagnostic.nvim",
		event = "VeryLazy",
		priority = 1000,
		config = function()
			require("tiny-inline-diagnostic").setup({
				options = {
					multilines = {
						enabled = true,
						always_show = true,
					},
				},
			})
			vim.diagnostic.config({ virtual_text = false }) -- Disable default virtual text
		end,
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
						return { "ruff_organize_imports", "ruff_format" }
					end,
					cpp = { "clang_format" },
					c = { "clang_format" },
					json = { "prettier" },
					jsonc = { "prettier" },
					-- Web dev (prettier)
					html = { "prettier" },
					css = { "prettier" },
					scss = { "prettier" },
					javascript = { "prettier" },
					typescript = { "prettier" },
					javascriptreact = { "prettier" },
					typescriptreact = { "prettier" },
					vue = { "prettier" },
					yaml = { "prettier" },
					markdown = { "prettier" },
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
					ruff_organize_imports = {
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
							"--style=file:" .. get_clang_format_config(),
						},
					},
				},
			})
		end,
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
}

return config
