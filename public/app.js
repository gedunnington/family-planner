// ── State ──────────────────────────────────────────────────────────────
const state = {
  themes: [],
  events: [],
  results: [],
  dismissed: [],
  sortMode: 'date',
};

// ── API helpers ────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  return res.json();
}
const GET = p => api('GET', p);
const POST = (p, b) => api('POST', p, b);
const PUT = (p, b) => api('PUT', p, b);
const DELETE = p => api('DELETE', p);

// ── Navigation ─────────────────────────────────────────────────────────
function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + screenId).classList.add('active');
}

const TITLES = {
  home: '🧭 Family Planner', results: 'Results', detail: '',
  events: 'My Events', themes: 'My Themes', add: 'Add Event',
};

function setHeader(screen, backFn) {
  document.getElementById('hdr-title').textContent = TITLES[screen] || '';
  document.getElementById('hdr-left').innerHTML = backFn
    ? `<span style="color:#4a90d9;cursor:pointer" onclick="(${backFn})()">← Back</span>` : '';
}

function nav(screen) {
  show(screen);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-' + screen)?.classList.add('active');
  setHeader(screen, null);
  if (screen === 'home') renderHome();
  if (screen === 'events') renderEventsList();
  if (screen === 'themes') renderThemesList();
}

// ── Date helpers ───────────────────────────────────────────────────────
function isoDate(d) { return d.toISOString().split('T')[0]; }

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function nextWeekend(from) {
  const d = new Date(from);
  const day = d.getDay();
  const daysToSat = day === 6 ? 0 : 6 - day;
  const sat = addDays(d, daysToSat);
  return { from: sat, to: addDays(sat, 1) };
}

function fmtShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US',
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDrive(mins) {
  if (!mins) return '';
  if (mins >= 60) { const h = Math.floor(mins / 60), m = mins % 60; return m ? `${h}h ${m}m` : `${h}h`; }
  return `${mins} min`;
}

function fromTimeInput(val) {
  if (!val) return null;
  const [h, m] = val.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function toTimeInput(val) {
  if (!val) return '';
  const parts = val.split(' ');
  const period = parts[1];
  let [h, m] = parts[0].split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ── Theme tag CSS classes ──────────────────────────────────────────────
const TAG_COLORS = {
  'Community Contribution': 'tc', 'Community': 'tc',
  'Physical Challenge': 'tp', 'Physical': 'tp',
  'Nature Connection': 'tn', 'Nature': 'tn',
  'Simplicity': 'ts',
  'Wonder & Curiosity': 'tw', 'Wonder': 'tw',
  'Social-Emotional Learning': 'tsel', 'SEL': 'tsel',
  'Autonomy & Risk-taking': 'ta', 'Autonomy': 'ta',
};
function tagClass(name) { return TAG_COLORS[name] || 'tw'; }

// ── Card HTML ──────────────────────────────────────────────────────────
function cardHtml(e) {
  const tags = (e.themes || []).map(t =>
    `<span class="tag ${tagClass(t.name)}">${t.name}</span>`).join('');
  const timeStr = e.start_time
    ? (e.end_time ? ` · ${e.start_time}–${e.end_time}` : ` · from ${e.start_time}`) : '';
  const dateStr = e.next_date ? fmtDate(e.next_date) + timeStr + ' · ' : '';
  const driveStr = fmtDrive(e.drive_time_mins);
  const undated = !e.next_date
    ? `<div class="card-undated">⚠ Date not yet announced · ${e.timing_notes || ''}${e.start_time ? ' · starts ' + e.start_time : ''}</div>` : '';
  const stale = e.fetch_error
    ? `<div class="card-undated">⚠ Last known date — may be outdated</div>` : '';
  const safeName = (e.name || '').replace(/'/g, "\\'");
  const safeUrl = (e.url || '').replace(/'/g, "\\'");
  return `<div class="event-card ${!e.next_date ? 'undated' : ''}" onclick="showDetail(${e.id})">
    <div class="card-row1">
      <div class="card-name">${e.name}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <div class="card-drive">${driveStr}</div>
        <div class="card-overflow" onclick="event.stopPropagation();toggleOverflow(${e.id})">···</div>
      </div>
    </div>
    <div class="card-meta">${dateStr}${e.location || ''}</div>
    ${undated}${stale}
    <div class="tag-row">${tags}</div>
    <div class="overflow-menu" id="overflow-${e.id}" style="display:none">
      <div class="overflow-item" onclick="event.stopPropagation();showDetail(${e.id})">View details</div>
      <div class="overflow-item dismiss" onclick="event.stopPropagation();dismissEvent(${e.id},'${safeName}','${safeUrl}')">Not for us — hide forever</div>
    </div>
  </div>`;
}

function toggleOverflow(id) {
  document.querySelectorAll('.overflow-menu').forEach(m => {
    if (m.id !== `overflow-${id}`) m.style.display = 'none';
  });
  const m = document.getElementById(`overflow-${id}`);
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

async function dismissEvent(id, name, url) {
  if (!confirm(`Hide "${name}" forever?\n\nYou can restore it from the Events list.`)) return;
  await POST('/api/dismissed', { event_name: name, source_url: url });
  state.dismissed = await GET('/api/dismissed');
  state.results = state.results.filter(e => e.id !== id);
  renderResults();
}

// ── Home screen ────────────────────────────────────────────────────────
let selectedPreset = 'weekend', selectedDrive = 'any';
let selectedThemeFilters = [], selectedLookahead = 3;

function getDateRange() {
  const now = new Date();
  if (selectedPreset === 'weekend') return nextWeekend(now);
  if (selectedPreset === '2wk') return { from: now, to: addDays(now, 14) };
  if (selectedPreset === 'month') {
    return { from: now, to: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
  }
  return {
    from: new Date(document.getElementById('cust-from').value + 'T00:00:00'),
    to: new Date(document.getElementById('cust-to').value + 'T23:59:59'),
  };
}

function renderHome() {
  const now = new Date();
  const weekend = nextWeekend(now);
  document.getElementById('screen-home').innerHTML = `
    <div class="tabs">
      <div class="tab active" id="tab-date" onclick="homeTab('date')">By Date</div>
      <div class="tab" id="tab-theme" onclick="homeTab('theme')">By Theme</div>
    </div>
    <div id="pane-date">
      <div class="section">
        <div class="label">When do you have free time?</div>
        <div class="preset-grid">
          <div class="preset-btn selected" id="pr-weekend" onclick="setPr('weekend',this)">
            <div class="p-label">This weekend</div>
            <div class="p-sub">${fmtShort(weekend.from)}–${fmtShort(weekend.to)}</div>
          </div>
          <div class="preset-btn" id="pr-2wk" onclick="setPr('2wk',this)">
            <div class="p-label">Next 2 weeks</div>
            <div class="p-sub">${fmtShort(now)}–${fmtShort(addDays(now, 14))}</div>
          </div>
          <div class="preset-btn" id="pr-month" onclick="setPr('month',this)">
            <div class="p-label">This month</div>
            <div class="p-sub">${now.toLocaleString('default', { month: 'long' })}</div>
          </div>
          <div class="preset-btn" id="pr-custom" onclick="setPr('custom',this)">
            <div class="p-label">Custom</div><div class="p-sub">Pick dates</div>
          </div>
        </div>
        <div id="custom-dates" style="display:none;margin-bottom:16px" class="form-2col">
          <div><label class="form-label">From</label><input type="date" class="form-input" id="cust-from"></div>
          <div><label class="form-label">To</label><input type="date" class="form-input" id="cust-to"></div>
        </div>
        <div class="label">Max drive time</div>
        <div class="chips">
          <div class="chip selected" id="dr-any" onclick="setDrive('any',this)">Any</div>
          <div class="chip" id="dr-30" onclick="setDrive('30',this)">30 min</div>
          <div class="chip" id="dr-60" onclick="setDrive('60',this)">1 hour</div>
          <div class="chip" id="dr-120" onclick="setDrive('120',this)">2 hours</div>
        </div>
        <button class="btn btn-blue" onclick="runSearch('date')">Find events</button>
      </div>
    </div>
    <div id="pane-theme" style="display:none">
      <div class="section">
        <div class="label">What do you want to focus on?</div>
        <div class="chips">${state.themes.map(t =>
          `<div class="chip ${selectedThemeFilters.includes(t.id) ? 'selected' : ''}"
                data-tid="${t.id}" onclick="toggleThemeFilter(${t.id},this)">${t.name}</div>`
        ).join('')}</div>
        <div class="label">Within the next</div>
        <div class="chips">
          <div class="chip ${selectedLookahead === 3 ? 'selected' : ''}" onclick="setLookahead(3,this)">3 months</div>
          <div class="chip ${selectedLookahead === 6 ? 'selected' : ''}" onclick="setLookahead(6,this)">6 months</div>
          <div class="chip ${selectedLookahead === 12 ? 'selected' : ''}" onclick="setLookahead(12,this)">1 year</div>
        </div>
        <button class="btn btn-blue" onclick="runSearch('theme')">Find events</button>
      </div>
    </div>`;

  // Restore preset selection state
  document.getElementById(`pr-${selectedPreset}`)?.classList.add('selected');
  if (selectedPreset === 'custom') document.getElementById('custom-dates').style.display = 'grid';
  document.getElementById(`dr-${selectedDrive}`)?.classList.add('selected');
}

function homeTab(t) {
  document.getElementById('pane-date').style.display = t === 'date' ? 'block' : 'none';
  document.getElementById('pane-theme').style.display = t === 'theme' ? 'block' : 'none';
  document.getElementById('tab-date').classList.toggle('active', t === 'date');
  document.getElementById('tab-theme').classList.toggle('active', t === 'theme');
}

function setPr(p, el) {
  selectedPreset = p;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('custom-dates').style.display = p === 'custom' ? 'grid' : 'none';
}

function setDrive(v, el) {
  selectedDrive = v;
  document.querySelectorAll('#pane-date .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function toggleThemeFilter(id, el) {
  selectedThemeFilters = selectedThemeFilters.includes(id)
    ? selectedThemeFilters.filter(t => t !== id) : [...selectedThemeFilters, id];
  el.classList.toggle('selected');
}

function setLookahead(v, el) {
  selectedLookahead = v;
  document.querySelectorAll('#pane-theme .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

async function runSearch(mode) {
  let url;
  if (mode === 'date') {
    const { from, to } = getDateRange();
    const drive = selectedDrive === 'any' ? '' : `&max_drive=${selectedDrive}`;
    url = `/api/search?mode=date&from=${isoDate(from)}&to=${isoDate(to)}${drive}`;
  } else {
    const ids = selectedThemeFilters.length
      ? selectedThemeFilters.join(',')
      : state.themes.map(t => t.id).join(',');
    url = `/api/search?mode=theme&theme_ids=${ids}&lookahead_months=${selectedLookahead}`;
  }

  state.results = await GET(url);
  state.sortMode = 'date';

  // Background-refresh stale dates (fire and forget)
  state.results
    .filter(e => !e.last_fetched || Date.now() - new Date(e.last_fetched) > 24 * 60 * 60 * 1000)
    .forEach(e => POST(`/api/ai/refresh/${e.id}`).catch(() => {}));

  renderResults();
  show('results');
  setHeader('results', () => nav('home'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

// ── Results screen ─────────────────────────────────────────────────────
function sortResults(by, el) {
  state.sortMode = by;
  document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderResults();
}

function renderResults() {
  let sorted = [...state.results];
  if (state.sortMode === 'date') {
    sorted.sort((a, b) => !a.next_date ? 1 : !b.next_date ? -1 : a.next_date.localeCompare(b.next_date));
  } else if (state.sortMode === 'drive') {
    sorted.sort((a, b) => (a.drive_time_mins || 9999) - (b.drive_time_mins || 9999));
  } else {
    sorted.sort((a, b) => (b.themes?.length || 0) - (a.themes?.length || 0));
  }

  const el = document.getElementById('screen-results');
  if (!sorted.length) {
    el.innerHTML = `<div class="results-bar">No events match</div>
      <div class="empty"><div class="empty-icon">🗓</div>
      <div class="empty-text">No events match this window.<br>Try a wider date range or distance.</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="results-bar">${sorted.length} event${sorted.length !== 1 ? 's' : ''} found</div>
    <div class="sort-row">
      <div class="sort-chip ${state.sortMode === 'date' ? 'active' : ''}" onclick="sortResults('date',this)">Date</div>
      <div class="sort-chip ${state.sortMode === 'drive' ? 'active' : ''}" onclick="sortResults('drive',this)">Drive time</div>
      <div class="sort-chip ${state.sortMode === 'theme' ? 'active' : ''}" onclick="sortResults('theme',this)">Theme coverage</div>
    </div>
    ${sorted.map(cardHtml).join('')}`;
}

// ── Event detail ───────────────────────────────────────────────────────
async function showDetail(id) {
  const e = await GET(`/api/events/${id}`);
  const timeStr = e.start_time
    ? (e.end_time ? ` · ${e.start_time}–${e.end_time}` : ` · from ${e.start_time}`) : '';
  const dateStr = e.next_date ? fmtDate(e.next_date) + timeStr : 'Date not yet announced';
  const driveStr = e.drive_time_mins ? ` · ${fmtDrive(e.drive_time_mins)}` : '';
  const tags = (e.themes || []).map(t =>
    `<span class="tag ${tagClass(t.name)}" style="font-size:12px;padding:4px 10px">${t.name}</span>`).join('');

  document.getElementById('screen-detail').innerHTML = `
    <div class="detail-wrap">
      <div class="detail-name">${e.name}</div>
      <div class="detail-meta">${dateStr} · ${e.location || ''}${driveStr}</div>
      <div class="detail-tags">${tags}</div>
      <div class="msg-block">
        <div class="msg-label">Message for today</div>
        <div class="msg-text" id="msg-text-${e.id}" contenteditable="true"
             onblur="saveMessage(${e.id},this.textContent)">${e.message || '<em style="color:#aaa">No message yet — edit to add one</em>'}</div>
        <div class="msg-source">Tap to edit</div>
      </div>
      ${e.notes ? `<div class="detail-sec">
        <div class="detail-sec-label">Your notes</div>
        <div class="detail-sec-text">${e.notes}</div>
      </div>` : ''}
      <a href="${e.url}" target="_blank" class="link-out">View event website ↗</a><br>
      <button class="outline-btn" onclick="showAdd(${e.id})">Edit event</button>
      <br><br>
      <button id="refresh-btn-${e.id}" onclick="refreshEventDate(${e.id})"
        style="background:none;border:none;color:#4a90d9;font-size:13px;cursor:pointer">
        ↻ Refresh date from website
      </button>
    </div>`;

  show('detail');
  setHeader('detail', () => { show('results'); setHeader('results', () => nav('home')); });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

async function saveMessage(id, text) {
  const e = await GET(`/api/events/${id}`);
  await PUT(`/api/events/${id}`, { ...e, message: text, theme_ids: (e.themes || []).map(t => t.id) });
}

async function refreshEventDate(id) {
  const btn = document.getElementById(`refresh-btn-${id}`);
  btn.textContent = '↻ Refreshing...';
  btn.disabled = true;
  try {
    const result = await POST(`/api/ai/refresh/${id}`);
    btn.textContent = result.date ? `✓ Updated: ${fmtDate(result.date)}` : '⚠ No date found on page';
  } catch {
    btn.textContent = '✗ Refresh failed';
  }
  setTimeout(() => { btn.textContent = '↻ Refresh date from website'; btn.disabled = false; }, 3000);
}

// ── Add / Edit event ───────────────────────────────────────────────────
let addPageText = '';
let addThemeSelections = [];
let addDetectedDate = null;

async function showAdd(editId = null) {
  addPageText = '';
  const editing = editId ? await GET(`/api/events/${editId}`) : null;
  addDetectedDate = editing?.next_date || null;

  document.getElementById('screen-add').innerHTML = `
    <div class="step-bar" id="add-step-bar">Step 1 of 2 — Basics</div>
    <div id="add-s1" class="section">
      <div class="form-group">
        <label class="form-label">Event website URL</label>
        <div class="fetch-row">
          <input class="form-input" id="add-url" type="url" placeholder="https://..."
                 value="${editing?.url || ''}">
          <button class="fetch-btn" id="fetch-btn" onclick="doFetch()">Fetch ↗</button>
        </div>
        <div class="fetch-ok" id="fetch-ok" style="display:none"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Event name</label>
        <input class="form-input" id="add-name" placeholder="e.g. Birkie Ski Race"
               value="${editing?.name || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Location</label>
        <input class="form-input" id="add-loc" placeholder="City, venue, or address"
               value="${editing?.location || ''}">
      </div>
      <div class="form-2col" style="margin-bottom:16px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Drive time (min) <span>AI fills</span></label>
          <input class="form-input" id="add-drive" type="number" placeholder="45"
                 value="${editing?.drive_time_mins || ''}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Timing notes</label>
          <input class="form-input" id="add-timing" placeholder="e.g. First wknd Feb"
                 value="${editing?.timing_notes || ''}">
        </div>
      </div>
      <div class="form-2col" style="margin-bottom:16px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Start time <span>AI fills</span></label>
          <input class="form-input" id="add-start" type="time"
                 value="${editing?.start_time ? toTimeInput(editing.start_time) : ''}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">End time <span>optional</span></label>
          <input class="form-input" id="add-end" type="time"
                 value="${editing?.end_time ? toTimeInput(editing.end_time) : ''}">
        </div>
      </div>
      <button class="btn btn-blue" onclick="addStep2(${editId || 'null'})">Next →</button>
    </div>
    <div id="add-s2" class="section" style="display:none">
      <div class="form-group">
        <label class="form-label">Themes <span style="color:#9b59b6">✦ AI suggested</span></label>
        <div class="chips" id="add-theme-chips"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Message for your kids <span style="color:#9b59b6">✦ AI draft</span></label>
        <textarea class="form-input" id="add-msg" rows="5">${editing?.message || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Your notes</label>
        <textarea class="form-input" id="add-notes" rows="2"
                  placeholder="Reminders, logistics...">${editing?.notes || ''}</textarea>
      </div>
      <button class="btn btn-green" onclick="saveEvent(${editId || 'null'})">Save event</button>
    </div>`;

  show('add');
  const backTarget = editId ? () => showDetail(editId) : () => nav('events');
  setHeader('add', backTarget);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

async function doFetch() {
  const url = document.getElementById('add-url').value.trim();
  if (!url) return alert('Enter a URL first');
  const btn = document.getElementById('fetch-btn');
  btn.textContent = 'Fetching...';
  btn.disabled = true;

  try {
    if (new URL(url).hostname.includes('facebook.com')) {
      const status = await GET('/auth/facebook/status');
      if (!status.connected) {
        btn.textContent = 'Fetch ↗';
        btn.disabled = false;
        if (confirm('Facebook login required to fetch events. Connect now?')) {
          location.href = '/auth/facebook';
        }
        return;
      }
    }
  } catch {}

  try {
    const timing = document.getElementById('add-timing').value;
    const result = await POST('/api/ai/fetch', { url, timing_notes: timing });

    if (result.facebook_events) {
      const names = result.facebook_events.map((e, i) =>
        `${i + 1}. ${e.name} — ${e.date || 'no date'}`).join('\n');
      const choice = prompt(`Facebook events found:\n${names}\n\nEnter number to import (or Cancel):`);
      if (choice) {
        const ev = result.facebook_events[parseInt(choice) - 1];
        if (ev) {
          document.getElementById('add-name').value = ev.name;
          document.getElementById('add-loc').value = ev.location || '';
          if (ev.start_time) document.getElementById('add-start').value = toTimeInput(ev.start_time);
          if (ev.end_time) document.getElementById('add-end').value = toTimeInput(ev.end_time);
          addPageText = ev.name;
          addDetectedDate = ev.date || null;
        }
      }
    } else if (result.error) {
      alert('Could not fetch page: ' + result.error);
    } else {
      if (result.name) document.getElementById('add-name').value = result.name;
      if (result.location) document.getElementById('add-loc').value = result.location;
      if (result.start_time) document.getElementById('add-start').value = toTimeInput(result.start_time);
      if (result.end_time) document.getElementById('add-end').value = toTimeInput(result.end_time);
      if (result.drive_time_mins && !document.getElementById('add-drive').value) {
        document.getElementById('add-drive').value = result.drive_time_mins;
      }
      addPageText = result.pageText || '';
      addDetectedDate = result.date || null;
      const ok = document.getElementById('fetch-ok');
      ok.style.display = 'block';
      ok.textContent = result.date
        ? `✓ Detected date: ${fmtDate(result.date)}`
        : '✓ Page fetched — no date detected yet (AI will look when you save)';
    }
  } catch (err) {
    alert('Fetch failed: ' + err.message);
  }
  btn.textContent = 'Fetch ↗';
  btn.disabled = false;
}

async function addStep2(editId) {
  const name = document.getElementById('add-name').value.trim();
  if (!name) return alert('Please enter an event name');

  document.getElementById('add-s1').style.display = 'none';
  document.getElementById('add-s2').style.display = 'block';
  document.getElementById('add-step-bar').textContent = 'Step 2 of 2 — Themes & Message';

  let suggested = { theme_ids: [], message: '' };
  if (addPageText) {
    suggested = await POST('/api/ai/analyze', { event_name: name, page_text: addPageText });
  } else if (editId) {
    const existing = await GET(`/api/events/${editId}`);
    suggested.theme_ids = (existing.themes || []).map(t => t.id);
    suggested.message = existing.message || '';
  }

  addThemeSelections = suggested.theme_ids || [];
  document.getElementById('add-theme-chips').innerHTML = state.themes.map(t =>
    `<div class="chip ${addThemeSelections.includes(t.id) ? 'selected' : ''}"
          onclick="toggleAddTheme(${t.id},this)">${t.name}</div>`
  ).join('');

  if (suggested.message && !document.getElementById('add-msg').value) {
    document.getElementById('add-msg').value = suggested.message;
  }
}

function toggleAddTheme(id, el) {
  addThemeSelections = addThemeSelections.includes(id)
    ? addThemeSelections.filter(t => t !== id) : [...addThemeSelections, id];
  el.classList.toggle('selected');
}

async function saveEvent(editId) {
  const body = {
    name: document.getElementById('add-name').value.trim(),
    url: document.getElementById('add-url').value.trim(),
    location: document.getElementById('add-loc').value.trim() || null,
    drive_time_mins: parseInt(document.getElementById('add-drive').value) || null,
    timing_notes: document.getElementById('add-timing').value.trim() || null,
    next_date: addDetectedDate,
    start_time: fromTimeInput(document.getElementById('add-start').value),
    end_time: fromTimeInput(document.getElementById('add-end').value),
    message: document.getElementById('add-msg').value.trim() || null,
    notes: document.getElementById('add-notes').value.trim() || null,
    theme_ids: addThemeSelections,
  };
  if (!body.name || !body.url) return alert('Name and URL are required');
  if (editId) {
    await PUT(`/api/events/${editId}`, body);
  } else {
    await POST('/api/events', body);
  }
  state.themes = await GET('/api/themes');
  nav('events');
}

// ── Events list ────────────────────────────────────────────────────────
async function renderEventsList() {
  state.events = await GET('/api/events');
  state.dismissed = await GET('/api/dismissed');
  const dismissedNames = new Set(state.dismissed.map(d => d.event_name));
  const sorted = [...state.events].sort((a, b) =>
    !a.next_date ? 1 : !b.next_date ? -1 : a.next_date.localeCompare(b.next_date));
  const visible = sorted.filter(e => !dismissedNames.has(e.name));
  const hiddenCount = sorted.length - visible.length;

  document.getElementById('screen-events').innerHTML = `
    <div class="list-hdr">
      <span class="list-count">
        ${visible.length} event${visible.length !== 1 ? 's' : ''}${hiddenCount
          ? ` · <a href="#" onclick="showDismissed();return false" style="color:#4a90d9">${hiddenCount} hidden</a>` : ''}
      </span>
      <button class="add-btn" onclick="showAdd()">+ Add event</button>
    </div>
    ${visible.length ? visible.map(e => cardHtml(e)).join('') :
      '<div class="empty"><div class="empty-icon">📅</div><div class="empty-text">No events yet.<br>Tap + Add event to get started.</div></div>'}`;
}

async function showDismissed() {
  if (!state.dismissed.length) return;
  const list = state.dismissed.map(d => `• ${d.event_name}`).join('\n');
  if (confirm(`Hidden events:\n${list}\n\nRestore all?`)) {
    await Promise.all(state.dismissed.map(d => DELETE(`/api/dismissed/${d.id}`)));
    state.dismissed = [];
    renderEventsList();
  }
}

// ── Themes screen ──────────────────────────────────────────────────────
async function renderThemesList() {
  state.themes = await GET('/api/themes');
  document.getElementById('screen-themes').innerHTML = `
    <div class="list-hdr">
      <span class="list-count">Your values framework</span>
      <button class="add-btn" onclick="showAddTheme()">+ Add</button>
    </div>
    ${state.themes.map(t => `
      <div class="theme-item" onclick="showEditTheme(${t.id})">
        <div class="theme-name">${t.name}</div>
        <div class="theme-source">${t.source || ''}</div>
        <div class="theme-desc">${t.description || ''}</div>
      </div>`).join('')}`;
}

function themeFormHtml(t = {}) {
  return `
    <div class="section">
      <div class="form-group">
        <label class="form-label">Theme name</label>
        <input class="form-input" id="th-name" value="${t.name || ''}" placeholder="e.g. Community Contribution">
      </div>
      <div class="form-group">
        <label class="form-label">Description <span>AI uses this to tag events</span></label>
        <textarea class="form-input" id="th-desc" rows="4"
          placeholder="What this theme means and why it matters...">${t.description || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Source</label>
        <input class="form-input" id="th-src" value="${t.source || ''}" placeholder="e.g. Hunt Gather Parent">
      </div>
      <button class="btn btn-blue" onclick="saveTheme(${t.id || 'null'})">Save theme</button>
      ${t.id ? `<br><br><button onclick="deleteTheme(${t.id})"
        style="color:#c0392b;background:none;border:none;cursor:pointer;font-size:14px">
        Delete theme</button>` : ''}
    </div>`;
}

function showAddTheme() {
  document.getElementById('screen-themes').innerHTML = themeFormHtml();
  setHeader('themes', () => nav('themes'));
}

async function showEditTheme(id) {
  const t = state.themes.find(x => x.id === id);
  document.getElementById('screen-themes').innerHTML = themeFormHtml(t);
  setHeader('themes', () => nav('themes'));
}

async function saveTheme(editId) {
  const body = {
    name: document.getElementById('th-name').value.trim(),
    description: document.getElementById('th-desc').value.trim(),
    source: document.getElementById('th-src').value.trim(),
  };
  if (!body.name) return alert('Name required');
  if (editId) await PUT(`/api/themes/${editId}`, body);
  else await POST('/api/themes', body);
  state.themes = await GET('/api/themes');
  nav('themes');
}

async function deleteTheme(id) {
  if (!confirm('Delete this theme? It will be removed from all events.')) return;
  await DELETE(`/api/themes/${id}`);
  state.themes = await GET('/api/themes');
  nav('themes');
}

// ── Init ───────────────────────────────────────────────────────────────
async function init() {
  [state.themes, state.dismissed] = await Promise.all([
    GET('/api/themes'),
    GET('/api/dismissed'),
  ]);

  const params = new URLSearchParams(location.search);
  if (params.get('fb_connected')) {
    history.replaceState({}, '', '/');
    alert('Facebook connected! You can now add events from facebook.com URLs.');
  }
  if (params.get('fb_error')) {
    history.replaceState({}, '', '/');
    alert('Facebook connection failed — check your FB_APP_ID and FB_APP_SECRET in .env.');
  }

  renderHome();
}

document.addEventListener('DOMContentLoaded', init);
