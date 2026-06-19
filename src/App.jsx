import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Clock3,
  Goal,
  Radio,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Table2,
  Trophy,
} from "lucide-react";
import { formatKickoff, standings as sampleStandings, statusLabel, teams } from "./data.js";
import { collectTeamsFromMatches, fetchLiveData, freshSampleMatches, getFeedUrl } from "./liveFeed.js";

const tabs = [
  { id: "live", label: "Live", icon: Radio },
  { id: "fixtures", label: "Fixtures", icon: CalendarDays },
  { id: "groups", label: "Groups", icon: Table2 },
];

function App() {
  const [activeTab, setActiveTab] = useState("live");
  const [matches, setMatches] = useState(() => freshSampleMatches());
  const [groupTables, setGroupTables] = useState(sampleStandings);
  const [teamsByCode, setTeamsByCode] = useState(teams);
  const [selectedMatchId, setSelectedMatchId] = useState("m-101");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [source, setSource] = useState(getFeedUrl() ? "External JSON feed" : "Loading ESPN feed");
  const [feedError, setFeedError] = useState("");

  const groups = useMemo(() => {
    const uniqueGroups = Array.from(new Set(matches.map((match) => match.group))).sort();
    return ["All", ...uniqueGroups];
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    return matches
      .filter((match) => group === "All" || match.group === group)
      .filter((match) => {
        if (!cleanQuery) return true;
        const home = teamName(match.home, teamsByCode).toLowerCase();
        const away = teamName(match.away, teamsByCode).toLowerCase();
        return [home, away, match.home.toLowerCase(), match.away.toLowerCase(), match.venue.toLowerCase(), match.group.toLowerCase()].some((value) =>
          value.includes(cleanQuery)
        );
      })
      .sort((a, b) => scoreStatusWeight(a.status) - scoreStatusWeight(b.status));
  }, [group, matches, query, teamsByCode]);

  const selectedMatch = useMemo(() => {
    const preferred = filteredMatches.find((match) => match.id === selectedMatchId);
    return preferred || filteredMatches.find((match) => match.status === "live") || filteredMatches[0] || null;
  }, [filteredMatches, selectedMatchId]);

  const visibleStandings = groupTables[selectedMatch?.group] || groupTables["Group C"] || [];

  useEffect(() => {
    const controller = new AbortController();

    async function loadFeed() {
      await loadLiveFeed(controller.signal);
    }

    loadFeed();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;

    const interval = window.setInterval(async () => {
      await loadLiveFeed();
    }, 12000);

    return () => window.clearInterval(interval);
  }, [autoRefresh]);

  async function loadLiveFeed(signal) {
    try {
      const data = await fetchLiveData(signal);
      if (!data.matches.length) throw new Error("Real feed returned no matches for the current window");
      const nextTeams = { ...teams, ...data.teams, ...collectTeamsFromMatches(data.matches) };
      setMatches(data.matches);
      setGroupTables(data.standings || sampleStandings);
      setTeamsByCode(nextTeams);
      setSelectedMatchId((current) =>
        data.matches.some((match) => match.id === current) ? current : choosePrimaryMatch(data.matches)?.id || ""
      );
      setSource(data.source);
      setFeedError("");
      setLastUpdated(new Date());
    } catch (error) {
      if (error.name === "AbortError") return;
      const fallbackMatches = freshSampleMatches();
      setMatches(fallbackMatches);
      setGroupTables(sampleStandings);
      setTeamsByCode({ ...teams, ...collectTeamsFromMatches(fallbackMatches) });
      setSelectedMatchId(fallbackMatches[0]?.id || "");
      setSource("Demo fallback");
      setFeedError(error.message);
      setLastUpdated(new Date());
    }
  }

  function refreshNow() {
    loadLiveFeed();
  }

  return (
    <div className="app-shell">
      <Header
        autoRefresh={autoRefresh}
        feedError={feedError}
        lastUpdated={lastUpdated}
        onRefresh={refreshNow}
        onToggleRefresh={() => setAutoRefresh((current) => !current)}
        source={source}
      />

      <main className="board">
        <section className="control-bar" aria-label="Score board controls">
          <div className="tabs" role="tablist" aria-label="Board views">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  className={activeTab === tab.id ? "tab active" : "tab"}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.id}
                >
                  <Icon size={16} strokeWidth={2.2} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <label className="search-box">
            <Search size={16} strokeWidth={2.2} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search team or venue"
              type="search"
            />
          </label>

          <label className="select-box">
            <SlidersHorizontal size={16} strokeWidth={2.2} />
            <select value={group} onChange={(event) => setGroup(event.target.value)}>
              {groups.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <ChevronDown className="select-chevron" size={16} strokeWidth={2.2} />
          </label>
        </section>

        {activeTab === "live" && (
          <LiveBoard
            matches={filteredMatches}
            selectedMatch={selectedMatch}
            selectedMatchId={selectedMatch?.id}
            standingsRows={visibleStandings}
            teamsByCode={teamsByCode}
            onSelectMatch={setSelectedMatchId}
          />
        )}

        {activeTab === "fixtures" && (
          <FixturesView matches={filteredMatches} teamsByCode={teamsByCode} onSelectMatch={setSelectedMatchId} />
        )}

        {activeTab === "groups" && <GroupsView groupTables={groupTables} teamsByCode={teamsByCode} />}
      </main>
    </div>
  );
}

function Header({ autoRefresh, feedError, lastUpdated, onRefresh, onToggleRefresh, source }) {
  const localeClock = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(lastUpdated);

  return (
    <header className="top-bar">
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">
          <Trophy size={20} strokeWidth={2.4} />
        </span>
        <div>
          <h1>FIFA Watchboard</h1>
          <div className="source-row">
            <span className="live-dot" aria-hidden="true" />
            <span>World Cup 2026</span>
            <span>{source}</span>
            {feedError && <span className="feed-warning">Feed fallback active</span>}
          </div>
        </div>
      </div>

      <div className="header-actions">
        <div className="clock-chip">
          <Clock3 size={16} strokeWidth={2.2} />
          <span>{localeClock}</span>
        </div>
        <button className="icon-button" onClick={onToggleRefresh} type="button" aria-label="Toggle auto refresh">
          {autoRefresh ? <CirclePause size={18} /> : <CirclePlay size={18} />}
          <span>Auto refresh</span>
        </button>
        <button className="icon-button refresh" onClick={onRefresh} type="button" aria-label="Refresh scores now">
          <RefreshCw size={18} />
        </button>
      </div>
    </header>
  );
}

function LiveBoard({ matches, onSelectMatch, selectedMatch, selectedMatchId, standingsRows, teamsByCode }) {
  if (!selectedMatch) {
    return (
      <section className="wide-panel empty-board">
        <h2>No matches found</h2>
        <p>Try clearing the search or changing the group filter.</p>
      </section>
    );
  }

  return (
    <div className="live-grid">
      <section className="featured-panel" aria-label="Featured match">
        <FeaturedMatch match={selectedMatch} teamsByCode={teamsByCode} />
      </section>

      <section className="match-panel" aria-label="Match list">
        <div className="section-heading">
          <div>
            <h2>Live</h2>
            <p>{matches.length} tracked matches</p>
          </div>
          <Activity size={18} strokeWidth={2.2} />
        </div>
        <div className="match-list">
          {matches.map((match) => (
            <MatchRow
              key={match.id}
              active={match.id === selectedMatchId}
              match={match}
              teamsByCode={teamsByCode}
              onClick={() => onSelectMatch(match.id)}
            />
          ))}
        </div>
      </section>

      <aside className="side-rail" aria-label="Match insights">
        <StandingsPanel group={selectedMatch.group} rows={standingsRows} teamsByCode={teamsByCode} />
        <EventTimeline
          away={selectedMatch.away}
          events={selectedMatch.events}
          home={selectedMatch.home}
          teamsByCode={teamsByCode}
        />
      </aside>
    </div>
  );
}

function FeaturedMatch({ match, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const possessionAway = 100 - match.stats.possessionHome;

  return (
    <div className="scoreboard">
      <div className="scoreboard-meta">
        <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
        <span>{match.group}</span>
        <span>{match.venue}</span>
      </div>

      <div className="score-display">
        <TeamScore side="home" score={match.homeScore} team={home} />
        <div className="match-clock">
          <span>{match.status === "upcoming" ? formatKickoff(match.kickoff) : `${match.minute}'`}</span>
          <small>{match.note}</small>
        </div>
        <TeamScore side="away" score={match.awayScore} team={away} />
      </div>

      <div className="stat-strip">
        <StatPill label="Possession" value={`${match.stats.possessionHome}%`} />
        <StatPill label="Shots" value={`${match.stats.shotsHome}-${match.stats.shotsAway}`} />
        <StatPill label="xG" value={`${match.stats.xgHome.toFixed(1)}-${match.stats.xgAway.toFixed(1)}`} />
      </div>

      <div className="possession-bar" aria-label="Possession split">
        <span style={{ width: `${match.stats.possessionHome}%` }} />
        <span style={{ width: `${possessionAway}%` }} />
      </div>
    </div>
  );
}

function TeamScore({ score, side, team }) {
  return (
    <div className={`team-score ${side}`}>
      <TeamBadge team={team} />
      <strong>{score ?? "-"}</strong>
      <span>{team.name}</span>
    </div>
  );
}

function MatchRow({ active, match, onClick, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);

  return (
    <button className={active ? "match-row active" : "match-row"} onClick={onClick} type="button">
      <div className="match-row-main">
        <div className="row-team">
          <TeamBadge team={home} compact />
          <span>{home.name}</span>
        </div>
        <div className="row-score">
          <strong>{match.homeScore ?? "-"}</strong>
          <span>:</span>
          <strong>{match.awayScore ?? "-"}</strong>
        </div>
        <div className="row-team away">
          <span>{away.name}</span>
          <TeamBadge team={away} compact />
        </div>
      </div>
      <div className="match-row-meta">
        <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
        <span>{match.status === "upcoming" ? formatKickoff(match.kickoff) : `${match.minute}'`}</span>
        <span>{match.venue}</span>
      </div>
    </button>
  );
}

function StandingsPanel({ group, rows, teamsByCode }) {
  return (
    <section className="rail-panel">
      <div className="section-heading compact">
        <div>
          <h2>Standings</h2>
          <p>{group}</p>
        </div>
        <Table2 size={18} strokeWidth={2.2} />
      </div>
      <table className="standings-table">
        <thead>
          <tr>
            <th>Team</th>
            <th>MP</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const item = row.teamData || getTeam(row.team, teamsByCode);
            return (
              <tr key={row.team}>
                <td>
                  <TeamBadge team={item} compact />
                  <span>{item.code}</span>
                </td>
                <td>{row.played}</td>
                <td>{row.goalsFor - row.goalsAgainst}</td>
                <td>{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function EventTimeline({ away, events, home, teamsByCode }) {
  return (
    <section className="rail-panel events-panel">
      <div className="section-heading compact">
        <div>
          <h2>Events</h2>
          <p>
            {teamName(home, teamsByCode)} vs {teamName(away, teamsByCode)}
          </p>
        </div>
        <Goal size={18} strokeWidth={2.2} />
      </div>
      <div className="event-list">
        {events.length ? (
          events.map((event, index) => (
            <div className="event-item" key={`${event.minute}-${event.team}-${index}`}>
              <span className={`event-type ${event.type}`} />
              <strong>{event.minute}'</strong>
              <p>{event.text}</p>
            </div>
          ))
        ) : (
          <div className="empty-state">No match events yet</div>
        )}
      </div>
    </section>
  );
}

function FixturesView({ matches, onSelectMatch, teamsByCode }) {
  const byDate = matches.reduce((days, match) => {
    const key = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(new Date(match.kickoff));
    return { ...days, [key]: [...(days[key] || []), match] };
  }, {});

  return (
    <section className="wide-panel fixtures-view">
      <div className="section-heading">
        <div>
          <h2>Fixtures</h2>
          <p>Schedule board with status and venue tracking</p>
        </div>
        <CalendarDays size={18} strokeWidth={2.2} />
      </div>
      <div className="fixture-days">
        {Object.entries(byDate).map(([date, dayMatches]) => (
          <div className="fixture-day" key={date}>
            <h3>{date}</h3>
            <div className="fixture-stack">
              {dayMatches.map((match) => (
                <MatchRow
                  key={match.id}
                  active={false}
                  match={match}
                  teamsByCode={teamsByCode}
                  onClick={() => onSelectMatch(match.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GroupsView({ groupTables, teamsByCode }) {
  return (
    <section className="groups-view">
      {Object.entries(groupTables).map(([groupName, rows]) => (
        <StandingsPanel group={groupName} key={groupName} rows={rows} teamsByCode={teamsByCode} />
      ))}
    </section>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="stat-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TeamBadge({ compact = false, team }) {
  return (
    <span
      className={compact ? "team-badge compact" : "team-badge"}
      style={{
        "--team-primary": team.colors[0],
        "--team-secondary": team.colors[1],
      }}
    >
      {team.flagUrl && <img src={team.flagUrl} alt="" loading="lazy" />}
      <span>{team.code}</span>
    </span>
  );
}

function getTeam(code, teamsByCode) {
  return teamsByCode[code] || teams[code] || { name: code, code, colors: ["#8de4ff", "#f4f7fb"] };
}

function teamName(code, teamsByCode) {
  return getTeam(code, teamsByCode).name;
}

function scoreStatusWeight(status) {
  if (status === "live") return 0;
  if (status === "halftime") return 1;
  if (status === "upcoming") return 2;
  return 3;
}

function choosePrimaryMatch(matches) {
  return [...matches].sort((a, b) => scoreStatusWeight(a.status) - scoreStatusWeight(b.status))[0];
}

export default App;
