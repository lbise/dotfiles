local settings = {
    colorscheme = 'tokyonight',
    lsp = {
        ensure_installed = {
            clangd = {},
            pyright = {},
            bashls = {},
            lua_ls = {
                Lua = {
                    workspace = { checkThirdParty = false },
                    telemetry = { enable = false },
                },
            },
        },
        -- Servers enable status, can also be a list of options passed to  require('lspconfig')[server].setup()
        servers = {
            clangd = false,
            pyright = true,
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
