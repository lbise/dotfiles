local settings = {
	colorscheme = "tokyonight",
	lsp = {
		-- Not used currently ...
		ensure_installed = {
			"clangd",
			"clang-format",
			"basedpyright",
			-- Required version for work..
			"ruff@0.11.2",
			--"ruff",
			"bash-language-server",
			"lua-language-server",
			"stylua",
		},
		-- Servers enable status, can also be a list of settings passed to require('lspconfig')[server].setup(settings = { xxx })
		servers = {
			clangd = false,
			--clangd = {
			--	cmd = {
			--		"clangd",
			--		"--log=verbose",
			--		"--background-index",
			--		"--clang-tidy",
			--		"--completion-style=detailed",
			--		"--header-insertion=iwyu",
			--		"--function-arg-placeholders=1",
			--	},
			--	filetypes = { "unity", "c", "cpp", "objc", "objcpp", "cuda", "proto" },
			--	root_markers = {
			--		".clangd",
			--		".clang-tidy",
			--		".clang-format",
			--		"compile_commands.json",
			--		"compile_flags.txt",
			--		"configure.ac",
			--	},
			--},
			basedpyright = {
				settings = {
					basedpyright = {
						analysis = {
							typeCheckingMode = "standard",
							extraPaths = {
								vim.fn.expand("$HOME/andromeda/rom/scripts/python"),
								vim.fn.expand("$HOME/andromeda/rom/_export/python3"),
								vim.fn.expand("$HOME/andromeda/executer/scripts/python"),
								vim.fn.expand("$HOME/andromeda/infrastructure/scripts/python"),
								vim.fn.expand("$HOME/andromeda/buildsystem/scripts/python"),
							},
						},
					},
				},
			},
			--ty = {
			--	settings = {
			--		ty = {
			--			diagnosticMode = "openFilesOnly",
			--			showSyntaxErrors = true,
			--			inlayHints = {
			--				variableTypes = true,
			--				callArgumentNames = true,
			--			},
			--			completions = {
			--				autoImport = true,
			--			},
			--			configuration = {
			--				environment = {
			--					["extra-paths"] = {
			--						vim.fn.expand("$HOME/andromeda/rom/scripts/python"),
			--						vim.fn.expand("$HOME/andromeda/rom/_export/python3"),
			--						vim.fn.expand("$HOME/andromeda/executer/scripts/python"),
			--						vim.fn.expand("$HOME/andromeda/infrastructure/scripts/python"),
			--						vim.fn.expand("$HOME/andromeda/buildsystem/scripts/python"),
			--					},
			--				},
			--			},
			--		},
			--	},
			--},
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
