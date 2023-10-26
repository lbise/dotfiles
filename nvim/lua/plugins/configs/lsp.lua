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
            'hrsh7th/cmp-nvim-lsp',
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

    --{
    --    'hrsh7th/nvim-cmp',
    --    event = 'InsertEnter',
    --    dependencies = {
    --        -- Snippet Engine & its associated nvim-cmp source
    --        'L3MON4D3/LuaSnip',
    --        'saadparwaiz1/cmp_luasnip',

    --        -- Adds LSP completion capabilities
    --        'hrsh7th/cmp-nvim-lsp',

    --        -- Adds a number of user-friendly snippets
    --        'rafamadriz/friendly-snippets',
    --    },
    --},

}

---- nvim-cmp supports additional completion capabilities, so broadcast that to servers
--local capabilities = vim.lsp.protocol.make_client_capabilities()
--capabilities = require('cmp_nvim_lsp').default_capabilities(capabilities)
--
---- Ensure the servers above are installed
--local mason_lspconfig = require 'mason-lspconfig'
--mason_lspconfig.setup {
--    ensure_installed = vim.tbl_keys(servers),
--}
--
--mason_lspconfig.setup_handlers {
--    function(server_name)
--        require('lspconfig')[server_name].setup {
--            capabilities = capabilities,
--            on_attach = on_attach,
--            settings = servers[server_name],
--            filetypes = (servers[server_name] or {}).filetypes,
--        }
--    end,
--}
--
---- Configure nvim-cmp
---- See `:help cmp`
--local cmp = require 'cmp'
--local luasnip = require 'luasnip'
--require('luasnip.loaders.from_vscode').lazy_load()
--luasnip.config.setup {}
--
--cmp.setup {
--    snippet = {
--        expand = function(args)
--            luasnip.lsp_expand(args.body)
--        end,
--    },
--    mapping = cmp.mapping.preset.insert {
--        ['<C-n>'] = cmp.mapping.select_next_item(),
--        ['<C-p>'] = cmp.mapping.select_prev_item(),
--        ['<C-d>'] = cmp.mapping.scroll_docs(-4),
--        ['<C-f>'] = cmp.mapping.scroll_docs(4),
--        ['<C-Space>'] = cmp.mapping.complete {},
--        ['<CR>'] = cmp.mapping.confirm {
--            behavior = cmp.ConfirmBehavior.Replace,
--            select = true,
--        },
--        ['<Tab>'] = nil,
--        ['<S-Tab>'] = nil,
--        --['<Tab>'] = cmp.mapping(function(fallback)
--        --    if cmp.visible() then
--        --        cmp.select_next_item()
--        --    elseif luasnip.expand_or_locally_jumpable() then
--        --        luasnip.expand_or_jump()
--        --    else
--        --        fallback()
--        --    end
--        --end, { 'i', 's' }),
--        --['<S-Tab>'] = cmp.mapping(function(fallback)
--        --    if cmp.visible() then
--        --        cmp.select_prev_item()
--        --    elseif luasnip.locally_jumpable(-1) then
--        --        luasnip.jump(-1)
--        --    else
--        --        fallback()
--        --    end
--        --end, { 'i', 's' }),
--    },
--    sources = {
--        { name = 'nvim_lsp' },
--        { name = 'luasnip' },
--    },
--}

return config
