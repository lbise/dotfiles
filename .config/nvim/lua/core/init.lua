local load_colorscheme = function()
    local colorscheme = require('core.settings').colorscheme
    vim.cmd.colorscheme(colorscheme)
end

local setup = function()
    require('core.tools')
    require('core.config')
    require('core.filetypes')

    -- Setup plugin manager if needed
    require('core.bootstrap').bootstrap()
    require('plugins')

    require('core.mappings')

    load_colorscheme()
end

setup()
