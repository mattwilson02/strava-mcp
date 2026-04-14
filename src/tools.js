import { z } from "zod";

// Helper to format duration
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatPace(secondsPerUnit) {
  const m = Math.floor(secondsPerUnit / 60);
  const s = Math.round(secondsPerUnit % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isSwim(type) {
  return type === "Swim";
}

// Helper to format date
function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function registerTools(server, strava) {
  // --- Get athlete profile ---
  server.tool(
    "get_athlete_profile",
    "Get the athlete's Strava profile including weight, FTP, and basic info",
    {},
    async () => {
      const athlete = await strava.getAthlete();
      const stats = await strava.getAthleteStats(athlete.id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                name: `${athlete.firstname} ${athlete.lastname}`,
                weight_kg: athlete.weight,
                ftp: athlete.ftp,
                city: athlete.city,
                country: athlete.country,
                ride_totals: {
                  all_time: {
                    count: stats.all_ride_totals?.count,
                    distance_km: Math.round(stats.all_ride_totals?.distance / 1000),
                    elevation_m: Math.round(stats.all_ride_totals?.elevation_gain),
                    moving_time: formatDuration(stats.all_ride_totals?.moving_time || 0),
                  },
                  ytd: {
                    count: stats.ytd_ride_totals?.count,
                    distance_km: Math.round(stats.ytd_ride_totals?.distance / 1000),
                    elevation_m: Math.round(stats.ytd_ride_totals?.elevation_gain),
                    moving_time: formatDuration(stats.ytd_ride_totals?.moving_time || 0),
                  },
                },
                run_totals: {
                  all_time: {
                    count: stats.all_run_totals?.count,
                    distance_km: Math.round(stats.all_run_totals?.distance / 1000),
                    elevation_m: Math.round(stats.all_run_totals?.elevation_gain),
                    moving_time: formatDuration(stats.all_run_totals?.moving_time || 0),
                  },
                  ytd: {
                    count: stats.ytd_run_totals?.count,
                    distance_km: Math.round(stats.ytd_run_totals?.distance / 1000),
                    elevation_m: Math.round(stats.ytd_run_totals?.elevation_gain),
                    moving_time: formatDuration(stats.ytd_run_totals?.moving_time || 0),
                  },
                },
                swim_totals: {
                  all_time: {
                    count: stats.all_swim_totals?.count,
                    distance_m: Math.round(stats.all_swim_totals?.distance || 0),
                    moving_time: formatDuration(stats.all_swim_totals?.moving_time || 0),
                  },
                  ytd: {
                    count: stats.ytd_swim_totals?.count,
                    distance_m: Math.round(stats.ytd_swim_totals?.distance || 0),
                    moving_time: formatDuration(stats.ytd_swim_totals?.moving_time || 0),
                  },
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Get recent activities ---
  server.tool(
    "get_recent_activities",
    "Get a list of recent activities (rides, runs, swims, virtual variants) with key metrics. Use this to review training history and weekly volume.",
    {
      count: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of activities to fetch (default 20, max 100)"),
      after_date: z
        .string()
        .optional()
        .describe("Only activities after this date (ISO 8601, e.g. 2025-06-01)"),
      before_date: z
        .string()
        .optional()
        .describe("Only activities before this date (ISO 8601)"),
    },
    async ({ count, after_date, before_date }) => {
      const params = { perPage: count };
      if (after_date) params.after = Math.floor(new Date(after_date).getTime() / 1000);
      if (before_date) params.before = Math.floor(new Date(before_date).getTime() / 1000);

      const activities = await strava.getActivities(params);

      const SUPPORTED_TYPES = [
        "Ride",
        "VirtualRide",
        "Run",
        "VirtualRun",
        "Swim",
      ];
      const filtered = activities
        .filter((a) => SUPPORTED_TYPES.includes(a.type))
        .map((a) => {
          const swim = isSwim(a.type);
          return {
            id: a.id,
            name: a.name,
            date: formatDate(a.start_date_local),
            type: a.type,
            duration: formatDuration(a.moving_time),
            distance_km: swim ? null : (a.distance / 1000).toFixed(1),
            distance_m: swim ? Math.round(a.distance) : null,
            elevation_m: swim ? null : Math.round(a.total_elevation_gain),
            avg_watts: a.average_watts || null,
            weighted_avg_watts: a.weighted_average_watts || null,
            max_watts: a.max_watts || null,
            avg_hr: a.average_heartrate || null,
            max_hr: a.max_heartrate || null,
            avg_cadence: a.average_cadence || null,
            avg_speed_kph: swim ? null : ((a.average_speed * 3600) / 1000).toFixed(1),
            avg_pace_min_km: a.type.includes("Run") && a.average_speed
              ? formatDuration(1000 / a.average_speed) + "/km"
              : null,
            avg_pace_per_100m: swim && a.average_speed
              ? formatPace(100 / a.average_speed) + "/100m"
              : null,
            avg_stroke_rate: swim ? a.average_cadence || null : null,
            suffer_score: a.suffer_score || null,
            kilojoules: a.kilojoules || null,
            calories: a.calories || null,
            has_power: a.device_watts || false,
          };
        });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { total: filtered.length, activities: filtered },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Get detailed activity ---
  server.tool(
    "get_activity_detail",
    "Get detailed data for a specific activity including laps, splits, and segment efforts. Use the activity ID from get_recent_activities.",
    {
      activity_id: z.number().describe("Strava activity ID"),
    },
    async ({ activity_id }) => {
      const [activity, laps] = await Promise.all([
        strava.getActivity(activity_id, true),
        strava.getActivityLaps(activity_id),
      ]);

      const swim = isSwim(activity.type);
      const detail = {
        id: activity.id,
        name: activity.name,
        description: activity.description || null,
        date: formatDate(activity.start_date_local),
        start_time: new Date(activity.start_date_local).toLocaleTimeString("en-GB"),
        type: activity.type,
        duration: formatDuration(activity.moving_time),
        elapsed_time: formatDuration(activity.elapsed_time),
        distance_km: swim ? null : (activity.distance / 1000).toFixed(1),
        distance_m: swim ? Math.round(activity.distance) : null,
        pool_length_m: swim ? activity.pool_length || null : null,
        total_strokes: swim ? activity.total_strokes || null : null,
        avg_pace_per_100m: swim && activity.average_speed
          ? formatPace(100 / activity.average_speed) + "/100m"
          : null,
        elevation_m: swim ? null : Math.round(activity.total_elevation_gain),
        avg_watts: activity.average_watts || null,
        weighted_avg_watts: activity.weighted_average_watts || null,
        max_watts: activity.max_watts || null,
        avg_hr: activity.average_heartrate || null,
        max_hr: activity.max_heartrate || null,
        avg_cadence: activity.average_cadence || null,
        kilojoules: activity.kilojoules || null,
        calories: activity.calories || null,
        device_name: activity.device_name || null,
        gear: activity.gear?.name || null,
        laps: laps.map((l, i) => ({
          lap: i + 1,
          name: l.name,
          duration: formatDuration(l.moving_time),
          distance_km: (l.distance / 1000).toFixed(2),
          avg_watts: l.average_watts || null,
          max_watts: l.max_watts || null,
          avg_hr: l.average_heartrate || null,
          avg_cadence: l.average_cadence || null,
        })),
        segment_efforts: (activity.segment_efforts || []).slice(0, 20).map((s) => ({
          name: s.name,
          duration: formatDuration(s.moving_time),
          distance_km: (s.distance / 1000).toFixed(2),
          avg_watts: s.average_watts || null,
          avg_hr: s.average_heartrate || null,
          pr_rank: s.pr_rank || null,
          kom_rank: s.kom_rank || null,
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
      };
    }
  );

  // --- Get power/HR streams ---
  server.tool(
    "get_activity_power_data",
    "Get second-by-second power, heart rate, cadence and altitude streams for an activity. Useful for analyzing interval quality, power distribution, and pacing. Returns sampled data (every 10s) for activities over 30 min.",
    {
      activity_id: z.number().describe("Strava activity ID"),
      streams: z
        .array(z.enum(["watts", "heartrate", "cadence", "altitude", "velocity_smooth"]))
        .default(["watts", "heartrate", "cadence"])
        .describe("Which data streams to fetch"),
    },
    async ({ activity_id, streams }) => {
      const data = await strava.getActivityStreams(activity_id, [...streams, "time"]);

      const streamMap = {};
      for (const stream of data) {
        streamMap[stream.type] = stream.data;
      }

      const timeData = streamMap.time || [];

      // Sample every 10s for long activities to keep response manageable
      const sampleInterval = timeData.length > 1800 ? 10 : 1;

      const sampled = [];
      for (let i = 0; i < timeData.length; i += sampleInterval) {
        const point = { time_s: timeData[i] };
        for (const key of streams) {
          if (streamMap[key]) point[key] = streamMap[key][i];
        }
        sampled.push(point);
      }

      // Compute power summary if watts available
      let powerSummary = null;
      if (streamMap.watts) {
        const watts = streamMap.watts.filter((w) => w > 0);
        watts.sort((a, b) => a - b);
        powerSummary = {
          avg: Math.round(watts.reduce((a, b) => a + b, 0) / watts.length),
          max: Math.max(...streamMap.watts),
          median: watts[Math.floor(watts.length / 2)],
          time_above_ftp_pct: null, // would need FTP
          total_points: streamMap.watts.length,
          sampled_points: sampled.length,
          sample_interval_s: sampleInterval,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                activity_id,
                power_summary: powerSummary,
                data_points: sampled.length,
                streams: sampled,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Weekly training summary ---
  server.tool(
    "get_weekly_training_summary",
    "Get a week-by-week training summary for a date range. Shows total hours, distance, and activity count per week. Covers rides, runs, and swims.",
    {
      weeks: z
        .number()
        .min(1)
        .max(26)
        .default(8)
        .describe("Number of weeks to look back (default 8)"),
    },
    async ({ weeks }) => {
      const now = new Date();
      const after = new Date(now);
      after.setDate(after.getDate() - weeks * 7);

      // Fetch enough activities to cover the period
      const activities = await strava.getActivities({
        perPage: 100,
        after: Math.floor(after.getTime() / 1000),
      });

      const SUPPORTED_TYPES = [
        "Ride",
        "VirtualRide",
        "Run",
        "VirtualRun",
        "Swim",
      ];
      const filtered = activities.filter((a) => SUPPORTED_TYPES.includes(a.type));

      // Group by ISO week
      const weekMap = {};
      for (const act of filtered) {
        const date = new Date(act.start_date_local);
        // Get Monday of that week
        const day = date.getDay();
        const monday = new Date(date);
        monday.setDate(date.getDate() - ((day + 6) % 7));
        const weekKey = monday.toISOString().split("T")[0];

        if (!weekMap[weekKey]) {
          weekMap[weekKey] = {
            week_starting: weekKey,
            rides: 0,
            runs: 0,
            swims: 0,
            total_hours: 0,
            total_distance_km: 0,
            total_swim_distance_m: 0,
            total_elevation_m: 0,
            total_kj: 0,
            avg_weighted_watts: [],
            activities: [],
          };
        }

        const w = weekMap[weekKey];
        const swim = isSwim(act.type);
        if (swim) w.swims++;
        else if (act.type.includes("Run")) w.runs++;
        else w.rides++;
        w.total_hours += act.moving_time / 3600;
        if (swim) {
          w.total_swim_distance_m += act.distance;
        } else {
          w.total_distance_km += act.distance / 1000;
          w.total_elevation_m += act.total_elevation_gain;
        }
        w.total_kj += act.kilojoules || 0;
        if (act.weighted_average_watts) {
          w.avg_weighted_watts.push(act.weighted_average_watts);
        }
        w.activities.push({
          name: act.name,
          type: act.type,
          date: formatDate(act.start_date_local),
          duration: formatDuration(act.moving_time),
          distance_km: swim ? null : (act.distance / 1000).toFixed(1),
          distance_m: swim ? Math.round(act.distance) : null,
          avg_watts: act.average_watts || null,
          np: act.weighted_average_watts || null,
          avg_pace_per_100m: swim && act.average_speed
            ? formatPace(100 / act.average_speed) + "/100m"
            : null,
        });
      }

      // Format output
      const weeklySummaries = Object.values(weekMap)
        .sort((a, b) => b.week_starting.localeCompare(a.week_starting))
        .map((w) => ({
          week_starting: w.week_starting,
          rides: w.rides,
          runs: w.runs,
          swims: w.swims,
          total_hours: w.total_hours.toFixed(1),
          total_distance_km: Math.round(w.total_distance_km),
          total_swim_distance_m: Math.round(w.total_swim_distance_m),
          total_elevation_m: Math.round(w.total_elevation_m),
          total_kj: Math.round(w.total_kj),
          avg_np:
            w.avg_weighted_watts.length > 0
              ? Math.round(
                  w.avg_weighted_watts.reduce((a, b) => a + b, 0) /
                    w.avg_weighted_watts.length
                )
              : null,
          activities: w.activities,
        }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { weeks_analyzed: weeklySummaries.length, summaries: weeklySummaries },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Power curve / best efforts ---
  server.tool(
    "get_power_bests",
    "Analyze an activity's power data to find best average power over key durations (5s, 30s, 1m, 2m, 3m, 5m, 10m, 20m, 60m). Essential for profiling the rider's strengths and tracking fitness.",
    {
      activity_id: z.number().describe("Strava activity ID"),
    },
    async ({ activity_id }) => {
      const data = await strava.getActivityStreams(activity_id, ["watts", "time"]);

      const streamMap = {};
      for (const stream of data) {
        streamMap[stream.type] = stream.data;
      }

      if (!streamMap.watts || !streamMap.time) {
        return {
          content: [
            { type: "text", text: "No power data available for this activity." },
          ],
        };
      }

      const watts = streamMap.watts;
      const durations = [5, 30, 60, 120, 180, 300, 600, 1200, 3600];
      const labels = ["5s", "30s", "1min", "2min", "3min", "5min", "10min", "20min", "60min"];

      const bests = {};
      for (let d = 0; d < durations.length; d++) {
        const window = durations[d];
        if (watts.length < window) {
          bests[labels[d]] = null;
          continue;
        }

        let maxAvg = 0;
        let windowSum = 0;

        // Initial window
        for (let i = 0; i < window; i++) {
          windowSum += watts[i];
        }
        maxAvg = windowSum / window;

        // Slide
        for (let i = window; i < watts.length; i++) {
          windowSum += watts[i] - watts[i - window];
          const avg = windowSum / window;
          if (avg > maxAvg) maxAvg = avg;
        }

        bests[labels[d]] = Math.round(maxAvg);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                activity_id,
                power_bests: bests,
                note: "These are best average power values over each duration within this single activity.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
