local min_version = '0.9.2'
local expected_min_version = vim.version.parse(min_version)
local actual_version = vim.version()

if vim.version.lt(actual_version, expected_min_version) then
    local msg = string.format("neovim version %s.%s.%s not supported. Use at least %s.", vim.version().major, vim.version().minor, vim.version().patch, min_version)
    error(msg)
end

require('core')
