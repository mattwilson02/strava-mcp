import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StravaClient } from "./strava.js";
import { registerTools } from "./tools.js";

const {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_REFRESH_TOKEN,
  PORT = "3000",
} = process.env;

if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
  console.error(
    "Missing required env vars: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN"
  );
  console.error("See README.md for setup instructions.");
  process.exit(1);
}

// --- Strava client ---
const strava = new StravaClient({
  clientId: STRAVA_CLIENT_ID,
  clientSecret: STRAVA_CLIENT_SECRET,
  refreshToken: STRAVA_REFRESH_TOKEN,
});

// --- Express app ---
const app = express();

// Track active transports for cleanup
const transports = {};

// SSE endpoint — Claude connects here
app.get("/sse", async (req, res) => {
  console.log("New SSE connection");
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  const server = new McpServer({
    name: "strava",
    version: "1.0.0",
  });

  registerTools(server, strava);

  res.on("close", () => {
    console.log(`SSE connection closed: ${transport.sessionId}`);
    delete transports[transport.sessionId];
  });

  await server.connect(transport);
});

// Message endpoint — Claude sends tool calls here
app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];

  if (!transport) {
    res.status(400).json({ error: "Unknown session" });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// Root — info page
app.get("/", (req, res) => {
  res.json({
    service: "strava-mcp",
    status: "running",
    endpoints: {
      sse: "/sse",
      health: "/health",
      auth: "/auth",
    },
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "strava-mcp" });
});

// --- OAuth helper route (one-time setup) ---
app.get("/auth", (req, res) => {
  const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
  const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read,activity:read_all&approval_prompt=force`;
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    res.status(400).send("Missing code parameter");
    return;
  }

  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();

    res.send(`
      <html>
        <body style="font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px;">
          <h1>Strava Connected!</h1>
          <p>Add this to your <code>.env</code> file:</p>
          <pre style="background: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto;">STRAVA_REFRESH_TOKEN=${data.refresh_token}</pre>
          <p>Then restart the server. You can close this tab.</p>
          <hr>
          <details>
            <summary>Full token response</summary>
            <pre>${JSON.stringify(data, null, 2)}</pre>
          </details>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`OAuth error: ${err.message}`);
  }
});

// --- Start ---
app.listen(parseInt(PORT), () => {
  console.log(`Strava MCP server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  if (!STRAVA_REFRESH_TOKEN || STRAVA_REFRESH_TOKEN === "your_refresh_token_here") {
    console.log(`\nFirst time? Visit http://localhost:${PORT}/auth to connect Strava`);
  }
});
