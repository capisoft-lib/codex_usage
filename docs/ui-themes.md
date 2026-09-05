# UI themes

The editable UI lives in `public/`. Do not edit `dist/dashboard/` or `sites-hub/public/dashboard/`; the bundle scripts generate them.

The dashboard offers four dark palettes in Settings → Appearance. Green remains the default. The `codex-usage-theme` browser preference is applied by the blocking, same-origin `themes.js` script before the stylesheet loads. No inline script, remote asset, API call or account setting is required. Unknown values fall back to green; unavailable storage still allows switching for the current tab. Browser storage events synchronize other tabs, including preference removal.

To add a theme:

1. Add a stable ID and matching background color to the frozen registry in `public/themes.js`.
2. Add its `[data-theme="id"]` palette to `public/styles.css`, defining every base token present in the green palette. UI components use these tokens; translucent surfaces derive from them. Keep danger/status meanings and chart series distinguishable.
3. Add the theme key and translated names to `THEME_LABELS` and its key list in `public/translations.js`. The radio choices and swatches are generated from the registry.
4. Run the root checks and hosted tests/lint. The theme tests verify palette completeness, readable foreground contrast, persistence, storage failures, tab synchronization and local/offline bundle inclusion. Review appearance and keyboard operation separately when doing browser QA.

The brand/PWA icon and Mesh administration/sign-in pages retain their own branding. Themes cover the shared usage dashboard, including its settings, tables, drawers, dialogs and charts.
