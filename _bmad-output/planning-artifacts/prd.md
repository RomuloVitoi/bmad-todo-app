---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments: []
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 0
workflowType: 'prd'
classification:
  projectType: web_app
  domain: general
  complexity: low
  projectContext: greenfield
  notes: >
    Full-stack responsive web app backed by a single shared global todo list.
    No authentication in v1 — every visitor sees and can mutate the same list.
    Per-user isolation and auth are explicit post-MVP features. Deployment
    target is an open choice for the architecture phase. Architecture must
    not preclude future multi-user/auth features.
---

# Product Requirements Document - todo-app

**Author:** Romulo
**Date:** 2026-04-19

## Executive Summary

A deliberately minimal full-stack todo application that lets anyone open the app and immediately manage a shared list of tasks (no accounts in v1) — no onboarding, no feature negotiation. The product delivers the four core actions (create, view, complete, delete) with instant UI response, polished empty/loading/error states, and durable persistence across sessions. The target user is any individual who wants a clean, fast place to track tasks without adopting a tool or learning a workflow. The problem solved is not the absence of todo apps — it is the absence of one that stays small on purpose.

### What Makes This Special

Most todo apps compete by adding features; this one competes by refusing to. The core insight is that the value of a todo app lives in the reliability and polish of its core loop, not in its feature count. A v1 that nails instant feedback, unambiguous active/completed state, and session durability feels more complete than a feature-rich app that does any of those poorly. The first-use moment is friction-free — the list is visible on open, and the first task can be added without reading a single word of UI copy. Extensibility is treated as engineering discipline, not product ambition: the v1 scope is the product, but the architecture will not require a rewrite to add auth, multi-user, or richer task metadata later.

## Project Classification

- **Project Type:** Web application (full-stack, responsive desktop + mobile)
- **Domain:** General / personal productivity — no regulatory or specialized-domain concerns
- **Complexity:** Low — single shared list, CRUD-only scope, no authentication in v1 (v1 is deliberately global; per-user isolation is a post-MVP feature)
- **Project Context:** Greenfield — no existing system to extend
- **Deployment Target:** Open choice, to be determined in the architecture phase

## Success Criteria

### User Success

- A first-time user can add, view, complete, and delete a todo on their first session with zero onboarding, help text, or documentation.
- The user's list of todos is visible immediately on app load — no modal, no sign-up gate, no tooltips.
- Completed todos are visually distinguishable from active todos at a glance (no re-reading required).
- Users can reload or return to the app and find the shared list in the state it was last left by any user — no lost data, no duplicated items, no drift between sessions.
- When something goes wrong (network failure, server error), the user sees a clear, non-technical message and can recover without refreshing or losing in-progress input.

### Business Success

- The v1 ships as a reference-quality full-stack implementation: small enough to read end-to-end in one sitting, polished enough to demo without caveats.
- The delivered artifact is recognizably "complete" — a reviewer would not say "this is missing [obvious core feature]" within the v1 scope.
- The codebase and architecture make the next plausible features (auth, multi-user, metadata) straightforward to add without a rewrite.

### Technical Success

- All CRUD operations complete perceptibly within ~100 ms under normal conditions (optimistic UI acceptable).
- Data is durable across browser refreshes, tab closes, and server restarts — no reliance on in-memory or client-only storage for the source of truth.
- The backend API is well-defined (documented shapes, predictable error responses) and exercisable independently of the frontend.
- Client and server handle failure states gracefully — no uncaught errors, no stuck spinners, no silent data loss.
- The application is straightforward to run locally, deploy, and extend by a developer who has never seen it before.

### Measurable Outcomes

- **Time-to-first-task (new user):** < 10 seconds from page load to first todo created.
- **Core-loop latency:** ≤ 100 ms perceived UI response on add / complete / delete under normal conditions.
- **Session durability:** 100% of todos persist across full page reloads and server restarts in integration tests.
- **Onboarding-free usability:** 5 out of 5 unprimed testers complete add → complete → delete without assistance.
- **Error recovery:** every induced failure (offline, 500, timeout) surfaces a user-readable state the user can recover from without refresh.

## Product Scope

### MVP - Minimum Viable Product

- Create a todo (short textual description).
- View the list of todos with active / completed state visually distinguished.
- Mark a todo as completed (and un-complete).
- Delete a todo.
- Persisted storage via backend API with CRUD endpoints.
- Responsive UI across desktop and mobile viewports.
- Empty, loading, and error states handled throughout.
- Basic client- and server-side error handling.

### Growth Features (Post-MVP)

- User accounts and authentication.
- Per-user data isolation (multi-tenant data model).
- Task priorities, due dates, and reminders/notifications.
- Task editing (beyond complete/delete).
- Filtering, sorting, and search.
- Keyboard shortcuts and power-user affordances.

### Vision (Future)

- Multi-device sync with conflict resolution.
- Collaboration — shared lists, assignment, comments.
- Integrations with calendars, email, or chat.
- Offline-first PWA behavior.
- API/integration surface for third-party clients.

## Scope Philosophy & Risk Mitigation

### MVP Strategy & Philosophy

**MVP Approach: Experience MVP.** The product is validated by the *feel* of the core loop, not by feature count, user acquisition numbers, or revenue. Success is "this feels like a complete, polished product despite doing very little." The MVP is small not because we're cutting corners, but because doing the small surface excellently *is* the thesis.

**What we're deliberately not doing:**

- **No accounts, multi-user, or collaboration** — v1 is a single shared list.
- **No richer task metadata** — no priorities, due dates, tags, notes, or categories. Just description + done/not-done + creation time.
- **No real-time sync** — concurrent visitors see changes on next fetch.
- **No offline / PWA** — requires network to mutate state.
- **No analytics, telemetry, or A/B testing** — out of scope for a reference implementation.

**Resource framing:** v1 is sized for a small delivery — a single developer or pair, completable in a short timeframe. Scope expansion would invalidate the "simple, reference-quality" positioning.

**Phase dependency:** Phase 3 items mostly assume Phase 2's auth work has shipped.

### Risk Mitigation Strategy

**Technical Risks:**

- **Concurrency on a shared list.** Multiple users mutating simultaneously could produce lost updates. *Mitigation:* last-write-wins semantics, documented explicitly in the API; the backend is the authority; optimistic client updates reconcile against server responses.
- **Over-engineering "future extensibility."** Temptation to design auth/multi-user in now "so it's ready later." *Mitigation:* build v1 for v1 only; keep the data model and API surface simple enough that replacing them is cheap. Extensibility is preserved by smallness, not by premature abstractions.
- **Choice paralysis on tech stack.** The architecture phase has an open brief, which can spiral. *Mitigation:* constrain stack selection to choices where the developer already has strong familiarity; prefer boring, idiomatic tools.

**Market / Product Risks:**

- **"Yet another todo app" reception.** *Mitigation:* v1 isn't positioned to compete in the todo-app market — it's a reference-quality implementation and a stance on minimalism. Success is judged on execution polish, not adoption.
- **Shared-list design looks broken to someone expecting per-user behavior.** *Mitigation:* the landing surface should make the shared nature immediately legible (e.g., subtle UI hint or microcopy), and the PRD documents it as an explicit v1 choice.

**Resource / Scope Risks:**

- **Scope creep during build.** The "architecture shouldn't block future features" framing can justify adding things "just in case." *Mitigation:* any feature outside Phase 1 requires an explicit PRD revision, not a dev-side judgment call.
- **Undersized v1.** Risk that v1 is *too* minimal to feel complete (e.g., missing edit, missing any confirmation on delete). *Mitigation:* treat polish (error states, empty state, accessibility, responsive behavior) as in-scope work equal to feature work — not afterthoughts.

## User Journeys

### Journey 1 — First-Time Use (Happy Path)

**Meet Alex.** They open the link their friend shared, over lunch.

**Opening scene.** The page loads. There is no modal, no sign-up, no tour. They see an input field and a list of todos already populated by prior visitors — some checked off, some not. Alex immediately understands: this is a shared space. The mental model is closer to a public whiteboard than a private inbox.

**Rising action.** Alex types "pick up dry cleaning," presses Enter. The item appears at the end of the list instantly. They add two more. Each one lands without delay.

**Climax.** Alex checks off "pick up dry cleaning." It visually shifts — struck through, clearly completed. Their own addition is indistinguishable from items added by anyone else, which is intentional: the v1 product has no notion of ownership.

**Resolution.** Alex closes the laptop. On their phone two hours later, they open the app again. The three items they added are still there, alongside whatever others have added or completed in the interim.

**Capabilities revealed:** gating-free page load, inline creation, instant visual feedback, distinct active/completed styling, durable shared persistence, responsive layout.

### Journey 2 — Returning Session & Routine Use

**Alex, two weeks later.** They open the tab. The list has thirty items now — a few theirs, most not. Completed items from today and older are visible but visually deprioritized.

**Rising action.** Alex deletes one of their stale completed items to tidy up. The list re-flows cleanly. They notice someone else has added "clean coffee machine" — they consider leaving it, then complete it because they actually did it.

**Resolution.** They close the tab. The app has earned its slot — not as private storage, but as a low-ceremony shared scratchpad.

**Capabilities revealed:** deletion (on any item, active or completed), list stability across mutations, no ownership distinction, consistent ordering semantics.

### Journey 3 — Failure & Recovery (Edge Case)

**Alex on the train, patchy connectivity.** They type "email landlord" and press Enter.

**Rising action.** Network is down. The app surfaces a clear, non-technical error ("Couldn't save — we'll try again") without clearing the typed text.

**Climax.** Train emerges into signal. Retry (auto or one-tap) succeeds. The item lands.

**Resolution.** No data lost, no refresh required.

**Capabilities revealed:** explicit error states, input preservation, user-driven retry, graceful degradation, no silent data loss.

### Journeys Intentionally Out of Scope for v1

- **Admin / operations** — no admin surface exists.
- **Support / troubleshooting** — no accounts to investigate.
- **API consumer** — backend API exists and is well-defined, but no external integration is a named v1 user type.
- **Moderation** — a shared unauthenticated list could in principle be abused; v1 deliberately does not address this (see trade-offs below).

### Known v1 Trade-offs from the Shared-List Choice

- **No privacy:** anyone can see, complete, or delete anyone else's todos. Acceptable only because v1 is a reference/learning implementation, not a production service.
- **No abuse protection:** no rate-limiting, no moderation, no content filtering in v1 scope.
- **Session durability means global durability:** a user's additions persist indefinitely (until deleted by anyone), not just until they close their session.

### Journey Requirements Summary

- **Rendering & layout:** list-first page, responsive, no gating screens.
- **Create / complete / delete:** optimistic-feeling UI, immediate feedback, no ownership checks.
- **Persistence:** globally durable — the single shared list is the canonical state for all visitors.
- **State styling:** unambiguous active vs. completed.
- **Error surfaces:** human-readable failures with preserved input and a recovery path.
- **Edge states:** empty, loading, and error states are first-class.

## Web App Specific Requirements

### Project-Type Overview

A responsive full-stack web application with a single-page client and a small backend API. The application delivers a shared todo list with CRUD operations, optimistic UI updates, and polished edge states. It runs in modern browsers on desktop and mobile form factors.

### Technical Architecture Considerations

- **Rendering model:** Single-Page Application (SPA). The list and its mutations are the entire product surface; a multi-page architecture would add navigation cost without user benefit. Server-rendered initial HTML is optional (nice-to-have for first-paint), not required.
- **Client/server split:** Frontend consumes a small, documented backend API. The API is the single source of truth; the client maintains optimistic UI state but does not claim authority.
- **State management:** Keep it proportional to scope — a single list and three mutations do not require Redux-scale state tooling. Local component state or a lightweight store is sufficient.
- **Shared-list contention:** Because v1 is a single global list, the architecture must tolerate concurrent mutations from multiple users without corrupting state. Last-write-wins semantics are acceptable for v1; this should be explicit in the API contract, not emergent.

### Browser Matrix

- **Supported:** current and previous major versions of Chrome, Firefox, Safari, and Edge (desktop + mobile).
- **Not supported:** Internet Explorer, legacy Edge (pre-Chromium), browsers without ES2020 support.
- **Gracefully degraded (not targeted):** older mobile browsers that don't meet the above bar — the app may render but advanced styling/interactions are not guaranteed.

### Responsive Design

- **Breakpoints:** mobile-first layout that adapts to desktop without a separate codebase.
- **Touch and pointer parity:** tap targets sized for touch; no hover-only affordances that break on mobile.
- **Viewport handling:** no horizontal scroll, no zoom requirement to read text or use controls.

### Performance Targets

- **Time to interactive on first load:** < 2s on a modern broadband connection, < 5s on a 3G-equivalent profile.
- **Core-loop latency (create / complete / delete):** ≤ 100 ms perceived UI response; server round-trip may exceed this but UI feedback is optimistic.
- **Bundle size:** small — this is a todo app; anything over ~200 KB gzipped for the initial JS bundle is a smell.

### Real-Time Behavior

v1 is **not real-time**. Concurrent visitors see each other's changes only on the next page load or refetch (e.g., via an explicit reload, or when the client re-requests the list on a user-initiated action). Real-time propagation (polling, WebSockets, SSE) is explicitly out of scope for v1. This is a deliberate simplification, documented as a known limitation; the API is designed to support a real-time layer being added later without breaking changes.

### SEO Strategy

- **Not a priority for v1.** The content is user-generated, ephemeral, and of no search value. No specific SEO work is required beyond a sensible `<title>`, meta description, and no accidental `noindex`.
- The application should render a meaningful page title and work with/without JavaScript enabled for basic accessibility (see below), but no server-side rendering for crawlers is required.

### Accessibility Level

- **Target:** WCAG 2.1 Level AA for the core user flows (create, view, complete, delete).
- **Specifics:** keyboard-navigable throughout; visible focus indicators; semantic HTML (form elements, list semantics, button roles); color contrast meeting AA; screen-reader-friendly labels for the input, checkbox, and delete controls; completed/active state communicated to assistive tech beyond color alone.
- **Not targeted:** AAA, locale-specific accessibility standards (e.g., Section 508 formal certification).

### Implementation Considerations

- **API contract first:** the REST (or similar) API between client and server should be definable and testable independently of the UI.
- **Tech stack is an open choice** for the architecture phase; selection should favor simplicity, idiomatic tooling, and a small dependency footprint.
- **Local development ergonomics:** the app should be runnable end-to-end locally with a single command (or close to it) — alignment with the "easy to understand, deploy, and extend" success criterion.
- **Deployment-agnostic:** no assumption of a specific platform (Vercel, Docker-on-anything, bare Node, serverless) — decisions defer to the architecture phase.

### Explicitly Skipped (per project-type configuration)

- Native desktop/mobile integrations.
- CLI surface.

## Functional Requirements

### Task Management

- **FR1:** User can add a new todo by entering a short text description.
- **FR2:** User can mark any active todo as completed.
- **FR3:** User can mark any completed todo as not completed.
- **FR4:** User can delete any todo regardless of its completion state.
- **FR5:** Each todo carries a unique identifier assigned by the system at creation time.
- **FR6:** Each todo records its creation time.
- **FR7:** Each todo carries a completion state (active or completed).

### List Presentation

- **FR8:** User sees the full shared list of todos immediately on page load, without authentication or interaction gates.
- **FR9:** Active and completed todos are visually distinguishable from each other at a glance.
- **FR10:** Todos are rendered in a consistent, predictable order across page loads and across users.
- **FR11:** User sees an empty-state presentation when the list contains no todos.
- **FR12:** User sees a loading-state presentation while the initial list is being fetched.

### State & Persistence

- **FR13:** All todos persist in durable server-side storage and survive server restarts and client reloads.
- **FR14:** The shared list is the single source of truth for all visitors — no per-user or per-session isolation in v1.
- **FR15:** Concurrent mutations from multiple users are resolved deterministically by the server (last-write-wins at the todo level).
- **FR16:** Client-side state reconciles with server state on fetch; divergence is resolved in favor of the server.

### Feedback & Error Handling

- **FR17:** User receives immediate visual feedback on every mutation attempt (create, complete, uncomplete, delete).
- **FR18:** User sees a clear, non-technical error message when a mutation cannot be persisted.
- **FR19:** User's in-progress input (e.g., text being typed) is preserved through mutation failures.
- **FR20:** User can retry a failed mutation without refreshing the page or losing list state.
- **FR21:** The system does not silently drop mutations; every attempted operation either succeeds, visibly fails, or is retried.

### API Surface

- **FR22:** The backend exposes an operation to retrieve the full list of todos.
- **FR23:** The backend exposes an operation to create a new todo from a text description.
- **FR24:** The backend exposes an operation to update a todo's completion state.
- **FR25:** The backend exposes an operation to delete a todo.
- **FR26:** Each API operation returns predictable, documented success and error response shapes.
- **FR27:** API error responses distinguish between client errors (invalid input) and server errors (internal failures).
- **FR28:** The API can be exercised and tested independently of the frontend client.

### Responsive & Accessible Delivery

- **FR29:** The application renders usably across desktop, tablet, and mobile viewport widths without a separate codebase per form factor.
- **FR30:** All interactive elements are reachable and operable via keyboard alone.
- **FR31:** All interactive elements expose accessible labels and roles consumable by assistive technology.
- **FR32:** Active vs. completed state is communicated to assistive technology by means other than color alone.
- **FR33:** The application is operable in supported modern browsers without special configuration or fallback plugins.

## Non-Functional Requirements

### Performance

- **NFR1:** Core-loop UI response (add, complete, uncomplete, delete) is perceptibly instantaneous — ≤ 100 ms from user action to visual feedback under normal conditions, via optimistic UI.
- **NFR2:** Server-side API response for all CRUD operations returns in ≤ 300 ms at the 95th percentile under normal single-user load.
- **NFR3:** Initial page load to interactive is < 2 s on a modern broadband connection and < 5 s on a 3G-equivalent profile.
- **NFR4:** Initial JavaScript bundle is ≤ 200 KB gzipped.

### Reliability & Durability

- **NFR5:** Todo data persists across client reloads, tab closures, and backend process restarts — no data loss in any of these scenarios.
- **NFR6:** Concurrent mutations from multiple clients do not produce corrupted state, duplicated items, or lost updates at the backend level.
- **NFR7:** The system does not silently swallow errors — every failed mutation is surfaced to the user or retried automatically.
- **NFR8:** The application recovers from transient network failures (offline, timeout, 5xx) without requiring a full page refresh.
- **NFR9:** No unhandled promise rejections, uncaught exceptions, or stuck UI states under the induced failure modes documented in Journey 3.

### Accessibility

- **NFR10:** The core user flows (add, view, complete, delete) meet WCAG 2.1 Level AA conformance.
- **NFR11:** All interactive elements are operable via keyboard alone, with visible focus indicators.
- **NFR12:** Active vs. completed state is conveyed to assistive technology via semantic markup or ARIA, not by color alone.
- **NFR13:** Color contrast for text and interactive elements meets WCAG AA contrast ratios.
- **NFR14:** Tap targets on mobile viewports are sized to meet accessibility tap-target guidelines (minimum 44×44 CSS pixels or equivalent).

### Security

- **NFR15:** The application serves over HTTPS in any deployed environment (local development may exempt).
- **NFR16:** The API validates and sanitizes all user-supplied input server-side before persisting — no trust in client-side validation.
- **NFR17:** Rendered todo text is escaped appropriately to prevent cross-site scripting regardless of input content.
- **NFR18:** The API applies reasonable input bounds (e.g., maximum todo description length) to prevent trivial resource-exhaustion inputs.
- **NFR19:** No authentication, session, or authorization mechanisms exist in v1 (deliberate); no data in v1 is treated as private or protected.

### Maintainability & Operability

- **NFR20:** A developer unfamiliar with the codebase can run the full stack (frontend + backend) locally with a single documented command.
- **NFR21:** The codebase is small enough to be read end-to-end in a single sitting; no module exists solely for speculative future use.
- **NFR22:** The backend API is documented (contract shape, error codes) such that a developer could implement a client without reading the frontend code.
- **NFR23:** Automated tests cover the critical paths: CRUD API operations, list rendering, and the three documented user journeys including failure recovery.
- **NFR24:** The system emits sufficient server-side logs on errors to diagnose failures without reproducing them client-side.
