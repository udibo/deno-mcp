import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// Patch from this PR:
// https://github.com/modelcontextprotocol/typescript-sdk/pull/349
import { StdioServerTransport } from "./fork/server-stdio.ts";
export { StdioServerTransport } from "./fork/server-stdio.ts";
export { StdioClientTransport } from "./fork/client-stdio.ts";
import { resolve } from "@std/path/resolve";
import { z } from "zod";

const cwd = Deno.env.get("WORKSPACE_FOLDER_PATHS") ?? Deno.cwd();

/**
 * The Deno MCP server provides tools for interacting with Deno projects,
 * primarily focused on running tests and viewing code coverage.
 *
 * ## Features
 *
 * - **Run Tests**: Execute Deno tests for specific files or entire directories.
 *   Supports options for enabling coverage, evaluating JSDoc/Markdown code blocks,
 *   updating snapshots, and tracing leaks.
 * - **View Coverage**: Display detailed code coverage reports.
 *
 * ## Getting Started
 *
 * To use the Deno MCP server with Cursor, add the following configuration
 * to your `.cursor/mcp.json` file:
 *
 * ```json, title=".cursor/mcp.json"
 * {
 *   "mcpServers": {
 *     "deno": {
 *       "command": "deno",
 *       "args": ["run", "-A", "jsr:@udibo/deno-mcp", "-A"]
 *     }
 *   }
 * }
 * ```
 *
 * Any arguments provided in the `args` array *after* the script path (`jsr:@udibo/deno-mcp` in this example)
 * will be passed to the `deno test` command when the `test` tool is executed.
 * For instance, the trailing `-A` in the example above will be included in all `test` tool invocations.
 *
 * ## Extending the Server
 *
 * You can extend the server with custom tools. For example, to add an `echo` tool:
 *
 * ```typescript, title="custom-server.ts"
 * import { server, StdioServerTransport } from "@udibo/deno-mcp";
 * import { z } from "zod";
 *
 * server.tool(
 *   "echo",
 *   {
 *     message: z.string(),
 *   },
 *   {
 *     "title": "Echo",
 *     "description": "Echo a message back to the client.",
 *   },
 *   ({ message }) => {
 *     return {
 *       content: [{
 *         type: "text",
 *         text: message,
 *       }],
 *     };
 *   },
 * );
 *
 * if (import.meta.main) {
 *   const transport = new StdioServerTransport();
 *   await server.connect(transport);
 * }
 * ```
 *
 * Then, update your `.cursor/mcp.json` to point to your custom server script:
 *
 * ```json, title=".cursor/mcp.json"
 * {
 *   "mcpServers": {
 *     "deno": {
 *       "command": "deno",
 *       "args": ["run", "-A", "./custom-server.ts", "-A"]
 *     }
 *   }
 * }
 * ```
 *
 * Similar to the base configuration, any arguments placed after `"./custom-server.ts"` in the `args` array
 * (like the trailing `-A` shown) will be appended to the `deno test` commands executed by the `test` tool.
 *
 * **Note**: If you make changes to your MCP server, you will need to restart the tool in your Cursor settings for the changes to take effect.
 */
export const server: McpServer = new McpServer({
  name: "Deno MCP",
  version: "0.1.0",
});

server.tool(
  "test",
  {
    files: z.array(z.string()).optional().describe(
      "Test files or directories to run tests for. If not provided, all tests will be run.",
    ),
    coverage: z.boolean().optional().default(false).describe(
      "Flag to collect coverage profile data.",
    ),
    doc: z.boolean().optional().default(false).describe(
      "Flag to evaluate code blocks in JSDoc and Markdown.",
    ),
    update: z.boolean().optional().default(false).describe(
      "Flag to update snapshot files for test cases that use snapshots.",
    ),
    traceLeaks: z.boolean().optional().default(false).describe(
      "Flag to enable tracing of leaks.",
    ),
  },
  {
    "title": "Test",
    "description":
      "Run Deno tests for specified files or directories. Supports options for coverage, JSDoc/Markdown evaluation, snapshot updates, and leak tracing.",
  },
  async ({ files, doc, update, coverage, traceLeaks }) => {
    try {
      const denoPath = Deno.execPath();
      const args = [
        "test",
        ...Deno.args,
      ];

      if (coverage) args.push("--coverage");
      if (traceLeaks) args.push("--trace-leaks");
      if (doc) args.push("--doc");
      if (files) {
        const filesToTest = files.map((file) => resolve(cwd, file));
        args.push(...filesToTest);
      }

      if (update) {
        args.push("--");
        args.push("--update");
      }

      const command = new Deno.Command(denoPath, {
        args,
        env: { "NO_COLOR": "1" },
        stdout: "piped",
        stderr: "piped",
        cwd,
      });

      const { code, stdout, stderr } = await command.output();
      const output = new TextDecoder().decode(stdout);
      const errors = new TextDecoder().decode(stderr);

      return {
        content: [{
          type: "text",
          text: output + (errors ?? ""),
        }],
        isError: code !== 0,
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: "text",
          text: `Error running tests: ${error}`,
        }],
        isError: true,
      };
    }
  },
);

server.tool(
  "coverage",
  {},
  {
    "title": "Coverage",
    "description":
      "Run coverage for a given file or directory. If it fails, try running the test tool first with coverage enabled.",
  },
  async () => {
    try {
      const denoPath = Deno.execPath();
      const command = new Deno.Command(denoPath, {
        args: ["coverage", "--detailed"],
        env: { "NO_COLOR": "1" },
        stdout: "piped",
        stderr: "piped",
        cwd,
      });

      const { code, stdout, stderr } = await command.output();
      const output = new TextDecoder().decode(stdout);
      const errors = new TextDecoder().decode(stderr);

      return {
        content: [{
          type: "text",
          text: output + (errors ?? ""),
        }],
        isError: code !== 0,
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: "text",
          text: `Error running coverage: ${error}`,
        }],
        isError: true,
      };
    }
  },
);

if (import.meta.main) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
