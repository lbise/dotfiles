local config = {
	{
		"zbirenbaum/copilot.lua",
		cmd = "Copilot",
		event = "InsertEnter",
		config = function()
			if os.getenv("USER") == "13lbise" then
				vim.g.copilot_proxy = os.getenv("http_proxy")
				if vim.g.copilot_proxy == nil then
					vim.notify("No proxy set for copilot. http_proxy not set in env", vim.log.levels.ERROR)
				end
			end
			require("copilot").setup({
				suggestion = { enabled = false, auto_trigger = true },
				panel = { enabled = false },
				filetypes = {
					python = true,
					c = true,
					markdown = true,
					help = true,
					--["*"] = false, -- disable for all other filetypes and ignore default `filetypes`
				},
			})
		end,
	},
	{
		"CopilotC-Nvim/CopilotChat.nvim",
		dependencies = {
			{ "zbirenbaum/copilot.lua" },
			{ "nvim-lua/plenary.nvim", branch = "master" }, -- for curl, log and async functions
		},
		build = "make tiktoken", -- Only on MacOS or Linux
		opts = {
			-- See Configuration section for options
			proxy = os.getenv("http_proxy"),
		},
		-- See Commands section for default commands if you want to lazy load on them
	},
	{
		"olimorris/codecompanion.nvim",
		dependencies = {
			"nvim-lua/plenary.nvim",
			"nvim-treesitter/nvim-treesitter",
		},
		config = function()
			local provider = "copilot"
			if os.getenv("USER") == "13lbise" then
				provider = "azure_openai"
			end
			require("codecompanion").setup({
				--opts = {
				--	log_level = "TRACE",
				--},
				adapters = {
					opts = {
						allow_insecure = true,
						proxy = os.getenv("http_proxy"),
					},
					azure_openai = function()
						return require("codecompanion.adapters").extend("azure_openai", {
							env = {
								endpoint = "https://soc-ai0-sdc.openai.azure.com",
								api_version = "2024-12-01-preview",
							},
							schema = {
								model = {
									-- Deployment name
									--default = "gpt-4o",
									default = "o3-mini",
									choices = {
										"gpt-4o",
										-- opts can be stream and can_reason
										["o3-mini"] = { opts = { can_reason = true, stream = false } },
									},
								},
							},
						})
					end,
				},
				strategies = {
					chat = {
						adapter = provider,
					},
					inline = {
						adapter = provider,
					},
					agent = {
						adapter = provider,
					},
				},
				display = {
					chat = {
						window = {
							layout = "vertical", -- float|vertical|horizontal|buffer
							width = 0.3,
						},
					},
					diff = {
						enabled = true,
						close_chat_at = 240, -- Close an open chat buffer if the total columns of your display are less than...
						layout = "vertical", -- vertical|horizontal split for default provider
						--opts = { "internal", "filler", "closeoff", "algorithm:patience", "followwrap", "linematch:120" },
						provider = "mini_diff", -- default|mini_diff
					},
				},
			})
		end,
		init = function()
			--vim.keymap.set({ "n", "v" }, "<C-a>", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
			vim.keymap.set(
				{ "n", "v" },
				"<leader>d",
				"<cmd>CodeCompanionChat Toggle<cr>",
				{ noremap = true, silent = true }
			)
			vim.keymap.set("v", "ga", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })

			-- Expand 'cc' into 'CodeCompanion' in the command line
			vim.cmd([[cab cc CodeCompanion]])
		end,
	},
	--{
	--	"yetone/avante.nvim",
	--	event = "VeryLazy",
	--	version = false, -- Never set this value to "*"! Never!
	--    init = function()
	--        --local api_key = os.getenv("AZURE_OPENAI_API_KEY")
	--        --if api_key then
	--        --    vim.env.AZURE_OPENAI_API_KEY = api_key
	--        --else
	--        --    vim.notify('AZURE_OPENAI_API_KEY not set, cannot use Avante', vim.log.levels.ERROR)
	--        --end

	--        --if vim.fn.exists("$22AZURE_OPENAI_API_KEY") then
	--        --    caca
	--        --    local api_key = vim.fn.expand("AZURE_OPENAI_API_KEY")
	--        --else
	--        --    caca
	--        --    vim.notify('AZURE_OPENAI_API_KEY not set, cannot use Avante', vim.log.levels.ERROR)
	--        --end
	--    end,
	--	opts = {
	--		-- add any opts here
	--		-- for example
	--		--provider = "copilot",
	--		provider = "azure",
	--		--provider = "openai",
	--		copilot = {
	--            endpoint = "https://api.githubcopilot.com",
	--            model = "gpt-4o-2024-08-06",
	--            --proxy = "http://ch03rdproxy.corp.ads:3129", -- [protocol://]host[:port] Use this proxy
	--            proxy = nil, -- [protocol://]host[:port] Use this proxy
	--            allow_insecure = false, -- Allow insecure server connections
	--            timeout = 30000, -- Timeout in milliseconds
	--            temperature = 0,
	--            max_tokens = 20480,
	--		},
	--		azure = {
	--			endpoint = "https://soc-ai0-sdc.openai.azure.com",
	--            api_version = '2025-03-01-preview',
	--            api_key_name = 'AZURE_OPENAI_API_KEY',
	--            deployment = "gpt-4o",
	--			timeout = 30000, -- Timeout in milliseconds, increase this for reasoning models
	--			temperature = 0,
	--			max_tokens = 8192, -- Increase this to include reasoning tokens (for reasoning models)
	--			--reasoning_effort = "medium", -- low|medium|high, only used for reasoning models
	--		},
	--		openai = {
	--			endpoint = "https://api.openai.com/v1",
	--			model = "gpt-4o", -- your desired model (or use gpt-4o, etc.)
	--			timeout = 30000, -- Timeout in milliseconds, increase this for reasoning models
	--			temperature = 0,
	--			max_tokens = 8192, -- Increase this to include reasoning tokens (for reasoning models)
	--			--reasoning_effort = "medium", -- low|medium|high, only used for reasoning models
	--		},
	--	},
	--	-- if you want to build from source then do `make BUILD_FROM_SOURCE=true`
	--	build = "make",
	--	-- build = "powershell -ExecutionPolicy Bypass -File Build.ps1 -BuildFromSource false" -- for windows
	--	dependencies = {
	--		"nvim-treesitter/nvim-treesitter",
	--		"stevearc/dressing.nvim",
	--		"nvim-lua/plenary.nvim",
	--		"MunifTanjim/nui.nvim",
	--		--- The below dependencies are optional,
	--		"echasnovski/mini.pick", -- for file_selector provider mini.pick
	--		"nvim-telescope/telescope.nvim", -- for file_selector provider telescope
	--		"hrsh7th/nvim-cmp", -- autocompletion for avante commands and mentions
	--		"ibhagwan/fzf-lua", -- for file_selector provider fzf
	--		"nvim-tree/nvim-web-devicons", -- or echasnovski/mini.icons
	--		"zbirenbaum/copilot.lua", -- for providers='copilot'
	--		{
	--			-- support for image pasting
	--			"HakonHarnes/img-clip.nvim",
	--			event = "VeryLazy",
	--			opts = {
	--				-- recommended settings
	--				default = {
	--					embed_image_as_base64 = false,
	--					prompt_for_file_name = false,
	--					drag_and_drop = {
	--						insert_mode = true,
	--					},
	--					-- required for Windows users
	--					use_absolute_path = true,
	--				},
	--			},
	--		},
	--		{
	--			-- Make sure to set this up properly if you have lazy=true
	--			"MeanderingProgrammer/render-markdown.nvim",
	--			opts = {
	--				file_types = { "markdown", "Avante" },
	--			},
	--			ft = { "markdown", "Avante" },
	--		},
	--	},
	--},
}

return config
