local settings = {
    colorscheme = 'tokyonight',
    lsp = {
        ensure_installed = {
            'clangd',
            'pyright',
            'ruff_lsp',
            'bashls',
            'lua_ls',
        },
        -- Servers enable status, can also be a list of options passed to  require('lspconfig')[server].setup()
        servers = {
            clangd = false,
            pyright = true,
            ruff_lsp = true,
            bashls = true,
            lua_ls = {
                workspace = {
                    checkThirdParty = false
                },
            }
        }
    }
}

return settings
