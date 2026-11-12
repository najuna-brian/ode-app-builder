# {{APP_NAME}}

{{APP_DESCRIPTION}}

An [Open Data Ensemble (ODE)](https://opendataensemble.org/) custom app, made with the ODE App Builder ({{BUILDER_VERSION}}) from the "Simple" template.

## What is in this folder

| Path | What it is |
| --- | --- |
| `app/` | The app that runs inside Formulus: `index.html`, `runtime.js`, `runtime.css`, `formulus-load.js`, your settings in `config.js`, your theme in `app.config.json`, and your logo. |
| `forms/<form_id>/` | One folder per form: `schema.json` (what is collected) and `ui.json` (how it is shown). `BRIEF.md` is the plain-language description the form was written from. |
| `odeapp.json` | Your ODE App Builder project. Open it in the builder to keep editing with clicks. |
| `scripts/` | `check`, `bundle` and `preview` helpers. |
| `AGENTS.md`, `CONTEXT_*.md` | Rules and context for AI assistants that edit this project. |

`app/` and `forms/` sit side by side, exactly as they do in the Synkronus app bundle.

## Forms

| Form id | Title |
| --- | --- |
{{FORM_LIST}}

## Everyday use

Requires [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
npm run check     # check every form with the ODE rules
npm run bundle    # build/{{APP_SLUG}}_v{{APP_VERSION}}_bundle.zip, ready for Synkronus
npm run preview   # see the home screen in your browser
```

- **Publish:** upload the bundle zip in the Synkronus portal (App bundles), or with the [Synkronus CLI](https://opendataensemble.org/docs/reference/synkronus-cli): `synk app-bundle upload build/<name>.zip --activate`.
- **Try it in ODE Desktop:** run `npm run bundle`, then in Workbench → Bundles turn on Developer mode and choose the `build/desktop` folder.
- **Change a form:** edit `forms/<form_id>/schema.json` and `ui.json`, bump the `"version"` in `schema.json`, run `npm run check`. Never rename or remove a field that already has data.
- **Change the look:** re-open `odeapp.json` in the ODE App Builder, or edit `app/config.js` (home screen) and `app/app.config.json` (Formulus colours) by hand.

## Make it a Git repository

```sh
git init
git add .
git commit -m "Start {{APP_NAME}}"
```

Then create an empty repository on GitHub and push to it. The included workflow (`.github/workflows/bundle.yml`) checks the forms and builds the bundle on every push.

## Learn more

- [Form specifications](https://opendataensemble.org/docs/reference/form-specifications)
- [App bundle format](https://opendataensemble.org/docs/reference/app-bundle-format)
- [Custom applications](https://opendataensemble.org/docs/guides/custom-applications)
- [AI agent support in ODE Desktop](https://opendataensemble.org/docs/guides/ai-agents)
