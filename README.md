# FIFA Watchboard

**Description:** A live World Cup 2026 score tracking board with a prominent clock header, emoji flags, fixtures, standings, event timelines, and official YouTube highlights.

FIFA Watchboard is a live-score tracking board for World Cup 2026 coverage. It uses a live match data feed by default, with a local fallback and a custom external JSON feed hook. The main board starts with a compact sync header, a larger live clock, fullscreen viewing, match filters, and live update controls. Each match includes an official highlights area that embeds a YouTube highlights URL when one is supplied.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

For GitHub Pages under `/fifa/`, use:

```bash
npm run build:pages
```

## Live feed

By default the board uses its live World Cup match data feed. To override it with a CORS-accessible JSON feed, pass a `feed` query parameter:

```text
https://<user>.github.io/fifa/?feed=https://example.com/matches.json
```

The feed may be either an array of match objects or an object with a `matches` array.

## Official highlights

FIFA Watchboard does not provide live video streams. Match cards show official YouTube highlights when a highlight URL is provided. If a match has no highlight URL yet, the card links to the official FIFA YouTube channel search for that matchup.

## Automatic highlight search

The site reads `public/highlights-index.json` on every feed refresh and automatically attaches any indexed official highlights to matching finished games. A scheduled GitHub Action runs `npm run highlights:update` hourly, searches the official FIFA YouTube channel, and commits new highlight URLs back into that index.

To enable the automation, add a repository secret named `YOUTUBE_API_KEY` with a YouTube Data API key. Optional workflow environment variables:

- `YOUTUBE_CHANNEL_HANDLE`: defaults to `@fifa`
- `YOUTUBE_CHANNEL_ID`: skips handle lookup when supplied
- `HIGHLIGHT_MATCH_FEED_URL`: searches against your custom match feed instead of the default live feed
- `HIGHLIGHT_MAX_MATCHES`: maximum finished matches to search per run, default `8`
- `HIGHLIGHT_RETRY_HOURS`: how soon to retry a match with no result, default `2`

Include highlights metadata on a custom feed match:

```json
{
  "id": "match-1",
  "home": "USA",
  "away": "CAN",
  "status": "upcoming",
  "group": "Group D",
  "venue": "Seattle",
  "kickoff": "2026-06-21T18:00:00-07:00",
  "highlightsUrl": "https://www.youtube.com/watch?v=<id>",
  "highlightsTitle": "USA vs Canada official highlights",
  "highlightsSource": "FIFA YouTube"
}
```

Supported highlight links include YouTube watch, short, live, embed, and `youtu.be` URLs.
