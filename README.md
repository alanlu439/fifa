# FIFA Watchboard

**Description:** A live World Cup 2026 score tracking board powered by ESPN feeds, with country flags, fixtures, standings, and event timelines.

FIFA Watchboard is a live-score tracking board for World Cup 2026 coverage. It uses ESPN's public FIFA World Cup scoreboard and standings feeds by default, with a local fallback and a custom external JSON feed hook.

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

By default the board uses ESPN's public FIFA World Cup scoreboard and standings feeds. To override it with a CORS-accessible JSON feed, pass a `feed` query parameter:

```text
https://<user>.github.io/fifa/?feed=https://example.com/matches.json
```

The feed may be either an array of match objects or an object with a `matches` array.
