<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Browser baseline

Tailwind v4 utilities like `border-current/10` and `bg-color/<opacity>` compile to
`color-mix(in oklab, ..., transparent)` — supported in Chrome 111+, Safari 16.4+
(March 2023), Firefox 113+. PRD FR33 ("modern browsers") is interpreted to
include this floor. If a deploy target's analytics shows meaningful traffic
from older browsers, replace these utilities with explicit colors or define
project-level `--color-*` CSS vars in `globals.css`.

## Path alias resolution

`@/*` (mapped to `./src/*` in `tsconfig.json`) works for `.ts` / `.tsx` imports.
Turbopack does NOT read `tsconfig.paths` for non-TS files — `.css` / `.svg`
imports via `@/*` will fail at build time even if the editor's TS Language
Server resolves them. If/when this becomes an issue, mirror the alias into
`next.config.ts` `turbopack.resolveAlias`.
