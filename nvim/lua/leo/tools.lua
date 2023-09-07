local tools = {}

function tools.is_wsl()
	local release_name = vim.loop.os_uname().release
	if vim.fn.match(release_name, "microsoft") == -1 then
		return false
	else
		return true
	end
end

function tools.is_work()
	if vim.env.USER == "13lbise" then
		return true
	else
		return false
	end
end

return tools
