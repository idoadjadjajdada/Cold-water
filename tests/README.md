# Tests

Browser tests for `index.html`, driven by Playwright against real Chromium.
The game is a single file with no build step, so the suites load it straight
off disk over `file://` and drive it the way a player would — clicking tiles,
buying from the shop, seeding saves into `localStorage`.

## Running

```sh
npm install                     # once, from the repo root
npx playwright install chromium # once, fetches the browser
npm test                        # or: tests/run.sh
node tests/halls.js             # a single suite
```

Each suite prints one line per assertion and exits non-zero if any fail.

If Playwright cannot find a browser, point it at one:

```sh
CHROMIUM_PATH=/path/to/chrome npm test
```

## The suites

| Suite | Covers |
|---|---|
| `smoke.js` | Booting, placing, collecting, selling, the shop drawer, tap vs. drag, persistence across a page load |
| `corrupt.js` | Malformed and hostile saves — garbage in every field, out-of-range values, unknown machine types, invalid JSON — plus offline earnings |
| `halls.js` | Multiple halls: buying, switching, halls running while you are elsewhere, per-hall rows, site-wide power, fan range, sell mode, v1 save migration |
| `content.js` | The later content: new machines, switch adjacency boost, dust, coolant leaks, the new automation, and a full rebirth cycle with perks carrying over |

## Notes for anyone adding a test

- **Seed state through `localStorage`, not by playing.** Every suite has a
  `seed()` helper that writes a save before the page loads. Reaching a late-game
  state by clicking would take longer than the whole suite does now.
- **Seed once per context, not once per navigation.** Rebirth reloads the page.
  An `addInitScript` without the `__seeded` guard will happily overwrite the
  state the game just wrote and leave you debugging a bug that is not there.
- **Do not assert on wall-clock production.** A loaded machine will fill a
  buffer to its cap while the suite is mid-assertion. Where a test needs
  compute to accumulate, raise `up.buffer` in the seed so nothing can saturate.
- **The game only repaints the hall you are standing in.** Tiles in a
  background hall hold stale DOM on purpose. Switch to a hall before reading
  its tiles.
- **Timers keep running after `page.goto`.** Prefer asserting on saved state
  (dispatch `pagehide`, then read `localStorage`) over transient DOM text when
  the value is one the sim keeps changing.
