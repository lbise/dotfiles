local tools = require("core.tools")

local allow_npm_tools = not tools.is_work() or tools.is_wsl()
local enable_web_lsp = not tools.is_work()

local settings = {
	colorscheme = "tokyonight",
	lsp = {
		-- LSP and tools installed by mason
		-- Supports pinned version like ruff@0.11.2
		mason_installed = {
			"clangd",
			-- Specific version required for work
			"ruff@0.11.2",
			"basedpyright",
			"lua-language-server",
			"stylua",
			"ty",
		},
		-- Language highlighting through tree sitter
		treesitter_installed = {
			"c",
			"lua",
			"vim",
			"vimdoc",
			"query",
			"cpp",
			"python",
			"bash",
			"csv",
			"diff",
			"json",
			"make",
			"cmake",
			"xml",
			"yaml",
		},
		-- Servers enable status, can also be a list of settings passed to require('lspconfig')[server].setup(settings = { xxx })
		servers = {
			--clangd = false,
			clangd = {
				cmd = {
					"clangd",
					"--log=verbose",
					"--background-index",
					"--clang-tidy",
					"--completion-style=detailed",
					"--header-insertion=iwyu",
					"--function-arg-placeholders=1",
					-- Fails with ccac
					-- "--query-driver=/home/13lbise/andromeda/_tools/ARC_2023_03/MetaWare/arc/bin/ccac"
				},
				filetypes = { "unity", "c", "cpp", "objc", "objcpp", "cuda", "proto" },
				root_markers = {
					".clangd",
					".clang-tidy",
					".clang-format",
					"compile_commands.json",
					"compile_flags.txt",
					"configure.ac",
				},
			},

			-- basedpyright = {
			-- 	settings = {
			-- 		basedpyright = {
			-- 			analysis = {
			-- 				typeCheckingMode = "standard",
			-- 				extraPaths = {
			-- 					vim.fn.expand("$HOME/andromeda"),
			-- 					vim.fn.expand("$HOME/andromeda/apps/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/bt/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/buildsystem/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/dsp/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/executer/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/hlc/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/infrastructure/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/pctools/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/raspi4/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/rom/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/stf4/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/tstenv/scripts/python"),
			-- 					vim.fn.expand("$HOME/andromeda/nordic/scripts/python"),
			-- 				},
			-- 			},
			-- 		},
			-- 	},
			-- },
			ty = {
				init_options = { logLevel = "debug" },
				settings = {
					ty = {
						diagnosticMode = "openFilesOnly",
						showSyntaxErrors = true,
						inlayHints = {
							variableTypes = true,
							callArgumentNames = true,
						},
						completions = {
							autoImport = true,
						},
						configuration = {
							-- Override rules from config file
							rules = {
								["all"] = "error",
								-- ["unresolved-reference"] = "warn",
							},
						},
					},
				},
			},
			lua_ls = {
				settings = {
					Lua = {
						workspace = {
							checkThirdParty = false,
						},
					},
				},
			},
		},
	},
}

-- Npm-based Mason tools that are allowed on work machines only when using WSL.
if allow_npm_tools then
	table.insert(settings.lsp.mason_installed, "prettier")
end

-- Web development tools are never enabled on work machines, even in WSL.
if enable_web_lsp then
	for _, package in ipairs({
		"typescript-language-server",
		"eslint-lsp",
		"tailwindcss-language-server",
	}) do
		table.insert(settings.lsp.mason_installed, package)
	end

	settings.lsp.servers.ts_ls = true
	settings.lsp.servers.eslint = true
	settings.lsp.servers.tailwindcss = true
end

return settings
