import { sampleMatches } from "./data.js";

const requiredKeys = ["id", "home", "away", "status", "group", "venue", "kickoff"];

export function getFeedUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("feed");
}

export async function fetchExternalFeed(signal) {
  const feedUrl = getFeedUrl();
  if (!feedUrl) return null;

  const response = await fetch(feedUrl, { signal });
  if (!response.ok) {
    throw new Error(`Feed request failed with ${response.status}`);
  }

  const payload = await response.json();
  const rawMatches = Array.isArray(payload) ? payload : payload.matches;
  if (!Array.isArray(rawMatches)) {
    throw new Error("Feed payload must be an array or contain a matches array");
  }

  return normalizeMatches(rawMatches);
}

export function normalizeMatches(rawMatches) {
  return rawMatches
    .filter((match) => requiredKeys.every((key) => match[key] !== undefined && match[key] !== null))
    .map((match) => ({
      id: String(match.id),
      group: String(match.group),
      venue: String(match.venue),
      stage: match.stage ? String(match.stage) : "Group stage",
      kickoff: String(match.kickoff),
      status: normalizeStatus(match.status),
      minute: Number(match.minute || 0),
      home: String(match.home),
      away: String(match.away),
      homeScore: normalizeScore(match.homeScore),
      awayScore: normalizeScore(match.awayScore),
      note: match.note ? String(match.note) : "",
      stats: {
        possessionHome: Number(match.stats?.possessionHome || 50),
        shotsHome: Number(match.stats?.shotsHome || 0),
        shotsAway: Number(match.stats?.shotsAway || 0),
        xgHome: Number(match.stats?.xgHome || 0),
        xgAway: Number(match.stats?.xgAway || 0),
      },
      events: Array.isArray(match.events) ? match.events : [],
    }));
}

export function tickDemoMatches(matches = sampleMatches) {
  return matches.map((match) => {
    if (match.status !== "live") return match;

    const nextMinute = Math.min(match.minute + 1, 90);
    const pressure = Math.max(8, Math.min(92, match.stats.possessionHome + (nextMinute % 3) - 1));

    return {
      ...match,
      minute: nextMinute,
      stats: {
        ...match.stats,
        possessionHome: pressure,
        shotsHome: match.stats.shotsHome + (nextMinute % 11 === 0 ? 1 : 0),
        shotsAway: match.stats.shotsAway + (nextMinute % 13 === 0 ? 1 : 0),
      },
    };
  });
}

export function freshSampleMatches() {
  return sampleMatches.map((match) => ({ ...match, events: [...match.events], stats: { ...match.stats } }));
}

function normalizeStatus(status) {
  const clean = String(status).toLowerCase();
  if (["live", "halftime", "finished", "upcoming"].includes(clean)) return clean;
  if (clean === "ht") return "halftime";
  if (clean === "ft") return "finished";
  return "upcoming";
}

function normalizeScore(score) {
  if (score === null || score === undefined || score === "") return null;
  return Number(score);
}
