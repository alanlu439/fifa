import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Clock3,
  ExternalLink,
  GitBranch,
  Goal,
  History,
  LayoutDashboard,
  Minimize2,
  Newspaper,
  Radio,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Table2,
  Trophy,
  Video,
} from "lucide-react";
import { standings as sampleStandings, statusLabel, teams } from "./data.js";
import { collectTeamsFromMatches, fetchLiveData, fetchWorldCupNews, freshNewsItems, freshSampleMatches, getFeedUrl } from "./liveFeed.js";

const tabs = [
  { id: "live", label: "Live", icon: Radio },
  { id: "fixtures", label: "Fixtures", icon: CalendarDays },
  { id: "past", label: "Past", icon: History },
  { id: "bracket", label: "Bracket", icon: GitBranch },
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
const KNOCKOUT_ROUNDS = [
  {
    id: "round-of-32",
    label: "Round of 32",
    shortLabel: "R32",
    slotCount: 16,
    aliases: ["round of 32", "last 32", "1/16", "1/16-finals", "1/16 finals"],
  },
  {
    id: "round-of-16",
    label: "Round of 16",
    shortLabel: "R16",
    slotCount: 8,
    aliases: ["round of 16", "last 16", "1/8", "1/8-finals", "1/8 finals"],
  },
  {
    id: "quarterfinals",
    label: "Quarterfinals",
    shortLabel: "QF",
    slotCount: 4,
    aliases: ["quarterfinal", "quarter final", "quarter-finals", "quarter finals"],
  },
  {
    id: "semifinals",
    label: "Semifinals",
    shortLabel: "SF",
    slotCount: 2,
    aliases: ["semifinal", "semi final", "semi-finals", "semi finals"],
  },
  {
    id: "third-place",
    label: "Third Place",
    shortLabel: "3P",
    slotCount: 1,
    aliases: ["third place", "third-place", "3rd place", "bronze"],
  },
  {
    id: "final",
    label: "Final",
    shortLabel: "Final",
    slotCount: 1,
    aliases: ["final", "world cup final", "championship match"],
  },
];

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
  const [newsItems, setNewsItems] = useState(() => freshNewsItems());
  const [newsSource, setNewsSource] = useState("Official links");
  const [newsUpdatedAt, setNewsUpdatedAt] = useState(new Date());
  const [newsError, setNewsError] = useState("");
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
      .filter((match) => matchContainsQuery(match, cleanQuery, teamsByCode))
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
  const bracketMatches = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return matches
      .filter(isKnockoutMatch)
      .filter((match) => matchContainsQuery(match, cleanQuery, teamsByCode))
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  }, [matches, query, teamsByCode]);
  const bracketRounds = useMemo(() => buildBracketRounds(bracketMatches), [bracketMatches]);
  const resultCount =
    activeTab === "past" ? pastMatches.length : activeTab === "fixtures" ? fixtureMatches.length : activeTab === "bracket" ? bracketMatches.length : filteredMatches.length;
  const dashboardLiveMatches = useMemo(() => filteredMatches.filter(isLiveMatch), [filteredMatches]);
  const dashboardUpcomingMatch = useMemo(
    () => filteredMatches.filter((match) => match.status === "upcoming").sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0] || null,
    [filteredMatches]
  );

  useEffect(() => {
    const controller = new AbortController();

    loadLiveFeed(controller.signal);
    loadNewsFeed(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;

    const interval = window.setInterval(() => {
      loadLiveFeed();
      loadNewsFeed();
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
      if (signal?.aborted) return;
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
      if (error.name === "AbortError" || signal?.aborted) return;
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

  async function loadNewsFeed(signal) {
    try {
      const data = await fetchWorldCupNews(signal);
      if (signal?.aborted) return;
      setNewsItems(data.items);
      setNewsSource(data.source);
      setNewsError("");
      setNewsUpdatedAt(new Date());
    } catch (error) {
      if (error.name === "AbortError" || signal?.aborted) return;
      setNewsItems(freshNewsItems());
      setNewsSource("Official links");
      setNewsError(error.message || "News feed unavailable");
      setNewsUpdatedAt(new Date());
    }
  }

  function refreshNow() {
    loadLiveFeed();
    loadNewsFeed();
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
        boardSummary={boardSummary}
        dashboardMatch={dashboardPrimaryMatch}
        dashboardMode={dashboardMode}
        feedError={feedError}
        isFullscreen={fullscreenActive}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        onRefresh={refreshNow}
        onToggleFullscreen={toggleFullscreen}
        onToggleRefresh={() => setAutoRefresh((current) => !current)}
        source={source}
        teamsByCode={teamsByCode}
      />

      {fullscreenActive ? (
        <DashboardMode
          boardSummary={boardSummary}
          matches={dashboardMatches}
          mode={dashboardMode}
          newsError={newsError}
          newsItems={newsItems}
          newsSource={newsSource}
          newsUpdatedAt={newsUpdatedAt}
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
            newsError={newsError}
            newsItems={newsItems}
            newsSource={newsSource}
            newsUpdatedAt={newsUpdatedAt}
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

        {activeTab === "bracket" && <BracketView rounds={bracketRounds} teamsByCode={teamsByCode} onSelectMatch={selectMatch} />}

        {activeTab === "groups" && <GroupsView groupTables={groupTables} teamsByCode={teamsByCode} />}
      </main>
      )}
    </div>
  );
}

function Header({
  autoRefresh,
  boardSummary,
  dashboardMatch,
  dashboardMode,
  feedError,
  isFullscreen,
  isRefreshing,
  lastUpdated,
  onRefresh,
  onToggleFullscreen,
  onToggleRefresh,
  source,
  teamsByCode,
}) {
  const [now, setNow] = useState(() => new Date());
  const DashboardIcon = isFullscreen ? Minimize2 : LayoutDashboard;
  const currentClock = formatClockParts(now);
  const updateAge = formatUpdateAge(now - lastUpdated);
  const autoRefreshLabel = autoRefresh ? "Pause auto refresh" : "Resume auto refresh";
  const dashboardLabel = isFullscreen ? "Exit dashboard mode" : "Enter dashboard mode";
  const dashboardHome = dashboardMatch ? getTeam(dashboardMatch.home, teamsByCode) : null;
  const dashboardAway = dashboardMatch ? getTeam(dashboardMatch.away, teamsByCode) : null;
  const dashboardMatchLabel = dashboardMatch && dashboardHome && dashboardAway ? `${dashboardHome.code} vs ${dashboardAway.code}` : "Waiting for match data";
  const dashboardStateLabel = dashboardMatch ? dashboardStatusSummary(dashboardMatch) : "No active window";
  const dashboardCounts = boardSummary
    ? [
        { label: "Live", value: boardSummary.live },
        { label: "Next", value: boardSummary.upcoming },
        { label: "Final", value: boardSummary.finished },
      ]
    : [];

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  return (
    <header className={isFullscreen ? "top-bar dashboard-top-bar" : "top-bar"} aria-label="Scoreboard header">
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

      {!isFullscreen && boardSummary && (
        <div className="header-match-strip" aria-label="Tournament status">
          <div className="header-status-main">
            <Radio size={17} strokeWidth={2.35} />
            <div>
              <span>Match Center</span>
              <strong>{boardSummary.live ? `${boardSummary.live} live now` : `Next ${boardSummary.nextKickoff}`}</strong>
            </div>
          </div>
          <div className="header-count-strip" aria-label="Match counts">
            {dashboardCounts.map((item) => (
              <span key={item.label}>
                <strong>{item.value}</strong>
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {isFullscreen && (
        <div className="clock-chip dashboard-master-clock" aria-label={`Master clock ${currentClock.label}`}>
          <div className="master-clock-label">
            <Clock3 size={21} strokeWidth={2.2} />
            <span>Master clock</span>
          </div>
          <span className="clock-time">{currentClock.time}</span>
          <div className="master-clock-meta">
            <span className="master-clock-date">{currentClock.date}</span>
            <span className="master-clock-zone">{currentClock.zone}</span>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div className="dashboard-header-mode" aria-label="Dashboard Mode active">
          <div className="dashboard-mode-main">
            <LayoutDashboard size={22} strokeWidth={2.4} />
            <div>
              <strong>Dashboard Mode</strong>
              <span>{dashboardMode === "live" ? "Live command board" : "Next match command board"}</span>
            </div>
          </div>
          <div className="dashboard-header-match">
            <strong>{dashboardMatchLabel}</strong>
            <span>{dashboardStateLabel}</span>
          </div>
          <div className="dashboard-header-counts" aria-label="Dashboard match counts">
            {dashboardCounts.map((item) => (
              <span key={item.label}>
                <strong>{item.value}</strong>
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="header-actions">
        {!isFullscreen && (
          <div className="clock-chip" aria-label={`Current time ${currentClock.label}`}>
            <Clock3 size={22} strokeWidth={2.2} />
            <span className="clock-time">{currentClock.time}</span>
            <span className="clock-zone">{currentClock.zone}</span>
          </div>
        )}
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

function DashboardMode({ boardSummary, matches, mode, newsError, newsItems, newsSource, newsUpdatedAt, onSelectMatch, primaryMatch, standingsRows, teamsByCode }) {
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
  const fullKickoff = formatDashboardKickoff(primaryMatch.kickoff);
  const otherMatches = matches.filter((match) => match.id !== primaryMatch.id);
  const metricRows = buildDashboardMetricRows(primaryMatch, home, away);
  const secondaryRows = buildDashboardSecondaryStats(primaryMatch);
  const topPlayers = buildDashboardTopPlayers(primaryMatch, teamsByCode);
  const visibleQueue = [primaryMatch, ...otherMatches].slice(0, 4);

  return (
    <main className={`dashboard-board dashboard-command ${isLive ? "live-dashboard" : "upcoming-dashboard"}`} aria-label="Dashboard mode">
      <section className="dashboard-stage" aria-label={isLive ? "Live match focus" : "Upcoming match focus"}>
        <div className="dashboard-round-meta">
          <span>{primaryMatch.group.toUpperCase()} · {primaryMatch.stage}</span>
          <span>{isLive ? `${boardSummary.live} live now` : "Next scheduled event"}</span>
        </div>

        <div className="dashboard-match-focus">
          <DashboardTeamHero side="home" team={home} />
          <div className={`dashboard-score-core ${primaryMatch.status}`}>
            <span className={`status-chip ${primaryMatch.status}`}>{statusLabel(primaryMatch.status)}</span>
            <small>{primaryMatch.note || primaryMatch.stage}</small>
            <div className="dashboard-scoreline">
              <strong>{primaryMatch.homeScore ?? "-"}</strong>
              <span>:</span>
              <strong>{primaryMatch.awayScore ?? "-"}</strong>
            </div>
            <div className="dashboard-clock-strip">
              <Clock3 size={16} strokeWidth={2.2} />
              {primaryMatch.status === "upcoming" ? (
                <span>
                  <strong>{kickoff.date}</strong>
                  {kickoff.time}
                </span>
              ) : (
                <span>
                  <strong>{`${primaryMatch.minute}'`}</strong>
                  {primaryMatch.status === "halftime" ? "Half-time" : "Match clock"}
                </span>
              )}
            </div>
          </div>
          <DashboardTeamHero side="away" team={away} />
        </div>

        <div className="dashboard-metric-grid" aria-label="Match metrics">
          {metricRows.map((metric) => (
            <DashboardMetricLane key={metric.label} metric={metric} />
          ))}
        </div>

        <div className="dashboard-data-strip">
          {secondaryRows.map((stat) => (
            <DashboardStatBox key={stat.label} stat={stat} />
          ))}
        </div>
      </section>

      <section className="dashboard-panel dashboard-facts-panel" aria-label="Detailed match facts">
        <DashboardEventFeed match={primaryMatch} teamsByCode={teamsByCode} />

        <div className="dashboard-facts-column">
          <div className="section-heading compact">
            <div>
              <h2>Match Facts</h2>
              <p>{home.code} vs {away.code} · {eventCount ? `${eventCount} feed events` : "awaiting event feed"}</p>
            </div>
            <BarChart3 size={18} strokeWidth={2.2} />
          </div>
          <div className="dashboard-fact-summary">
            <span>{primaryMatch.venue}</span>
            <span>{fullKickoff.full}</span>
            <span>{primaryMatch.note || statusLabel(primaryMatch.status)}</span>
          </div>
          <div className="dashboard-facts-deck">
            <DashboardTopPlayers players={topPlayers} />
            <DashboardComparison metrics={metricRows} home={home} away={away} />
          </div>
        </div>
      </section>

      <aside className="dashboard-side-stack" aria-label="Dashboard secondary data">
        <section className="dashboard-panel dashboard-window" aria-label={isLive ? "Live matches" : "Upcoming match"}>
          <div className="section-heading compact">
            <div>
              <h2>{isLive ? "Live & Next" : "Next Up"}</h2>
              <p>{isLive ? "Dashboard Mode hides final results and future fixtures" : "Showing the next scheduled fixture while live window is quiet"}</p>
            </div>
            <Activity size={18} strokeWidth={2.2} />
          </div>
          <div className="dashboard-match-stack">
            {visibleQueue.map((match, index) => (
              <DashboardMatchTile key={match.id} active={index === 0} match={match} onClick={() => onSelectMatch(match.id)} teamsByCode={teamsByCode} />
            ))}
          </div>
        </section>

        <NewsPanel dashboard error={newsError} items={newsItems} source={newsSource} updatedAt={newsUpdatedAt} />
        <DashboardStandingsSnapshot group={primaryMatch.group} rows={standingsRows.slice(0, 4)} teamsByCode={teamsByCode} />
        <DashboardHighlightStatus match={primaryMatch} teamsByCode={teamsByCode} />
      </aside>

      <footer className="dashboard-footer" aria-label="Dashboard feed status">
        <span>
          <Radio size={14} strokeWidth={2.2} />
          Data feed: <strong>{isLive ? "Live" : "Watching next"}</strong>
        </span>
        <span>Refresh cadence: <strong>{Math.round(REFRESH_INTERVAL_MS / 1000)}s</strong></span>
        <span>Matches: <strong>{boardSummary.total}</strong></span>
        <span>Live: <strong>{boardSummary.live}</strong></span>
        <span>Upcoming: <strong>{boardSummary.upcoming}</strong></span>
        <span>Completed: <strong>{boardSummary.finished}</strong></span>
        <span className="dashboard-footer-brand">FIFA World Cup 2026™</span>
      </footer>
    </main>
  );
}

function DashboardTeamHero({ side, team }) {
  return (
    <div className={`dashboard-team-hero ${side}`}>
      <TeamBadge team={team} />
      <strong>{team.name}</strong>
    </div>
  );
}

function DashboardMetricLane({ metric }) {
  return (
    <div className="dashboard-metric-lane">
      <div className="dashboard-metric-head">
        <strong>{metric.homeValue}</strong>
        <span>{metric.label}</span>
        <strong>{metric.awayValue}</strong>
      </div>
      <div className="dashboard-metric-bar" aria-label={`${metric.label}: ${metric.homeValue} to ${metric.awayValue}`}>
        <span style={{ width: `${metric.homeShare}%` }} />
        <span style={{ width: `${metric.awayShare}%` }} />
      </div>
      <div className="dashboard-metric-foot">
        <span>{metric.homeCode}</span>
        <small>{metric.detail}</small>
        <span>{metric.awayCode}</span>
      </div>
    </div>
  );
}

function DashboardDataTile({ detail, icon: Icon, label, value }) {
  return (
    <div className="dashboard-data-tile">
      <Icon size={15} strokeWidth={2.2} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function DashboardStatBox({ stat }) {
  return (
    <div className={`dashboard-data-tile dashboard-stat-box ${stat.tone || ""}`}>
      <span>{stat.label}</span>
      <div className="dashboard-stat-values">
        <strong>{stat.homeValue}</strong>
        <strong>{stat.awayValue}</strong>
      </div>
      <div className="dashboard-metric-bar compact" aria-label={`${stat.label}: ${stat.homeValue} to ${stat.awayValue}`}>
        <span style={{ width: `${stat.homeShare}%` }} />
        <span style={{ width: `${stat.awayShare}%` }} />
      </div>
      <small>{stat.detail}</small>
    </div>
  );
}

function DashboardFact({ label, value }) {
  return (
    <div className="dashboard-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardTopPlayers({ players }) {
  return (
    <section className="dashboard-top-players" aria-label="Top players and events">
      <div className="dashboard-subtitle-row">
        <strong>Top Players</strong>
        <span>from live event feed</span>
      </div>
      <div className="dashboard-player-list">
        {players.length ? (
          players.map((player, index) => (
            <div className="dashboard-player-row" key={`${player.team}-${player.name}-${index}`}>
              <span>{index + 1}</span>
              <div>
                <strong>{player.name}</strong>
                <small>{player.team} · {player.detail}</small>
              </div>
              <em>{player.rating}</em>
            </div>
          ))
        ) : (
          <div className="empty-state">Player feed pending</div>
        )}
      </div>
    </section>
  );
}

function DashboardComparison({ away, home, metrics }) {
  return (
    <div className="dashboard-comparison" aria-label={`${home.name} and ${away.name} comparison`}>
      <div className="dashboard-comparison-title">
        <span>{home.code}</span>
        <strong>Team Comparison</strong>
        <span>{away.code}</span>
      </div>
      {metrics.slice(1).map((metric) => (
        <div className="dashboard-compare-row" key={`compare-${metric.label}`}>
          <span>{metric.homeValue}</span>
          <div>
            <small>{metric.label}</small>
            <div className="dashboard-metric-bar compact">
              <span style={{ width: `${metric.homeShare}%` }} />
              <span style={{ width: `${metric.awayShare}%` }} />
            </div>
          </div>
          <span>{metric.awayValue}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardEventFeed({ match, teamsByCode }) {
  const visibleEvents = [...match.events].slice(-6).reverse();

  return (
    <section className="dashboard-event-feed" aria-label="Live events">
      <div className="section-heading compact">
        <div>
          <h2>Live Events</h2>
          <p>
            {teamName(match.home, teamsByCode)} vs {teamName(match.away, teamsByCode)}
          </p>
        </div>
        <Goal size={18} strokeWidth={2.2} />
      </div>
      <div className="dashboard-event-list">
        {visibleEvents.length ? (
          visibleEvents.map((event, index) => (
            <div className="dashboard-event-row" key={`${event.minute}-${event.team}-${event.text}-${index}`}>
              <span className={`event-type ${event.type}`} />
              <strong>{event.minute}'</strong>
              <span>{getTeam(event.team, teamsByCode).code}</span>
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

function DashboardStandingsSnapshot({ group, rows, teamsByCode }) {
  return (
    <section className="dashboard-panel dashboard-table-panel" aria-label={`${group} group table`}>
      <div className="section-heading compact">
        <div>
          <h2>Group Table</h2>
          <p>{group}</p>
        </div>
        <Table2 size={18} strokeWidth={2.2} />
      </div>
      <table className="dashboard-standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>MP</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const item = row.teamData || getTeam(row.team, teamsByCode);
            return (
              <tr key={row.team}>
                <td>{index + 1}</td>
                <td>
                  <TeamBadge team={item} compact />
                  <span>{item.name}</span>
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

function DashboardHighlightStatus({ match, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const highlightState = getHighlightState(match, teamsByCode);

  return (
    <section className="dashboard-panel dashboard-highlight-status" aria-label={`${home.name} vs ${away.name} highlight status`}>
      <div className="section-heading compact">
        <div>
          <h2>Official Highlights</h2>
          <p>{highlightState.caption}</p>
        </div>
        <Video size={18} strokeWidth={2.2} />
      </div>
      <div className="dashboard-highlight-body">
        <div>
          <strong>{home.name} vs {away.name}</strong>
          <span>{highlightState.statusText}</span>
        </div>
        <HighlightActionLink compact highlightState={highlightState} />
      </div>
    </section>
  );
}

function DashboardMatchTile({ active = false, match, onClick, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const timeLabel = match.status === "upcoming" ? formatShortKickoff(match.kickoff) : `${match.minute}'`;

  return (
    <button className={active ? "dashboard-match-tile active" : "dashboard-match-tile"} onClick={onClick} type="button">
      <div className="dashboard-tile-status">
        <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
        <span>{timeLabel}</span>
      </div>
      <div className="dashboard-tile-main">
        <span>
          <TeamBadge team={home} compact />
          {home.name}
        </span>
        <strong>{match.homeScore ?? "-"} : {match.awayScore ?? "-"}</strong>
        <span>
          {away.name}
          <TeamBadge team={away} compact />
        </span>
      </div>
      <div className="dashboard-tile-meta">
        <span>{match.group}</span>
        <span>{match.venue}</span>
      </div>
    </button>
  );
}

function NewsPanel({ dashboard = false, error, items, source, updatedAt }) {
  const visibleItems = items.slice(0, dashboard ? 5 : 4);
  const updatedLabel = updatedAt ? formatNewsUpdatedAt(updatedAt) : "syncing";

  return (
    <section className={dashboard ? "dashboard-panel news-panel dashboard-news-panel" : "rail-panel news-panel"} aria-label="World Cup news">
      <div className="section-heading compact">
        <div>
          <h2>Newswire</h2>
          <p>{error ? "Official backup links" : `${source} · updated ${updatedLabel}`}</p>
        </div>
        <Newspaper size={18} strokeWidth={2.2} />
      </div>
      <div className="news-list">
        {visibleItems.map((item, index) => (
          <NewsCard item={item} key={item.id || `${item.title}-${index}`} lead={index === 0} />
        ))}
      </div>
    </section>
  );
}

function NewsCard({ item, lead }) {
  return (
    <article className={lead ? "news-card lead" : "news-card"}>
      <a className={item.image ? "news-thumb" : "news-thumb placeholder"} href={item.url} target="_blank" rel="noreferrer" aria-label={item.title}>
        {item.image ? <img alt="" loading="lazy" src={item.image} /> : <Newspaper size={18} strokeWidth={2.1} />}
      </a>
      <div className="news-card-body">
        <div className="news-meta">
          <span>{item.tag}</span>
          <span>{formatNewsTime(item.published)}</span>
        </div>
        <h3>
          <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
        </h3>
        {item.summary && <p>{item.summary}</p>}
        <a className="news-link" href={item.url} target="_blank" rel="noreferrer">
          {item.source}
          <ExternalLink size={12} strokeWidth={2.2} />
        </a>
      </div>
    </article>
  );
}

function LiveBoard({ boardSummary, matches, newsError, newsItems, newsSource, newsUpdatedAt, onSelectMatch, selectedMatch, selectedMatchId, standingsRows, teamsByCode }) {
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
        <NewsPanel error={newsError} items={newsItems} source={newsSource} updatedAt={newsUpdatedAt} />
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

function HighlightActionLink({ compact = false, highlightState }) {
  const label = compact ? highlightState.shortAction : highlightState.action;

  return (
    <a
      aria-label={`${highlightState.action} for ${highlightState.title}`}
      className={highlightState.resolved ? "highlight-action youtube" : "highlight-action"}
      href={highlightState.href}
      target="_blank"
      rel="noreferrer"
    >
      {highlightState.resolved && <CirclePlay size={14} strokeWidth={2.4} />}
      <span>{label}</span>
      <ExternalLink size={13} strokeWidth={2.2} />
    </a>
  );
}

function MatchHighlights({ compact = false, match, teamsByCode }) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const highlightState = getHighlightState(match, teamsByCode);

  return (
    <section className={compact ? "match-highlights compact" : "match-highlights"} aria-label={`${home.name} vs ${away.name} official highlights`}>
      <div className="highlight-heading">
        <div>
          <h3>
            <CirclePlay size={15} strokeWidth={2.2} />
            Official highlights
          </h3>
          <p>{highlightState.caption}</p>
        </div>
        <HighlightActionLink compact={compact} highlightState={highlightState} />
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

  const highlightStates = matches.map((match) => getHighlightState(match, teamsByCode));
  const publishedCount = highlightStates.filter((state) => state.resolved).length;
  const linkedCount = highlightStates.filter((state) => state.autoSearch).length;
  const pendingCount = matches.length - publishedCount - linkedCount;

  return (
    <section className="past-video-library" aria-label="All past match videos">
      <div className="section-heading compact">
        <div>
          <h2>Past Videos</h2>
          <p>
            {publishedCount} videos, {linkedCount} auto-added FIFA links{pendingCount ? `, ${pendingCount} waiting for official FIFA upload` : ""}
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

function BracketView({ onSelectMatch, rounds, teamsByCode }) {
  const actualMatches = rounds.flatMap((round) => round.slots.map((slot) => slot.match).filter(Boolean));
  const liveCount = actualMatches.filter(isLiveMatch).length;
  const finishedCount = actualMatches.filter(isPastMatch).length;
  const upcomingCount = actualMatches.filter((match) => match.status === "upcoming").length;
  const openSlots = rounds.reduce((count, round) => count + round.slots.filter((slot) => !slot.match).length, 0);
  const nextKnockout = actualMatches
    .filter((match) => match.status === "upcoming")
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];

  return (
    <section className="wide-panel bracket-view" aria-label="World Cup knockout bracket">
      <div className="section-heading bracket-heading">
        <div>
          <h2>Knockout Bracket</h2>
          <p>
            Round of 32 to Final · {nextKnockout ? `next knockout match ${formatShortKickoff(nextKnockout.kickoff)}` : "slots update when the match feed publishes qualifiers"}
          </p>
        </div>
        <GitBranch size={18} strokeWidth={2.2} />
      </div>

      <div className="bracket-summary" aria-label="Knockout status summary">
        <BracketSummaryItem label="Live" value={liveCount} tone="live" />
        <BracketSummaryItem label="Upcoming" value={upcomingCount} tone="upcoming" />
        <BracketSummaryItem label="Final" value={finishedCount} tone="finished" />
        <BracketSummaryItem label="Open slots" value={openSlots} tone="open" />
      </div>

      <div className="bracket-shell">
        <div className="bracket-rounds">
          {rounds.map((round) => (
            <section className="bracket-round" key={round.id} aria-label={round.label}>
              <div className="bracket-round-header">
                <div>
                  <span>{round.shortLabel}</span>
                  <h3>{round.label}</h3>
                </div>
                <strong>{round.matchCount}/{round.slots.length}</strong>
              </div>
              <div className="bracket-stack">
                {round.slots.map((slot) => (
                  <BracketMatchCard key={slot.id} slot={slot} teamsByCode={teamsByCode} onSelectMatch={onSelectMatch} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {!actualMatches.length && (
        <div className="bracket-empty-note">
          No knockout fixtures are in the live feed yet. The bracket scaffold is ready and will fill automatically as FIFA publishes the Round of 32 and later rounds.
        </div>
      )}
    </section>
  );
}

function BracketSummaryItem({ label, tone, value }) {
  return (
    <div className={`bracket-summary-item ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BracketMatchCard({ onSelectMatch, slot, teamsByCode }) {
  if (!slot.match) {
    return (
      <article className="bracket-card bracket-placeholder">
        <div className="bracket-placeholder-top">
          <span>{slot.label}</span>
          <strong>TBD</strong>
        </div>
        <p>{slot.path}</p>
      </article>
    );
  }

  const { match } = slot;
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const homeScore = match.homeScore ?? "-";
  const awayScore = match.awayScore ?? "-";
  const timeLabel = match.status === "upcoming" ? formatShortKickoff(match.kickoff) : match.status === "finished" ? "Final" : `${match.minute}'`;
  const homeWon = match.status === "finished" && Number(match.homeScore) > Number(match.awayScore);
  const awayWon = match.status === "finished" && Number(match.awayScore) > Number(match.homeScore);

  return (
    <button className={`bracket-card ${match.status}`} onClick={() => onSelectMatch(match.id)} type="button" aria-label={`Open ${home.name} vs ${away.name}`}>
      <div className="bracket-card-top">
        <span className={`status-chip ${match.status}`}>{statusLabel(match.status)}</span>
        <span>{slot.label}</span>
      </div>
      <div className={homeWon ? "bracket-team-row winner" : "bracket-team-row"}>
        <span className="bracket-team-info">
          <TeamBadge team={home} compact />
          <span>{home.name}</span>
        </span>
        <strong>{homeScore}</strong>
      </div>
      <div className={awayWon ? "bracket-team-row winner" : "bracket-team-row"}>
        <span className="bracket-team-info">
          <TeamBadge team={away} compact />
          <span>{away.name}</span>
        </span>
        <strong>{awayScore}</strong>
      </div>
      <div className="bracket-card-meta">
        <span>{timeLabel}</span>
        <span>{match.venue}</span>
      </div>
    </button>
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

function matchContainsQuery(match, cleanQuery, teamsByCode) {
  if (!cleanQuery) return true;
  const home = teamName(match.home, teamsByCode).toLowerCase();
  const away = teamName(match.away, teamsByCode).toLowerCase();
  return [home, away, match.home, match.away, match.venue, match.group, match.stage, match.note]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .some((value) => value.includes(cleanQuery));
}

function buildBracketRounds(matches) {
  const matchesByRound = KNOCKOUT_ROUNDS.reduce((acc, round) => ({ ...acc, [round.id]: [] }), {});

  matches.forEach((match) => {
    const round = getKnockoutRound(match);
    if (round) matchesByRound[round.id].push(match);
  });

  return KNOCKOUT_ROUNDS.map((round) => {
    const roundMatches = [...matchesByRound[round.id]].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const filledSlots = roundMatches.map((match, index) => ({
      id: `${round.id}-${match.id}`,
      label: `${round.shortLabel} ${index + 1}`,
      match,
    }));
    const slotCount = Math.max(round.slotCount, filledSlots.length);
    const slots = Array.from({ length: slotCount }, (_, index) => filledSlots[index] || buildBracketPlaceholder(round, index));

    return {
      ...round,
      matchCount: roundMatches.length,
      slots,
    };
  });
}

function buildBracketPlaceholder(round, index) {
  return {
    id: `${round.id}-slot-${index + 1}`,
    label: `${round.shortLabel} ${index + 1}`,
    path: bracketPlaceholderPath(round.id, index),
  };
}

function bracketPlaceholderPath(roundId, index) {
  if (roundId === "round-of-32") return "Group-stage qualifier to be confirmed";
  if (roundId === "round-of-16") return `Winner R32-${index * 2 + 1} vs Winner R32-${index * 2 + 2}`;
  if (roundId === "quarterfinals") return `Winner R16-${index * 2 + 1} vs Winner R16-${index * 2 + 2}`;
  if (roundId === "semifinals") return `Winner QF-${index * 2 + 1} vs Winner QF-${index * 2 + 2}`;
  if (roundId === "third-place") return "Loser SF-1 vs Loser SF-2";
  return "Winner SF-1 vs Winner SF-2";
}

function isKnockoutMatch(match) {
  return Boolean(getKnockoutRound(match));
}

function getKnockoutRound(match) {
  const text = knockoutStageText(match);
  if (!text || /\bgroup stage\b/.test(text)) return null;

  const thirdPlace = KNOCKOUT_ROUNDS.find((round) => round.id === "third-place");
  if (thirdPlace.aliases.some((alias) => text.includes(alias))) return thirdPlace;

  return KNOCKOUT_ROUNDS.find((round) => round.id !== "third-place" && round.aliases.some((alias) => text.includes(alias))) || null;
}

function knockoutStageText(match) {
  return [match.stage, match.group, match.note]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[-_]+/g, " ");
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

function getHighlightState(match, teamsByCode) {
  const home = getTeam(match.home, teamsByCode);
  const away = getTeam(match.away, teamsByCode);
  const highlights = getMatchHighlights(match);
  const resolved = highlights ? resolveYouTubeHighlight(highlights.url) : null;
  const searchUrl = officialHighlightsSearchUrl(match, teamsByCode);
  const autoSearch = Boolean(highlights?.fallbackSearch && !resolved);
  const href = resolved?.watchUrl || highlights?.url || searchUrl;
  const pendingText = match.status === "finished" ? "Official highlights pending" : "Highlights publish after full time";
  const title = highlights?.title || `${home.name} vs ${away.name} official highlights`;

  if (resolved) {
    return {
      action: "Watch on YouTube",
      autoSearch: false,
      caption: highlights.source,
      href,
      resolved,
      shortAction: "YouTube",
      statusText: "Video ready",
      title,
    };
  }

  if (autoSearch) {
    return {
      action: "Open FIFA search",
      autoSearch: true,
      caption: "Official FIFA search link auto-added",
      href,
      resolved: null,
      shortAction: "Open search",
      statusText: "FIFA link ready",
      title,
    };
  }

  return {
    action: "Search FIFA",
    autoSearch: false,
    caption: pendingText,
    href,
    resolved: null,
    shortAction: "Search FIFA",
    statusText: match.status === "finished" ? "Pending upload" : "Available after full time",
    title,
  };
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

function dashboardStatusSummary(match) {
  if (isLiveMatch(match)) {
    return `${match.minute || 0}' · ${match.note || statusLabel(match.status)}`;
  }

  if (match.status === "finished") {
    return `Final · ${match.homeScore ?? "-"}-${match.awayScore ?? "-"}`;
  }

  return `Next kickoff · ${formatShortKickoff(match.kickoff)}`;
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

function formatNewsUpdatedAt(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatNewsTime(value) {
  if (!value) return "Live";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Live";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatClockParts(date) {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).formatToParts(date);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(date);
  const zone = parts.find((part) => part.type === "timeZoneName")?.value || "";
  const time = parts
    .filter((part) => part.type !== "timeZoneName")
    .map((part) => part.value)
    .join("")
    .replace(/,\s*$/, "")
    .trim();

  return {
    date: dateLabel,
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

function formatDashboardKickoff(kickoff) {
  const date = new Date(kickoff);
  return {
    short: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date),
    long: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date),
    full: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      timeZoneName: "short",
      weekday: "short",
    }).format(date),
  };
}

function buildDashboardMetricRows(match, home, away) {
  const possession = getPossessionSplit(match);
  const shotsHome = Number(match.stats.shotsHome) || 0;
  const shotsAway = Number(match.stats.shotsAway) || 0;
  const xgHome = Number(match.stats.xgHome) || 0;
  const xgAway = Number(match.stats.xgAway) || 0;
  const shotsOnTargetHome = estimateShotsOnTarget(match, match.home);
  const shotsOnTargetAway = estimateShotsOnTarget(match, match.away);
  const passHome = estimatePassAccuracy(possession.homeShare, shotsHome, shotsAway, xgHome);
  const passAway = estimatePassAccuracy(possession.awayShare, shotsAway, shotsHome, xgAway);
  const shotShare = splitShare(shotsHome, shotsAway);
  const shotsOnTargetShare = splitShare(shotsOnTargetHome, shotsOnTargetAway);
  const xgShare = splitShare(xgHome, xgAway);
  const pressureHome = Math.round(possession.homeShare * 0.45 + shotShare.homeShare * 0.35 + xgShare.homeShare * 0.2);
  const pressureAway = 100 - pressureHome;
  const passShare = splitShare(passHome, passAway);

  return [
    {
      label: "Possession",
      homeCode: home.code,
      awayCode: away.code,
      homeValue: `${possession.homeShare}%`,
      awayValue: `${possession.awayShare}%`,
      homeShare: possession.homeShare,
      awayShare: possession.awayShare,
      detail: "territory split",
    },
    {
      label: "Shots",
      homeCode: home.code,
      awayCode: away.code,
      homeValue: `${shotsHome}`,
      awayValue: `${shotsAway}`,
      homeShare: shotShare.homeShare,
      awayShare: shotShare.awayShare,
      detail: "total attempts",
    },
    {
      label: "Shots on Target",
      homeCode: home.code,
      awayCode: away.code,
      homeValue: `${shotsOnTargetHome}`,
      awayValue: `${shotsOnTargetAway}`,
      homeShare: shotsOnTargetShare.homeShare,
      awayShare: shotsOnTargetShare.awayShare,
      detail: "derived from feed",
    },
    {
      label: "xG",
      homeCode: home.code,
      awayCode: away.code,
      homeValue: xgHome.toFixed(2),
      awayValue: xgAway.toFixed(2),
      homeShare: xgShare.homeShare,
      awayShare: xgShare.awayShare,
      detail: "expected goals",
    },
    {
      label: "Pass Accuracy",
      homeCode: home.code,
      awayCode: away.code,
      homeValue: `${passHome}%`,
      awayValue: `${passAway}%`,
      homeShare: passShare.homeShare,
      awayShare: passShare.awayShare,
      detail: "derived index",
    },
    {
      label: "Pressure",
      homeCode: home.code,
      awayCode: away.code,
      homeValue: `${pressureHome}%`,
      awayValue: `${pressureAway}%`,
      homeShare: pressureHome,
      awayShare: pressureAway,
      detail: "derived index",
    },
  ];
}

function buildDashboardSecondaryStats(match) {
  const homeEvents = countEvents(match, match.home);
  const awayEvents = countEvents(match, match.away);
  const cornersHome = countEvents(match, match.home, ["corner"]) || Math.floor((Number(match.stats.shotsHome) || 0) / 4);
  const cornersAway = countEvents(match, match.away, ["corner"]) || Math.floor((Number(match.stats.shotsAway) || 0) / 4);
  const foulsHome = countEvents(match, match.home, ["foul"]);
  const foulsAway = countEvents(match, match.away, ["foul"]);
  const yellowHome = countCardEvents(match, match.home, "yellow");
  const yellowAway = countCardEvents(match, match.away, "yellow");
  const redHome = countCardEvents(match, match.home, "red");
  const redAway = countCardEvents(match, match.away, "red");
  const offsideHome = countEvents(match, match.home, ["offside"]);
  const offsideAway = countEvents(match, match.away, ["offside"]);

  return [
    dashboardStat("Events", homeEvents, awayEvents, "feed entries"),
    dashboardStat("Corners", cornersHome, cornersAway, "set pieces"),
    dashboardStat("Fouls", foulsHome, foulsAway, "feed calls"),
    dashboardStat("Yellow Cards", yellowHome, yellowAway, "discipline"),
    dashboardStat("Red Cards", redHome, redAway, "discipline"),
    dashboardStat("Offsides", offsideHome, offsideAway, "feed calls"),
  ];
}

function buildDashboardTopPlayers(match, teamsByCode) {
  return [...match.events]
    .filter((event) => event.team)
    .sort((a, b) => eventWeight(b) - eventWeight(a) || Number(b.minute || 0) - Number(a.minute || 0))
    .slice(0, 4)
    .map((event) => {
      const team = getTeam(event.team, teamsByCode);
      const rating = Math.min(9.6, 6.8 + eventWeight(event) * 0.32 + Number(event.minute || 0) / 120).toFixed(1);
      return {
        detail: `${event.minute || 0}' ${event.type || "event"}`,
        name: eventActorName(event.text, team.code),
        rating,
        team: team.code,
      };
    });
}

function dashboardStat(label, homeValue, awayValue, detail) {
  const share = splitShareOrEmpty(homeValue, awayValue);
  return {
    label,
    homeValue: `${homeValue}`,
    awayValue: `${awayValue}`,
    homeShare: share.homeShare,
    awayShare: share.awayShare,
    detail,
  };
}

function countEvents(match, teamCode, matchers = []) {
  return match.events.filter((event) => {
    if (event.team !== teamCode) return false;
    if (!matchers.length) return true;
    const haystack = `${event.type || ""} ${event.text || ""}`.toLowerCase();
    return matchers.some((matcher) => haystack.includes(matcher));
  }).length;
}

function countCardEvents(match, teamCode, color) {
  return match.events.filter((event) => {
    if (event.team !== teamCode) return false;
    const haystack = `${event.type || ""} ${event.text || ""}`.toLowerCase();
    if (!haystack.includes("card")) return false;
    if (color === "red") return haystack.includes("red");
    return !haystack.includes("red");
  }).length;
}

function getGoalEvents(match) {
  return match.events.filter((event) => event.type === "goal" || String(event.text || "").toLowerCase().includes("goal"));
}

function estimateShotsOnTarget(match, teamCode) {
  const isHome = teamCode === match.home;
  const shots = Number(isHome ? match.stats.shotsHome : match.stats.shotsAway) || 0;
  const xg = Number(isHome ? match.stats.xgHome : match.stats.xgAway) || 0;
  const goalCount = getGoalEvents(match).filter((event) => event.team === teamCode).length;
  if (!shots) return goalCount;
  return Math.min(shots, Math.max(goalCount, Math.round(shots * 0.34 + xg * 1.6)));
}

function estimatePassAccuracy(possession, ownShots, opponentShots, xg) {
  return clampPercent(66 + possession * 0.18 + Math.min(10, xg * 3) + Math.max(-5, Math.min(5, ownShots - opponentShots)));
}

function eventWeight(event) {
  if (event.type === "goal") return 5;
  if (event.type === "shot") return 3;
  if (event.type === "card") return 2;
  if (event.type === "corner") return 1.5;
  return 1;
}

function eventActorName(text, fallbackCode) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return `${fallbackCode} event`;
  const firstChunk = clean.split(/\s[-–—]\s/)[0].split(".")[0].replace(/^(goal|shot|corner|foul|yellow card|red card)!?:?\s*/i, "").trim();
  const words = firstChunk.split(" ").filter(Boolean).slice(0, 3);
  const candidate = words.join(" ");
  return candidate && candidate.length <= 28 ? candidate : `${fallbackCode} event`;
}

function getPossessionSplit(match) {
  const homeShare = Number(match.stats.possessionHome);
  if (!Number.isFinite(homeShare) || homeShare <= 0) {
    return { homeShare: 50, awayShare: 50 };
  }

  const safeHome = clampPercent(homeShare);
  return { homeShare: safeHome, awayShare: 100 - safeHome };
}

function splitShare(homeValue, awayValue) {
  const homeNumber = Number(homeValue) || 0;
  const awayNumber = Number(awayValue) || 0;
  const total = homeNumber + awayNumber;
  if (total <= 0) return { homeShare: 50, awayShare: 50 };
  const homeShare = clampPercent(Math.round((homeNumber / total) * 100));
  return { homeShare, awayShare: 100 - homeShare };
}

function splitShareOrEmpty(homeValue, awayValue) {
  const homeNumber = Number(homeValue) || 0;
  const awayNumber = Number(awayValue) || 0;
  const total = homeNumber + awayNumber;
  if (total <= 0) return { homeShare: 0, awayShare: 0 };
  const homeShare = clampPercent(Math.round((homeNumber / total) * 100));
  return { homeShare, awayShare: 100 - homeShare };
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
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
