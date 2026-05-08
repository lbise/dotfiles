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

local function parse_package_identifier(package_identifier)
	local parts = vim.split(package_identifier, "@", { plain = true })
	return parts[1], parts[2]
end

local function ensure_mason_packages_installed()
	local registry = require("mason-registry")
	local mason_installed = require("core.settings").lsp.mason_installed or {}

	if vim.tbl_isempty(mason_installed) then
		return
	end

	registry.refresh(function(success)
		if not success then
			vim.schedule(function()
				vim.notify("Failed to refresh Mason registry", vim.log.levels.ERROR)
			end)
			return
		end

		local install_queue = {}

		for _, package_identifier in ipairs(mason_installed) do
			local package_name, version = parse_package_identifier(package_identifier)
			local ok, pkg = pcall(registry.get_package, package_name)

			if not ok then
				local missing_package = package_identifier
				vim.schedule(function()
					vim.notify(
						("Mason package %q was not found in the registry"):format(missing_package),
						vim.log.levels.ERROR
					)
				end)
			else
				local is_installed = pkg:is_installed()
				local installed_version = pkg:get_installed_version()
				local install_opts = {}
				local should_install = not is_installed

				if version then
					install_opts.version = version
					if installed_version ~= version then
						should_install = true
						install_opts.force = is_installed
					end
				end

				if should_install and not pkg:is_installing() then
					table.insert(install_queue, {
						identifier = package_identifier,
						pkg = pkg,
						install_opts = install_opts,
					})
				end
			end
		end

		local installed_packages = {}
		local pending_installs = #install_queue

		local function notify_restart_if_needed()
			if pending_installs ~= 0 or vim.tbl_isempty(installed_packages) then
				return
			end

			local packages = vim.deepcopy(installed_packages)
			table.sort(packages)

			vim.schedule(function()
				if #packages == 1 then
					vim.notify(
						("Installed Mason tool %s. Restart Neovim to use it."):format(packages[1]),
						vim.log.levels.WARN
					)
				else
					vim.notify(
						("Installed Mason tools:\n- %s\nRestart Neovim to use them."):format(
							table.concat(packages, "\n- ")
						),
						vim.log.levels.WARN
					)
				end
			end)
		end

		for _, install in ipairs(install_queue) do
			local package_identifier = install.identifier
			local pkg = install.pkg
			local install_opts = install.install_opts

			pkg:install(install_opts, function(install_success, err)
				pending_installs = pending_installs - 1

				if install_success then
					table.insert(installed_packages, package_identifier)
				else
					vim.schedule(function()
						vim.notify(
							("Failed to install Mason package %s: %s"):format(package_identifier, tostring(err)),
							vim.log.levels.ERROR
						)
					end)
				end

				notify_restart_if_needed()
			end)
		end
	end)
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
			ensure_mason_packages_installed()

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
