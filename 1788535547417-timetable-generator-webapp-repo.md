# Timetable Generator Web App — Implementation Plan

A client-side-only timetable generator for a gymnasium: build weekly lesson plans by dragging subjects from a catalog onto a Mon–Fri × period grid, with per-cell teacher initials, room number/name, odd/even-week split lessons, custom themes, and PNG export.

Deliverables: three separate files at repo root — `index.html`, `style.css`, `app.js` (no build step, no other files required).

## Confirmed decisions (from user interview)

- **3 files** (`index.html`, `style.css`, `app.js`), pure front-end, hosted on a domain, internet/CDN allowed (no offline requirement).
- **Grid**: rows = days (Mon–Fri), columns = numbered periods. Day labels editable per plan.
- **Periods**: user-defined count; each period has number/label + start time + end time, shown stacked in the top header line. Optional "break after" mark renders a thicker divider column line (e.g., lunch).
- **Lesson slot contents** (shown as SHORT forms in the grid): subject abbreviation, teacher initials (first two letters of teacher's last name, typed by user), room = 3-digit number + room-name abbreviation (e.g., `TVO`, `N—X`).
- **Catalog**: draggable subject cards containing only full subject name + color (background). The grid shows only short/abbreviated subject names.
- **Editing**: click a placed item to open an editor where you type teacher initials, room number, room-name short, and subject short/full. No inline typing into cells.
- **O/E (odd/even week)**: handled on an already-placed item. A cell starts as one "every week" lesson. Toggling it to "differs odd/even" reveals two halves; each half independently chooses its subject, teacher, room. The cell then renders split into an O half and an E half (both always visible).
- **Free hours**: empty cells render as pure blank space that shows the plan's overall background through (no separate fill).
- **Drag interactions**: drop on empty cell = place; drop on occupied cell = prompt Replace / Cancel (Cancel returns the card and lets the user re-drag). Drag an item out of the grid back to the catalog area or blank canvas = delete (never re-append to catalog). Cell-to-cell drag allowed (move). Both mouse and touch.
- **Themes** (stored in localStorage): background (color/gradient/image), title header background + text color, fonts, grid item text color, item shape (rectangle / square / rounded radius), day-header styling, teacher/room text colors, grid line colors, break-line color. Item **background colors** are per-subject (not uniform) and overridable per placed item; a background image can be put on individual items. Subject color and per-lesson overrides are user-set, never preset.
- **Storage**: multiple named timetables auto-saved in the browser (localStorage). NO JSON export/import files. Hamburger (≡) menu lists all plans and has "+" to create one; if no plan exists yet, redirect to that menu screen. Duplicate / rename / delete / clear-plan actions available there with confirmations.
- **PNG export**: scale selector (1x/2x/3x), option to include/exclude the header/title band; download via `html-to-image` from CDN.
- **Extras selected**: undo/redo, create-plan wizard, duplicate/clear actions, PNG scale & header options.
- **Not in scope**: A4 print stylesheet, JSON backup files.

## Data model (state in JS)

```js
// Persisted under localStorage key "ttg_v1"
{
  activePlanId: string,
  plans: Plan[]
}

Plan = {
  id, name,
  days: [{ id, label }],            // default Mon..Fri; editable in settings
  periods: [{ id, label, start, end, breakAfter }], // start/end "HH:MM" or ""; breakAfter bool
  catalog: Subject[],
  grid: { "<dayId>.<periodIdx>": Cell },   // missing keys = free
  theme: Theme,                            // see below
  createdAt, updatedAt
}

Subject = { id, fullName, short, color }   // short = abbreviation shown in cells

Cell =
  { kind: "all", lesson: Lesson } |
  { kind: "oe", odd: Lesson|null, even: Lesson|null }  // one half may be null (free that week)

Lesson = {
  subjectId,          // reference into plan.catalog
  teacher,            // initials, e.g. "Mü"
  roomNum,            // 3-digit string, e.g. "123"
  roomName,           // e.g. "TVO" or "N—X"
  bgColor?, bgImage?, // per-item overrides (bgImage = downscaled dataURL)
  textColor?, subTextColor? // optional per-item overrides
}

Theme = {
  name,
  pageBg,            // { type:"color"|"gradient"|"image", color, gradientCss, image(dataURL), pos, size }
  headerTitleBg, headerTitleText,   // title band background & text color
  titleText,                        // editable title string ("Name / class / year")
  font,                            // chosen family for title & grid (shared or separate titleFont/bodyFont)
  dayHeaderBg, dayHeaderText,
  itemTextColor, subTextColor,     // default subject text & teacher/room text colors
  itemShape,                       // "sharp" | "rounded" (radius preset) | "pill"
  bgImageEnabled,                  // placeholder clarity not needed; store per item anyway
  gridLineColor, breakLineColor,
  cellPad,                         // density: compact / normal / spacious
  preset: true/false               // true when it's a built-in preset (copied on first edit)
}
```

Undo/redo = snapshot stacks (JSON deep copies of active plan, debounced capture before each mutation). Keyboard: Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y.

## Screen / UI structure

1. **Landing state** (no plans exist): hamburger-screen equivalent — empty-state panel: "Create your first timetable" → opens wizard.
2. **Hamburger menu / plan list**: slide-in sheet listing every plan name; buttons per plan: open, duplicate, rename, delete. Top: "+ New plan". New-plan button always reachable in app header.
3. **Create-plan wizard** (modal, few steps): name, weekdays (Mon–Fri default, toggles for Sat?), number of periods (3–12), initial start times with sensible defaults but fully editable afterward. Creates empty plan → editor.
4. **Editor screen** layout:
   - App header bar: hamburger, plan title (editable inline), undo/redo, theme button, export button.
   - Left/main: catalog drawer — subject cards (full names + color swatches), search filter, "+" to add a subject (full name, short label, color), card edit menu, footer hint "drag a card onto the grid · drag grid items back here or onto the background to delete".
   - Center/right: timetable canvas (the generated, theme-styled table).
   - Header row above columns: period label + start–end time, and a tall title band above it (editable title text, header styling).
   - Free cells & cells absent from grid key show pure background.
   - OE cells render vertically split: top half tagged `O`, bottom half `E`, thin divider, alternating shade not required (colors come from subjects).
5. **Cell editor popover** (click a placed item): shows each variant. For a normal lesson: subject (dropdown/search of catalog + color), subject short override?, teacher initials, room number, room name; "every week" radio vs "differs odd/even week" toggle. When toggled to O/E, shows two side-by-side halves `O` / `E`, each with its own subject/teacher/room; "free" option per half. Per-item overrides: bg color, bg image upload, text colors.
6. **Theme panel** (modal): preset gallery (e.g., Clean Light, Dark, Pastel, Print High-Contrast) + custom editor: title band text, fonts, colors, item shape, background picker (color/gradient/image upload), grid & break line colors, spacing density; live preview on the canvas behind the panel; Save/Cancel. Built-in presets copied before user edits; user themes stored in localStorage only.
7. **Export panel** (modal): includes header? yes/no; scale 1x/2x/3x; filename `<planName>.png`; Download. Also a "download is faithful to what you see" note.

## Drag & drop mechanics

- Use Pointer Events (works for mouse + touch). Long-press (~120 ms) or touch-drag lifts a catalog card / grid item into a floating ghost; no native HTML5 DnD (unreliable on phones).
- During drag: every timetable cell shows its drop-target outline; occupied cells that would trigger replace get a distinct "replace" outline; catalog drawer edge acts as the delete zone (trash highlight).
- Drop outcomes: empty cell → place; occupied → native-style confirm dialog (Replace / Cancel; Cancel = ghost returns, nothing changes, hint "drag to the correct hour"); onto catalog/blank zone → remove from grid.
- Scrolling while dragging near edges (auto-scroll) for narrow phones.
- Cancel drag by dropping outside anything valid or pressing Escape.

## Theming / rendering notes

- Grid is an HTML `<table>`-like CSS grid so themes and backgrounds are easy to style and html-to-image renders faithfully.
- Background images: page-level and per-item; on upload, downscale via canvas to ≤ ~1400 px longest side and store as JPEG/PNG dataURL to respect the ~5 MB localStorage budget. Save errors from quota overflow surface a friendly message ("remove/compress background images").
- Both title and item fonts: bundle a small set via Google Fonts `<link>` (e.g., Roboto, Inter, Lora, monospace fallback stack) — internet allowed; always pair with generic fallback.
- OE halves: force even layout (two stacked boxes); teacher/room text small under subject short; subject short is the emphasized line.
- Column header shows e.g. `1.` over `07:45–08:30`; break-after period draws thicker vertical line; a large gap (break span) may also be implemented as thicker spacing if breakAfter set.
- Days with fewer lessons simply have empty trailing cells (free, background shows).

## Responsive behavior

- Editor layout: catalog collapses into a bottom sheet / toggle drawer on narrow screens.
- Timetable horizontally scrolls inside a container; the day-name column sticks to the left; the header row sticks to the top.
- Buttons ≥ touch-target sizes; dialogs become bottom sheets on phones.
- Viewport `meta`, `-webkit-tap-highlight`, `touch-action: manipulation`, disable text selection during drag.

## Files & implementation order (implementation tasks)

1. `index.html` — semantic skeleton: app shell, hamburger sheet, wizard modal, editor (header, catalog, canvas, floating toolbars), cell editor popover, theme modal, export modal, confirm dialog, toasts, modal backdrop; load `html-to-image` via CDN script; single `<script type="module" src="app.js">`; Google Fonts links.
2. `style.css` — design tokens, CSS variables that JS theme sets on `:root`/canvas scope; layout for editor/responsive breakpoints; component styles for all modals/sheets; drop-target & drag states; OE split-cell styles; print-avoid; scroll behavior; canvas export area sized for 1x/2x/3x via inline scale classes.
3. `app.js` — modules/functions (single file, organized):
   - storage layer (load/save/autosave debounce, quota guard),
   - state store + undo/redo snapshots,
   - plan CRUD (create via wizard, rename, duplicate, delete, clear),
   - catalog management (add/edit/delete/search subjects),
   - grid rendering (full re-render on data change; targeted re-render of a cell),
   - cell editor logic incl. O/E toggle,
   - pointer-based drag & drop engine with ghost/auto-scroll/confirmations,
   - theme engine (presets + custom, applies CSS vars),
   - image upload helper (downscale → dataURL),
   - export (html-to-image `toPng`, scale, header include toggle, filename download),
   - router between landing/menu/editor screens.
4. Cross-check mobile interactions & final polish pass.

## Risks / notes for implementer

- html-to-image + Google Fonts: ensure CORS-friendly font loading (standard `<link>` + crossorigin font fetching usually fine); if a font fails to inline, PNG falls back to system font — acceptable.
- localStorage quota: mitigate by downscaling all images on import; catch QuotaExceededError and inform user.
- Keep OE visual semantics obvious even without color (O/E tags on the halves) since two halves may share a color.
- Native `confirm()` is unreliable inside some in-app contexts; use the custom confirm dialog component instead.
- Do not persist image blobs as separate files — everything stays inside the single localStorage JSON as dataURLs per user requirement (no files, no cookies).
- Times: parse "HH:MM", tolerate empty start/end (shows label only).

## Validation

- Manual run: `python3 -m http.server 8000` in repo root and open `http://localhost:8000` (ES modules + CDN need http(s), not `file://`).
- Scenario checklist:
  1. Fresh browser → landing → wizard → empty editor renders Mon–Fri rows with period header times.
  2. Add catalog subjects → drag onto cells; drag onto occupied → Replace/Cancel; drag from grid back to catalog deletes.
  3. Toggle O/E on a placed lesson → two halves; assign odd=Math, even=Czech with different teachers/rooms → split cell shows both.
  4. Edit period times, add breakAfter → header updates, break line shows.
  5. Reload page → state restored from localStorage; hamburger lists plans; create second plan; rename/duplicate/delete work with confirmations.
  6. Undo/redo after drags and edits.
  7. Theme changes (colors, fonts, shape, page background image, item background image) apply live and survive reload.
  8. Resize to phone width (DevTools): drawer collapses, table scrolls, day column sticky, touch drag places a lesson.
  9. Export PNG with/without header at 1x/2x/3x; file downloads and visually matches the screen.
  10. Fill a day with fewer lessons → trailing space shows page background image.
- Lint/syntax check of `app.js` via `node --check app.js`.
