local settings = {
	colorscheme = "tokyonight",
	lsp = {
		ensure_installed = {
			"clangd",
			"pyright",
			-- Required version for work..
			"ruff@0.11.2",
			"bashls",
			"lua_ls",
		},
		-- Servers enable status, can also be a list of settings passed to require('lspconfig')[server].setup(settings = { xxx })
		servers = {
			clangd = {
				cmd = {
					"clangd",
					"--log=verbose",
					"--background-index",
					"--clang-tidy",
					"--completion-style=detailed",
					"--header-insertion=iwyu",
					"--function-arg-placeholders=1",
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
			pyright = {
				settings = {
					python = {
						analysis = {
							extraPaths = {
								vim.fn.expand("$HOME/andromeda/rom/scripts/python"),
								vim.fn.expand("$HOME/andromeda/rom/_export/python3"),
								vim.fn.expand("$HOME/andromeda/pctools/scripts/python"),
								vim.fn.expand("$HOME/andromeda/executer/scripts/python"),
								vim.fn.expand("$HOME/andromeda/infrastructure/scripts/python"),
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

return settings
