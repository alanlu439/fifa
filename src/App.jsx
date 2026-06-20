import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Clock3,
  Goal,
  History,
  Radio,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Table2,
  Trophy,
} from "lucide-react";
import { standings as sampleStandings, statusLabel, teams } from "./data.js";
import { collectTeamsFromMatches, fetchLiveData, freshSampleMatches, getFeedUrl } from "./liveFeed.js";

const tabs = [
  { id: "live", label: "Live", icon: Radio },
  { id: "fixtures", label: "Fixtures", icon: CalendarDays },
  { id: "past", label: "Past", icon: History },
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
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const boardSummary = useMemo(() => getBoardSummary(matches), [matches]);
  const fixtureMatches = useMemo(() => filteredMatches.filter((match) => !isPastMatch(match)), [filteredMatches]);
  const pastMatches = useMemo(() => filteredMatches.filter(isPastMatch).sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)), [filteredMatches]);
  const resultCount = activeTab === "past" ? pastMatches.length : activeTab === "fixtures" ? fixtureMatches.length : filteredMatches.length;

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
    setIsRefreshing(true);
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
    } finally {
      if (!signal?.aborted) setIsRefreshing(false);
    }
  }

  function refreshNow() {
    loadLiveFeed();
  }

  function selectMatch(matchId) {
    setSelectedMatchId(matchId);
    if (activeTab !== "live") setActiveTab("live");
  }

  return (
    <div className="app-shell">
      <Header
        autoRefresh={autoRefresh}
        boardSummary={boardSummary}
        feedError={feedError}
        isRefreshing={isRefreshing}
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

          <div className="result-chip" aria-live="polite">
            <strong>{resultCount}</strong>
            <span>showing</span>
          </div>
        </section>

        {activeTab === "live" && (
          <LiveBoard
            boardSummary={boardSummary}
            matches={filteredMatches}
            selectedMatch={selectedMatch}
            selectedMatchId={selectedMatch?.id}
            standingsRows={visibleStandings}
            teamsByCode={teamsByCode}
            onSelectMatch={selectMatch}
          />
        )}

        {activeTab === "fixtures" && (
          <FixturesView matches={fixtureMatches} teamsByCode={teamsByCode} onSelectMatch={selectMatch} />
        )}

        {activeTab === "past" && (
          <PastEventsView matches={pastMatches} teamsByCode={teamsByCode} onSelectMatch={selectMatch} />
        )}

        {activeTab === "groups" && <GroupsView groupTables={groupTables} teamsByCode={teamsByCode} />}
      </main>
    </div>
  );
}

function Header({ autoRefresh, boardSummary, feedError, isRefreshing, lastUpdated, onRefresh, onToggleRefresh, source }) {
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
            <span className={feedError ? "live-dot warning" : "live-dot"} aria-hidden="true" />
            <strong>{source}</strong>
            <span>World Cup 2026</span>
            <span>{feedError ? "Demo fallback active" : "ESPN scoreboard window"}</span>
          </div>
        </div>
      </div>

      <div className="header-summary" aria-label="Board summary">
        <SummaryChip label="Matches" value={boardSummary.total} />
        <SummaryChip label="Live" value={boardSummary.live} tone={boardSummary.live ? "live" : "neutral"} />
        <SummaryChip label="Past" value={boardSummary.finished} />
        <SummaryChip label="Next" value={boardSummary.nextKickoff} wide />
      </div>

      <div className="header-actions">
        <div className="clock-chip">
          <Clock3 size={16} strokeWidth={2.2} />
          <span>{localeClock}</span>
        </div>
        <button className="icon-button" onClick={onToggleRefresh} type="button" aria-label="Toggle auto refresh">
          {autoRefresh ? <CirclePause size={18} /> : <CirclePlay size={18} />}
          <span>{autoRefresh ? "Auto on" : "Auto off"}</span>
        </button>
        <button
          className={isRefreshing ? "icon-button refresh spinning" : "icon-button refresh"}
          disabled={isRefreshing}
          onClick={onRefresh}
          type="button"
          aria-label="Refresh scores now"
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {feedError && (
        <div className="feed-alert" role="status">
          Real feed unavailable: {feedError}
        </div>
      )}
    </header>
  );
}

function LiveBoard({ boardSummary, matches, onSelectMatch, selectedMatch, selectedMatchId, standingsRows, teamsByCode }) {
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
            <h2>Match Window</h2>
            <p>
              {boardSummary.live} live, {boardSummary.upcoming} upcoming, {boardSummary.finished} final
            </p>
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
  const clockValue = match.status === "upcoming" ? formatShortKickoff(match.kickoff) : `${match.minute}'`;
  const clockLabel = match.status === "upcoming" ? "Kickoff" : match.status === "finished" ? "Full time" : "Match clock";

  return (
    <div className="scoreboard">
      <div className="scoreboard-meta">
        <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
        <span>{match.group}</span>
        <span>{match.venue}</span>
      </div>

      <div className="score-display">
        <TeamScore side="home" score={match.homeScore} team={home} />
        <div className={`match-clock ${match.status}`}>
          <small>{clockLabel}</small>
          <span>{clockValue}</span>
          <small>{match.note || match.stage}</small>
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
  const rowTime = match.status === "upcoming" ? formatShortKickoff(match.kickoff) : match.status === "finished" ? "Final" : `${match.minute}'`;

  return (
    <button className={active ? "match-row active" : "match-row"} onClick={onClick} type="button">
      <div className="match-row-top">
        <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
        <span>{match.group}</span>
        <span>{rowTime}</span>
      </div>
      <div className="match-row-main">
        <div className="row-team">
          <TeamBadge team={home} compact />
          <span className="row-team-name">{home.name}</span>
        </div>
        <div className="row-score">
          <strong>{match.homeScore ?? "-"}</strong>
          <span>:</span>
          <strong>{match.awayScore ?? "-"}</strong>
        </div>
        <div className="row-team away">
          <span className="row-team-name">{away.name}</span>
          <TeamBadge team={away} compact />
        </div>
      </div>
      <div className="match-row-meta">
        <span>{match.venue}</span>
        <span>{match.note || match.stage}</span>
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
        {Object.entries(byDate).length ? (
          Object.entries(byDate).map(([date, dayMatches]) => (
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
          ))
        ) : (
          <div className="empty-state wide">No fixtures match the current filters</div>
        )}
      </div>
    </section>
  );
}

function PastEventsView({ matches, onSelectMatch, teamsByCode }) {
  const byDate = groupMatchesByDate(matches);

  return (
    <section className="wide-panel past-view">
      <div className="section-heading">
        <div>
          <h2>Past Events</h2>
          <p>Completed matches with final scores and published match events</p>
        </div>
        <History size={18} strokeWidth={2.2} />
      </div>
      <div className="past-days">
        {Object.entries(byDate).length ? (
          Object.entries(byDate).map(([date, dayMatches]) => (
            <div className="past-day" key={date}>
              <h3>{date}</h3>
              <div className="past-stack">
                {dayMatches.map((match) => (
                  <PastEventCard
                    key={match.id}
                    match={match}
                    teamsByCode={teamsByCode}
                    onClick={() => onSelectMatch(match.id)}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state wide">No past events match the current filters</div>
        )}
      </div>
    </section>
  );
}

function PastEventCard({ match, onClick, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const visibleEvents = match.events.slice(0, 4);

  return (
    <button className="past-card" onClick={onClick} type="button" aria-label={`Open ${home.name} vs ${away.name}`}>
      <div className="past-card-top">
        <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
        <span>{match.group}</span>
        <span>{match.venue}</span>
      </div>

      <div className="past-scoreline">
        <div className="past-team">
          <TeamBadge team={home} compact />
          <span>{home.name}</span>
        </div>
        <div className="past-score">
          <strong>{match.homeScore ?? "-"}</strong>
          <span>:</span>
          <strong>{match.awayScore ?? "-"}</strong>
        </div>
        <div className="past-team away">
          <span>{away.name}</span>
          <TeamBadge team={away} compact />
        </div>
      </div>

      <div className="past-events">
        {visibleEvents.length ? (
          visibleEvents.map((event, index) => (
            <span className="past-event" key={`${match.id}-${event.minute}-${event.text}-${index}`}>
              <span className={`event-type ${event.type}`} />
              <strong>{event.minute}'</strong>
              <span>{event.text}</span>
            </span>
          ))
        ) : (
          <span className="past-event muted">Final score recorded; event detail not published in feed.</span>
        )}
      </div>
    </button>
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

function SummaryChip({ label, tone = "neutral", value, wide = false }) {
  return (
    <div className={`summary-chip ${tone} ${wide ? "wide" : ""}`}>
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

function getBoardSummary(matches) {
  const live = matches.filter((match) => match.status === "live" || match.status === "halftime").length;
  const upcomingMatches = matches
    .filter((match) => match.status === "upcoming")
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  return {
    total: matches.length,
    live,
    upcoming: upcomingMatches.length,
    finished: matches.filter((match) => match.status === "finished").length,
    nextKickoff: upcomingMatches[0] ? formatShortKickoff(upcomingMatches[0].kickoff) : "TBD",
  };
}

function formatShortKickoff(kickoff) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(kickoff));
}

function formatLongDate(kickoff) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    weekday: "short",
  }).format(new Date(kickoff));
}

function groupMatchesByDate(matches) {
  return matches.reduce((days, match) => {
    const key = formatLongDate(match.kickoff);
    return { ...days, [key]: [...(days[key] || []), match] };
  }, {});
}

function isPastMatch(match) {
  return match.status === "finished";
}

function choosePrimaryMatch(matches) {
  return [...matches].sort((a, b) => scoreStatusWeight(a.status) - scoreStatusWeight(b.status))[0];
}

export default App;
