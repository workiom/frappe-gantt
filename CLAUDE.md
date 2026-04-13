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
- `src/styles/` — CSS for the gantt chart.

**Build:** Vite builds to `dist/frappe-gantt.es.js` and `dist/frappe-gantt.umd.js` with `dist/frappe-gantt.css`.

**Key design patterns:**
- View modes are objects with rendering config; users can pass custom view mode objects or predefined name strings.
- Tasks have `dependencies` (comma-separated IDs) and `_start`/`_end` as internal Date objects after normalization in `setup_tasks`.
- `gantt.tasks` is a proxy-like object with `.append()`, `.refresh()`, etc. for dynamic updates.
- The `dependencies_type` option controls how dependent tasks shift when a parent moves (`fixed`, `finish-to-start`, etc.).
- RTL support is handled via `isRTL` option which flips layout direction.
