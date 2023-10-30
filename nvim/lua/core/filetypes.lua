local set_ft_config = function(size)
    vim.opt.shiftwidth = size
    vim.opt.softtabstop = size
    vim.opt.expandtab = true
end

-- All languages - 4 spaces soft tabs + expand
vim.api.nvim_create_autocmd('FileType', {
    callback = function()
        set_ft_config(4)
    end,
    pattern = '*',
})

vim.api.nvim_create_autocmd('FileType', {
    callback = function()
        set_ft_config(2)
    end,
    pattern = 'html',
})

vim.api.nvim_create_autocmd('FileType', {
    callback = function()
        set_ft_config(2)
    end,
    pattern = 'json',
})

vim.api.nvim_create_autocmd('FileType', {
    callback = function()
        set_ft_config(2)
    end,
    pattern = 'yaml',
})

vim.api.nvim_create_autocmd('FileType', {
    callback = function()
        set_ft_config(2)
    end,
    pattern = 'sshconfig',
})

vim.api.nvim_create_autocmd('FileType', {
    callback = function()
        vim.opt.spell = true
    end,
    pattern = 'gitcommit',
})

vim.api.nvim_create_autocmd('FileType', {
    callback = function()
        vim.opt.shiftwidth = 8
        vim.opt.softtabstop = 0
        vim.opt.expandtab = false
    end,
    pattern = 'make',
})

vim.api.nvim_create_autocmd({ 'BufRead', 'BufNewFile' }, {
    callback = function()
        vim.opt.filetype = 'c'
    end,
    pattern = '*.unity',
})
