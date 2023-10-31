local config = {
    {
        'tpope/vim-fugitive',
    },
    {
        'sindrets/diffview.nvim',
        cmd = {
            'DiffviewOpen'
        },
    },
    {
        'folke/which-key.nvim',
        event = 'VeryLazy',
        cmd = {
            'WhichKey'
        },
    },
    {
        'danymat/neogen',
        dependencies = 'nvim-treesitter/nvim-treesitter',
        cmd = {
            'Neogen'
        },
        config = function()
	        require('neogen').setup({
                snippet_engine = 'luasnip'
            })
        end
    },
}

return config
