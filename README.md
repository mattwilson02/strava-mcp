# Strava MCP Server

An MCP (Model Context Protocol) server that gives Claude access to your Strava cycling data. Built for use with Claude.ai projects.

## What Claude Can Do With This

Once connected, Claude has access to these tools:

| Tool | What it does |
|------|-------------|
| `get_athlete_profile` | Your Strava profile, weight, FTP, year-to-date stats |
| `get_recent_activities` | List recent rides with power, HR, distance, duration |
| `get_activity_detail` | Deep dive on a specific ride — laps, segments, splits |
| `get_activity_power_data` | Second-by-second power/HR/cadence streams |
| `get_weekly_training_summary` | Week-by-week volume, hours, intensity breakdown |
| `get_power_bests` | Best power over 5s, 30s, 1m, 2m, 3m, 5m, 10m, 20m, 60m for any ride |

## Setup (15 minutes)

### Step 1: Create a Strava API App

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create an application:
   - **Application Name:** anything (e.g. "My MCP Server")
   - **Category:** Data Analysis
   - **Website:** `http://localhost:3000`
   - **Authorization Callback Domain:** `localhost`
3. Note your **Client ID** and **Client Secret**

### Step 2: Install & Configure

```bash
git clone <your-repo-url> strava-mcp
cd strava-mcp
npm install

# Create your env file
cp env.example .env
```

Edit `.env` and add your Client ID and Client Secret:

```
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc123def456
STRAVA_REFRESH_TOKEN=your_refresh_token_here
PORT=3000
```

### Step 3: Get Your Refresh Token

```bash
npm start
```

Visit `http://localhost:3000/auth` in your browser. This will:
1. Redirect you to Strava to authorize the app
2. Show you a refresh token on the callback page
3. Copy that token into your `.env` file as `STRAVA_REFRESH_TOKEN`

Restart the server after updating `.env`.

### Step 4: Deploy (so Claude can reach it)

The server needs to be publicly accessible for Claude.ai to connect. Options:

**Railway (easiest):**
```bash
# Install Railway CLI: https://railway.app
railway login
railway init
railway up
```
Set your env vars in the Railway dashboard.

**Fly.io:**
```bash
fly launch
fly secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... STRAVA_REFRESH_TOKEN=...
fly deploy
```

**Any Docker host:**
```bash
docker build -t strava-mcp .
docker run -p 3000:3000 --env-file .env strava-mcp
```

Note your public URL (e.g. `https://strava-mcp-production.up.railway.app`).

**Important:** After deploying, update your Strava API app's **Authorization Callback Domain** to match your deployed domain (e.g. `strava-mcp-production.up.railway.app`), then visit `https://your-deployed-url/auth` to re-authorize and get a fresh refresh token for the deployed environment.

### Step 5: Connect to Claude

1. Open your Claude.ai project
2. Go to Project Settings → Integrations (or MCP Servers)
3. Add a new MCP server:
   - **URL:** `https://your-deployed-url/sse`
   - **Name:** Strava
4. Claude now has access to your training data

## Testing Locally

```bash
npm start
# Server runs on http://localhost:3000
# SSE endpoint: http://localhost:3000/sse
# Health check: http://localhost:3000/health
```

## Strava API Rate Limits

Strava allows 100 requests per 15 minutes and 1,000 per day. Normal usage with Claude won't come close to this, but if you're doing heavy analysis of many activities, be aware.

## Privacy

This server only reads your data — it cannot modify anything on Strava. The `activity:read_all` scope gives access to all activities including private ones. If you only want public activities, change the scope in `src/index.js` to `activity:read`.

Your data flows directly between Strava's API and Claude via your server. Nothing is stored or cached.
