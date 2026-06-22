import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Clock3,
  ExternalLink,
  Goal,
  History,
  LayoutDashboard,
  Minimize2,
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

const REFRESH_INTERVAL_MS = 12000;
const flagCodesByTeam = {
  ALG: "DZ",
  ARG: "AR",
  AUS: "AU",
  AUT: "AT",
  BEL: "BE",
  BIH: "BA",
  BRA: "BR",
  CAN: "CA",
  CHI: "CL",
  CIV: "CI",
  COD: "CD",
  COL: "CO",
  CPV: "CV",
  CRC: "CR",
  CRO: "HR",
  CUW: "CW",
  CZE: "CZ",
  DEN: "DK",
  ECU: "EC",
  EGY: "EG",
  ENG: "GB-ENG",
  ESP: "ES",
  FRA: "FR",
  GER: "DE",
  GHA: "GH",
  HAI: "HT",
  IRN: "IR",
  IRQ: "IQ",
  ITA: "IT",
  JAM: "JM",
  JOR: "JO",
  JPN: "JP",
  KOR: "KR",
  KSA: "SA",
  MAR: "MA",
  MEX: "MX",
  NED: "NL",
  NOR: "NO",
  NZL: "NZ",
  PAN: "PA",
  PAR: "PY",
  POL: "PL",
  POR: "PT",
  QAT: "QA",
  ROU: "RO",
  RSA: "ZA",
  SCO: "GB-SCT",
  SEN: "SN",
  SRB: "RS",
  SUI: "CH",
  SWE: "SE",
  TUN: "TN",
  TUR: "TR",
  UKR: "UA",
  URU: "UY",
  USA: "US",
  UZB: "UZ",
  WAL: "GB-WLS",
};

const FIFA_YOUTUBE_CHANNEL = "https://www.youtube.com/@fifa";

function App() {
  const appShellRef = useRef(null);
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
  const [source, setSource] = useState(getFeedUrl() ? "External JSON feed" : "Loading live feed");
  const [feedError, setFeedError] = useState("");
  const [fullscreenElementActive, setFullscreenElementActive] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);

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
  const dashboardLiveMatches = useMemo(() => filteredMatches.filter(isLiveMatch), [filteredMatches]);
  const dashboardUpcomingMatch = useMemo(
    () => filteredMatches.filter((match) => match.status === "upcoming").sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0] || null,
    [filteredMatches]
  );

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
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    function syncFullscreenState() {
      const isNativeFullscreen = Boolean(document.fullscreenElement);
      setFullscreenElementActive(isNativeFullscreen);
      if (isNativeFullscreen) setFullscreenFallback(false);
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    syncFullscreenState();
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

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

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Dashboard Mode remains available even if the browser blocks fullscreen exit.
      }
      setFullscreenFallback(false);
      return;
    }

    setFullscreenFallback((current) => !current);
  }

  const fullscreenActive = fullscreenElementActive || fullscreenFallback;
  const dashboardPrimaryMatch = dashboardLiveMatches[0] || dashboardUpcomingMatch || selectedMatch;
  const dashboardMatches = dashboardLiveMatches.length ? dashboardLiveMatches : dashboardPrimaryMatch ? [dashboardPrimaryMatch] : [];
  const dashboardMode = dashboardLiveMatches.length ? "live" : "upcoming";
  const dashboardStandings = groupTables[dashboardPrimaryMatch?.group] || [];

  return (
    <div className={fullscreenActive ? "app-shell dashboard-fullscreen" : "app-shell"} ref={appShellRef}>
      <Header
        autoRefresh={autoRefresh}
        feedError={feedError}
        isFullscreen={fullscreenActive}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        onRefresh={refreshNow}
        onToggleFullscreen={toggleFullscreen}
        onToggleRefresh={() => setAutoRefresh((current) => !current)}
        source={source}
      />

      {fullscreenActive ? (
        <DashboardMode
          boardSummary={boardSummary}
          matches={dashboardMatches}
          mode={dashboardMode}
          onSelectMatch={selectMatch}
          primaryMatch={dashboardPrimaryMatch}
          standingsRows={dashboardStandings}
          teamsByCode={teamsByCode}
        />
      ) : (
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
                  aria-label={tab.label}
                  aria-selected={activeTab === tab.id}
                  title={tab.label}
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
      )}
    </div>
  );
}

function Header({
  autoRefresh,
  feedError,
  isFullscreen,
  isRefreshing,
  lastUpdated,
  onRefresh,
  onToggleFullscreen,
  onToggleRefresh,
  source,
}) {
  const [now, setNow] = useState(() => new Date());
  const DashboardIcon = isFullscreen ? Minimize2 : LayoutDashboard;
  const currentClock = formatClockParts(now);
  const updateAge = formatUpdateAge(now - lastUpdated);
  const autoRefreshLabel = autoRefresh ? "Pause auto refresh" : "Resume auto refresh";
  const dashboardLabel = isFullscreen ? "Exit dashboard mode" : "Enter dashboard mode";

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  return (
    <header className="top-bar" aria-label="Scoreboard header">
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
            <span>{feedError ? "Demo fallback active" : `Synced ${updateAge}`}</span>
          </div>
        </div>
      </div>

      <div className="header-actions">
        <div className="clock-chip" aria-label={`Current time ${currentClock.label}`}>
          <Clock3 size={22} strokeWidth={2.2} />
          <span className="clock-time">{currentClock.time}</span>
          <span className="clock-zone">{currentClock.zone}</span>
        </div>
        <button className="icon-button" onClick={onToggleRefresh} type="button" aria-label={autoRefreshLabel} aria-pressed={autoRefresh} title={autoRefreshLabel}>
          {autoRefresh ? <CirclePause size={18} /> : <CirclePlay size={18} />}
        </button>
        <button
          className={isRefreshing ? "icon-button refresh spinning" : "icon-button refresh"}
          disabled={isRefreshing}
          onClick={onRefresh}
          type="button"
          aria-label="Refresh scores now"
          title="Refresh scores now"
        >
          <RefreshCw size={18} />
        </button>
        <button
          className={isFullscreen ? "icon-button fullscreen-button dashboard-toggle active" : "icon-button fullscreen-button dashboard-toggle"}
          onClick={onToggleFullscreen}
          type="button"
          aria-label={dashboardLabel}
          aria-pressed={isFullscreen}
          title={dashboardLabel}
        >
          <DashboardIcon size={20} />
        </button>
      </div>

      {feedError && (
        <div className="feed-alert" role="status">
          Live match data unavailable: {feedError}
        </div>
      )}
    </header>
  );
}

function DashboardMode({ boardSummary, matches, mode, onSelectMatch, primaryMatch, standingsRows, teamsByCode }) {
  if (!primaryMatch) {
    return (
      <main className="dashboard-board empty-board">
        <h2>No dashboard match available</h2>
        <p>Try clearing filters or refreshing the feed.</p>
      </main>
    );
  }

  const isLive = mode === "live";
  const home = getTeam(primaryMatch.home, teamsByCode);
  const away = getTeam(primaryMatch.away, teamsByCode);
  const eventCount = primaryMatch.events.length;
  const kickoff = formatFeaturedKickoff(primaryMatch.kickoff);
  const otherMatches = matches.filter((match) => match.id !== primaryMatch.id);

  return (
    <main className={`dashboard-board ${isLive ? "live-dashboard" : "upcoming-dashboard"}`} aria-label="Dashboard mode">
      <section className="dashboard-stage" aria-label={isLive ? "Live match focus" : "Upcoming match focus"}>
        <div className="dashboard-title-row">
          <div>
            <h2>{isLive ? "Live Dashboard" : "Next Match Dashboard"}</h2>
            <p>{isLive ? `${boardSummary.live} match${boardSummary.live === 1 ? "" : "es"} live now` : "No live matches. Showing the next scheduled fixture."}</p>
          </div>
          <span className={`status-chip ${primaryMatch.status}`}>{statusLabel(primaryMatch.status)}</span>
        </div>

        <div className="dashboard-score">
          <DashboardTeam team={home} score={primaryMatch.homeScore} />
          <div className={`dashboard-clock-card ${primaryMatch.status}`}>
            <small>{isLive ? primaryMatch.note || "In play" : "Kickoff"}</small>
            {primaryMatch.status === "upcoming" ? (
              <span className="clock-stack">
                <strong>{kickoff.date}</strong>
                <span>{kickoff.time}</span>
              </span>
            ) : (
              <strong>{`${primaryMatch.minute}'`}</strong>
            )}
            <small>{primaryMatch.group}</small>
          </div>
          <DashboardTeam team={away} score={primaryMatch.awayScore} />
        </div>

        <div className="dashboard-meta-grid">
          <DashboardInfo label="Venue" value={primaryMatch.venue} />
          <DashboardInfo label="Stage" value={primaryMatch.stage} />
          <DashboardInfo label="Events" value={eventCount ? `${eventCount} recorded` : primaryMatch.status === "upcoming" ? "Awaiting kickoff" : "No events yet"} />
          <DashboardInfo label="Next kickoff" value={boardSummary.nextKickoff} />
        </div>

        <div className="dashboard-stat-row">
          <StatPill label="Possession" value={`${primaryMatch.stats.possessionHome}%`} />
          <StatPill label="Shots" value={`${primaryMatch.stats.shotsHome}-${primaryMatch.stats.shotsAway}`} />
          <StatPill label="xG" value={`${primaryMatch.stats.xgHome.toFixed(1)}-${primaryMatch.stats.xgAway.toFixed(1)}`} />
        </div>
      </section>

      <section className="dashboard-panel dashboard-window" aria-label={isLive ? "Live matches" : "Upcoming match"}>
        <div className="section-heading compact">
          <div>
            <h2>{isLive ? "Live Only" : "Next Up"}</h2>
            <p>{isLive ? "Finished and future fixtures hidden in Dashboard Mode" : "Dashboard fallback while live window is quiet"}</p>
          </div>
          <Activity size={18} strokeWidth={2.2} />
        </div>
        <div className="dashboard-match-stack">
          <DashboardMatchTile active match={primaryMatch} onClick={() => onSelectMatch(primaryMatch.id)} teamsByCode={teamsByCode} />
          {otherMatches.map((match) => (
            <DashboardMatchTile key={match.id} match={match} onClick={() => onSelectMatch(match.id)} teamsByCode={teamsByCode} />
          ))}
        </div>
      </section>

      <section className="dashboard-panel dashboard-details" aria-label="Detailed match information">
        <EventTimeline away={primaryMatch.away} events={primaryMatch.events.slice(0, 5)} home={primaryMatch.home} teamsByCode={teamsByCode} />
        <StandingsPanel group={primaryMatch.group} rows={standingsRows.slice(0, 4)} teamsByCode={teamsByCode} />
      </section>
    </main>
  );
}

function DashboardTeam({ score, team }) {
  return (
    <div className="dashboard-team">
      <TeamBadge team={team} />
      <span>{team.name}</span>
      <strong>{score ?? "-"}</strong>
    </div>
  );
}

function DashboardInfo({ label, value }) {
  return (
    <div className="dashboard-info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardMatchTile({ active = false, match, onClick, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const timeLabel = match.status === "upcoming" ? formatShortKickoff(match.kickoff) : `${match.minute}'`;

  return (
    <button className={active ? "dashboard-match-tile active" : "dashboard-match-tile"} onClick={onClick} type="button">
      <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
      <div className="dashboard-tile-main">
        <span>{home.code}</span>
        <strong>{match.homeScore ?? "-"} : {match.awayScore ?? "-"}</strong>
        <span>{away.code}</span>
      </div>
      <div className="dashboard-tile-meta">
        <span>{match.group}</span>
        <span>{timeLabel}</span>
      </div>
    </button>
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
  const kickoff = formatFeaturedKickoff(match.kickoff);
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
          {match.status === "upcoming" ? (
            <span className="clock-stack">
              <strong>{kickoff.date}</strong>
              <span>{kickoff.time}</span>
            </span>
          ) : (
            <span>{`${match.minute}'`}</span>
          )}
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

      <MatchHighlights match={match} teamsByCode={teamsByCode} />
    </div>
  );
}

function TeamScore({ score, side, team }) {
  return (
    <div className={`team-score ${side} ${score == null ? "pending" : ""}`}>
      <TeamBadge team={team} />
      <span className="team-name">{team.name}</span>
      <strong>{score ?? "-"}</strong>
    </div>
  );
}

function MatchRow({ active, match, onClick, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const rowTime = match.status === "upcoming" ? formatShortKickoff(match.kickoff) : match.status === "finished" ? "Final" : `${match.minute}'`;

  return (
    <article className={active ? "match-card active" : "match-card"}>
      <button className="match-row" onClick={onClick} type="button">
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
      <MatchHighlights compact match={match} teamsByCode={teamsByCode} />
    </article>
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

function MatchHighlights({ compact = false, match, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const highlights = getMatchHighlights(match);
  const resolved = highlights ? resolveYouTubeHighlight(highlights.url) : null;
  const searchUrl = officialHighlightsSearchUrl(match, teamsByCode);
  const title = highlights?.title || `${home.name} vs ${away.name} official highlights`;
  const placeholder = match.status === "finished" ? "Official highlights pending" : "Highlights publish after full time";

  return (
    <section className={compact ? "match-highlights compact" : "match-highlights"} aria-label={`${home.name} vs ${away.name} official highlights`}>
      <div className="highlight-heading">
        <div>
          <h3>
            <CirclePlay size={15} strokeWidth={2.2} />
            Official highlights
          </h3>
          <p>{resolved ? highlights.source : placeholder}</p>
        </div>
        <a href={resolved?.watchUrl || searchUrl} target="_blank" rel="noreferrer">
          {resolved ? "Watch on YouTube" : "Search FIFA"}
          <ExternalLink size={13} strokeWidth={2.2} />
        </a>
      </div>

      {resolved ? (
        <div className="highlight-frame">
          <iframe
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-same-origin allow-scripts allow-presentation allow-popups"
            src={resolved.embedUrl}
            title={title}
          />
        </div>
      ) : (
        <div className="highlight-placeholder">
          <CirclePlay size={20} strokeWidth={1.9} />
          <span>{placeholder}</span>
        </div>
      )}
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
      <PastVideosLibrary matches={matches} teamsByCode={teamsByCode} onSelectMatch={onSelectMatch} />
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

function PastVideosLibrary({ matches, onSelectMatch, teamsByCode }) {
  if (!matches.length) return null;

  const publishedCount = matches.filter((match) => getMatchHighlights(match)).length;
  const pendingCount = matches.length - publishedCount;

  return (
    <section className="past-video-library" aria-label="All past match videos">
      <div className="section-heading compact">
        <div>
          <h2>Past Videos</h2>
          <p>
            {publishedCount} published, {pendingCount} waiting for official FIFA upload
          </p>
        </div>
        <CirclePlay size={18} strokeWidth={2.2} />
      </div>
      <div className="past-video-grid">
        {matches.map((match) => (
          <PastVideoCard key={`video-${match.id}`} match={match} teamsByCode={teamsByCode} onClick={() => onSelectMatch(match.id)} />
        ))}
      </div>
    </section>
  );
}

function PastVideoCard({ match, onClick, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);

  return (
    <article className="past-video-card">
      <button className="past-video-summary" onClick={onClick} type="button" aria-label={`Open ${home.name} vs ${away.name}`}>
        <div className="past-video-top">
          <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
          <span>{formatShortKickoff(match.kickoff)}</span>
          <span>{match.venue}</span>
        </div>
        <div className="past-video-match">
          <div className="past-video-team">
            <TeamBadge team={home} compact />
            <span>{home.name}</span>
          </div>
          <div className="past-video-score">
            <strong>{match.homeScore ?? "-"}</strong>
            <span>:</span>
            <strong>{match.awayScore ?? "-"}</strong>
          </div>
          <div className="past-video-team away">
            <span>{away.name}</span>
            <TeamBadge team={away} compact />
          </div>
        </div>
      </button>
      <MatchHighlights match={match} teamsByCode={teamsByCode} />
    </article>
  );
}

function PastEventCard({ match, onClick, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const visibleEvents = match.events.slice(0, 4);

  return (
    <article className="past-card-shell">
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
      <MatchHighlights compact match={match} teamsByCode={teamsByCode} />
    </article>
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
      <span className="flag-emoji" aria-hidden="true">{flagEmojiForTeam(team.code)}</span>
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

function isLiveMatch(match) {
  return match.status === "live" || match.status === "halftime";
}

function getBoardSummary(matches) {
  const live = matches.filter(isLiveMatch).length;
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

function getMatchHighlights(match) {
  return match.highlights || null;
}

function officialHighlightsSearchUrl(match, teamsByCode) {
  const home = teamName(match.home, teamsByCode);
  const away = teamName(match.away, teamsByCode);
  const query = `FIFA World Cup 2026 ${home} ${away} highlights`;
  return `${FIFA_YOUTUBE_CHANNEL}/search?query=${encodeURIComponent(query)}`;
}

function resolveYouTubeHighlight(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!["https:", "http:"].includes(parsed.protocol)) return null;

  const host = parsed.hostname.replace(/^www\./, "");
  let videoId = "";

  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    videoId = parsed.searchParams.get("v") || "";
    if (!videoId && (parsed.pathname.startsWith("/live/") || parsed.pathname.startsWith("/shorts/"))) {
      videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    }
    if (!videoId && parsed.pathname.startsWith("/embed/")) {
      videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    }
  }

  if (!videoId) return null;

  return {
    embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
    watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
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

function formatUpdateAge(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatClockParts(date) {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).formatToParts(date);
  const zone = parts.find((part) => part.type === "timeZoneName")?.value || "";
  const time = parts
    .filter((part) => part.type !== "timeZoneName")
    .map((part) => part.value)
    .join("")
    .replace(/,\s*$/, "")
    .trim();

  return {
    label: zone ? `${time} ${zone}` : time,
    time,
    zone,
  };
}

function formatFeaturedKickoff(kickoff) {
  const date = new Date(kickoff);
  return {
    date: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date),
    time: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function flagEmojiForTeam(code) {
  const flagCode = flagCodesByTeam[code] || (code?.length === 2 ? code.toUpperCase() : "");
  if (!flagCode) return String.fromCodePoint(0x1f3f3, 0xfe0f);
  const countryCode = flagCode.startsWith("GB-") ? "GB" : flagCode;

  return countryCode
    .toUpperCase()
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
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
