import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEspnWorldCupFeed, freshSampleMatches, normalizeMatches } from "../src/liveFeed.js";
import { teams } from "../src/data.js";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const INDEX_URL = new URL("../public/highlights-index.json", import.meta.url);
const WORLD_CUP_YEAR = "2026";
const DEFAULT_CHANNEL_HANDLE = "@fifa";
const DEFAULT_MAX_MATCHES = Number.POSITIVE_INFINITY;
const DEFAULT_RETRY_HOURS = 2;

const TEAM_ALIASES = {
  ENG: ["England"],
  KOR: ["Korea Republic", "South Korea", "Korea"],
  KSA: ["Saudi Arabia", "Saudi"],
  NED: ["Netherlands", "Holland"],
  PAR: ["Paraguay"],
  RSA: ["South Africa"],
  SCO: ["Scotland"],
  TUR: ["Türkiye", "Turkey", "Turkiye"],
  USA: ["USA", "United States", "USMNT"],
  WAL: ["Wales"],
};

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.log("YOUTUBE_API_KEY is not set; skipping automatic highlight search.");
    return;
  }

  const now = new Date();
  const index = await readHighlightIndex();
  const channel = await resolveChannel(apiKey);
  const matches = await loadMatches();
  const retryHours = Number(process.env.HIGHLIGHT_RETRY_HOURS || DEFAULT_RETRY_HOURS);
  const maxMatches = parseMaxMatches(process.env.HIGHLIGHT_MAX_MATCHES);
  const searchableMatches = matches
    .filter((match) => match.status === "finished")
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))
    .filter((match) => !findExistingHighlight(index.matches, match))
    .filter((match) => shouldSearch(index.checked, match, now, retryHours));
  const finishedMatches = limitMatches(searchableMatches, maxMatches);

  if (!finishedMatches.length) {
    console.log("No finished matches need highlight search right now.");
    return;
  }

  let changed = false;
  for (const match of finishedMatches) {
    const result = await searchHighlight(match, channel, apiKey, now);
    const key = matchKey(match);
    const idKey = String(match.id);

    if (result) {
      index.matches[idKey] = result;
      index.matches[key] = { ...result, aliasFor: idKey };
      delete index.checked[idKey];
      delete index.checked[key];
      changed = true;
      console.log(`Added highlight for ${matchLabel(match)}: ${result.title}`);
    } else {
      const previous = index.checked[idKey] || index.checked[key] || {};
      const checked = {
        attempts: Number(previous.attempts || 0) + 1,
        checkedAt: now.toISOString(),
        matchKey: key,
        query: buildSearchQuery(match),
      };
      index.checked[idKey] = checked;
      index.checked[key] = { ...checked, aliasFor: idKey };
      changed = true;
      console.log(`No highlight found for ${matchLabel(match)}.`);
    }
  }

  if (!changed) {
    console.log("Highlight index is already current.");
    return;
  }

  index.schemaVersion = 1;
  index.source = "Official FIFA YouTube highlights";
  index.channelHandle = channel.handle;
  index.channelId = channel.id;
  index.channelTitle = channel.title;
  index.generatedAt = now.toISOString();

  await writeJson(INDEX_URL, index);
  console.log(`Updated ${fileURLToPath(INDEX_URL)}.`);
}

async function loadMatches() {
  const feedUrl = process.env.HIGHLIGHT_MATCH_FEED_URL || process.env.MATCH_FEED_URL;
  if (feedUrl) {
    const response = await fetch(feedUrl);
    if (!response.ok) throw new Error(`Match feed request failed with ${response.status}`);
    const payload = await response.json();
    const rawMatches = Array.isArray(payload) ? payload : payload.matches;
    if (!Array.isArray(rawMatches)) throw new Error("Match feed must be an array or contain a matches array.");
    return normalizeMatches(rawMatches);
  }

  try {
    const data = await fetchEspnWorldCupFeed();
    if (data.matches.length) return data.matches;
  } catch (error) {
    console.warn(`Live match feed unavailable for highlight search: ${error.message}`);
  }

  return freshSampleMatches();
}

async function resolveChannel(apiKey) {
  const configuredId = process.env.YOUTUBE_CHANNEL_ID;
  const handle = process.env.YOUTUBE_CHANNEL_HANDLE || DEFAULT_CHANNEL_HANDLE;
  if (configuredId) {
    return { id: configuredId, handle, title: process.env.YOUTUBE_CHANNEL_TITLE || "FIFA" };
  }

  const payload = await youtubeGet("channels", apiKey, {
    forHandle: handle,
    maxResults: "1",
    part: "id,snippet",
  });
  const channel = payload.items?.[0];
  if (!channel?.id) throw new Error(`Could not resolve YouTube channel handle ${handle}`);
  return {
    handle,
    id: channel.id,
    title: channel.snippet?.title || "FIFA",
  };
}

async function searchHighlight(match, channel, apiKey, now) {
  const payload = await youtubeGet("search", apiKey, {
    channelId: channel.id,
    maxResults: "10",
    order: "date",
    part: "snippet",
    publishedAfter: publishedAfter(match),
    q: buildSearchQuery(match),
    safeSearch: "moderate",
    type: "video",
    videoEmbeddable: "true",
  });

  const candidate = (payload.items || [])
    .map((item) => ({ item, score: scoreVideo(match, item) }))
    .filter((candidate) => candidate.item.id?.videoId && candidate.score >= 95)
    .sort((a, b) => b.score - a.score)[0]?.item;

  if (!candidate) return null;

  const videoId = candidate.id.videoId;
  const snippet = candidate.snippet || {};
  return {
    matchId: String(match.id),
    matchKey: matchKey(match),
    home: String(match.home),
    away: String(match.away),
    kickoff: String(match.kickoff),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: decodeEntities(snippet.title || "Official match highlights"),
    source: "Official FIFA YouTube highlights",
    publishedAt: snippet.publishedAt || "",
    channelTitle: snippet.channelTitle || channel.title,
    thumbnail:
      snippet.thumbnails?.maxres?.url ||
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      "",
    discoveredAt: now.toISOString(),
  };
}

function buildSearchQuery(match) {
  const home = displayTeamName(match.home, match.homeTeam);
  const away = displayTeamName(match.away, match.awayTeam);
  return `${home} ${away} highlights FIFA World Cup ${WORLD_CUP_YEAR}`;
}

function scoreVideo(match, item) {
  const snippet = item.snippet || {};
  const haystack = normalizeText(`${snippet.title || ""} ${snippet.description || ""}`);
  const title = normalizeText(snippet.title || "");
  let score = 0;

  if (haystack.includes("highlight")) score += 38;
  if (haystack.includes("extended highlights")) score += 8;
  if (haystack.includes("world cup")) score += 12;
  if (haystack.includes(WORLD_CUP_YEAR)) score += 8;
  if (haystack.includes("fifa")) score += 8;
  if (matchesTeam(haystack, match.home, match.homeTeam)) score += 36;
  if (matchesTeam(haystack, match.away, match.awayTeam)) score += 36;
  if (title.includes("preview") || title.includes("trailer")) score -= 40;
  if (title.includes("full match") || title.includes("live")) score -= 25;

  return score;
}

function matchesTeam(haystack, code, team) {
  return teamAliases(code, team).some((alias) => haystack.includes(normalizeText(alias)));
}

function teamAliases(code, team) {
  const cleanCode = String(code || "").toUpperCase();
  return Array.from(new Set([cleanCode, displayTeamName(cleanCode, team), ...(TEAM_ALIASES[cleanCode] || [])])).filter(Boolean);
}

function displayTeamName(code, team) {
  return team?.name || teams[String(code).toUpperCase()]?.name || String(code).toUpperCase();
}

function findExistingHighlight(indexMatches, match) {
  return indexMatches?.[String(match.id)] || indexMatches?.[matchKey(match)] || indexMatches?.[matchKey(match, { reverseTeams: true })];
}

function shouldSearch(checked, match, now, retryHours) {
  const record = checked?.[String(match.id)] || checked?.[matchKey(match)] || checked?.[matchKey(match, { reverseTeams: true })];
  if (!record?.checkedAt) return true;
  const checkedAt = new Date(record.checkedAt);
  if (Number.isNaN(checkedAt.getTime())) return true;
  return now - checkedAt >= retryHours * 60 * 60 * 1000;
}

function matchLabel(match) {
  return `${displayTeamName(match.home, match.homeTeam)} vs ${displayTeamName(match.away, match.awayTeam)}`;
}

function matchKey(match, options = {}) {
  const home = String(options.reverseTeams ? match.away : match.home).toLowerCase();
  const away = String(options.reverseTeams ? match.home : match.away).toLowerCase();
  const date = String(match.kickoff || "").slice(0, 10);
  return `${date}-${home}-${away}`;
}

function publishedAfter(match) {
  const kickoff = new Date(match.kickoff);
  if (Number.isNaN(kickoff.getTime())) return `${WORLD_CUP_YEAR}-06-01T00:00:00Z`;
  kickoff.setHours(kickoff.getHours() - 2);
  return kickoff.toISOString();
}

function parseMaxMatches(value) {
  if (value === undefined || value === null || String(value).trim() === "") return DEFAULT_MAX_MATCHES;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "all" || normalized === "unlimited") return Number.POSITIVE_INFINITY;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return Number.POSITIVE_INFINITY;
  return Math.floor(parsed);
}

function limitMatches(matches, maxMatches) {
  return Number.isFinite(maxMatches) ? matches.slice(0, maxMatches) : matches;
}

async function youtubeGet(resource, apiKey, params) {
  const url = new URL(`${API_BASE}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `YouTube API request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function readHighlightIndex() {
  try {
    const raw = await readFile(INDEX_URL, "utf8");
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: 1,
      source: "Official FIFA YouTube highlights",
      channelHandle: DEFAULT_CHANNEL_HANDLE,
      channelId: "",
      channelTitle: "",
      generatedAt: null,
      matches: {},
      checked: {},
      ...parsed,
      matches: parsed.matches || {},
      checked: parsed.checked || {},
    };
  } catch {
    return {
      schemaVersion: 1,
      source: "Official FIFA YouTube highlights",
      channelHandle: DEFAULT_CHANNEL_HANDLE,
      channelId: "",
      channelTitle: "",
      generatedAt: null,
      matches: {},
      checked: {},
    };
  }
}

async function writeJson(url, payload) {
  const filePath = fileURLToPath(url);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(sortObject(payload), null, 2)}\n`);
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObject(value[key]);
      return acc;
    }, {});
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
