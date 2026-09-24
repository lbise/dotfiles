-- Clipboard provider selection. See docs/clipboard.md.
--
-- Local sessions use the machine's clipboard tool. SSH sessions copy through
-- the terminal with OSC 52; paste reads the terminal clipboard only if the
-- terminal answers OSC 52 reads (e.g. Ghostty with clipboard-read = allow).
-- Otherwise `p` pastes the last yank and the terminal's own paste key
-- (Ctrl+Shift+V) is the way to paste from the system clipboard.
local M = {}

local READ_TIMEOUT_MS = 1000

local function osc52_provider()
	local osc52 = require("vim.ui.clipboard.osc52")
	local cache = {}
	local read_supported = true

	local function copy(reg)
		local send = osc52.copy(reg)
		return function(lines, regtype)
			cache[reg] = { lines, regtype }
			send(lines)
		end
	end

	local function read(reg)
		local contents
		local id = vim.api.nvim_create_autocmd("TermResponse", {
			callback = function(ev)
				local encoded = ev.data.sequence:match("\027%]52;%w?;([A-Za-z0-9+/=]*)")
				if encoded then
					contents = vim.base64.decode(encoded)
					return true
				end
			end,
		})
		vim.api.nvim_ui_send(string.format("\027]52;%s;?\027\\", reg == "+" and "c" or "p"))
		vim.wait(READ_TIMEOUT_MS, function()
			return contents ~= nil
		end)
		if contents == nil then
			pcall(vim.api.nvim_del_autocmd, id)
		end
		return contents
	end

	local function paste(reg)
		return function()
			local cached = cache[reg] or { {}, "v" }
			if not read_supported then
				return cached
			end
			local contents = read(reg)
			if contents == nil then
				-- The terminal ignores OSC 52 reads; do not ask again this session.
				read_supported = false
				return cached
			end
			-- Keep the register type (e.g. linewise) when the text came from us.
			if contents == table.concat(cached[1], "\n") then
				return cached
			end
			return vim.split(contents, "\n")
		end
	end

	return {
		name = "osc52",
		copy = { ["+"] = copy("+"), ["*"] = copy("*") },
		paste = { ["+"] = paste("+"), ["*"] = paste("*") },
	}
end

-- WSLg sets WAYLAND_DISPLAY, and Neovim would pick wl-copy if it is installed.
-- Talk to the Windows clipboard directly instead.
local function wsl_provider()
	if vim.fn.executable("win32yank.exe") == 1 then
		return "win32yank"
	end
	-- Slower fallback without win32yank.exe; install it for faster, UTF-8-safe paste.
	return {
		name = "wsl-clip",
		copy = { ["+"] = { "clip.exe" }, ["*"] = { "clip.exe" } },
		paste = {
			["+"] = { "powershell.exe", "-NoLogo", "-NoProfile", "-Command", "[Console]::Out.Write((Get-Clipboard -Raw) -replace \"`r\", \"\")" },
			["*"] = { "powershell.exe", "-NoLogo", "-NoProfile", "-Command", "[Console]::Out.Write((Get-Clipboard -Raw) -replace \"`r\", \"\")" },
		},
	}
end

local function is_ssh()
	return vim.env.SSH_CONNECTION ~= nil or vim.env.SSH_CLIENT ~= nil or vim.env.SSH_TTY ~= nil
end

function M.setup()
	if vim.g.clipboard ~= nil then
		-- core.tmux already chose the tmux provider, or the user set one.
		return
	end
	if is_ssh() then
		-- Also avoids xclip over X forwarding, whose DISPLAY goes stale on reconnect.
		vim.g.clipboard = osc52_provider()
	elseif vim.fn.has("wsl") == 1 then
		vim.g.clipboard = wsl_provider()
	end
	-- Otherwise keep Neovim's detection (wl-copy on the Arch desktop).
end

return M
