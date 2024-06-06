local config = {
    {
        'navarasu/onedark.nvim',
        lazy = true,
        config = function()
            require('onedark').setup({
                style = 'deep', -- Default theme style. Choose between 'dark', 'darker', 'cool', 'deep', 'warm', 'warmer' and 'light'
                transparent = false,
                term_colors = true,
                -- Change code style ---
                -- Options are italic, bold, underline, none
                -- You can configure multiple style with comma separated, For e.g., keywords = 'italic,bold'
                code_style = {
                    comments = 'none',
                    keywords = 'none',
                    functions = 'bold',
                    strings = 'none',
                    variables = 'bold'
                },
            })
        end,
    },
    { 'sainnhe/edge', lazy = true },
    { 'sainnhe/sonokai', lazy = true },
    { 'sainnhe/gruvbox-material', lazy = true },
    { 'shaunsingh/nord.nvim', lazy = true },
    { 'sainnhe/everforest', lazy = true },
    { 'EdenEast/nightfox.nvim', lazy = true },
    { 'rebelot/kanagawa.nvim', lazy = true },
    { 'catppuccin/nvim', name = 'catppuccin', lazy = true },
    { 'olimorris/onedarkpro.nvim', lazy = true },
    { 'tanvirtin/monokai.nvim', lazy = true },
    { 'marko-cerovac/material.nvim', lazy = true },
    {
        'folke/tokyonight.nvim',
        lazy = true,
        config = function()
            require('tokyonight').setup({
                -- your configuration comes here
                -- or leave it empty to use the default settings
                style = 'storm', -- The theme comes in three styles, `storm`, `moon`, a darker variant `night` and `day`
                light_style = 'day', -- The theme is used when the background is set to light
                transparent = false, -- Enable this to disable setting the background color
                terminal_colors = true, -- Configure the colors used when opening a `:terminal` in [Neovim](https://github.com/neovim/neovim)
                styles = {
                    -- Style to be applied to different syntax groups
                    -- Value is any valid attr-list value for `:help nvim_set_hl`
                    comments = { italic = true },
                    keywords = { italic = true },
                    functions = {},
                    variables = {},
                    -- Background styles. Can be 'dark', 'transparent' or 'normal'
                    sidebars = 'dark', -- style for sidebars, see below
                    floats = 'dark', -- style for floating windows
                },
                sidebars = { 'qf', 'help' }, -- Set a darker background on sidebar-like windows. For example: `['qf', 'vista_kind', 'terminal', 'packer']`
                day_brightness = 0.3, -- Adjusts the brightness of the colors of the **Day** style. Number between 0 and 1, from dull to vibrant colors
                hide_inactive_statusline = false, -- Enabling this option, will hide inactive statuslines and replace them with a thin border instead. Should work with the standard **StatusLine** and **LuaLine**.
                dim_inactive = false, -- dims inactive windows
                lualine_bold = false, -- When `true`, section headers in the lualine theme will be bold
                on_colors = function(colors)
                    -- Make comments brighter
                    colors.comment = "#67719f"
                end,
                on_highlights = function(hl, colors)
                    -- Make linenumbers brighter
                    hl.LineNr = {
                        fg = "#67719f"
                    }
                end,
            })
        end
    },
    {
        'nvim-lualine/lualine.nvim',
        event = 'VeryLazy',
        opts = {
            options = {
                icons_enabled = true,
                theme = require('core.settings').colorscheme,
                --section_separators = { left = '', right = '' },
                --component_separators = { left = '', right = '' }
                -- component_separators = '|',
                -- section_separators = '',
                section_separators = { left = '', right = '' },
            },
        },
    },
    {
		'akinsho/bufferline.nvim',
		dependencies = 'nvim-tree/nvim-web-devicons',
		event = { 'BufRead', 'BufNewFile' },
		config = function()
            require('bufferline').setup({
                options = {
                    mode = "buffers", -- set to "tabs" to only show tabpages instead
                    style_preset = require('bufferline').style_preset.no_italic,
                    buffer_close_icon = '',
                    modified_icon = ' ',
                    close_icon = '',
                    left_trunc_marker = '',
                    right_trunc_marker = '',
                    max_name_length = 25,
                    max_prefix_length = 15,
                    tab_size = 25,
                    diagnostics = 'nvim_lsp',
                    custom_filter = function(bufnr)
                        local exclude_ft = { 'qf', 'fugitive', 'git' }
                        local cur_ft = vim.bo[bufnr].filetype
                        local should_filter = vim.tbl_contains(exclude_ft, cur_ft)

                        if should_filter then
                            return false
                        end

                        return true
                    end,
                    show_buffer_icons = true,
                    show_buffer_close_icons = false,
                    show_tab_indicators = true,
                    persist_buffer_sort = true,
                    separator_style = 'slope',
                    enforce_regular_tabs = false,
                    always_show_bufferline = true,
                    sort_by = 'id',
                },
            })
        end
    },
    {
        'lewis6991/gitsigns.nvim',
        event = { 'BufReadPost', 'BufNewFile' },
        enabled = true,
        opts = {
            signs = {
                add          = { text = '│' },
                change       = { text = '│' },
                delete       = { text = '_' },
                topdelete    = { text = '‾' },
                changedelete = { text = '~' },
                untracked    = { text = '┆' },
            },
            signcolumn = true,  -- Toggle with `:Gitsigns toggle_signs`
            numhl      = false, -- Toggle with `:Gitsigns toggle_numhl`
            linehl     = false, -- Toggle with `:Gitsigns toggle_linehl`
            word_diff  = false, -- Toggle with `:Gitsigns toggle_word_diff`
            watch_gitdir = {
                follow_files = true
            },
            attach_to_untracked = true,
            current_line_blame = false, -- Toggle with `:Gitsigns toggle_current_line_blame`
            current_line_blame_opts = {
                virt_text = true,
                virt_text_pos = 'eol', -- 'eol' | 'overlay' | 'right_align'
                delay = 1000,
                ignore_whitespace = false,
            },
            current_line_blame_formatter = '<author>, <author_time:%Y-%m-%d> - <summary>',
            sign_priority = 6,
            update_debounce = 100,
            status_formatter = nil, -- Use default
            max_file_length = 40000, -- Disable if file is longer than this (in lines)
            preview_config = {
                -- Options passed to nvim_open_win
                border = 'single',
                style = 'minimal',
                relative = 'cursor',
                row = 0,
                col = 1
            },
            yadm = {
                enable = false
            },
        }
    },
    {
        -- Add indentation guides even on blank lines
        'lukas-reineke/indent-blankline.nvim',
        event = { 'BufReadPost', 'BufNewFile' },
        main = 'ibl',
        opts = {
            scope = { enabled = false },
        },
    },
    {
        'folke/noice.nvim',
        event = 'VeryLazy',
        opts = {
          -- add any options here
        },
        dependencies = {
          -- if you lazy-load any plugin below, make sure to add proper `module='...'` entries
          'MunifTanjim/nui.nvim',
          -- OPTIONAL:
          --   `nvim-notify` is only needed, if you want to use the notification view.
          --   If not available, we use `mini` as the fallback
          'rcarriga/nvim-notify',
        },
        config = function()
            require('noice').setup({
                lsp = {
                    -- override markdown rendering so that **cmp** and other plugins use **Treesitter**
                    override = {
                        ["vim.lsp.util.convert_input_to_markdown_lines"] = true,
                        ["vim.lsp.util.stylize_markdown"] = true,
                        ["cmp.entry.get_documentation"] = true, -- requires hrsh7th/nvim-cmp
                    },
                },
                presets = {
                    bottom_search = true, -- use a classic bottom cmdline for search
                    command_palette = false, -- position the cmdline and popupmenu together
                    long_message_to_split = true, -- long messages will be sent to a split
                    inc_rename = false, -- enables an input dialog for inc-rename.nvim
                    lsp_doc_border = false, -- add a border to hover docs and signature help
                },
                cmdline = {
                    view = "cmdline", -- view for rendering the cmdline. Change to `cmdline` to get a classic cmd
                }
            })
        end,
    }
}

return config
