local settings = {
    colorscheme = 'tokyonight',
    lsp = {
        ensure_installed = {
            'clangd',
            'pyright',
            --'ruff_lsp',
            'bashls',
            'lua_ls',
        },
        -- Servers enable status, can also be a list of settings passed to require('lspconfig')[server].setup(settings = { xxx })
        servers = {
            clangd = false,
            pyright = {
                settings = {
                    python = {
                        analysis = {
                            extraPaths = {
                                vim.fn.expand('$HOME/andromeda/rom/scripts/python'),
                                vim.fn.expand('$HOME/andromeda/rom/_export/python3'),
                                vim.fn.expand('$HOME/andromeda/pctools/scripts/python'),
                                vim.fn.expand('$HOME/andromeda/executer/scripts/python'),
                                vim.fn.expand('$HOME/andromeda/infrastructure/scripts/python'),
                            }
                        },
                    },
                },
            },
            --ruff_lsp = true,
            bashls = true,
            lua_ls = {
                settings = {
                    Lua = {
                        workspace = {
                            checkThirdParty = false
                        },
                    },
                },
            }
        }
    }
}

return settings
