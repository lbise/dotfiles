-- Run from the repository root:
-- nvim --clean --headless -l scripts/tests/test-nvim-clipboard.lua
package.path = "dot/.config/nvim/lua/?.lua;" .. package.path

local function setup(env, provider)
	for _, name in ipairs({ "SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY" }) do
		vim.env[name] = env[name]
	end
	vim.g.clipboard = provider
	package.loaded["core.clipboard"] = nil
	require("core.clipboard").setup()
end

-- Local, not WSL: keep Neovim's detection (wl-copy on the Arch desktop).
if vim.fn.has("wsl") == 0 then
	setup({}, nil)
	assert(vim.g.clipboard == nil, "Keep automatic detection for local sessions")
end

-- tmux already chose its provider.
setup({ SSH_CONNECTION = "1 2 3 4" }, "tmux")
assert(vim.g.clipboard == "tmux", "Keep the tmux provider")

-- SSH: copy emits OSC 52.
setup({ SSH_CONNECTION = "1 2 3 4" }, nil)
assert(type(vim.g.clipboard) == "table" and vim.g.clipboard.name == "osc52", "Use OSC 52 over SSH")
vim.o.clipboard = "unnamedplus"

local output = {}
vim.api.nvim_ui_send = function(data)
	output[#output + 1] = data
end
vim.api.nvim_buf_set_lines(0, 0, -1, false, { "clipboard-test" })
vim.cmd("normal! gg0yy")
local expected = "\027]52;c;" .. vim.base64.encode("clipboard-test\n") .. "\027\\"
assert(table.concat(output):find(expected, 1, true), "Unexpected clipboard output: " .. vim.inspect(output))

-- The terminal never answers the OSC 52 read (like Windows Terminal): paste
-- falls back to the last yank, and later pastes skip the read.
local start = vim.uv.hrtime()
vim.cmd("normal! p")
vim.cmd("normal! p")
local elapsed_ms = (vim.uv.hrtime() - start) / 1e6
assert(elapsed_ms < 2000, "Paste waited too long: " .. elapsed_ms .. "ms")
local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
assert(#lines == 3 and lines[3] == "clipboard-test", "Unexpected paste: " .. vim.inspect(lines))

print("PASS: local keeps detection, tmux is preserved, SSH copies via OSC 52 and paste falls back to the last yank")
