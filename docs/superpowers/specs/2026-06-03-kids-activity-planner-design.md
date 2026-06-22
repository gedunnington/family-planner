# Kids Activity Planner — Design Spec
**Date:** 2026-06-03  
**Status:** Approved for implementation

---

## Problem

A parent maintains a mental/physical list of events and activities they want to do with their kids but can never recall them in the moment when unexpected free time appears. They need a fast, mobile-accessible way to answer "what can we do this weekend?" against a pre-curated list — and to feel confident they're regularly hitting specific parenting values with their kids.

---

## Scope (v1)

**In scope:**
- Tracked events with AI-powered date fetching from event websites
- Query by date range (preset windows) or by theme
- Event detail with AI-drafted moral/message, user-editable
- Themes system: user-defined values framework drawn from parenting resources
- Browse/edit all saved events

**Out of scope for v1 (designed for, built later):**
- Anytime activities with materials lists
- Materials planning / activity meal planner
- Discovery (scanning unfamiliar sites for new events)
- Calendar Builder + Google Calendar integration (v2 — see section below)

---

## Architecture

A single Node.js + Express application:

- **Backend:** Node.js + Express, handles both serving the frontend and all API routes
- **Database:** SQLite (single file, no separate service required)
- **Frontend:** Plain HTML/CSS/JS — no framework, no build step
- **AI:** Claude API (Haiku model) for event date extraction, theme suggestion, and message drafting
- **Hosting:** Render free tier — one GitHub repo, one service, auto-deploys on push
- **Access:** Any device via browser URL — no app install required

On the Render free tier, the service sleeps after inactivity and has a ~30 second cold-start delay on first use. Acceptable for personal use.

---

## Data Model

### Events
| Field | Type | Notes |
|---|---|---|
| id | integer | Primary key |
| name | text | Event name (AI pre-fills from URL fetch) |
| url | text | Website AI fetches to extract the next date |
| location | text | City, venue, or address |
| drive_time_mins | integer | Drive time from home in minutes; displayed as "1h 30m" |
| timing_notes | text | User's notes on typical timing (e.g. "first weekend of February") — fed to AI as context |
| next_date | date | Cached result of last AI fetch |
| start_time | text | Optional start time, e.g. "8:00 AM" — AI extracts alongside date |
| end_time | text | Optional end time, e.g. "2:00 PM" |
| last_fetched | timestamp | When next_date was last updated; re-fetched if >24 hours old |
| message | text | AI-drafted moral/message, user-edited |
| notes | text | Free-form reminders (e.g. "book lodging 3 months out") |
| themes | join | Many-to-many with Themes table |
| created_at | timestamp | |

### Themes
| Field | Type | Notes |
|---|---|---|
| id | integer | Primary key |
| name | text | e.g. "Community Contribution" |
| description | text | Used by AI to decide if an event qualifies — should be rich and specific |
| source | text | Book or organization this theme comes from (e.g. "Hunt Gather Parent") |

Starter themes the user will populate from: Hunt Gather Parent, Simplicity Parenting, The Wonder of Boys, Girls on the Run SEL curriculum, Let Them Grow project.

### Activities (v1.5 — schema only, not built in v1)
| Field | Type | Notes |
|---|---|---|
| id | integer | |
| name | text | |
| description | text | |
| materials | text | JSON array of strings e.g. `["life jackets","paddles","sunscreen"]` |
| lead_time_days | integer | How many days ahead to flag "get materials" |
| message | text | AI-drafted moral/message, user-edited |
| themes | join | Many-to-many with Themes table |

---

## Screens & Navigation

Bottom navigation bar with three tabs:

1. **Home** — query interface (default view)
2. **Events** — browse and edit all saved events
3. **Themes** — manage values framework

### Home — Query Screen

Two tabs within Home:

**"By date" tab (default):**
- Quick-tap preset windows: This weekend / Next 2 weeks / This month / Custom (date picker)
- Max drive time filter chips: Any / 30 min / 1 hr / 2 hr
- "Find events" button

**"By theme" tab:**
- Grid of theme chips (tap to select one or more)
- Lookahead window: Next 3 months / Next 6 months / Next year
- "Find events" button

### Results Screen

List of event cards. Each card shows:
- Event name
- Date (or "Date not yet announced" if next_date is null)
- Location and drive time (displayed as "1h 30m")
- Theme tags (color-coded chips)

Sort options: Date / Drive time / Theme coverage (prioritizes events for themes the user hasn't hit recently — exact algorithm TBD in implementation).

Events with no announced date remain visible but flagged with a yellow indicator.

Each result card has a **"···" overflow button** revealing two options:
- **View details** — same as tapping the card
- **Not for us** — permanently hides this specific event (by name + source URL) so it never appears in results again, even if the tracked URL resurfaces it

Dismissed events are stored in a `dismissed_events` table (`id`, `event_name`, `source_url`, `dismissed_at`). A "Manage dismissed" option in the Events list lets the user review and restore any dismissed event.

### Event Detail Screen

Accessed by tapping any event card. Shows:
- Name, date, location, drive time
- Theme tags
- **"Message for today"** block — the AI-drafted moral/message in a visually distinct callout; tap to edit in-place (no separate edit flow needed for the message)
- User notes
- Link to event website (opens in new tab)
- Edit button (opens Add/Edit flow)

### Add / Edit Event — Two-step flow

**Step 1: Basics**
- URL field with "Fetch" button → AI fetches the page and pre-fills: name, location, detected next date
- User fills in: drive time (minutes), timing notes
- Next button

**Step 2: Themes + Message**
- Theme chips with AI-suggested selections pre-toggled; user adjusts
- Message textarea pre-filled with AI draft; user edits
- Notes field (free-form)
- Save button

On edit, all fields are pre-populated from the saved event.

### Events List Screen

Flat list of all saved events, sorted by next upcoming date (soonest first; undated events at bottom). Each row shows name, date, location, drive time. Tap to open Event Detail. Long-press or swipe to delete.

### Themes Screen

List of all user-defined themes. Each shows name, source, and truncated description. Tap to edit (name, description, source fields). Button to add new theme.

---

## AI Features

All AI calls use the Claude API (Haiku model for speed and cost).

### 1. Date extraction
**Trigger:** User taps "Fetch" on the add event form, or a cached date is >24 hours old at query time.  
**Input:** Page HTML from the event URL + user's timing notes.  
**Output:** Next upcoming date (ISO format) plus optional start/end times if listed, or null if not found.  
**Prompt approach:** "Given this webpage and the note that this event typically occurs [timing_notes], what is the next upcoming date and time? Return JSON: `{date, start_time, end_time}` — use null for unknown fields."  
**On failure:** If the fetch or AI call fails, keep the previously cached date and set a `fetch_error` flag so the UI can show "Last known date — may be outdated" rather than silently showing stale data.

**URL types and fetching strategies:**
- **Regular public websites** — fetch HTML directly, AI-parse for date/time
- **Facebook event URLs** — require user authentication; see Facebook Connect below
- **Other authenticated sites** — fall back to manual date entry (user taps "Enter date manually")

### 2. Theme suggestion
**Trigger:** After URL fetch on the add event form.  
**Input:** Event name, location, and page summary + all user-defined theme names and descriptions.  
**Output:** List of theme IDs that apply.

### 3. Message drafting
**Trigger:** After URL fetch on the add event form (runs alongside theme suggestion).  
**Input:** Event name, page summary, matched themes and their descriptions, source books/orgs.  
**Output:** 2–4 sentence message suitable for saying to kids before or during the event.  
**Note:** User always edits this before saving.

---

## Key Design Decisions

- **Drive time as integer minutes** — sortable and filterable; displayed as human-readable string
- **Date caching with 24h TTL** — balances freshness with performance; undated events shown rather than hidden
- **No framework on frontend** — keeps the project simple, easy to modify, no build step
- **SQLite on Render** — requires a persistent disk add-on (paid) OR the implementation plan should use an alternative (e.g. Turso, a free SQLite-compatible cloud DB) to avoid data loss on redeploy
- **Theme coverage sort** — exact recency algorithm deferred to implementation

---

## Calendar Builder (v2)

A fourth tab in the bottom nav — "Plan" — for building an intentional week around your tracked events.

### Layout

Weekly view: 7 day columns (Mon–Sun), each showing the day name and its events stacked vertically. A scrollable "Available to plan" panel sits below the week grid, listing upcoming tracked events not yet placed.

### Interaction

1. Tap an event card in the "Available" panel to select it (highlights in blue)
2. Tap any day column to assign it to that day
3. The event appears as a colored chip in that day; a remove (×) button lets you unplace it
4. Existing Google Calendar events appear as grey, non-interactive chips for context

### Google Calendar Integration

**Reading (on load):**
- User connects Google account via OAuth 2.0 on first use
- App fetches existing events for the viewed week from Google Calendar API
- Displayed as grey context chips — read-only, not editable from this app

**Writing (on sync):**
- "Push to Google Calendar" button creates real calendar events for all placed activities
- Each event is created with: title (event name), date/time (from next_date + start_time/end_time), description (moral/message + notes)
- Events are tagged with a custom `source: family-planner` property so the app can identify and update/delete them later without touching user's own events

### Data

New `planned_events` table:
| Field | Type | Notes |
|---|---|---|
| id | integer | |
| event_id | integer | FK to Events |
| planned_date | date | The day it's assigned to |
| google_calendar_event_id | text | Populated after sync; used for updates/deletes |
| created_at | timestamp | |

### Auth note
Google OAuth adds a login step to the app. Since this is a personal single-user tool, a simple "Connect Google Calendar" button on first use is sufficient — no multi-user auth complexity needed.

---

## Facebook Connect

Some tracked events live only on Facebook. Rather than requiring a separate URL or manual entry, the app supports a Facebook login flow that lets it fetch event dates from the user's Facebook account.

**Flow:**
1. When the app detects a `facebook.com` URL on an event, it shows a "🔒 Login with Facebook to fetch date" prompt instead of auto-fetching
2. User taps → Facebook OAuth popup opens in the browser
3. User logs in and grants read permission to their events (`user_events` scope)
4. App stores the access token; future refreshes fetch automatically like any other event
5. A small "via Facebook" badge appears on the event card to indicate the source

**Implementation note:** Facebook's `user_events` Graph API permission requires app review for public apps, but for a personal tool the user can create their own Facebook Developer App and self-authorize — no review required. The implementation plan should include setup instructions for this.

**Token storage:** Facebook access tokens are stored server-side (in the SQLite DB), not in the browser. Long-lived tokens (60-day) are used and refreshed automatically.

---

## Out of Scope Clarifications

- No push notifications or reminders
- No social/sharing features
- User authentication: Google OAuth only (for Calendar integration in v2); v1 has no auth
