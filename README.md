# FIFA Watchboard

**Description:** A live World Cup 2026 score tracking board with emoji flags, fixtures, standings, event timelines, and authorized video feed embeds.

FIFA Watchboard is a live-score tracking board for World Cup 2026 coverage. It uses a live match data feed by default, with a local fallback and a custom external JSON feed hook. Match video panels support authorized embeddable feeds when a feed URL is supplied.

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

## Video feed

Live broadcast rights are regional, so the app does not invent or proxy an unlicensed stream. The Video Feed panel embeds an authorized source when one is provided by either a URL override or a custom match feed.

Use a page-level override:

```text
https://<user>.github.io/fifa/?video=https://www.youtube.com/watch?v=<id>&videoTitle=Match%20feed
```

Or include video metadata on a custom feed match:

```json
{
  "id": "match-1",
  "home": "USA",
  "away": "CAN",
  "status": "upcoming",
  "group": "Group D",
  "venue": "Seattle",
  "kickoff": "2026-06-21T18:00:00-07:00",
  "videoUrl": "https://www.youtube.com/watch?v=<id>",
  "videoTitle": "USA vs Canada video feed",
  "videoSource": "Authorized broadcaster"
}
```

Supported embeds include YouTube, Vimeo, existing `/embed/` URLs, and direct video files such as `.mp4`, `.webm`, `.ogg`, or `.m3u8`.
