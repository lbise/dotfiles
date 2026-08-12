local M = {}

local environment_names = {
	DISPLAY = true,
	WAYLAND_DISPLAY = true,
	XAUTHORITY = true,
	SSH_CONNECTION = true,
	SSH_CLIENT = true,
	SSH_TTY = true,
	KRB5CCNAME = true,
}

local function sync_environment()
	if not vim.env.TMUX then
		return
	end

	local lines = vim.fn.systemlist({ "tmux", "show-environment" })
	if vim.v.shell_error ~= 0 then
		return
	end

	for _, line in ipairs(lines) do
		local name, value = line:match("^([A-Z0-9_]+)=(.*)$")
		if name and environment_names[name] then
			vim.env[name] = value
		else
			local unset_name = line:match("^-([A-Z0-9_]+)$")
			if unset_name and environment_names[unset_name] then
				vim.env[unset_name] = nil
			end
		end
	end
end

function M.setup()
	if not vim.env.TMUX then
		return
	end

	-- Neovim otherwise prefers xclip when DISPLAY is set. X11 forwarding gives
	-- that provider a connection-specific display which goes stale on reconnect.
	-- The tmux provider targets the active client and lets tmux emit OSC 52.
	vim.g.clipboard = "tmux"

	sync_environment()

	local group = vim.api.nvim_create_augroup("TmuxEnvironment", { clear = true })
	vim.api.nvim_create_autocmd("FocusGained", {
		group = group,
		callback = sync_environment,
		desc = "Refresh connection-specific environment variables from tmux",
	})

	vim.api.nvim_create_user_command("TmuxRefreshEnvironment", sync_environment, {
		desc = "Refresh connection-specific environment variables from tmux",
	})
end

return M
