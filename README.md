# FIFA Watchboard

FIFA Watchboard is a live-score tracking board for World Cup 2026 coverage. It ships with a demo feed, live filtering, fixtures, group standings, event timelines, and a simple external JSON feed hook.

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

By default the board uses demo data. To connect a CORS-accessible JSON feed, pass a `feed` query parameter:

```text
https://<user>.github.io/fifa/?feed=https://example.com/matches.json
```

The feed may be either an array of match objects or an object with a `matches` array.
