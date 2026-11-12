# ODE App Builder

Make an [Open Data Ensemble](https://opendataensemble.org/) custom app without writing code. People name and brand their app, describe each form in plain words, paste a generated prompt into any AI, paste the answer back, and download a zip that Synkronus accepts.

Everything runs in the browser. There is no server, no login, and nothing is sent anywhere.

## Try it

Open `builder/index.html` in Chrome, Edge or Firefox. That's all. (Or run `npm run serve` and open http://localhost:5177.)

1. **Start**: blank app, the "Community health visits" example, or open a saved project / any bundle zip.
2. **Name & brand**: name, description, version, logo, two colours (the full Formulus light/dark theme is worked out for you), main language, which Formulus tabs to show.
3. **Home screen**: welcome text, grid or list of form cards, record counts, saved-records list.
4. **Forms**: describe each form, copy the AI prompt, paste the answer back. The builder finds `schema.json` and `ui.json` in the answer, checks them, explains problems in plain words, and gives a fix-up prompt. "What the form will ask" shows pages, questions, choices and show/hide rules.
5. **Check & download**:
   - `<app>_v<version>_bundle.zip`: `app/` + `forms/`, upload to Synkronus.
   - `<app>_v<version>_source.zip`: the same app as a project folder (README, AGENTS.md, form checks, bundle script, GitHub workflow). Unzip, `git init`, or open in ODE Desktop developer mode.
   - `<app>.odeapp.json`: the builder project, to continue later.

The right-hand phone is the real app runtime with a pretend Formulus, so what you see is what collectors get.

## Deploy

The site is plain static files in `builder/`, served by a Cloudflare Worker (static assets only) on `ode-app.nahati.online`:

```sh
npx wrangler login      # once
npm run deploy          # embeds templates, then wrangler deploy (see wrangler.toml)
```

Any static host works too: copy the `builder/` folder.

## What goes in the bundle

```
app/
  index.html  runtime.js  runtime.css  formulus-load.js   shared "Simple" runtime
  config.js            home screen, form cards (window.ODE_APP_CONFIG)
  app.config.json      name + theme + tabs, read by Formulus itself
  logo.png             if one was added
  odeapp.json          the builder project (minus form files) so the zip can be re-opened
forms/
  <form_id>/schema.json
  <form_id>/ui.json
```

No `manifest.json` and no other top-level folders: Synkronus rejects them.

## Folder layout

| Path | What it is |
| --- | --- |
| `builder/` | The website (Lucide icons, ISC; colour chart from the Tailwind CSS palette, MIT). `js/core.js` holds all logic (also used by tests and the source project's `npm run check`); `js/app.js` is the UI. |
| `runtime/simple/` | The app that runs on phones. Add a folder here for each new app design. |
| `source-template/simple/` | Extra files for the source project zip. |
| `examples/` | Example projects shown on the Start step. |
| `tools/embed.mjs` | Packs runtime, source template and examples into `builder/js/templates.js` and `examples.js`, so the builder works from file://. Run after changing them. |
| `tests/` | Unit tests, browser end-to-end test, and a Synkronus upload test. |

## Tests

```sh
npm install
npm test            # 12 unit tests: palette, form checks, AI-answer parsing, prompt, zips, re-open
npm run test:e2e    # drives the builder in Chromium, downloads the bundle, runs the app with a pretend Formulus
```

`tests/synkronus/oab_push_test.go.txt` pushes bundles through Synkronus's real `PushBundle` code. Copy it to `synkronus/pkg/appbundle/zz_oab_push_test.go` in the ODE repo and run `OAB_ZIPS=/path/a.zip go test ./pkg/appbundle -run TestOABPush -v`.

## Adding another app design

1. Add `runtime/<name>/` with an `index.html` that loads `formulus-load.js`, `config.js` and your code, and reads `window.ODE_APP_CONFIG`.
2. Add `source-template/<name>/` (copy `simple`).
3. Add a title and description in `tools/embed.mjs`, run `npm run embed`. It shows up on the Start step.
