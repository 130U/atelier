# Atelier

**The Étude Sky.** Chopin's twenty-four études, placed by key on the circle of fifths, curated by Theodore Ouyang at [www.theodoreoy.com/atelier/](https://www.theodoreoy.com/atelier/), apart from his personal site.

- **The chart.** Each étude is a star. Angle is its key around the circle of fifths, with C at the top; major keys sit on the outer ring and each relative minor on the inner ring at the same angle. Colour is the key, size the length of the recording. Fifteen keys hold all twenty-four, so études in one key form double and triple stars. Op. 10 and Op. 25 are drawn as two constellations in published order.
- **The plates.** `art/plate.mjs` paints one plate per étude from its recording, all by the same rules: angle is pitch class on the circle of fifths, radius is time, each dot is an onset sized by its strength, the watercolour wash is the key's pigment as deep as the music is loud, and the strongest onsets are joined in gold by a minimum spanning tree.
- **The music.** Edward Neeman's recordings for Musopen's *Set Chopin Free* (2014), public domain, from Wikimedia Commons. They are trimmed and loudness-matched; the player crossfades between two decks so études hand over without a gap, and the plate and its star follow the music as it plays.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Serve the site at `localhost:4321/atelier/` |
| `npm run fetch` | Download the 24 recordings into `.cache/recordings/` and verify their checksums |
| `npm run process` | Write `public/audio/*.mp3`, `public/data/*.json` and `src/data/recordings.json` from the recordings |
| `npm run render` | Paint the plates into `public/plates/`; pass ids such as `op10-05` to paint only those |
| `npm run og` | Render the social preview `public/og.jpg` |
| `npm run build` | Build the static site into `dist/` |

Behind a local proxy, run the fetch step with `NODE_USE_ENV_PROXY=1`. `.cache/` stays out of git.

## Data

- `src/data/etudes.json`: key, tempo marking and the English and Chinese names of each étude.
- `src/data/palette.json`: the watercolour pigment for each position on the circle of fifths, shared by the plates and the chart.
- `public/data/<id>.json`: per recording, its duration, onsets as `[centiseconds, strength, pitch-class mask]` triples, and loudness every quarter second.

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/pages.yml`.

Template research for the site: [docs/research.md](docs/research.md)
