# Notes for AI assistants

This is an ODE custom app made with the ODE App Builder (React starter: React 18 + TypeScript + Vite). Read this before changing anything.

## Layout

- `src/` is the app source. `npm run build` type-checks it and writes `app/index.html` and `app/runtime.js`. Never edit those two by hand; edit `src/` and rebuild.
- Navigation must keep one history entry per screen (`src/router.ts`, `go()` / `back()`), so the Android back button steps back one screen and only offers to exit on the home screen.
- Keep `formulus-load.js` a classic script loaded before the app, and get the API with `window.getFormulus()` (see `src/data.ts`).
- `app/config.js` sets `window.ODE_APP_CONFIG`: app name, logo, home screen and the form cards (`forms[]`: `formType`, `title`, `description`, `icon`, `color`).
- `app/app.config.json` is read by Formulus itself: app name, light/dark theme colours, native tabs, default locale. Keep `theme.light` and `theme.dark` complete.
- `forms/<form_id>/schema.json` + `ui.json`: one folder per form. The folder name is the form type. A new form also needs an entry in `app/config.js`.
- `odeapp.json` is the builder project file. If you change forms here, the builder will pick them up when the person re-opens the bundle zip.

## Rules for forms

Follow `CONTEXT_ODE_FORMS.md` and https://opendataensemble.org/docs/reference/form-specifications. In short:

- Root of `ui.json` is a `SwipeLayout`; each page is a layout inside it.
- Bump the string `"version"` in `schema.json` on every change.
- Never rename or delete a field that may have data; never reuse a choice code with a new meaning.
- Rule condition values must match the field's choice codes and type exactly (`"1"` is not `1`).
- A question that a rule can hide must not be in the top-level `required`.
- Run `npm run check` after every change and fix all errors.
- Run `npm run build` after changing `src/`, and fix all type errors.

## ODE Desktop

If ODE Desktop is installed, its `ode` command and MCP server (`ode mcp`) give you the `ode-edit-form` skill, validation and form preview. Run `npm run bundle` and point Developer mode at `build/desktop`.

## Do not

- Add a `manifest.json` or any top-level folder other than `app/`, `forms/` and `renderers/` to the bundle; Synkronus rejects it.
- Publish to a server without the person's explicit confirmation.
