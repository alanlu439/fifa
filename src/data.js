export const teams = {
  BRA: {
    name: "Brazil",
    code: "BRA",
    colors: ["#f7cf2f", "#1fa36a"],
  },
  HAI: {
    name: "Haiti",
    code: "HAI",
    colors: ["#2f6dff", "#d73445"],
  },
  USA: {
    name: "USA",
    code: "USA",
    colors: ["#1e5eff", "#f2445a"],
  },
  AUS: {
    name: "Australia",
    code: "AUS",
    colors: ["#1e8f5a", "#ffd442"],
  },
  TUR: {
    name: "Türkiye",
    code: "TUR",
    colors: ["#e01f35", "#ffffff"],
  },
  PAR: {
    name: "Paraguay",
    code: "PAR",
    colors: ["#2676ff", "#ef3340"],
  },
  SCO: {
    name: "Scotland",
    code: "SCO",
    colors: ["#2055c7", "#ffffff"],
  },
  MAR: {
    name: "Morocco",
    code: "MAR",
    colors: ["#c42736", "#159957"],
  },
  MEX: {
    name: "Mexico",
    code: "MEX",
    colors: ["#188353", "#d22d42"],
  },
  RSA: {
    name: "South Africa",
    code: "RSA",
    colors: ["#087a4f", "#ffcc2f"],
  },
  CAN: {
    name: "Canada",
    code: "CAN",
    colors: ["#f23d4f", "#ffffff"],
  },
  KOR: {
    name: "Korea Republic",
    code: "KOR",
    colors: ["#ffffff", "#df334e"],
  },
};

export const sampleMatches = [
  {
    id: "m-101",
    group: "Group C",
    venue: "Philadelphia",
    stage: "Group stage",
    kickoff: "2026-06-19T18:00:00-04:00",
    status: "live",
    minute: 64,
    home: "BRA",
    away: "HAI",
    homeScore: 2,
    awayScore: 1,
    note: "Second half",
    stats: { possessionHome: 58, shotsHome: 12, shotsAway: 6, xgHome: 1.9, xgAway: 0.8 },
    events: [
      { minute: 12, team: "BRA", type: "goal", text: "Brazil score from a low cross" },
      { minute: 28, team: "HAI", type: "goal", text: "Haiti level after a set piece" },
      { minute: 52, team: "BRA", type: "goal", text: "Brazil retake the lead" },
      { minute: 61, team: "HAI", type: "card", text: "Haiti booked for a late challenge" },
    ],
  },
  {
    id: "m-102",
    group: "Group D",
    venue: "Seattle",
    stage: "Group stage",
    kickoff: "2026-06-19T20:00:00-07:00",
    status: "live",
    minute: 21,
    home: "USA",
    away: "AUS",
    homeScore: 0,
    awayScore: 0,
    note: "First half",
    stats: { possessionHome: 51, shotsHome: 3, shotsAway: 2, xgHome: 0.3, xgAway: 0.2 },
    events: [
      { minute: 7, team: "USA", type: "shot", text: "USA force an early save" },
      { minute: 18, team: "AUS", type: "corner", text: "Australia win consecutive corners" },
    ],
  },
  {
    id: "m-103",
    group: "Group H",
    venue: "Boston",
    stage: "Group stage",
    kickoff: "2026-06-19T17:00:00-04:00",
    status: "halftime",
    minute: 45,
    home: "TUR",
    away: "PAR",
    homeScore: 1,
    awayScore: 1,
    note: "Half-time",
    stats: { possessionHome: 47, shotsHome: 5, shotsAway: 7, xgHome: 0.7, xgAway: 1.1 },
    events: [
      { minute: 22, team: "PAR", type: "goal", text: "Paraguay finish a quick break" },
      { minute: 41, team: "TUR", type: "goal", text: "Türkiye equalize from distance" },
    ],
  },
  {
    id: "m-104",
    group: "Group C",
    venue: "Kansas City",
    stage: "Group stage",
    kickoff: "2026-06-19T21:00:00-05:00",
    status: "upcoming",
    minute: 0,
    home: "SCO",
    away: "MAR",
    homeScore: null,
    awayScore: null,
    note: "Later today",
    stats: { possessionHome: 0, shotsHome: 0, shotsAway: 0, xgHome: 0, xgAway: 0 },
    events: [],
  },
  {
    id: "m-105",
    group: "Group A",
    venue: "Mexico City",
    stage: "Group stage",
    kickoff: "2026-06-11T19:00:00-06:00",
    status: "finished",
    minute: 90,
    home: "MEX",
    away: "RSA",
    homeScore: 2,
    awayScore: 0,
    note: "Full-time",
    stats: { possessionHome: 56, shotsHome: 13, shotsAway: 8, xgHome: 1.7, xgAway: 0.6 },
    events: [
      { minute: 34, team: "MEX", type: "goal", text: "Mexico open the scoring" },
      { minute: 78, team: "MEX", type: "goal", text: "Mexico seal the match late" },
    ],
  },
  {
    id: "m-106",
    group: "Group B",
    venue: "Toronto",
    stage: "Group stage",
    kickoff: "2026-06-20T17:00:00-04:00",
    status: "upcoming",
    minute: 0,
    home: "CAN",
    away: "KOR",
    homeScore: null,
    awayScore: null,
    note: "Tomorrow",
    stats: { possessionHome: 0, shotsHome: 0, shotsAway: 0, xgHome: 0, xgAway: 0 },
    events: [],
  },
];

export const standings = {
  "Group A": [
    { team: "MEX", played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, points: 3 },
    { team: "KOR", played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, points: 1 },
    { team: "RSA", played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 2, points: 0 },
  ],
  "Group B": [
    { team: "CAN", played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    { team: "KOR", played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  ],
  "Group C": [
    { team: "BRA", played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1, points: 3 },
    { team: "SCO", played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    { team: "MAR", played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    { team: "HAI", played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 1, goalsAgainst: 2, points: 0 },
  ],
  "Group D": [
    { team: "USA", played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 1 },
    { team: "AUS", played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 1 },
  ],
  "Group H": [
    { team: "PAR", played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, points: 1 },
    { team: "TUR", played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, points: 1 },
  ],
};

export function statusLabel(status) {
  if (status === "live") return "LIVE";
  if (status === "halftime") return "HT";
  if (status === "finished") return "FT";
  return "UPCOMING";
}

export function formatKickoff(kickoff) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(kickoff));
}
