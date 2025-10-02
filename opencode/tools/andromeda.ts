import { tool } from "@opencode-ai/plugin"
import { spawn } from "child_process"

export const build = tool({
  description: "Build projects using Andromeda build system",
  args: {
    paths: tool.schema.array(tool.schema.string()).describe("List of project paths to build"),
  },
  async execute(args) {
    const andromedaRoot = process.env.ANDROMEDA_ROOT
    if (!andromedaRoot) {
      return "Error: ANDROMEDA_ROOT environment variable is not set"
    }

    const buildScript = `${andromedaRoot}/build.py`
    const results = []

    for (const path of args.paths) {
      const result = await new Promise<string>((resolve) => {
        const buildProcess = spawn("python3", [buildScript, "-p", path], {
          stdio: ["ignore", "pipe", "pipe"]
        })

        let stdout = ""
        let stderr = ""

        buildProcess.stdout.on("data", (data) => {
          stdout += data.toString()
        })

        buildProcess.stderr.on("data", (data) => {
          stderr += data.toString()
        })

        buildProcess.on("close", (code) => {
          const output = stdout + (stderr ? `\nErrors:\n${stderr}` : "")
          if (code === 0) {
            resolve(`✓ Build successful for ${path}\n${output}`)
          } else {
            resolve(`✗ Build failed for ${path} (exit code: ${code})\n${output}`)
          }
        })

        buildProcess.on("error", (error) => {
          resolve(`✗ Error executing build script for ${path}: ${error.message}`)
        })
      })

      results.push(result)
    }

    return results.join("\n\n" + "=".repeat(50) + "\n\n")
  },
})
