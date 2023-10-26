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
}

return config
