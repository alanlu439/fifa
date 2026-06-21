import { sampleMatches, standings as sampleStandings, teams as baseTeams } from "./data.js";

const requiredKeys = ["id", "home", "away", "status", "group", "venue", "kickoff"];
const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const ESPN_STANDINGS_URL = "https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
const ESPN_SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";
const WORLD_CUP_2026_START = "2026-06-11T00:00:00";
const summaryEventsCache = new Map();

export async function fetchLiveData(signal) {
  const feedUrl = getFeedUrl();
  if (feedUrl) {
    const matches = await fetchExternalFeed(signal);
    return {
      matches,
      standings: sampleStandings,
      teams: collectTeamsFromMatches(matches),
      source: "External JSON feed",
    };
  }

  return fetchEspnWorldCupFeed(signal);
}

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
      homeTeam: match.homeTeam ? normalizeCustomTeam(match.homeTeam, match.home) : undefined,
      awayTeam: match.awayTeam ? normalizeCustomTeam(match.awayTeam, match.away) : undefined,
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

export async function fetchEspnWorldCupFeed(signal) {
  const dateRange = getEspnDateRange();
  const [scoreboard, standings] = await Promise.all([
    fetchJson(`${ESPN_SCOREBOARD_URL}?dates=${dateRange}`, signal),
    fetchJson(ESPN_STANDINGS_URL, signal),
  ]);

  const tableData = normalizeEspnStandings(standings);
  const scoreboardData = normalizeEspnScoreboard(scoreboard, tableData.teamGroups);
  const matches = await hydrateEspnPastEvents(scoreboardData.matches, signal);

  return {
    matches,
    standings: tableData.standings,
    teams: {
      ...tableData.teams,
      ...scoreboardData.teams,
    },
    source: "ESPN live feed",
  };
}

export function freshSampleMatches() {
  return sampleMatches.map((match) => ({
    ...match,
    homeTeam: baseTeams[match.home],
    awayTeam: baseTeams[match.away],
    events: [...match.events],
    stats: { ...match.stats },
  }));
}

export function collectTeamsFromMatches(matches) {
  return matches.reduce((acc, match) => {
    if (match.homeTeam) acc[match.home] = match.homeTeam;
    if (match.awayTeam) acc[match.away] = match.awayTeam;
    return acc;
  }, {});
}

function normalizeEspnScoreboard(payload, teamGroups) {
  const teams = {};
  const matches = (payload.events || [])
    .map((event) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      const homeEntry = competitors.find((competitor) => competitor.homeAway === "home") || competitors[0];
      const awayEntry = competitors.find((competitor) => competitor.homeAway === "away") || competitors[1];

      if (!competition || !homeEntry?.team || !awayEntry?.team) return null;

      const homeTeam = normalizeEspnTeam(homeEntry.team);
      const awayTeam = normalizeEspnTeam(awayEntry.team);
      teams[homeTeam.code] = homeTeam;
      teams[awayTeam.code] = awayTeam;

      const status = normalizeEspnStatus(competition.status || event.status);
      const group = teamGroups[homeTeam.code] || teamGroups[awayTeam.code] || normalizeStage(event.season?.slug);

      return {
        id: String(event.id),
        group,
        venue: competition.venue?.fullName || event.venue?.displayName || "Venue TBA",
        stage: normalizeStage(event.season?.slug),
        kickoff: event.date || competition.date,
        status,
        minute: normalizeEspnMinute(competition.status, status),
        home: homeTeam.code,
        away: awayTeam.code,
        homeScore: status === "upcoming" ? null : normalizeScore(homeEntry.score),
        awayScore: status === "upcoming" ? null : normalizeScore(awayEntry.score),
        note: competition.status?.type?.shortDetail || competition.status?.type?.detail || "",
        homeTeam,
        awayTeam,
        stats: normalizeEspnStats(homeEntry, awayEntry),
        events: normalizeEspnDetails(competition.details || []),
      };
    })
    .filter(Boolean);

  return { matches, teams };
}

async function hydrateEspnPastEvents(matches, signal) {
  const finishedMatches = matches.filter((match) => match.status === "finished" && !match.events.length);
  if (!finishedMatches.length) return matches;

  const eventPairs = await Promise.all(
    finishedMatches.map(async (match) => {
      try {
        return [match.id, await fetchEspnSummaryEvents(match.id, signal)];
      } catch {
        return [match.id, []];
      }
    })
  );
  const eventsByMatchId = new Map(eventPairs);

  return matches.map((match) => {
    if (!eventsByMatchId.has(match.id)) return match;
    return { ...match, events: eventsByMatchId.get(match.id) };
  });
}

async function fetchEspnSummaryEvents(eventId, signal) {
  if (summaryEventsCache.has(eventId)) return summaryEventsCache.get(eventId);
  const summary = await fetchJson(`${ESPN_SUMMARY_URL}?event=${eventId}`, signal);
  const events = normalizeEspnKeyEvents(summary.keyEvents || []);
  summaryEventsCache.set(eventId, events);
  return events;
}

function normalizeEspnStandings(payload) {
  const teams = {};
  const teamGroups = {};
  const standings = {};

  for (const child of payload.children || []) {
    const groupName = child.name || child.abbreviation || "Group";
    const rows = (child.standings?.entries || []).map((entry) => {
      const teamData = normalizeEspnTeam(entry.team);
      teams[teamData.code] = teamData;
      teamGroups[teamData.code] = groupName;

      return {
        team: teamData.code,
        teamData,
        played: statValue(entry.stats, "gamesPlayed"),
        won: statValue(entry.stats, "wins"),
        drawn: statValue(entry.stats, "ties"),
        lost: statValue(entry.stats, "losses"),
        goalsFor: statValue(entry.stats, "pointsFor"),
        goalsAgainst: statValue(entry.stats, "pointsAgainst"),
        points: statValue(entry.stats, "points"),
      };
    });

    if (rows.length) standings[groupName] = rows;
  }

  return {
    standings: Object.keys(standings).length ? standings : sampleStandings,
    teamGroups,
    teams,
  };
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Real feed request failed with ${response.status}`);
  return response.json();
}

function getEspnDateRange(date = new Date()) {
  const tournamentStart = new Date(WORLD_CUP_2026_START);
  const start = date >= tournamentStart ? tournamentStart : new Date(date);
  const end = new Date(date);
  if (date < tournamentStart) start.setDate(start.getDate() - 7);
  end.setDate(end.getDate() + 2);
  return `${formatYmd(start)}-${formatYmd(end)}`;
}

function formatYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function normalizeEspnTeam(team) {
  const code = String(team.abbreviation || team.shortDisplayName || team.name || "TBD").toUpperCase();
  const knownTeam = baseTeams[code] || {};
  return {
    name: team.displayName || team.shortDisplayName || knownTeam.name || code,
    code,
    colors: [ensureHex(team.color) || knownTeam.colors?.[0] || "#8de4ff", ensureHex(team.alternateColor) || knownTeam.colors?.[1] || "#f4f7fb"],
  };
}

function normalizeCustomTeam(team, fallbackCode) {
  const code = String(team.code || fallbackCode).toUpperCase();
  const knownTeam = baseTeams[code] || {};
  return {
    name: team.name || knownTeam.name || code,
    code,
    colors: team.colors || knownTeam.colors || ["#8de4ff", "#f4f7fb"],
  };
}

function normalizeEspnStatus(statusPayload) {
  const type = statusPayload?.type || {};
  const state = String(type.state || "").toLowerCase();
  const label = `${type.name || ""} ${type.description || ""} ${type.detail || ""} ${type.shortDetail || ""}`.toLowerCase();

  if (type.completed || state === "post") return "finished";
  if (label.includes("half")) return "halftime";
  if (state === "in") return "live";
  return "upcoming";
}

function normalizeEspnMinute(statusPayload, status) {
  if (status === "upcoming") return 0;
  if (status === "finished") return 90;
  const displayClock = statusPayload?.displayClock || statusPayload?.type?.shortDetail || "";
  const displayMinute = String(displayClock).match(/\d+/);
  if (displayMinute) return Number(displayMinute[0]);
  return Math.max(0, Math.round(Number(statusPayload?.clock || 0)));
}

function normalizeEspnStats(homeEntry, awayEntry) {
  const homeStats = homeEntry.statistics || [];
  const awayStats = awayEntry.statistics || [];
  return {
    possessionHome: statValue(homeStats, "possessionPct", statValue(homeStats, "possession", 50)),
    shotsHome: statValue(homeStats, "totalShots", statValue(homeStats, "shotsTotal", 0)),
    shotsAway: statValue(awayStats, "totalShots", statValue(awayStats, "shotsTotal", 0)),
    xgHome: statValue(homeStats, "expectedGoals", 0),
    xgAway: statValue(awayStats, "expectedGoals", 0),
  };
}

function normalizeEspnDetails(details) {
  return details
    .map((detail) => ({
      minute: normalizeDetailMinute(detail),
      team: detail.team?.abbreviation || "",
      type: normalizeEventType(detail.type?.text || detail.type?.id || detail.type || ""),
      text: detail.shortText || detail.text || detail.headline || "",
    }))
    .filter((detail) => detail.text);
}

function normalizeEspnKeyEvents(details) {
  return normalizeEspnDetails(details).filter((detail) => ["goal", "card", "shot", "corner"].includes(detail.type));
}

function normalizeDetailMinute(detail) {
  const display = detail.clock?.displayValue || detail.displayTime || detail.time || "";
  const minute = String(display).match(/\d+/);
  return minute ? Number(minute[0]) : 0;
}

function normalizeEventType(type) {
  const clean = String(type).toLowerCase();
  if (clean.includes("goal")) return "goal";
  if (clean.includes("card")) return "card";
  if (clean.includes("corner")) return "corner";
  if (clean.includes("shot")) return "shot";
  return "event";
}

function normalizeStage(slug = "") {
  return String(slug)
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ") || "World Cup";
}

function statValue(stats = [], name, fallback = 0) {
  const stat = stats.find((item) => item.name === name);
  const value = Number(stat?.value ?? stat?.displayValue);
  return Number.isFinite(value) ? value : fallback;
}

function ensureHex(color) {
  if (!color) return "";
  const clean = String(color).replace("#", "").trim();
  return clean.length === 6 ? `#${clean}` : "";
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
