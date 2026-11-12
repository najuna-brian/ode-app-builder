# {{APP_NAME}}

{{APP_DESCRIPTION}}

An [Open Data Ensemble (ODE)](https://opendataensemble.org/) custom app, made with the ODE App Builder ({{BUILDER_VERSION}}) from the React starter: React 18, TypeScript and Vite.

## What is in this folder

| Path | What it is |
| --- | --- |
| `src/` | The app's source: `screens/Home.tsx`, `screens/List.tsx`, `screens/Record.tsx`, the router (one history entry per screen, so the phone's back button steps back), the Formulus data helpers and `styles.css`. |
| `app/` | The built app that runs inside Formulus. `npm run build` writes `index.html` and `runtime.js` (with the styles inside) here. `config.js` (your settings), `app.config.json` (Formulus theme) and your logo also live here and are kept by the build. |
| `public/` | Files copied into `app/` as they are: `formulus-load.js` (the Formulus bridge loader) and `icons.js` (line icons). |
| `forms/<form_id>/` | One folder per form: `schema.json` (what is collected) and `ui.json` (how it is shown). `BRIEF.md` is the plain-language description the form was written from. |
| `odeapp.json` | Your ODE App Builder project. Open it in the builder to keep editing with clicks. |
| `scripts/` | `check` and `bundle` helpers. |
| `AGENTS.md`, `CONTEXT_*.md` | Rules and context for AI assistants that edit this project. |

`app/` already holds a working build, so you can bundle straight away.

## Forms

| Form id | Title |
| --- | --- |
{{FORM_LIST}}

## Everyday use

Requires [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
npm run dev       # work on the app in your browser, with a pretend Formulus that saves sample records
npm run build     # type-check and build into app/
npm run check     # check every form with the ODE rules
npm run bundle    # build/{{APP_SLUG}}_v{{APP_VERSION}}_bundle.zip, ready for Synkronus
```

- **Publish:** upload the bundle zip in the Synkronus portal (App bundles), or with the [Synkronus CLI](https://opendataensemble.org/docs/reference/synkronus-cli): `synk app-bundle upload build/<name>.zip --activate`.
- **Try it in ODE Desktop:** run `npm run build && npm run bundle`, then in Workbench → Bundles turn on Developer mode and choose the `build/desktop` folder.
- **Change a form:** edit `forms/<form_id>/schema.json` and `ui.json`, bump the `"version"` in `schema.json`, run `npm run check`. Never rename or remove a field that already has data.
- **Change the look:** edit `src/styles.css` and the screens. Colours come from `app/app.config.json` as CSS variables (`--primary`, `--surface`, ...), so the app follows the Formulus theme and dark mode.
- **Talk to Formulus:** `src/data.ts` wraps the API (`getObservations`, `openFormplayer`). The full API is in `CONTEXT_FORMULUS_API.md`.

## Make it a Git repository

```sh
git init
git add .
git commit -m "Start {{APP_NAME}}"
```

Then create an empty repository on GitHub and push to it. The included workflow (`.github/workflows/bundle.yml`) checks the forms, builds the app and makes the bundle on every push.

## Learn more

- [Form specifications](https://opendataensemble.org/docs/reference/form-specifications)
- [App bundle format](https://opendataensemble.org/docs/reference/app-bundle-format)
- [Custom applications](https://opendataensemble.org/docs/guides/custom-applications)
- [AI agent support in ODE Desktop](https://opendataensemble.org/docs/guides/ai-agents)
