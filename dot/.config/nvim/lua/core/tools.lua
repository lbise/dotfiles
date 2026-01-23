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

function tools.dump_table(o)
	return vim.inspect(o)
	--if type(o) == 'table' then
	--    local s = '{ '
	--    for k,v in pairs(o) do
	--        if type(k) ~= 'number' then k = '"'..k..'"' end
	--        s = s .. '['..k..'] = ' .. tools.dump_table(v) .. ','
	--    end
	--    return s .. '} '
	--else
	--    return tostring(o)
	--end
end

function tools.dump_lsp_config()
	return vim.inspect(vim.lsp.get_active_clients())
end

function tools.merge_table(tbl1, tbl2)
	for _, v in ipairs(tbl2) do
		table.insert(tbl1, v)
	end
	return tbl1
end

-- Stolen from https://github.com/timoclsn/dotfiles/blob/a200117f8a2d9f0577dbb3e8d09735842e56af5a/nvim/lua/utils/path_utils.lua#L27
local function detect_project_root(_)
	return vim.fn.getcwd()
end

function tools.relative_to_root(full_path)
	if not full_path or full_path == "" then
		return full_path or ""
	end

	local root = detect_project_root(full_path)

	if root:sub(-1) ~= "/" then
		root = root .. "/"
	end

	local is_prefix = vim.startswith(full_path, root)

	if not is_prefix then
		return full_path
	end

	return full_path:sub(#root + 1)
end

function tools.copy_relative_path(full_path, opts)
	opts = opts or {}

	local rel = tools.relative_to_root(full_path)

	vim.fn.setreg("+", rel)
	vim.fn.setreg('"', rel)

	if not opts.silent then
		print("Copied path: " .. rel)
	end

	return rel
end

-- Convert glob -> Lua pattern
function tools.glob_to_lua_pattern(glob)
	-- Escape Lua pattern magic chars
	local pattern = glob
		:gsub("([%^%$%(%)%%%.%[%]%+%-%?])", "%%%1")
		-- ** matches any number of directories (use placeholder to avoid double replacement)
		:gsub("%*%*", "\1DOUBLESTAR\1")
		-- * matches anything except path separator
		:gsub("%*", "[^/]*")
		-- Replace placeholder with .* for **
		:gsub("\1DOUBLESTAR\1", ".*")

	return pattern
end

return tools
