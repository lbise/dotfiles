-- Wallpaper picker over ~/.config/leo/wallpaper. Thumbnails come from the images
-- themselves. Selecting one runs set_wallpaper.sh from the same folder. Reached from
-- Style > Background.
Name = "wallpaper"
Parent = "style"
NamePretty = "Background"
Icon = "preferences-desktop-wallpaper-symbolic"
Action = "lua:Set"
HideFromProviderlist = true
Description = "Desktop wallpapers"

local DIR = os.getenv("HOME") .. "/.config/leo/wallpaper"

local function shell_quote(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

function GetEntries()
    local entries = {}
    local handle = io.popen("ls -1 " .. shell_quote(DIR) .. " 2>/dev/null")
    if not handle then
        return entries
    end
    for name in handle:lines() do
        -- current.jpg is the active copy, not a choice.
        if name ~= "current.jpg" and name:lower():match("%.[jp][pn]e?g$") then
            local text = name:gsub("%.[^.]+$", ""):gsub("-%d+x%d+$", ""):gsub("[-_]+", " ")
            table.insert(entries, {
                Text = text,
                Value = DIR .. "/" .. name,
                Icon = DIR .. "/" .. name,
            })
        end
    end
    handle:close()
    return entries
end

function Set(value, args, query)
    os.execute("sleep 0.2; " .. shell_quote(DIR .. "/set_wallpaper.sh") .. " " .. shell_quote(value))
end
