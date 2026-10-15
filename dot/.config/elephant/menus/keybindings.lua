-- Live list of Hyprland keybindings, built from `hyprctl binds -j` on every open.
-- Selecting a row runs the same dispatcher the key would, looked up by description in the
-- keybind_actions table that hyprland.lua fills. Reached from Learn > Keybindings.
Name = "keybindings"
Parent = "learn"
NamePretty = "Keybindings"
Icon = "input-keyboard-symbolic"
Action = "lua:Run"
HideFromProviderlist = true
Description = "Hyprland keybindings"

local MODS = { { 64, "SUPER" }, { 1, "SHIFT" }, { 4, "CTRL" }, { 8, "ALT" } }

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

-- Workspace binds are described "Workspace N" / "Move window to workspace N" in hyprland.lua.
local function numbered(bind)
    local prefix, number = bind.description:match("^(.-)(%d+)$")
    if prefix == "Workspace " or prefix == "Move window to workspace " then
        return prefix, tonumber(number)
    end
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
        if not bind.mouse and bind.description ~= "" then
            local prefix, number = numbered(bind)
            if prefix then
                local id = prefix .. bind.modmask
                if not groups[id] then
                    groups[id] = { prefix = prefix, binds = {} }
                    table.insert(order, id)
                end
                table.insert(groups[id].binds, { bind = bind, number = number })
            else
                table.insert(entries, {
                    Text = string.format("%-22s %s", combo(bind), bind.description),
                    Value = bind.description,
                    Icon = "input-keyboard-symbolic",
                })
            end
        end
    end

    for _, id in ipairs(order) do
        local group = groups[id]
        table.sort(group.binds, function(a, b) return a.number < b.number end)
        local first, last = group.binds[1], group.binds[#group.binds]
        local range = { modmask = first.bind.modmask, keycode = 0, key = first.bind.key .. "-" .. last.bind.key }
        table.insert(entries, {
            Text = string.format("%-22s %s%d-%d", combo(range), group.prefix, first.number, last.number),
            Value = "",
            Icon = "input-keyboard-symbolic",
        })
    end
    return entries
end

function Run(value, args, query)
    if value == "" then
        return
    end
    local action = string.format("keybind_actions[%q]", value)
    os.execute("sleep 0.2; hyprctl dispatch " .. shell_quote(action))
end
