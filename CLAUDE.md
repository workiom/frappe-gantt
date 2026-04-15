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
