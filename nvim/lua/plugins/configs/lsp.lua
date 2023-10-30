local config = {
    {
        'neovim/nvim-lspconfig',
        event = {
            'BufReadPost',
            'BufNewFile',
        },
        -- Plugins setup before nvim-lspconfig
        dependencies = {
            'williamboman/mason.nvim',
            cmd = {
                'Mason', 'MasonInstall', 'MasonUpdate'
            },
            'williamboman/mason-lspconfig.nvim',
            {
                -- Neovim setup for init.lua and plugin development with full signature help, docs and completion for the nvim lua API.
                'folke/neodev.nvim',
                event = 'LspAttach',
                config = function()
                    require('neodev').setup()
                end
            },
        },
    },
    {
        'williamboman/mason-lspconfig.nvim',
        event = {
            'BufEnter'
        },
        config = function()
            require('mason').setup()
            require('mason-lspconfig').setup({
                ensure_installed = require('core.settings').lsp.ensure_installed,
            })

            for config_server, config_opt in pairs(require('core.settings').lsp.servers) do
                if not config_opt == false then
                    local capabilities = vim.lsp.protocol.make_client_capabilities()
                    capabilities = require('cmp_nvim_lsp').default_capabilities(capabilities)
                    local opts = {
                        capabilities = capabilities
                    }

                    -- override options if user defines them
                    if type(require('core.settings').lsp.servers[config_server]) == 'table' then
                        local user_opts = require('core.settings').lsp.servers[config_server]
                        opts = require('core.tools').merge_table(opts, user_opts)
                    end

                    require('lspconfig')[config_server].setup(opts)
                end
            end

        end,
        dependencies = {
            'williamboman/mason.nvim',
        },
    },
    {
        -- Standalone UI for nvim-lsp progress.
        'j-hui/fidget.nvim',
        tag = 'legacy',
        event = 'LspAttach',
        config = true,
    },
    {
        -- Show diagnostics messages in a window
        'folke/trouble.nvim',
        event = 'LspAttach',
        dependencies = {
            'nvim-tree/nvim-web-devicons'
        },
    }
}

return config
