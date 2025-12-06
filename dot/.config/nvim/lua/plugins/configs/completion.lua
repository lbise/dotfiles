local has_words_before = function()
    unpack = unpack or table.unpack
    local line, col = unpack(vim.api.nvim_win_get_cursor(0))
    return col ~= 0 and vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col, col):match("%s") == nil
end

local config = {
    --{
    --    'hrsh7th/nvim-cmp',
    --    event = { "InsertEnter", "CmdlineEnter" },
    --    config = function()
    --        require('cmp').setup({
    --            snippet = {
    --                expand = function(args)
    --                    require('luasnip').lsp_expand(args.body)
    --                end,
    --            },
    --            mapping = require('cmp').mapping.preset.insert {
    --                ['<C-n>'] = require('cmp').mapping.select_next_item(),
    --                ['<C-p>'] = require('cmp').mapping.select_prev_item(),
    --                ['<C-d>'] = require('cmp').mapping.scroll_docs(-4),
    --                ['<C-f>'] = require('cmp').mapping.scroll_docs(4),
    --                ['<C-Space>'] = require('cmp').mapping.complete(),
    --                ['<CR>'] = require('cmp').mapping.confirm {
    --                    behavior = require('cmp').ConfirmBehavior.Replace,
    --                    select = true,
    --                },
    --                ['<Tab>'] = require('cmp').mapping(function(fallback)
    --                    if require('cmp').visible() then
    --                        require('cmp').select_next_item()
    --                        -- You could replace the expand_or_jumpable() calls with expand_or_locally_jumpable()
    --                        -- that way you will only jump inside the snippet region
    --                    elseif require('luasnip').expand_or_jumpable() then
    --                        require('luasnip').expand_or_jump()
    --                    -- LeB: Prevent entering tab characters if the cursor is just after text...
    --                    --elseif has_words_before() then
    --                    --    require('cmp').complete()
    --                    else
    --                        fallback()
    --                    end
    --                end, { 'i', 's' }),

    --                ['<S-Tab>'] = require('cmp').mapping(function(fallback)
    --                    if require('cmp').visible() then
    --                        require('cmp').select_prev_item()
    --                    elseif require('luasnip').jumpable(-1) then
    --                        require('luasnip').jump(-1)
    --                    else
    --                        fallback()
    --                    end
    --                end, { 'i', 's' }),
    --            },
    --            sources = {
    --                { name = 'nvim_lsp' },
    --                { name = 'luasnip' },
    --            },
    --        })
    --    end,
    --    dependencies = {
    --        -- Snippet Engine & its associated nvim-cmp source
    --        {
    --            'L3MON4D3/LuaSnip',
    --            config = function()
    --                require("luasnip.loaders.from_vscode").lazy_load()
    --            end
    --        },
    --        'saadparwaiz1/cmp_luasnip',

    --        -- Adds LSP completion capabilities
    --        'hrsh7th/cmp-nvim-lsp',

    --        -- Adds a number of user-friendly snippets
    --        'rafamadriz/friendly-snippets',
    --    },
    --},
}

return config
