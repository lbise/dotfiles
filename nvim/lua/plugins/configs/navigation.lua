local config = {
    {
        'ThePrimeagen/harpoon',
        dependencies = {
            'nvim-lua/plenary.nvim',
        }
    },
    {
        'nvim-neo-tree/neo-tree.nvim',
        cmd = 'Neotree',
        event = { 'BufEnter' },
        branch = 'v3.x',
        dependencies = {
            'nvim-lua/plenary.nvim',
            -- not strictly required, but recommended
            'nvim-tree/nvim-web-devicons',
            'MunifTanjim/nui.nvim',
        },
        config = function()
            require('neo-tree').setup({
                window = {
                    mappings = {
                        ['l'] =  'open'
                    }
                },
                filesystem = {
                    bind_to_cwd = false, -- true creates a 2-way binding between vim's cwd and neo-tree's root
                    hijack_netrw_behavior = 'open_current'
                },
            })
        end
    },
    {
        'nvim-telescope/telescope.nvim',
        branch = '0.1.x',
        event = 'UIEnter',
        dependencies = {
            'nvim-lua/plenary.nvim',
            -- Fuzzy Finder Algorithm which requires local dependencies to be built.
            -- Only load if `make` is available. Make sure you have the system
            -- requirements installed.
            {
                'nvim-telescope/telescope-fzf-native.nvim',
                -- NOTE: If you are having trouble with this installation,
                --       refer to the README for telescope-fzf-native for more instructions.
                build = 'make',
                cond = function()
                    return vim.fn.executable 'make' == 1
                end,
            },
        },
        config = function()
            -- Enable telescope fzf native, if installed
            pcall(require('telescope').load_extension, 'fzf')
        end
    },
    {
        'ojroques/nvim-bufdel',
        event = { 'BufReadPost', 'BufNewFile' },
        opts = {
            quit = false
        },
    },
    {
        'christoomey/vim-tmux-navigator',
        cmd = {
            "TmuxNavigateLeft",
            "TmuxNavigateDown",
            "TmuxNavigateUp",
            "TmuxNavigateRight",
            "TmuxNavigatePrevious",
        },
        keys = {
            { "<c-h>", "<cmd><C-U>TmuxNavigateLeft<cr>" },
            { "<c-j>", "<cmd><C-U>TmuxNavigateDown<cr>" },
            { "<c-k>", "<cmd><C-U>TmuxNavigateUp<cr>" },
            { "<c-l>", "<cmd><C-U>TmuxNavigateRight<cr>" },
            { "<c-\\>", "<cmd><C-U>TmuxNavigatePrevious<cr>" },
        },
    },
}

return config
