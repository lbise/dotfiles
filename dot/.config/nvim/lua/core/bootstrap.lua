local bootstrap = {}

function bootstrap.setup_plugin_manager()
	local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
	local mgr_address = "https://github.com/folke/lazy.nvim.git"

	if not vim.loop.fs_stat(lazypath) then
		vim.notify("Lazy not installed. Cloning repo from " .. mgr_address .. " to " .. lazypath)

		vim.fn.system({
			"git",
			"clone",
			"--filter=blob:none",
			mgr_address,
			"--branch=stable", -- latest stable release
			lazypath,
		})
	end

	return lazypath
end

function bootstrap.is_bootstraped()
	-- Check if plugin manager exists
	local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
	return vim.loop.fs_stat(lazypath)
end

function bootstrap.bootstrap()
	local lazypath = bootstrap.setup_plugin_manager()
	vim.opt.rtp:prepend(lazypath)
end

return bootstrap
