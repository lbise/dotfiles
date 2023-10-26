local config = {
    {
        'hrsh7th/nvim-cmp',
        event = 'InsertEnter',
        config = function()
            require('cmp').setup({
                snippet = {
                    expand = function(args)
                        require('luasnip').lsp_expand(args.body)
                    end,
                },
                mapping = require('cmp').mapping.preset.insert {
                    ['<C-n>'] = require('cmp').mapping.select_next_item(),
                    ['<C-p>'] = require('cmp').mapping.select_prev_item(),
                    ['<C-d>'] = require('cmp').mapping.scroll_docs(-4),
                    ['<C-f>'] = require('cmp').mapping.scroll_docs(4),
                    ['<C-Space>'] = require('cmp').mapping.complete {},
                    ['<CR>'] = require('cmp').mapping.confirm {
                        behavior = require('cmp').ConfirmBehavior.Replace,
                        select = true,
                    },
                    ['<Tab>'] = nil,
                    ['<S-Tab>'] = nil,
                    --['<Tab>'] = cmp.mapping(function(fallback)
                        --    if cmp.visible() then
                        --        cmp.select_next_item()
                        --    elseif luasnip.expand_or_locally_jumpable() then
                        --        luasnip.expand_or_jump()
                        --    else
                        --        fallback()
                        --    end
                        --end, { 'i', 's' }),
                        --['<S-Tab>'] = cmp.mapping(function(fallback)
                            --    if cmp.visible() then
                            --        cmp.select_prev_item()
                            --    elseif luasnip.locally_jumpable(-1) then
                            --        luasnip.jump(-1)
                            --    else
                            --        fallback()
                            --    end
                            --end, { 'i', 's' }),
                },
                sources = {
                    { name = 'nvim_lsp' },
                    { name = 'luasnip' },
                },
            })
        end,
        dependencies = {
            -- Snippet Engine & its associated nvim-cmp source
            'L3MON4D3/LuaSnip',
            'saadparwaiz1/cmp_luasnip',

            -- Adds LSP completion capabilities
            'hrsh7th/cmp-nvim-lsp',

            -- Adds a number of user-friendly snippets
            'rafamadriz/friendly-snippets',
        },
    },
}

return config
