require('leo')

-- Setup system
require('leo.bootstrap').bootstrap()

-- Once plugin manager is setup require plugins
require('leo.plugins')

-- After plugins are loaded, apply mappings
require("leo.remap")
