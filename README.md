# Strava MCP Server

An MCP (Model Context Protocol) server that gives Claude access to your Strava cycling data. Connect it to a Claude.ai project and Claude can pull your rides, power data, training volume, and more.

Works with any Strava account — cycling, running, or multi-sport.

## What Claude Can Do With This

Once connected, Claude has access to these tools:

| Tool | What it does |
|------|-------------|
| `get_athlete_profile` | Your Strava profile, weight, FTP, and year-to-date stats |
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
git clone https://github.com/YOUR_USERNAME/strava-mcp.git
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

### Step 3: Get Your Refresh Token (local)

```bash
npm start
```

Visit `http://localhost:3000/auth` in your browser. This will:
1. Redirect you to Strava to authorize the app
2. Show you a refresh token on the callback page
3. Copy that token into your `.env` file as `STRAVA_REFRESH_TOKEN`

Restart the server after updating `.env`.

### Step 4: Deploy

The server needs to be publicly accessible for Claude.ai to connect. Here are three options:

#### Render (recommended — free tier)

1. Push this repo to GitHub
2. Sign up at [render.com](https://render.com)
3. Click **New** → **Web Service** → connect your GitHub repo
4. Configure:
   - **Runtime:** Docker
   - **Instance Type:** Free
   - **Region:** closest to you
5. Add environment variables in the Render dashboard:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_REFRESH_TOKEN` (set to `placeholder` for now)
   - `PORT` → `3000`
6. Deploy — you'll get a URL like `https://strava-mcp.onrender.com`
7. Update your Strava API app's **Authorization Callback Domain** to your Render domain (e.g. `strava-mcp.onrender.com`)
8. Visit `https://your-render-url/auth` to authorize and get a real refresh token
9. Update `STRAVA_REFRESH_TOKEN` in Render's environment variables — it'll auto-redeploy

> **Note:** Render's free tier spins down after 15 minutes of inactivity. The first request after idle takes ~30 seconds to cold-start. This is fine for occasional use with Claude.

#### Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Set env vars in the Railway dashboard. Hobby plan is $5/month (includes $5 usage).

#### Fly.io

```bash
fly launch
fly secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... STRAVA_REFRESH_TOKEN=...
fly deploy
```

#### Any Docker host

```bash
docker build -t strava-mcp .
docker run -p 3000:3000 --env-file .env strava-mcp
```

### Step 5: Connect to Claude

1. Open your Claude.ai project
2. Go to **Project Settings** → **Integrations** (or MCP Servers)
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

Verify with: `curl http://localhost:3000/health`

## How It Works

- The server authenticates with Strava using OAuth2 refresh tokens (auto-refreshes when expired)
- Claude connects via SSE (Server-Sent Events) to the `/sse` endpoint
- Tool calls from Claude arrive as POST requests to `/messages`
- CORS is enabled for cross-origin requests
- No data is stored or cached — everything is fetched live from Strava's API

## Strava API Rate Limits

Strava allows 100 requests per 15 minutes and 1,000 per day. Normal usage with Claude won't come close to this, but be aware if doing heavy analysis across many activities.

## Privacy & Security

- **Read-only:** This server cannot modify anything on your Strava account
- **No storage:** Data flows directly from Strava to Claude via your server. Nothing is persisted
- **Public endpoint:** The SSE endpoint has no authentication. If your Strava is public this is a non-issue. If you want to lock it down, you can add bearer token auth to the `/sse` and `/messages` routes
- **Scopes:** Uses `read` and `activity:read_all` (includes private activities). Change to `activity:read` in `src/index.js` if you only want public activities

## License

MIT
