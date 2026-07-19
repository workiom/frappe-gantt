# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (watch mode)
npm run dev

# Production build (outputs to dist/)
npm run build

# Lint
npm run lint

# Format
npm run prettier

# Check formatting
npm run prettier-check
```

No test runner is configured — `tests/date_utils.test.js` exists but there is no Jest/Vitest script in `package.json`.

## Architecture

This is an SVG-based Gantt chart library. Entry point is `src/index.js` which exports the `Gantt` class.

**Core classes:**
- `Gantt` (`src/index.js`) — Main class. Manages tasks, view modes, rendering pipeline, and event binding. Instantiated with `new Gantt(wrapper, tasks, options)`.
- `Bar` (`src/bar.js`) — Renders a single task bar as SVG elements. Handles drag, resize, and progress interactions.
- `Arrow` (`src/arrow.js`) — Renders dependency arrows between task bars.
- `Popup` (`src/popup.js`) — Tooltip shown on bar hover/click.

**Supporting modules:**
- `src/date_utils.js` — All date manipulation (parse, format, add, diff, is_weekend, etc.). No external date library — fully custom.
- `src/svg_utils.js` — SVG DOM helpers (`createSVG`, `$`, `animateSVG`).
- `src/defaults.js` — `DEFAULT_OPTIONS` and `DEFAULT_VIEW_MODES` (Hour, Quarter Day, Half Day, Day, Week, Month, Year). View modes define `step`, `padding`, `upper_text`, `lower_text`, and `date_format`.
- `src/dependency_shifting.js` — Pure-function module for dependency date shifting. Exports `compute_dependency_shifts(tasks, movedTaskId, deltaMs, mode, direction)` → `Map<taskId, deltaMs>`. `direction` is `'upstream'`, `'downstream'`, or `'both'` and controls traversal direction. Contains graph building, BFS traversal (maintain_buffer modes), and topological-sort-based conflict resolution (consume_buffer mode).
- `src/styles/` — CSS for the gantt chart.
- Critical path (`calculate_critical_path` in `src/index.js`, enabled by `critical_path` option) uses CPM forward/backward passes. It is **date-based** (anchored to the earliest actual task start, so real calendar gaps between bars become slack), **type-aware** (each dependency edge honors its `finish-to-start`/`start-to-start`/`finish-to-finish`/`start-to-finish` type via `resolve_type`, falling back to `dependencies_type`), and **cycle-safe** (a visiting `stack` Set turns dependency back-edges into no-ops instead of infinite recursion). A task is critical when slack (`LS - ES`) ≈ 0. An arrow is critical only when both endpoint tasks are critical (`arrow.js`).

## Documentation Rules

Update `README.md` and `CLAUDE.md` only when needed:

- **Update `README.md`** when user-facing behavior changes: new options, new events, new interaction patterns, or changes to how existing features work. Do not update for internal refactors, bug fixes, or CSS-only tweaks that don't change documented behavior.
- **Update `CLAUDE.md`** when a new project-wide rule or architectural pattern is established, or when a decision is made that future sessions should follow. Do not update for one-off task details or temporary context.

## Styling Rules

**Never hardcode color values in CSS files.** All colors must use CSS custom properties (variables).

When introducing any new color:
1. **First, check if an existing variable in `src/styles/light.css` already represents the right color** — reuse it if so.
2. **If no existing variable fits**, define a new one:
   - Add `--g-<name>: <value>` to `src/styles/light.css` (`:root` block)
   - Add `--g-<name>-dark: <value>` to `src/styles/dark.css` (`:root` block) with an appropriate dark-theme equivalent
   - Use `var(--g-<name>)` in `src/styles/gantt.css`
   - Use `var(--g-<name>-dark)` in the `.dark` block of `src/styles/dark.css`

**Build:** Vite builds to `dist/frappe-gantt.es.js` and `dist/frappe-gantt.umd.js` with `dist/frappe-gantt.css`.

**Key design patterns:**
- View modes are objects with rendering config; users can pass custom view mode objects or predefined name strings.
- Tasks have `dependencies` as an array of `{ id, type? }` objects (e.g. `[{ id: 'task_1', type: 'finish-to-start' }]`). After normalization in `setup_tasks`, each entry's `id` has spaces replaced with `_`. If `type` is absent, `options.dependencies_type` is used as fallback at arrow-creation time.
- `gantt.tasks` is a proxy-like object with `.append()`, `.refresh()`, etc. for dynamic updates.
- The `dependencies_type` option sets the default relationship type for dependency arrows (`finish-to-start`, `start-to-start`, `finish-to-finish`, `start-to-finish`). Each arrow independently turns red when its constraint is violated. Dragging is always free — no auto-shifting of dependents. `Arrow` receives the resolved type as a constructor arg (`dependency_type`).
- Each `Arrow` renders two SVG elements: `element` (the visible path) and `hit_element` (a wider transparent path for easier mouse targeting). Both are appended to `this.layers.arrow` in `index.js`. Path calculation is split into per-type private methods (`_path_finish_to_start`, `_path_start_to_start`, `_path_finish_to_finish`, `_path_start_to_finish`).
- Arrow hover highlights the arrow (`.arrow-hover` class) and connected bar elements (`.bar-arrow-hover`, `.bar-arrow-critical`, or `.bar-arrow-invalid` classes). CSS variables `--g-arrow-hover-color` (light) and `--g-arrow-hover-color-dark` (dark) control the hover stroke color.
- RTL support is handled via `isRTL` option which flips layout direction.
- The `dependency_shifting` option controls how dependent tasks respond after a bar is dragged or resized (fires on mouseup, not during live drag). Four modes: `none` (default, no shifting), `maintain_buffer_all`, `maintain_buffer_downstream`, `consume_buffer` (topological-sort, type-aware — shifts only the minimum needed to resolve the actual conflict; diamond resolution takes the max shift). Implemented in `src/dependency_shifting.js`; called from the mouseup handler in `index.js`. `$bar.finaldx` is reset to `0` after each mouseup to prevent re-triggering on scroll events. The `direction` arg (`'upstream'`, `'downstream'`, `'both'`) passed to `compute_dependency_shifts` depends on both the mode and the interaction type:

  | Mode | Left-resize | Right-resize | Drag |
  |---|---|---|---|
  | `maintain_buffer_downstream` | nothing | downstream | downstream |
  | `maintain_buffer_all` | upstream | downstream | both |
  | `consume_buffer` | upstream | downstream | both |

  `consume_buffer` only shifts tasks where an actual conflict exists (buffer exhausted); remaining buffer is consumed silently.
- Interactive dependency linking is opt-in via `allow_dependency_creation` (default `true`). When enabled, `Bar.draw_connector_circles()` appends two `<circle>` elements (`.connector-circle.connector-start` and `.connector-circle.connector-end`) to `handle_group`. `Bar.update_connector_circles()` keeps their positions synced during drag/resize — it is a no-op when refs are null, which happens between the `handle_group.innerHTML = ''` DOM clear and the redraw in `refresh()`. Both refs are nulled at the top of `draw_connector_circles()` (before early-return guards) to ensure this. Connector circles are RTL-aware: start/end swap when `isRTL` is true. They are hidden when `readonly: true`.
- Dependency linking state lives entirely in `Gantt`. `bind_dependency_linking()` registers a delegated `mousedown` on `.connector-circle` (starts the drag), plus non-delegated `mousemove` and `mouseup` on `this.$svg`. The drop target is resolved by `_resolve_link_target(e, svgX)`: a direct hit on a `.connector-circle` uses that circle's endpoint; a hit anywhere on a bar body picks the nearer endpoint by splitting the bar at its midpoint (`bar.$bar.getX() + width/2`, RTL-aware — start half → `start`, end half → `end`). So the user can drop on a circle **or** anywhere on the target bar. `mousemove` drives snap feedback via `_update_link_hover(target)`/`_clear_link_hover()` (enlarges the target endpoint's circle to `r=9`, adds the temp line's `snap` class, and renders the type-abbreviation badge); it re-evaluates every move so crossing the bar midpoint flips start↔end live. The circles are `opacity:0` until the bar-wrapper is `:hover`ed, so the enlarged target circle is visible while hovering the bar. `mouseup` commits via `_commit_dependency` when a valid non-source target resolves, then `_cancel_linking()`; a document-level `mouseup` is a safety net that only cancels when the release lands outside the SVG. A `layers.linking` SVG `<g>` is created after the base layer loop so it renders on top. The temp line (`linking-temp-line`) uses SVG coordinates converted via `createSVGPoint()` + `getScreenCTM().inverse()`. A snap badge appears when the cursor is over a valid target circle. `_resolve_dependency_type(from_endpoint, to_endpoint)` maps endpoint pairs to type strings. `_commit_dependency(to_bar, to_endpoint)` enforces one-dep-per-task-pair: it removes any pre-existing dep from the same source task, then either creates the new one (no prior link → fires `on_dependency_create`), replaces it with a new type (prior link exists, different type → fires `on_dependency_changed(from, to, old_type, new_type)`), or stops without creating (same type → toggle off, fires `on_dependency_delete`). `delete_dependency(arrow)` removes the dep from `to_task.dependencies` and calls `update_task`. The Delete/Backspace keydown handler guards against firing when an `INPUT`, `TEXTAREA`, or `contenteditable` element is focused. The bar mousedown handler guards `if (e.target.classList.contains('connector-circle')) return` to prevent resize/drag from starting when a circle is clicked.
- Clicking a date cell in a task's grid row (task column enabled) sets dates. No-date tasks (`_has_no_dates`) assign immediately (start = clicked, end = +1 day). Tasks with exactly one date are flagged `_has_partial_dates` in `setup_tasks` (no longer filtered out) and render as bar-less clickable rows; tasks with both dates render normally. For date-having tasks, clicking routes to `reschedule_task_from_click(task, clicked_date)`, which awaits the opt-in `on_date_change_request(task, new_start, new_end)` callback — truthy applies (partial → end = start + 1 day; both → original duration preserved), falsy/throw/absent leaves the task unchanged. `date_change` + `after_date_change` fire after a successful apply.
