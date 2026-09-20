-- Run from the repository root:
-- nvim --clean --headless -l scripts/tests/test-nvim-herdr-clipboard.lua
local config = "dot/.config/nvim/lua/core/config.lua"

local function configure(herdr, tmux, provider)
    vim.env.HERDR_PANE_ID = herdr
    vim.env.TMUX = tmux
    vim.g.clipboard = provider
    dofile(config)
    vim.wait(100, function()
        return vim.o.clipboard == "unnamedplus"
    end)
end

configure(nil, nil, nil)
assert(vim.g.clipboard == nil, "Keep automatic detection outside Herdr")

configure("test-pane", "test-tmux", "tmux")
assert(vim.g.clipboard == "tmux", "Keep the existing tmux provider")

-- No desktop display or tmux is available in a remote Herdr pane.
vim.env.DISPLAY = nil
vim.env.WAYLAND_DISPLAY = nil
configure("test-pane", nil, nil)

-- Capture terminal output, but exercise the real yank and clipboard provider.
local output = {}
vim.api.nvim_ui_send = function(data)
    output[#output + 1] = data
end
vim.api.nvim_buf_set_lines(0, 0, -1, false, { "herdr-clipboard-test" })
vim.cmd("normal! gg0yy")
local expected = "\027]52;c;" .. vim.base64.encode("herdr-clipboard-test\n") .. "\027\\"
assert(table.concat(output):find(expected, 1, true), "Unexpected clipboard output: " .. vim.inspect(output))
print("PASS: Herdr yank emits OSC 52; other provider choices are preserved")
