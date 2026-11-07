# The Étude Sky

Chopin’s twenty-four études, charted as stars on the circle of fifths and curated by Theodore Ouyang at [www.theodoreoy.com/etude-sky/](https://www.theodoreoy.com/etude-sky/).

Everything on the page is computed from the music: each recording is analysed once, and the chart, the plates and the handscroll are drawn from that analysis by fixed rules.

- **The chart.** Each étude is a star. Its position angle is its key on the circle of fifths, C at the top; major keys sit on the outer ring and each relative minor on the inner ring at the same angle. Colour is the key, size is apparent magnitude. Fifteen keys hold all twenty-four, so études in one key form double and triple stars. Op. 10 and Op. 25 are joined in published order as two asterisms, solid and dashed.
- **Magnitude.** A recording’s gated loudness on Pogson’s scale, one magnitude to 4 dB, with the mean of the twenty-four at 3.
- **The plates.** One polar plot per étude inside a gilded astrolabe ring: angle is pitch class on the circle of fifths, distance from the centre is time, each point is an onset sized by its strength, each pitch class is laid in its pigment where and when it sounds, and the strongest onsets are joined in gold by a minimum spanning tree.
- **The handscroll.** A watercolour chromagram beneath the chart: twelve rows of pitch class, time from left to right. Each note is a stroke in its pitch’s pigment that decays as the string does. The painting is rendered once per étude and unrolled at the playhead; the paper is seeded by the true solar time of the visit.
- **The music.** Edward Neeman’s recordings for Musopen’s *Set Chopin Free* (2014), public domain, trimmed and loudness-matched. Two decks crossfade so one étude hands over to the next without a gap.

## Structure

```
src/
  pages/index.astro       the page: chart, card, handscroll, gallery, notes, player
  lib/theory.ts           the catalogue and its music theory: keys, magnitudes, relations, citation
  lib/random.ts           seeded randomness shared by the browser and the renderer
  scripts/sky.ts          interaction: selection, card, viewer, player wiring
  scripts/scroll.ts       the handscroll painter
  scripts/player.ts       the two-deck crossfading player
  styles/global.css       colour and type tokens, paper
  styles/sky.css          layout and components
  data/etudes.json        the twenty-four études: key, tempo, nickname
  data/palette.json       key letters and one pigment per step of the circle of fifths
  data/recordings.json    duration, onset count and loudness per recording (generated)
art/
  lib.mjs                 noise and the per-pixel paper renderer
  plate.mjs               the rules of a plate: pigment field and engraved overlay
  render.mjs              renders every plate in parallel
scripts/
  fetch-recordings.mjs    downloads and verifies the source recordings
  process-recordings.mjs  trims, matches loudness, encodes and analyses them
  og.mjs                  the social preview image
public/
  audio/ data/ plates/    generated media, one file per étude
```

`src/lib/theory.ts` is the single source for the catalogue: the site imports it through Astro, and the Node scripts import the same file directly.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Serve the site at `localhost:4321/etude-sky/` |
| `npm run fetch` | Download the 24 recordings into `.cache/recordings/` and verify their checksums |
| `npm run process` | Write `public/audio/`, `public/data/` and `src/data/recordings.json` from the recordings |
| `npm run render` | Render the plates into `public/plates/`; pass ids such as `op10-05` to render only those |
| `npm run og` | Render the social preview `public/og.jpg` |
| `npm run build` | Build the static site into `dist/` |

The scripts need Node 22.18 or later. Behind a local proxy, run the fetch step with `NODE_USE_ENV_PROXY=1`.

## Data

`public/data/<id>.json` holds, per recording, its duration, its integrated loudness, its onsets as `[centiseconds, strength 0–99, pitch-class bitmask]` triples, and its loudness every quarter second on a 0–99 scale.

## Conventions

- An étude is cited as `Op. 10 No. 3` in text and `10·3` on the chart; both come from `ident` and `short` in `theory.ts`. An étude without a nickname is named after its key, as in “Étude in F minor”.
- Type sizes are tokens in `global.css`, one per role, each easing between a phone and a wide desk. Mono labels are set in capitals by CSS and written in sentence case in the markup.
- Copy is English, with British spelling outside quotations.

## Extending

- **Change a colour.** Edit `src/data/palette.json`, then `npm run render` and `npm run og`; the chart and the handscroll read the palette at build time.
- **Change an étude’s details.** Edit `src/data/etudes.json`, then re-render its plate.
- **Replace a recording.** Put the new FLAC at `.cache/recordings/<id>.flac`, then run `npm run process -- <id>` and `npm run render -- <id>`.

## Deployment

Pull requests are built by `.github/workflows/pages.yml`; merging to `main` builds and deploys to GitHub Pages. The workflow pins every action to a commit, installs with `npm ci --ignore-scripts`, and grants write access only to the deploy job.
