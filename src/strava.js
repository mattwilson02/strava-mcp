import fetch from "node-fetch";

export class StravaClient {
  constructor({ clientId, clientSecret, refreshToken }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() / 1000 < this.tokenExpiry - 60) {
      return this.accessToken;
    }

    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Strava token refresh failed: ${res.status} — ${err}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = data.expires_at;
    return this.accessToken;
  }

  async api(path, params = {}) {
    const token = await this.getAccessToken();
    const url = new URL(`https://www.strava.com/api/v3${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Strava API error ${res.status}: ${err}`);
    }

    return res.json();
  }

  // --- Core endpoints ---

  async getAthlete() {
    return this.api("/athlete");
  }

  async getAthleteStats(athleteId) {
    return this.api(`/athletes/${athleteId}/stats`);
  }

  async getActivities({ page = 1, perPage = 30, before, after } = {}) {
    return this.api("/athlete/activities", {
      page,
      per_page: perPage,
      before,
      after,
    });
  }

  async getActivity(id, includeEfforts = false) {
    return this.api(`/activities/${id}`, {
      include_all_efforts: includeEfforts,
    });
  }

  async getActivityStreams(id, keys = ["watts", "heartrate", "cadence", "time", "altitude"]) {
    return this.api(`/activities/${id}/streams`, {
      keys: keys.join(","),
      key_type: "time",
    });
  }

  async getActivityZones(id) {
    return this.api(`/activities/${id}/zones`);
  }

  async getActivityLaps(id) {
    return this.api(`/activities/${id}/laps`);
  }
}
