-- List of all default plugins & their definitions
local default_plugins = {
    {
        --'shaunsingh/nord.nvim',
        'navarasu/onedark.nvim',
        --'EdenEast/nightfox.nvim',
        --'folke/tokyonight.nvim',
        priority = 1000,
        lazy = false,
        config = function()
            --vim.g.nord_borders = true
            --vim.g.nord_contrast = true
            --vim.g.nord_italic = false
            --vim.cmd.colorscheme 'nord'

            require('onedark').setup  {
                style = 'darker', -- Default theme style. Choose between 'dark', 'darker', 'cool', 'deep', 'warm', 'warmer' and 'light'
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
            }
            vim.cmd.colorscheme 'onedark'

            --require('tokyonight').setup({
            --    -- your configuration comes here
            --    -- or leave it empty to use the default settings
            --    style = 'storm', -- The theme comes in three styles, `storm`, `moon`, a darker variant `night` and `day`
            --    light_style = 'day', -- The theme is used when the background is set to light
            --    transparent = false, -- Enable this to disable setting the background color
            --    terminal_colors = true, -- Configure the colors used when opening a `:terminal` in [Neovim](https://github.com/neovim/neovim)
            --    styles = {
            --        -- Style to be applied to different syntax groups
            --        -- Value is any valid attr-list value for `:help nvim_set_hl`
            --        comments = { italic = false },
            --        keywords = { italic = false },
            --        functions = {},
            --        variables = {},
            --        -- Background styles. Can be 'dark', 'transparent' or 'normal'
            --        sidebars = 'dark', -- style for sidebars, see below
            --        floats = 'dark', -- style for floating windows
            --    },
            --    sidebars = { 'qf', 'help' }, -- Set a darker background on sidebar-like windows. For example: `['qf', 'vista_kind', 'terminal', 'packer']`
            --    day_brightness = 0.3, -- Adjusts the brightness of the colors of the **Day** style. Number between 0 and 1, from dull to vibrant colors
            --    hide_inactive_statusline = false, -- Enabling this option, will hide inactive statuslines and replace them with a thin border instead. Should work with the standard **StatusLine** and **LuaLine**.
            --    dim_inactive = false, -- dims inactive windows
            --    lualine_bold = false, -- When `true`, section headers in the lualine theme will be bold

            --    -- You can override specific color groups to use other groups or a hex color
            --    -- function will be called with a ColorScheme table
            --    --@param colors ColorScheme
            --    --on_colors = function(colors) end,

            --    -- You can override specific highlights to use other groups or a hex color
            --    -- function will be called with a Highlights and ColorScheme table
            --    --@param highlights Highlights
            --    --@param colors ColorScheme
            --    --on_highlights = function(highlights, colors) end,
            --})
            --vim.cmd.colorscheme 'tokyonight'

            --vim.cmd.colorscheme 'nordfox'
        end,
    },
    {
        'nvim-lualine/lualine.nvim',
        -- See `:help lualine.txt`
        event = 'VeryLazy',
        opts = {
            options = {
                icons_enabled = true,
                --theme = 'tokyonight',
                theme = 'onedark',
                --theme = 'nord',
                --section_separators = { left = '', right = '' },
                --component_separators = { left = '', right = '' }
                -- component_separators = '|',
                -- section_separators = '',
            },
        },
    },
    {
		'akinsho/bufferline.nvim',
		dependencies = 'nvim-tree/nvim-web-devicons',
		event = { 'BufRead', 'BufNewFile' },
		config = function()
            --require('bufferline').setup()
            require('bufferline').setup({
                options = {
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
        -- Add indentation guides even on blank lines
        'lukas-reineke/indent-blankline.nvim',
        event = { 'BufReadPost', 'BufNewFile' },
        main = 'ibl',
        opts = {
            scope = { enabled = false },
        },
    },
    {
        'nvim-treesitter/nvim-treesitter',
        cmd = { 'TSInstall', 'TSBufEnable', 'TSBufDisable', 'TSModuleInfo' },
        dependencies = {
            'nvim-treesitter/nvim-treesitter-textobjects',
        },
        build = ':TSUpdate',
        config = function()
        end,
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
        'tamago324/lir.nvim',
        lazy = false,
        dependencies = {
            'nvim-tree/nvim-web-devicons'
        },
        config = function()
            local actions = require'lir.actions'
            local mark_actions = require 'lir.mark.actions'
            local clipboard_actions = require'lir.clipboard.actions'

            require'lir'.setup({
                show_hidden_files = false,
                ignore = {}, -- { ".DS_Store", "node_modules" } etc.
                devicons = {
                    enable = true,
                    highlight_dirname = false
                },
                mappings = {
                    ['l']     = actions.edit,
                    ['<CR>']  = actions.edit,
                    ['<C-s>'] = actions.split,
                    ['<C-v>'] = actions.vsplit,
                    ['<C-t>'] = actions.tabedit,

                    ['h']     = actions.up,
                    ['q']     = actions.quit,

                    ['K']     = actions.mkdir,
                    ['N']     = actions.newfile,
                    ['R']     = actions.rename,
                    ['@']     = actions.cd,
                    ['Y']     = actions.yank_path,
                    ['.']     = actions.toggle_show_hidden,
                    ['D']     = actions.delete,

                    ['J'] = function()
                        mark_actions.toggle_mark()
                        vim.cmd('normal! j')
                    end,
                    ['C'] = clipboard_actions.copy,
                    ['X'] = clipboard_actions.cut,
                    ['P'] = clipboard_actions.paste,
                },
            })
        end,
        opts = {
        }
    },
    'tpope/vim-fugitive',
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
        'ojroques/nvim-bufdel',
        event = { 'BufReadPost', 'BufNewFile' },
        opts = {
            quit = false
        },
    },
    {
        'nvim-tree/nvim-tree.lua',
        cmd = { 'NvimTreeToggle', 'NvimTreeFocus' },
        config = function()
            require('nvim-tree').setup({
                hijack_netrw = false
            })
        end,
    },
    {
        'neovim/nvim-lspconfig',
        enable = true,
		event = {
			'BufReadPost',
			'BufNewFile',
		},
        dependencies = {
            -- Automatically install LSPs to stdpath for neovim
            {
                'williamboman/mason.nvim',
                cmd = { 'Mason', 'MasonInstall', 'MasonUpdate' },
            },
            'williamboman/mason-lspconfig.nvim',

            -- Useful status updates for LSP
            { 'j-hui/fidget.nvim', tag = 'legacy', opts = {} },

            -- Additional lua configuration, makes nvim stuff amazing!
            'folke/neodev.nvim',
            -- List all diagnostics in a new window
            {
                'folke/trouble.nvim',
                dependencies = {
                    'nvim-tree/nvim-web-devicons'
                },
                opts = {
                }
            },
        }
    },
    {
        'hrsh7th/nvim-cmp',
        event = 'InsertEnter',
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

require('lazy').setup(default_plugins, {
    defaults = {
        lazy = true,
    }
})

-- Defer nvim-treesitter configuration
vim.defer_fn(function()
    require('nvim-treesitter.configs').setup {
        -- A list of parser names, or 'all' (the five listed parsers should always be installed)
        -- Add more from https://github.com/nvim-treesitter/nvim-treesitter#supported-languages
        ensure_installed = { 'c', 'lua', 'vim', 'vimdoc', 'query', 'cpp', 'python', 'bash' },

        -- Install parsers synchronously (only applied to `ensure_installed`)
        sync_install = false,

        -- Automatically install missing parsers when entering buffer
        -- Recommendation: set to false if you don't have `tree-sitter` CLI installed locally
        auto_install = true,

        -- List of parsers to ignore installing (or 'all')
        ignore_install = {},

        ---- If you need to change the installation directory of the parsers (see -> Advanced Setup)
        -- parser_install_dir = '/some/path/to/store/parsers', -- Remember to run vim.opt.runtimepath:append('/some/path/to/store/parsers')!

        highlight = {
            enable = true,

            -- Setting this to true will run `:h syntax` and tree-sitter at the same time.
            -- Set this to `true` if you depend on 'syntax' being enabled (like for indentation).
            -- Using this option may slow down your editor, and you may see some duplicate highlights.
            -- Instead of true it can also be a list of languages
            additional_vim_regex_highlighting = false,
        },
    }
end, 0)

-- Configure LSP
local on_attach = function(_, bufnr)
    local nmap = function(keys, func, desc)
        if desc then
            desc = 'LSP: ' .. desc
        end

        vim.keymap.set('n', keys, func, { buffer = bufnr, desc = desc })
    end

    nmap('<leader>rn', vim.lsp.buf.rename, '[R]e[n]ame')
    nmap('<leader>ca', vim.lsp.buf.code_action, '[C]ode [A]ction')

    nmap('gd', require('telescope.builtin').lsp_definitions, '[G]oto [D]efinition')
    nmap('gr', require('telescope.builtin').lsp_references, '[G]oto [R]eferences')
    nmap('gI', require('telescope.builtin').lsp_implementations, '[G]oto [I]mplementation')
    nmap('<leader>D', require('telescope.builtin').lsp_type_definitions, 'Type [D]efinition')
    nmap('<leader>ds', require('telescope.builtin').lsp_document_symbols, '[D]ocument [S]ymbols')
    nmap('<leader>ws', require('telescope.builtin').lsp_dynamic_workspace_symbols, '[W]orkspace [S]ymbols')

    -- See `:help K` for why this keymap
    nmap('K', vim.lsp.buf.hover, 'Hover Documentation')
    nmap('<C-k>', vim.lsp.buf.signature_help, 'Signature Documentation')

    -- Lesser used LSP functionality
    nmap('gD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')
    nmap('<leader>wa', vim.lsp.buf.add_workspace_folder, '[W]orkspace [A]dd Folder')
    nmap('<leader>wr', vim.lsp.buf.remove_workspace_folder, '[W]orkspace [R]emove Folder')
    nmap('<leader>wl', function()
        print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
    end, '[W]orkspace [L]ist Folders')

    -- Create a command `:Format` local to the LSP buffer
    vim.api.nvim_buf_create_user_command(bufnr, 'Format', function(_)
        vim.lsp.buf.format()
    end, { desc = 'Format current buffer with LSP' })
end

require('mason').setup()
require('mason-lspconfig').setup()

local servers = {
    --clangd = {},
    pyright = {},
    bashls = {},
    -- gopls = {},
    -- rust_analyzer = {},
    -- tsserver = {},
    -- html = { filetypes = { 'html', 'twig', 'hbs'} },

    lua_ls = {
        Lua = {
            workspace = { checkThirdParty = false },
            telemetry = { enable = false },
        },
    },
}

require('neodev').setup()

-- nvim-cmp supports additional completion capabilities, so broadcast that to servers
local capabilities = vim.lsp.protocol.make_client_capabilities()
capabilities = require('cmp_nvim_lsp').default_capabilities(capabilities)

-- Ensure the servers above are installed
local mason_lspconfig = require 'mason-lspconfig'
mason_lspconfig.setup {
    ensure_installed = vim.tbl_keys(servers),
}

mason_lspconfig.setup_handlers {
    function(server_name)
        require('lspconfig')[server_name].setup {
            capabilities = capabilities,
            on_attach = on_attach,
            settings = servers[server_name],
            filetypes = (servers[server_name] or {}).filetypes,
        }
    end,
}

-- Configure nvim-cmp
-- See `:help cmp`
local cmp = require 'cmp'
local luasnip = require 'luasnip'
require('luasnip.loaders.from_vscode').lazy_load()
luasnip.config.setup {}

cmp.setup {
    snippet = {
        expand = function(args)
            luasnip.lsp_expand(args.body)
        end,
    },
    mapping = cmp.mapping.preset.insert {
        ['<C-n>'] = cmp.mapping.select_next_item(),
        ['<C-p>'] = cmp.mapping.select_prev_item(),
        ['<C-d>'] = cmp.mapping.scroll_docs(-4),
        ['<C-f>'] = cmp.mapping.scroll_docs(4),
        ['<C-Space>'] = cmp.mapping.complete {},
        ['<CR>'] = cmp.mapping.confirm {
            behavior = cmp.ConfirmBehavior.Replace,
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
}
