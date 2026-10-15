-- Hyprland config. Lua replaced hyprlang in 0.55; .conf support ends in 0.57.
-- https://wiki.hypr.land/Configuring/Start/
-- API stubs for the LSP: /usr/share/hypr/stubs
-- Check for errors without reloading: Hyprland --verify-config -c ~/.config/hypr/hyprland.lua

local home = os.getenv("HOME")

------------------
---- MONITORS ----
------------------

-- https://wiki.hypr.land/Configuring/Basics/Monitors/
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = "auto" })
hl.monitor({
    output   = "desc:LG Electronics LG ULTRAGEAR 110MACENHU27",
    mode     = "2560x1440@164.96Hz",
    position = "0x0",
    scale    = 1,
    cm       = "srgb",
})

-------------------
---- AUTOSTART ----
-------------------

hl.on("hyprland.start", function()
    -- Fixes AltGr combos in some apps:
    -- https://github.com/ghostty-org/ghostty/issues/2981
    -- https://github.com/ghostty-org/ghostty/discussions/8899
    hl.exec_cmd("uwsm-app -- fcitx5")
    hl.exec_cmd("uwsm-app -- mako")
    hl.exec_cmd("uwsm-app -- swaybg -i ~/.config/leo/wallpaper/current.jpg -m fill")
    hl.exec_cmd("uwsm-app -- hypridle")
    hl.exec_cmd("systemctl --user start leo-quickshell.service")
    hl.exec_cmd("uwsm-app -- walker --gapplication-service")
end)

-------------------------------
---- ENVIRONMENT VARIABLES ----
-------------------------------

-- https://wiki.hypr.land/Configuring/Advanced-and-Cool/Environment-variables/
-- Input method variables live in ~/.config/environment.d/fcitx5.conf.

hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")

-- Prefer Wayland everywhere
hl.env("GDK_BACKEND", "wayland,x11,*")
hl.env("QT_QPA_PLATFORM", "wayland;xcb")
hl.env("QT_STYLE_OVERRIDE", "kvantum")
hl.env("SDL_VIDEODRIVER", "wayland,x11")
hl.env("MOZ_ENABLE_WAYLAND", "1")
hl.env("ELECTRON_OZONE_PLATFORM_HINT", "wayland")
hl.env("OZONE_PLATFORM", "wayland")
hl.env("XDG_SESSION_TYPE", "wayland")

-- Better screen sharing (Google Meet, Discord, etc.)
hl.env("XDG_CURRENT_DESKTOP", "Hyprland")
hl.env("XDG_SESSION_DESKTOP", "Hyprland")

hl.config({
    xwayland  = { force_zero_scaling = true },
    -- Don't show update news on first launch
    ecosystem = { no_update_news = true },
})

-----------------------
---- LOOK AND FEEL ----
-----------------------

-- https://wiki.hypr.land/Configuring/Basics/Variables/

-- Border colours, generated from palette.json by system-theme-apply.py.
-- pcall keeps the rest of the config (binds included) loading if the file is missing.
local theme_ok, theme_err = pcall(require, home .. "/.config/leo/theme/hyprland.lua")
if not theme_ok then
    hl.notification.create({ text = "Theme not loaded: " .. tostring(theme_err), timeout = 10000 })
end

hl.config({
    general = {
        gaps_in     = 5,
        gaps_out    = 10,
        border_size = 2,

        -- true enables resizing windows by dragging borders and gaps
        resize_on_border = false,

        -- See https://wiki.hypr.land/Configuring/Advanced-and-Cool/Tearing/ before turning this on
        allow_tearing = false,

        layout = "dwindle",
    },

    decoration = {
        rounding       = 8,
        rounding_power = 2,

        active_opacity   = 1.0,
        inactive_opacity = 1.0,

        shadow = {
            enabled      = true,
            range        = 4,
            render_power = 3,
            color        = "rgba(1a1a1aee)",
        },

        blur = {
            enabled  = true,
            size     = 3,
            passes   = 1,
            vibrancy = 0.1696,
        },
    },

    animations = { enabled = true },

    -- https://wiki.hypr.land/Configuring/Layouts/Dwindle-Layout/
    dwindle = { preserve_split = true },

    -- https://wiki.hypr.land/Configuring/Layouts/Master-Layout/
    master = { new_status = "master" },

    misc = {
        disable_hyprland_logo    = true,
        disable_splash_rendering = true,
        focus_on_activate        = true,
        anr_missed_pings         = 3,
    },
})

-- https://wiki.hypr.land/Configuring/Advanced-and-Cool/Animations/
hl.curve("easeOutQuint",   { type = "bezier", points = { {0.23, 1},    {0.32, 1} } })
hl.curve("easeInOutCubic", { type = "bezier", points = { {0.65, 0.05}, {0.36, 1} } })
hl.curve("linear",         { type = "bezier", points = { {0, 0},       {1, 1}    } })
hl.curve("almostLinear",   { type = "bezier", points = { {0.5, 0.5},   {0.75, 1} } })
hl.curve("quick",          { type = "bezier", points = { {0.15, 0},    {0.1, 1}  } })

hl.animation({ leaf = "global",        enabled = true, speed = 10,   bezier = "default" })
hl.animation({ leaf = "border",        enabled = true, speed = 5.39, bezier = "easeOutQuint" })
hl.animation({ leaf = "windows",       enabled = true, speed = 4.79, bezier = "easeOutQuint" })
hl.animation({ leaf = "windowsIn",     enabled = true, speed = 4.1,  bezier = "easeOutQuint", style = "popin 87%" })
hl.animation({ leaf = "windowsOut",    enabled = true, speed = 1.49, bezier = "linear",       style = "popin 87%" })
hl.animation({ leaf = "fadeIn",        enabled = true, speed = 1.73, bezier = "almostLinear" })
hl.animation({ leaf = "fadeOut",       enabled = true, speed = 1.46, bezier = "almostLinear" })
hl.animation({ leaf = "fade",          enabled = true, speed = 3.03, bezier = "quick" })
hl.animation({ leaf = "layers",        enabled = true, speed = 3.81, bezier = "easeOutQuint" })
hl.animation({ leaf = "layersIn",      enabled = true, speed = 4,    bezier = "easeOutQuint", style = "fade" })
hl.animation({ leaf = "layersOut",     enabled = true, speed = 1.5,  bezier = "linear",       style = "fade" })
hl.animation({ leaf = "fadeLayersIn",  enabled = true, speed = 1.79, bezier = "almostLinear" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 1.39, bezier = "almostLinear" })
hl.animation({ leaf = "workspaces",    enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesIn",  enabled = true, speed = 1.21, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "zoomFactor",    enabled = true, speed = 7,    bezier = "quick" })

---------------
---- INPUT ----
---------------

hl.config({
    input = {
        -- Keep the $LAYOUT list in hyprlock.conf in step with kb_layout.
        kb_layout  = "ch",
        kb_variant = "fr",
        kb_model   = "pc105",
        kb_options = "caps:escape",
        kb_rules   = "",

        -- Faster key repeat for more responsive held-key input
        repeat_rate  = 40,
        repeat_delay = 250,

        follow_mouse = 1,

        sensitivity = -0.9, -- -1.0 to 1.0, 0 means no modification

        touchpad = { natural_scroll = false },
    },
})

-- Dell laptop touchpad
hl.device({
    name                 = "dell0a20:00-0488:101a-touchpad",
    sensitivity          = 0.2,
    tap_to_click         = true,
    clickfinger_behavior = true,
})

hl.gesture({ fingers = 3, direction = "horizontal", action = "workspace" })

---------------------
---- KEYBINDINGS ----
---------------------

-- https://wiki.hypr.land/Configuring/Basics/Binds/
-- `hyprctl binds` only reports Lua binds as `__lua N`, so every key bind gets a
-- description and its dispatcher is kept here by description. The Elephant
-- keybindings menu replays a bind with: hyprctl dispatch 'keybind_actions["Browser"]'
keybind_actions = {}

local function bind(keys, dispatcher, description, opts)
    opts = opts or {}
    opts.description = description
    keybind_actions[description] = dispatcher
    hl.bind(keys, dispatcher, opts)
end

local function exec(cmd)
    return hl.dsp.exec_cmd(cmd)
end

-- Action menus shrink to fit their entries (walker's default list has a tall fixed minimum).
local menu = "walker --minheight 1 --maxheight 630"

bind("SUPER + B",      exec("uwsm-app -- zen-browser"),            "Browser")
bind("SUPER + return", exec("uwsm-app -- ghostty +new-window"),    "Terminal")
bind("SUPER + Q",      hl.dsp.window.close(),                      "Close window")
bind("SUPER + F",      exec("uwsm-app -- dolphin"),                "Files")
bind("SUPER + R",      exec("walker -m desktopapplications"),      "Apps")
bind("SUPER + SPACE",  exec(menu .. " -m menus:leo"),              "Menu")
bind("SUPER + N",      exec("uwsm-app -- nvim --embed"),           "Neovim")
bind("SUPER + ESCAPE", exec(menu .. " -m menus:power"),            "System menu")

-- Applications
bind("SUPER + SHIFT + A", exec('uwsm-app -- zen-browser --new-window "https://chatgpt.com"'), "ChatGPT")

-- Clipboard: Ctrl+C/V in apps, the terminal's own copy/paste chord in terminals,
-- so Ctrl+C never reaches a shell. No window target: the chord goes to whatever
-- has keyboard focus, layer-shell surfaces (Walker, Quickshell) included. The
-- explicit mods replace the held SUPER. Down and up are separate because
-- send_shortcut can leave the synthetic key stuck and repeating:
-- https://github.com/hyprwm/Hyprland/discussions/14099
local terminal_clipboard = {
    -- Ghostty's config maps these to its clipboard actions.
    ["com.mitchellh.ghostty"] = { copy = { "CTRL", "Insert" }, paste = { "SHIFT", "Insert" } },
    ["kitty"] = { copy = { "CTRL + SHIFT", "C" }, paste = { "CTRL + SHIFT", "V" } },
}
local app_clipboard = { copy = { "CTRL", "C" }, paste = { "CTRL", "V" }, cut = { "CTRL", "X" } }

local function send_chord(chord)
    local mods, key = chord[1], chord[2]
    hl.dispatch(hl.dsp.send_key_state({ mods = mods, key = key, state = "down" }))
    hl.timer(function()
        hl.dispatch(hl.dsp.send_key_state({ mods = mods, key = key, state = "up" }))
    end, { timeout = 50, type = "oneshot" })
end

local function clipboard(operation)
    return function()
        local window = hl.get_active_window()
        local terminal = window and (terminal_clipboard[window.class] or terminal_clipboard[window.initial_class])
        send_chord((terminal or app_clipboard)[operation] or app_clipboard[operation])
    end
end

bind("SUPER + C", clipboard("copy"),  "Universal copy")
bind("SUPER + V", clipboard("paste"), "Universal paste")
bind("SUPER + X", clipboard("cut"),   "Universal cut")
-- History selection copies only; use Super+V after the picker closes.
bind("SUPER + CTRL + V", exec("walker -m clipboard"), "Clipboard manager")

-- Screenshot
bind("PRINT",         exec("system-screenshot.sh"),        "Screenshot fullscreen")
bind("SHIFT + PRINT", exec("system-screenshot.sh region"), "Screenshot region")

-- Move focus with SUPER + hjkl
bind("SUPER + h", hl.dsp.focus({ direction = "left" }),  "Focus left")
bind("SUPER + l", hl.dsp.focus({ direction = "right" }), "Focus right")
bind("SUPER + k", hl.dsp.focus({ direction = "up" }),    "Focus up")
bind("SUPER + j", hl.dsp.focus({ direction = "down" }),  "Focus down")

-- SUPER + [0-9] switches workspace; SUPER + SHIFT + [0-9] moves the active window there.
-- The keybindings menu folds these into one row each by matching the descriptions.
for i = 1, 10 do
    local key = i % 10 -- workspace 10 is on key 0
    bind("SUPER + " .. key,         hl.dsp.focus({ workspace = i }),       "Workspace " .. i)
    bind("SUPER + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }), "Move window to workspace " .. i)
end

-- TAB between workspaces
bind("SUPER + TAB",         hl.dsp.focus({ workspace = "e+1" }),      "Next workspace")
bind("SUPER + SHIFT + TAB", hl.dsp.focus({ workspace = "e-1" }),      "Previous workspace")
bind("SUPER + CTRL + TAB",  hl.dsp.focus({ workspace = "previous" }), "Former workspace")

-- Move/resize windows with SUPER + LMB/RMB and dragging
hl.bind("SUPER + mouse:272", hl.dsp.window.drag(),   { mouse = true })
hl.bind("SUPER + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- Laptop multimedia keys for volume and LCD brightness (work on the lock screen, repeat when held)
local function held(keys, cmd, description)
    bind(keys, exec(cmd), description, { locked = true, repeating = true })
end
held("XF86AudioRaiseVolume",  "wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+", "Volume up")
held("XF86AudioLowerVolume",  "wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-",      "Volume down")
held("XF86AudioMute",         "wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle",     "Mute")
held("XF86AudioMicMute",      "wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle",   "Mute microphone")
held("XF86MonBrightnessUp",   "brightnessctl -e4 -n2 set 5%+",                  "Brightness up")
held("XF86MonBrightnessDown", "brightnessctl -e4 -n2 set 5%-",                  "Brightness down")

-- Requires playerctl
local function media(keys, cmd, description)
    bind(keys, exec(cmd), description, { locked = true })
end
media("XF86AudioNext",  "playerctl next",       "Next track")
media("XF86AudioPause", "playerctl play-pause", "Play/pause")
media("XF86AudioPlay",  "playerctl play-pause", "Play/pause")
media("XF86AudioPrev",  "playerctl previous",   "Previous track")

--------------------------------
---- WINDOWS AND WORKSPACES ----
--------------------------------

-- https://wiki.hypr.land/Configuring/Basics/Window-Rules/

hl.window_rule({
    name           = "suppress-maximize-events",
    match          = { class = ".*" },
    suppress_event = "maximize",
})

-- Floating TUIs launched from the launcher menus (system-exec-float.sh), e.g. package install.
hl.window_rule({
    name   = "leo-menu-float",
    match  = { class = "^org\\.leo\\.menu$" },
    float  = true,
    size   = { 1100, 700 },
    center = true,
})

-- Fix some dragging issues with XWayland
hl.window_rule({
    name  = "fix-xwayland-drags",
    match = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})

-- HyprMod managed settings
require("hyprland-gui")
