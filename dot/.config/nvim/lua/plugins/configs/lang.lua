---@generic T
---@param super T[]
---@param sub T[]
---@return T[]
function table.except(super, sub)
	local result = {}
	local seenInResult = {}
	local lookupSub = {}

	for _, value in ipairs(sub) do
		lookupSub[value] = true
	end

	for _, value in ipairs(super) do
		if not lookupSub[value] and not seenInResult[value] then
			table.insert(result, value)
			seenInResult[value] = true
		end
	end

	return result
end

local config = {
	{
		"nvim-treesitter/nvim-treesitter",
		branch = "main",
		-- Always load treesitter
		lazy = false,
		cmd = { "TSInstall", "TSBufEnable", "TSBufDisable", "TSModuleInfo" },
		build = ":TSUpdate",
		config = function()
			local treesitter = require("nvim-treesitter")
			treesitter.setup({})
			local ensure_installed = require("core.settings").lsp.treesitter_installed
			treesitter.install(table.except(ensure_installed, treesitter.get_installed()))
			-- Automatically enable highlighting
			vim.api.nvim_create_autocmd("FileType", {
				callback = function(args)
					if vim.list_contains(treesitter.get_installed(), vim.treesitter.language.get_lang(args.match)) then
						vim.treesitter.start(args.buf)
					end
				end,
			})
		end,
	},
	{
		"nvim-treesitter/nvim-treesitter-textobjects",
		branch = "main",
		dependencies = {
			"nvim-treesitter/nvim-treesitter",
		},
		config = function()
			require("nvim-treesitter-textobjects").setup({
				select = {
					lookahead = true,
					selection_modes = {
						["@parameter.outer"] = "v",
						["@function.outer"] = "V",
						["@class.outer"] = "V",
					},
					include_surrounding_whitespace = true,
				},
				move = {
					set_jumps = false,
				},
			})
			do -- move
				vim.keymap.set({ "n", "x", "o" }, "]]", function()
					require("nvim-treesitter-textobjects.move").goto_next_start("@function.outer", "textobjects")
					vim.cmd("normal! zz")
				end)
				vim.keymap.set({ "n", "x", "o" }, "[[", function()
					require("nvim-treesitter-textobjects.move").goto_previous_start("@function.outer", "textobjects")
					vim.cmd("normal! zz")
				end)
			end
		end,
	},
}

return config
