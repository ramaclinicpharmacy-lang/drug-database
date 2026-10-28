# drug-database

Static HTML pages for Rama Clinic Pharmacy DB, using Supabase directly from the browser.

## Rendering database content safely

- Keep database values raw in application state and edit forms. Use `textContent`/`innerText` for plain DOM text.
- Inside HTML templates, use `encodeHTML(value)` for text and quoted attribute values. Use `textWithBreaks(value)` for multiline text. These preserve clinical operators such as `<30` and `≥60` as text.
- For links and images, use `encodeHTML(safeURL(value))` in templates, or `safeURL(value)` when assigning a DOM URL property. Only HTTP and HTTPS URLs are accepted.
- For dynamic controls, use `${bindHTMLAction('click', function(event) { /* use raw arguments here */ })}` and insert the completed fragment with `setHTML(element, markup)` in the same synchronous operation. The helper attaches listeners with `addEventListener`; it never evaluates handler text. Do not interpolate data into inline JavaScript handlers.
- `setHTML` binds generated controls; it is not a sanitizer. Its HTML must be built from static application markup and escaped data. Do not pass raw database HTML to it.
- Changelog content intentionally supports limited rich HTML through `safeRichHTML`, backed by vendored DOMPurify 3.4.17. Its license is in `vendor/DOMPurify-LICENSE`. If the sanitizer is unavailable, content is escaped as text.

Deploy `ui-safety.js` and `vendor/` alongside the HTML pages. Database permissions remain enforced by Supabase policies.

## Security regression tests

```sh
npm ci
npx playwright install chromium
npm test
```

Tests intercept every network request and use fake Supabase responses. They do not contact or modify production data. To use an existing Chromium binary, set `CHROMIUM_EXECUTABLE_PATH`.
