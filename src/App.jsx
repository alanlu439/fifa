import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Clock3,
  ExternalLink,
  Gauge,
  Goal,
  History,
  Maximize2,
  Minimize2,
  RadioTower,
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
  const dashboardStats = useMemo(() => getDashboardStats(matches, teamsByCode), [matches, teamsByCode]);
  const heroContext = useMemo(() => getHeroContext(matches, teamsByCode), [matches, teamsByCode]);
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
      await document.exitFullscreen();
      setFullscreenFallback(false);
      return;
    }

    const target = appShellRef.current || document.documentElement;
    if (target.requestFullscreen) {
      try {
        await target.requestFullscreen();
        setFullscreenFallback(false);
        return;
      } catch {
        // Some embedded browsers block fullscreen; keep a visual fallback mode.
      }
    }

    setFullscreenFallback((current) => !current);
  }

  const fullscreenActive = fullscreenElementActive || fullscreenFallback;

  return (
    <div className={fullscreenActive ? "app-shell dashboard-fullscreen" : "app-shell"} ref={appShellRef}>
      <Header
        autoRefresh={autoRefresh}
        boardSummary={boardSummary}
        dashboardStats={dashboardStats}
        feedError={feedError}
        heroContext={heroContext}
        isFullscreen={fullscreenActive}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        onRefresh={refreshNow}
        onToggleFullscreen={toggleFullscreen}
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

function Header({
  autoRefresh,
  boardSummary,
  dashboardStats,
  feedError,
  heroContext,
  isFullscreen,
  isRefreshing,
  lastUpdated,
  onRefresh,
  onToggleFullscreen,
  onToggleRefresh,
  source,
}) {
  const [now, setNow] = useState(() => new Date());
  const FullscreenIcon = isFullscreen ? Minimize2 : Maximize2;
  const currentClock = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(now);
  const updateAge = formatUpdateAge(now - lastUpdated);
  const updateDetail = isRefreshing ? "Refreshing now" : autoRefresh ? `Auto every ${REFRESH_INTERVAL_MS / 1000}s` : "Manual refresh";

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  return (
    <header className="top-bar" aria-label="Live statistics dashboard">
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
        <div className="clock-chip">
          <Clock3 size={16} strokeWidth={2.2} />
          <span>{currentClock}</span>
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
        <button className="icon-button fullscreen-button" onClick={onToggleFullscreen} type="button" aria-label={isFullscreen ? "Exit full screen" : "Open full screen dashboard"}>
          <FullscreenIcon size={18} />
          <span>{isFullscreen ? "Exit" : "Full screen"}</span>
        </button>
      </div>

      <div className="dashboard-metrics" aria-label="Live board statistics">
        <DashboardMetric icon={RadioTower} label="Live" value={boardSummary.live} detail={`${dashboardStats.halftime} half-time • ${boardSummary.upcoming} upcoming`} tone={boardSummary.live ? "live" : "neutral"} />
        <DashboardMetric icon={Trophy} label="Matches" value={boardSummary.total} detail={`${boardSummary.finished} final • ${dashboardStats.groupsCount} groups`} />
        <DashboardMetric icon={Goal} label="Goals" value={dashboardStats.totalGoals} detail={`${dashboardStats.totalEvents} event updates`} tone="cyan" />
        <DashboardMetric icon={Gauge} label="Venues" value={dashboardStats.venuesCount} detail={`${dashboardStats.highlightMatches} highlight links`} />
        <DashboardMetric icon={RefreshCw} label="Updated" value={updateAge} detail={updateDetail} tone={isRefreshing ? "live" : "neutral"} />
      </div>

      <div className="hero-intel" aria-label="World Cup feed context">
        <HeroFact
          label="Feed"
          value={source}
          detail={`${feedError ? "Fallback active" : "Real match data"} • ${autoRefresh ? "Auto refresh on" : "Auto refresh paused"}`}
          tone={feedError ? "warning" : "live"}
        />
        <HeroFact label={heroContext.focusLabel} value={heroContext.focusValue} detail={heroContext.focusDetail} tone={heroContext.focusTone} />
        <HeroFact label="Next Kickoff" value={heroContext.nextValue} detail={heroContext.nextDetail} />
        <HeroFact label="Window" value={heroContext.windowValue} detail={heroContext.windowDetail} />
      </div>

      <LiveTicker items={dashboardStats.liveTicker} />

      {feedError && (
        <div className="feed-alert" role="status">
          Live match data unavailable: {feedError}
        </div>
      )}
    </header>
  );
}

function DashboardMetric({ detail, icon: Icon, label, tone = "neutral", value }) {
  return (
    <div className={`dashboard-metric ${tone}`}>
      <div className="metric-topline">
        <span>{label}</span>
        <Icon size={17} strokeWidth={2.2} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function LiveTicker({ items }) {
  return (
    <section className="live-ticker" aria-label="Live match updates">
      <div className="ticker-heading">
        <Activity size={17} strokeWidth={2.2} />
        <span>Live Updates</span>
      </div>
      <div className="ticker-list">
        {items.length ? (
          items.map((item) => (
            <div className="ticker-item" key={item.id}>
              <span className={`status-chip ${item.status}`}>{item.clock}</span>
              <strong>{item.scoreline}</strong>
              <p>{item.detail}</p>
            </div>
          ))
        ) : (
          <div className="ticker-item empty">
            <span className="status-chip upcoming">Standby</span>
            <strong>No live matches right now</strong>
            <p>Auto refresh keeps watching the match window.</p>
          </div>
        )}
      </div>
    </section>
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
      <span>{team.name}</span>
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

function SummaryChip({ label, tone = "neutral", value, wide = false }) {
  return (
    <div className={`summary-chip ${tone} ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HeroFact({ detail, label, tone = "neutral", value }) {
  return (
    <div className={`hero-fact ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
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

function getDashboardStats(matches, teamsByCode) {
  const liveMatches = matches
    .filter((match) => match.status === "live" || match.status === "halftime")
    .sort((a, b) => scoreStatusWeight(a.status) - scoreStatusWeight(b.status));
  const totalGoals = matches.reduce((total, match) => total + Number(match.homeScore ?? 0) + Number(match.awayScore ?? 0), 0);
  const totalEvents = matches.reduce((total, match) => total + (match.events?.length || 0), 0);

  return {
    groupsCount: new Set(matches.map((match) => match.group)).size,
    halftime: matches.filter((match) => match.status === "halftime").length,
    highlightMatches: matches.filter((match) => match.highlights).length,
    liveTicker: liveMatches.slice(0, 4).map((match) => {
      const home = getTeam(match.home, teamsByCode);
      const away = getTeam(match.away, teamsByCode);
      const clock = match.status === "halftime" ? "HT" : `${match.minute}'`;
      const scoreline = `${home.code} ${match.homeScore ?? "-"}:${match.awayScore ?? "-"} ${away.code}`;

      return {
        id: match.id,
        clock,
        detail: `${home.name} vs ${away.name} • ${match.group} • ${match.venue}`,
        scoreline,
        status: match.status,
      };
    }),
    totalEvents,
    totalGoals,
    venuesCount: new Set(matches.map((match) => match.venue)).size,
  };
}

function getHeroContext(matches, teamsByCode) {
  const liveMatches = matches
    .filter((match) => match.status === "live" || match.status === "halftime")
    .sort((a, b) => scoreStatusWeight(a.status) - scoreStatusWeight(b.status));
  const upcomingMatches = matches
    .filter((match) => match.status === "upcoming")
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const finishedMatches = matches
    .filter((match) => match.status === "finished")
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
  const focusMatch = liveMatches[0] || upcomingMatches[0] || finishedMatches[0] || matches[0];
  const nextMatch = upcomingMatches[0];
  const groupsCount = new Set(matches.map((match) => match.group)).size;
  const venuesCount = new Set(matches.map((match) => match.venue)).size;

  if (!focusMatch) {
    return {
      focusLabel: "Focus",
      focusValue: "No matches loaded",
      focusDetail: "Waiting for feed data",
      focusTone: "neutral",
      nextValue: "TBD",
      nextDetail: "No kickoff available",
      windowValue: "0 matches",
      windowDetail: "0 groups • 0 venues",
    };
  }

  const focusLabel = liveMatches[0] ? "Live Focus" : nextMatch ? "Next Up" : "Latest Final";
  const focusTone = liveMatches[0] ? "live" : focusMatch.status === "finished" ? "finished" : "neutral";
  const focusDetail = `${matchStatusDetail(focusMatch)} • ${focusMatch.group} • ${focusMatch.venue}`;

  return {
    focusLabel,
    focusValue: matchLabel(focusMatch, teamsByCode),
    focusDetail,
    focusTone,
    nextValue: nextMatch ? matchLabel(nextMatch, teamsByCode) : "No upcoming fixtures",
    nextDetail: nextMatch ? `${formatShortKickoff(nextMatch.kickoff)} • ${nextMatch.venue}` : `${finishedMatches.length} finals logged`,
    windowValue: `${matches.length} matches`,
    windowDetail: `${upcomingMatches.length} upcoming • ${finishedMatches.length} final • ${groupsCount} groups • ${venuesCount} venues`,
  };
}

function matchLabel(match, teamsByCode) {
  return `${teamName(match.home, teamsByCode)} vs ${teamName(match.away, teamsByCode)}`;
}

function matchStatusDetail(match) {
  if (match.status === "upcoming") return "Scheduled";
  if (match.status === "finished") return "Final";
  if (match.status === "halftime") return "Half-time";
  return `${match.minute}'`;
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
