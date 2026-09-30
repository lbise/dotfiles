-- Live list of Hyprland keybindings, built from `hyprctl binds -j` on every open.
-- Selecting a row runs the same dispatcher the key would. Reached from Learn > Keybindings.
Name = "keybindings"
Parent = "learn"
NamePretty = "Keybindings"
Icon = "input-keyboard-symbolic"
Action = "lua:Run"
HideFromProviderlist = true
Description = "Hyprland keybindings"

local MODS = { { 64, "SUPER" }, { 1, "SHIFT" }, { 4, "CTRL" }, { 8, "ALT" } }
local DIRECTIONS = { l = "left", r = "right", u = "up", d = "down" }

-- Lua 5.1 has no bit operators.
local function has(mask, bit)
    return math.floor(mask / bit) % 2 == 1
end

local function shell_quote(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

local function combo(bind)
    local parts = {}
    for _, mod in ipairs(MODS) do
        if has(bind.modmask, mod[1]) then
            table.insert(parts, mod[2])
        end
    end
    local key = bind.key ~= "" and bind.key or ("code:" .. bind.keycode)
    table.insert(parts, key)
    return table.concat(parts, " + ")
end

-- Binds declared with `bindd` carry a description; describe the rest from the dispatcher.
local function describe(bind)
    if bind.description ~= "" then
        return bind.description
    end
    local d, arg = bind.dispatcher, bind.arg
    if d == "exec" then
        return (arg:gsub("^uwsm%-app %-%- ", ""))
    elseif d == "workspace" then
        return "Workspace " .. arg
    elseif d == "movetoworkspace" then
        return "Move window to workspace " .. arg
    elseif d == "movefocus" then
        return "Focus " .. (DIRECTIONS[arg] or arg)
    elseif d == "killactive" then
        return "Close window"
    end
    return (d .. " " .. arg):gsub("%s+$", "")
end

function GetEntries()
    local entries = {}
    local handle = io.popen("hyprctl binds -j 2>/dev/null")
    if not handle then
        return entries
    end
    local output = handle:read("*a")
    handle:close()

    local ok, binds = pcall(jsonDecode, output)
    if not ok or type(binds) ~= "table" then
        return entries
    end

    -- Numbered workspace binds (SUPER + 1..0) collapse into one row per modifier set.
    local groups, order = {}, {}
    for _, bind in ipairs(binds) do
        if not bind.mouse then
            local numbered = (bind.dispatcher == "workspace" or bind.dispatcher == "movetoworkspace")
                and bind.arg:match("^%d+$")
            if numbered then
                local id = bind.dispatcher .. ":" .. bind.modmask
                if not groups[id] then
                    groups[id] = {}
                    table.insert(order, id)
                end
                table.insert(groups[id], bind)
            else
                table.insert(entries, {
                    Text = string.format("%-22s %s", combo(bind), describe(bind)),
                    Value = bind.dispatcher .. "\t" .. bind.arg,
                    Icon = "input-keyboard-symbolic",
                })
            end
        end
    end

    for _, id in ipairs(order) do
        local group = groups[id]
        table.sort(group, function(a, b) return tonumber(a.arg) < tonumber(b.arg) end)
        local first, last = group[1], group[#group]
        local range = { modmask = first.modmask, keycode = 0, key = first.key .. "-" .. last.key }
        table.insert(entries, {
            Text = string.format("%-22s %s", combo(range), describe(first):gsub("%d+$", first.arg .. "-" .. last.arg)),
            Value = "",
            Icon = "input-keyboard-symbolic",
        })
    end
    return entries
end

function Run(value, args, query)
    local dispatcher, arg = value:match("^([^\t]*)\t(.*)$")
    if not dispatcher then
        return
    end
    os.execute("sleep 0.2; hyprctl dispatch " .. shell_quote(dispatcher) .. " " .. shell_quote(arg))
end
