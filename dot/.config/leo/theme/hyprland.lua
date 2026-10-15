-- Generated from palette.json by system-theme-apply.py. Do not edit by hand:
-- change ~/.config/leo/theme/palette.json and run system-theme-apply.py.
-- Colour formats: https://wiki.hypr.land/Configuring/Basics/Variables/

-- Window borders use the rule colour, not the accent.
local active_border = "rgb(3B404E)"
local inactive_border = "rgba(3B404E80)"

hl.config({
    general = { col = { active_border = active_border, inactive_border = inactive_border } },
    group = { col = { border_active = active_border } },
})
