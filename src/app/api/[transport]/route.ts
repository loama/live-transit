import { createMcpHandler } from "mcp-handler";
import { INSTRUCTIONS, SERVER_INFO, registerTools } from "@/mcp/server";

export const maxDuration = 30;

const handler = createMcpHandler(registerTools, {
  instructions: INSTRUCTIONS,
  serverInfo: SERVER_INFO,
});

export { handler as GET, handler as POST, handler as DELETE };
