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
    if type(o) == 'table' then
        local s = '{ '
        for k,v in pairs(o) do
            if type(k) ~= 'number' then k = '"'..k..'"' end
            s = s .. '['..k..'] = ' .. tools.dump_table(v) .. ','
        end
        return s .. '} '
    else
        return tostring(o)
    end
end

return tools
