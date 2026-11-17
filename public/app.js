/* QuizBlast client: home, host screen and player screen */
(function () {
  const { avatarSVG, COLORS, IDS, CHARS } = window.Avatars;
  const $main = document.getElementById('main');
  const $top = document.getElementById('top-actions');
  const socket = io();
  const SHAPES = ['▲', '◆', '●', '■'];
  const LETTERS = ['A', 'B', 'C', 'D'];

  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  let modes = [];
  // When the host opens localhost, phones can't use that address: show the computer's Wi-Fi address instead.
  let joinOrigin = location.origin;
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
  if (isLocal) fetch('/api/info').then((r) => r.json()).then((info) => {
    if (info.lan && info.lan[0]) { joinOrigin = `${location.protocol}//${info.lan[0]}:${location.port || info.port}`; if (role === 'host') render(); }
  }).catch(() => {});
  let role = null;           // 'host' | 'player' | null
  let state = null;          // last room state from server
  let me = null;             // player-private info
  let clockOffset = 0;
  let view = 'home';         // home | join
  let lastKey = '';
  let seenPlayers = new Set();
  let buzzedFor = -1, lastTickSec = -1, lastPhase = null;
  const profile = ls.get('qb-profile', { name: '', avatar: IDS[Math.floor(Math.random() * IDS.length)], color: COLORS[Math.floor(Math.random() * COLORS.length)] });

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now() + clockOffset;
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  fetch('/api/modes').then((r) => r.json()).then((m) => { modes = m; render(); });

  // ---------- Socket wiring
  socket.on('connect', () => {
    const h = JSON.parse(sessionStorage.getItem('qb-host') || 'null');
    const p = ls.get('qb-player', null);
    if (role === 'host' || (!role && h && view === 'home')) {
      if (h) socket.emit('host:resume', h, (res) => { if (res.ok) { role = 'host'; } else sessionStorage.removeItem('qb-host'); render(); });
    } else if (role === 'player' || (!role && p && view === 'home')) {
      if (p) socket.emit('player:join', p, (res) => { if (res.ok) { role = 'player'; } else { ls.del('qb-player'); role = null; } render(); });
    }
  });
  socket.on('state', (s) => {
    clockOffset = s.serverNow - Date.now();
    const prev = state;
    state = s;
    onTransition(prev, s);
    render();
  });
  socket.on('me', (m) => { me = m; if (role === 'player') render(); });
  socket.on('kicked', () => { ls.del('qb-player'); role = null; state = null; toast('The host removed you from the room.'); render(); });

  function onTransition(prev, s) {
    const key = s.phase + ':' + s.qIndex;
    if (prev && prev.phase === s.phase && prev.qIndex === s.qIndex) return;
    if (s.phase === 'countdown') { Sound.play('whoosh'); }
    if (s.phase === 'question') { if (me) me = { ...me, answer: null }; Sound.play('go'); Sound.duck(false); buzzedFor = -1; lastTickSec = -1; }
    if (s.phase === 'reveal') {
      if (s.lastResults?.timeUp && buzzedFor !== s.qIndex) { Sound.play('buzzer'); buzzedFor = s.qIndex; }
      if (role === 'player') {
        setTimeout(() => {
          const r = s.lastResults?.results.find((x) => x.id === me?.id);
          Sound.play(r?.correct ? 'correct' : 'wrong');
        }, s.lastResults?.timeUp ? 900 : 100);
      } else if (role === 'host') setTimeout(() => Sound.play('correct'), s.lastResults?.timeUp ? 900 : 100);
    }
    if (s.phase === 'final') { Sound.play('fanfare'); confetti(); }
    if (s.phase === 'lobby' && prev && prev.phase !== 'lobby') stopConfetti();
    lastPhase = s.phase;
  }

  // ---------- Timer loop
  function timerLoop() {
    if (state && state.phase === 'question' && state.deadline) {
      const total = state.settings.timer * 1000;
      const left = Math.max(0, state.deadline - now());
      const secs = Math.ceil(left / 1000);
      const frac = left / total;
      document.querySelectorAll('[data-timer]').forEach((el) => {
        const num = el.querySelector('.num'); if (num) num.textContent = secs;
        const bar = el.querySelector('.bar'); if (bar) bar.style.strokeDashoffset = String(201 * (1 - frac));
        el.classList.toggle('warn', secs <= 5);
      });
      document.querySelectorAll('[data-timebar]').forEach((el) => {
        el.firstElementChild.style.width = (frac * 100) + '%';
        el.classList.toggle('warn', secs <= 5);
      });
      if (secs <= 5 && secs > 0 && secs !== lastTickSec) { lastTickSec = secs; Sound.play('tick'); }
      if (left <= 0 && buzzedFor !== state.qIndex) { buzzedFor = state.qIndex; Sound.play('buzzer'); }
    }
    if (state && state.phase === 'countdown') {
      const el = document.getElementById('count-num');
      if (el) {
        const n = Math.max(1, 3 - Math.floor((Date.now() - countStart) / 1100));
        if (el.textContent !== String(n)) { el.textContent = n; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; Sound.play('count'); }
      }
    }
    requestAnimationFrame(timerLoop);
  }
  let countStart = 0;
  requestAnimationFrame(timerLoop);

  // ---------- Rendering
  function render() {
    renderTop();
    if (!role || !state) {
      lastKey = '';
      if (view === 'join') return renderJoin();
      return renderHome();
    }
    const key = role + ':' + state.phase + ':' + state.qIndex;
    const fresh = key !== lastKey;
    lastKey = key;
    if (state.phase === 'countdown' && fresh) countStart = Date.now();
    const html = role === 'host' ? hostView(state) : playerView(state);
    $main.innerHTML = `<div class="${fresh ? 'fresh' : ''}">${html}</div>`;
    if (role === 'host' && state.phase === 'lobby') drawQR();
    for (const p of state.players) seenPlayers.add(p.id);
  }

  function renderTop() {
    const parts = [];
    if (state && role) parts.push(`<span class="pill room-pill">Room <b>${esc(state.code)}</b></span>`);
    parts.push(`<button class="icon-btn" data-action="toggle-music" title="Music">🎵<span class="lbl-txt"> ${Sound.musicOn ? 'On' : 'Off'}</span></button>`);
    parts.push(`<button class="icon-btn" data-action="toggle-sfx" title="Sound effects">${Sound.sfxOn ? '🔊' : '🔇'}</button>`);
    if (role) parts.push(`<button class="icon-btn" data-action="leave" title="Leave">Leave</button>`);
    $top.innerHTML = parts.join('');
  }

  function renderHome() {
    const params = new URLSearchParams(location.search);
    if (params.get('join')) { view = 'join'; return renderJoin(); }
    $main.innerHTML = `
      <section class="hero">
        <h1>Trivia night, <span>anywhere.</span></h1>
        <p style="font-size:18px;max-width:640px;margin:10px auto 0">Host a live quiz on the big screen or a video call. Players join on their phones with a room code, pick a character and race to answer first.</p>
        <div class="mode-pills">${(modes.length ? modes : [{ emoji: '💼', name: 'Office Ice Breaker' }, { emoji: '🎈', name: 'Family Fun' }, { emoji: '🍸', name: 'Adult Game Night' }]).map((m) => `<span class="pill">${m.emoji} ${esc(m.name)}</span>`).join('')}</div>
      </section>
      <section class="grid2 home-cards">
        <div class="card">
          <div class="emoji-big">🎙️</div>
          <h2>Host a game</h2>
          <p>Pick a game type, categories, round length and timer. Share your screen so everyone sees the questions.</p>
          <button class="btn pink big block" data-action="create">Create a room</button>
        </div>
        <div class="card">
          <div class="emoji-big">📱</div>
          <h2>Join a game</h2>
          <p>Got a code from your host? Jump in with your name and a character.</p>
          <button class="btn big block" data-action="go-join">Join with a code</button>
        </div>
      </section>
      <section class="card rules" style="margin-top:16px">
        <h3>How scoring works</h3>
        <b>1 point</b> for every correct answer, plus a speed bonus for the order you got it right:
        <b>1st +5</b>, <b>2nd +4</b>, <b>3rd +3</b>, <b>4th +2</b>, <b>5th +1</b>. Answers lock in as soon as you tap, so choose wisely!
      </section>
      <div class="footer">Up to 20 players per room · Solo or team mode · 600 original questions</div>`;
  }

  function renderJoin() {
    const params = new URLSearchParams(location.search);
    const code = params.get('join') || '';
    $main.innerHTML = `
      <section class="card" style="max-width:640px;margin:10px auto">
        <h2>Join the game</h2>
        <label class="lbl" for="j-code">Room code</label>
        <input id="j-code" class="code" type="text" maxlength="4" autocomplete="off" placeholder="ABCD" value="${esc(code.toUpperCase())}" />
        <label class="lbl" for="j-name">Your name</label>
        <input id="j-name" type="text" maxlength="16" autocomplete="off" placeholder="e.g. Quiz Whiz" value="${esc(profile.name)}" />
        <label class="lbl">Pick your character</label>
        <div class="avatar-grid" id="j-avatars"></div>
        <label class="lbl">Pick a color</label>
        <div class="color-row" id="j-colors"></div>
        <div class="preview-row" style="margin-top:18px">
          <span id="j-preview"></span>
          <div style="flex:1"><button class="btn teal big block" data-action="join">Let's play! →</button></div>
        </div>
        <div class="err" id="j-err"></div>
      </section>`;
    drawAvatarPicker();
    const nameEl = document.getElementById('j-name');
    nameEl.addEventListener('input', () => { profile.name = nameEl.value; drawPreview(); });
    document.getElementById('j-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    (code ? nameEl : document.getElementById('j-code')).focus();
    [nameEl, document.getElementById('j-code')].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); }));
  }
  function drawAvatarPicker() {
    document.getElementById('j-avatars').innerHTML = IDS.map((id) => `<button class="avatar-opt ${profile.avatar === id ? 'sel' : ''}" data-action="pick-avatar" data-id="${id}" title="${CHARS[id].name}">${avatarSVG(id, profile.color, 56)}</button>`).join('');
    document.getElementById('j-colors').innerHTML = COLORS.map((c) => `<button class="swatch ${profile.color === c ? 'sel' : ''}" style="background:${c}" data-action="pick-color" data-c="${c}" aria-label="color ${c}"></button>`).join('');
    drawPreview();
  }
  function drawPreview() {
    const el = document.getElementById('j-preview');
    if (el) el.innerHTML = `<div class="row">${avatarSVG(profile.avatar, profile.color, 64)}<div><div style="font-weight:800;font-size:20px">${esc(profile.name || 'Your name')}</div><div class="small">${CHARS[profile.avatar].name}</div></div></div>`;
  }
  function doJoin() {
    const code = document.getElementById('j-code').value.trim().toUpperCase();
    const name = document.getElementById('j-name').value.trim();
    const err = document.getElementById('j-err');
    if (code.length !== 4) { err.textContent = 'Enter the 4-letter room code.'; return; }
    if (!name) { err.textContent = 'Enter your name.'; return; }
    Sound.init();
    profile.name = name; ls.set('qb-profile', profile);
    socket.emit('player:join', { code, name, avatar: profile.avatar, color: profile.color }, (res) => {
      if (!res.ok) { err.textContent = res.error; return; }
      role = 'player';
      ls.set('qb-player', { code: res.code, playerId: res.playerId });
      history.replaceState(null, '', '/');
      Sound.play('join');
    });
  }

  // ---------- Host views
  function hostView(s) {
    if (s.phase === 'lobby') return hostLobby(s);
    if (s.phase === 'countdown') return countdownView(s);
    if (s.phase === 'question' || s.phase === 'reveal') return hostQuestion(s);
    if (s.phase === 'final') return finalView(s, true);
    return '';
  }
  function hostLobby(s) {
    const st = s.settings;
    const mode = modes.find((m) => m.id === st.mode) || { categories: [] };
    const avail = st.categories.reduce((a, i) => a + (mode.categories[i]?.count || 0), 0);
    const short = avail < st.length;
    const joinUrl = `${joinOrigin}/?join=${s.code}`;
    const playerChip = (p, movable) => `<span class="chip ${p.connected ? '' : 'off'} ${seenPlayers.has(p.id) ? '' : 'new'}" ${movable ? `data-action="cycle-team" data-id="${p.id}" title="Click to move to the next team"` : ''}>${avatarSVG(p.avatar, p.color, 34)}${esc(p.name)}<button class="x" data-action="kick" data-id="${p.id}" title="Remove player">×</button></span>`;
    const playersHtml = st.teamMode
      ? `<div class="teams">${s.teams.map((t) => `<div class="team-col" style="--c:${t.color}"><div class="tn"><span>${esc(t.name)}</span><span>${t.members}</span></div><div class="players">${s.players.filter((p) => p.team === t.id).map((p) => playerChip(p, true)).join('') || '<div class="empty">No one yet</div>'}</div></div>`).join('')}</div><p class="small">Tip: click a player to move them to another team.</p>`
      : `<div class="players">${s.players.map((p) => playerChip(p)).join('') || '<div class="empty">Waiting for players to join…</div>'}</div>`;
    return `
      <div class="host-lobby">
        <section class="card">
          <h3>1 · Game type</h3>
          <div class="mode-cards">${modes.map((m) => `<button class="mode-card ${m.id === st.mode ? 'sel' : ''}" data-action="set-mode" data-mode="${m.id}"><div class="e">${m.emoji}</div><div class="n">${esc(m.name)}</div><div class="t">${esc(m.tagline)}</div></button>`).join('')}</div>
          <div class="row between" style="margin-top:20px"><h3 style="margin:0">2 · Categories</h3><span class="small"><button class="link-btn" data-action="cats-all">All</button> · <button class="link-btn" data-action="cats-none">None</button></span></div>
          <div class="cats" style="margin-top:10px">${mode.categories.map((c) => `<button class="cat ${st.categories.includes(c.id) ? 'sel' : ''}" data-action="toggle-cat" data-id="${c.id}"><span>${c.emoji}</span>${esc(c.name)}<span class="chk">${st.categories.includes(c.id) ? '✓' : ''}</span></button>`).join('')}</div>
          <div class="grid2" style="margin-top:20px">
            <div><h3>3 · Round length</h3><div class="seg">${[20, 40, 60].map((n) => `<button class="${st.length === n ? 'sel' : ''}" data-action="set-length" data-n="${n}">${n} Qs</button>`).join('')}</div></div>
            <div><h3>4 · Timer</h3><div class="seg">${[0, 10, 15, 20, 30, 45].map((n) => `<button class="${st.timer === n ? 'sel' : ''}" data-action="set-timer" data-n="${n}">${n ? n + 's' : 'Off'}</button>`).join('')}</div></div>
          </div>
          ${short ? `<p class="err">Selected categories hold ${avail} questions. Add ${Math.ceil((st.length - avail) / 20)} more categor${Math.ceil((st.length - avail) / 20) > 1 ? 'ies' : 'y'} for a ${st.length}-question round.</p>` : `<p class="small" style="margin-top:12px">${st.categories.length} categories · ${avail} questions available · ${st.timer ? st.timer + ' seconds per question' : 'no timer, you reveal when ready'}</p>`}
          <div class="row between" style="margin-top:14px">
            <div class="row"><button class="switch ${st.teamMode ? 'on' : ''}" data-action="toggle-teams" aria-label="Team mode"></button><div><b>Team mode</b><div class="small">Players' points add up for their team</div></div></div>
            ${st.teamMode ? `<div class="seg">${[2, 3, 4].map((n) => `<button class="${st.teamCount === n ? 'sel' : ''}" data-action="set-teams" data-n="${n}">${n} teams</button>`).join('')}</div>` : ''}
          </div>
        </section>
        <section class="card">
          <div class="join-box">
            <h3>Join at <span style="color:var(--text);text-transform:none;letter-spacing:0">${esc(joinOrigin.replace(/^https?:\/\//, ''))}</span> with code</h3>
            <div class="join-code">${esc(s.code)}</div>
            <div class="join-url">${esc(joinUrl)} <button class="link-btn" data-action="copy-link" data-url="${esc(joinUrl)}">Copy link</button></div>
            <div id="qr" data-url="${esc(joinUrl)}"><img src="/api/qr?u=${encodeURIComponent(joinUrl)}" width="132" height="132" alt="QR code to join" /></div>
          </div>
          <div class="row between" style="margin-top:18px"><h3 style="margin:0">Players</h3><span class="pill">${s.players.length} / 20</span></div>
          ${playersHtml}
          <button class="btn pink big block" style="margin-top:18px" data-action="start" ${!s.players.length || short || !st.categories.length ? 'disabled' : ''}>Start the game ▶</button>
          <div class="err" id="start-err"></div>
        </section>
      </div>`;
  }
  function drawQR() {
    const el = document.getElementById('qr');
    if (el && !el.firstChild) el.innerHTML = `<img src="/api/qr?u=${encodeURIComponent(el.dataset.url)}" width="132" height="132" alt="QR code to join" />`;
  }

  function countdownView(s) {
    return `<div class="center-stage"><div><h3>${esc(s.modeName)} · ${s.total} questions${s.settings.teamMode ? ' · Team mode' : ''}</h3><div class="count-num" id="count-num">3</div><h2>Get ready!</h2></div></div>`;
  }

  function timerRing() {
    return `<div class="timer" data-timer><svg viewBox="0 0 74 74"><circle class="track" cx="37" cy="37" r="32" fill="none" stroke-width="7"/><circle class="bar" cx="37" cy="37" r="32" fill="none" stroke-width="7" stroke-dasharray="201" stroke-dashoffset="0"/></svg><div class="num"></div></div>`;
  }

  function hostQuestion(s) {
    const q = s.question;
    const revealed = s.phase === 'reveal';
    const counts = revealed ? s.lastResults.counts : null;
    const answeredN = s.players.filter((p) => p.answered).length;
    const live = s.players.filter((p) => p.connected).length;
    const tiles = q.choices.map((c, i) => `<button class="ans c${i} ${revealed && i === q.answer ? 'correct' : ''}" disabled><span class="shape">${SHAPES[i]}</span><span>${esc(c)}</span>${revealed ? `<span class="cnt">${counts[i]}</span>` : ''}</button>`).join('');
    let lower = '';
    if (!revealed) {
      lower = `<div class="answered-row">${s.players.filter((p) => p.answered).map((p) => avatarSVG(p.avatar, p.color, 42)).join('')}</div>
        <div class="host-bar"><span class="pill">✋ ${answeredN} / ${live} answered</span>
        <div class="row"><button class="btn ghost" data-action="end">End game</button><button class="btn" data-action="reveal">Reveal answer</button></div></div>`;
    } else {
      const byId = Object.fromEntries(s.players.map((p) => [p.id, p]));
      const fastest = s.lastResults.results.filter((r) => r.correct).sort((a, b) => a.place - b.place).slice(0, 5);
      const board = [...s.players].sort((a, b) => b.score - a.score).slice(0, 8);
      const gains = Object.fromEntries(s.lastResults.results.map((r) => [r.id, r.gain]));
      const teamPanel = s.settings.teamMode ? `<div class="card"><h3>Team standings</h3><div class="rank-list">${[...s.teams].sort((a, b) => b.score - a.score).map((t, i) => `<div class="rank-item" style="animation-delay:${i * 60}ms"><span class="pos">${i + 1}</span><span class="team-dot" style="background:${t.color}"></span>${esc(t.name)}<span class="sc">${t.score}</span></div>`).join('')}</div></div>` : '';
      lower = `
        <div class="reveal-grid">
          <div class="card"><h3>${s.lastResults.timeUp ? '⏰ Time\'s up! ' : ''}Fastest correct</h3><div class="rank-list">${fastest.map((r, i) => { const p = byId[r.id]; return p ? `<div class="rank-item" style="animation-delay:${i * 80}ms"><span class="pos">${ordinal(r.place)}</span>${avatarSVG(p.avatar, p.color, 32)}${esc(p.name)}<span class="small">${(r.ms / 1000).toFixed(1)}s</span><span class="sc gain">+${r.gain}</span></div>` : ''; }).join('') || '<div class="empty">Nobody got this one! 😅</div>'}</div></div>
          ${teamPanel || `<div class="card"><h3>Leaderboard</h3><div class="rank-list">${board.map((p, i) => `<div class="rank-item" style="animation-delay:${i * 60}ms"><span class="pos">${i + 1}</span>${avatarSVG(p.avatar, p.color, 32)}${esc(p.name)}${gains[p.id] ? `<span class="gain">+${gains[p.id]}</span>` : ''}<span class="sc">${p.score}</span></div>`).join('')}</div></div>`}
        </div>
        <div class="host-bar"><button class="btn ghost" data-action="end">End game</button><button class="btn pink big" data-action="next">${s.qIndex + 1 >= s.total ? 'Final results 🏆' : 'Next question →'}</button></div>`;
    }
    return `
      <div class="q-head"><span class="tag">${q.categoryEmoji} ${esc(q.category)}</span><span class="tag">Question ${s.qIndex + 1} of ${s.total}</span>${!revealed && s.deadline ? timerRing() : s.deadline || s.settings.timer ? '<div class="timer"></div>' : ''}</div>
      <div class="q-text">${esc(q.text)}</div>
      <div class="answers ${revealed ? 'revealed' : ''}">${tiles}</div>
      ${lower}`;
  }

  // ---------- Player views
  function playerView(s) {
    const mine = s.players.find((p) => p.id === me?.id);
    if (s.phase === 'lobby') {
      const teamPick = s.settings.teamMode ? `<h3 style="margin-top:20px">Your team</h3><div class="teams">${s.teams.map((t) => `<button class="team-col" style="--c:${t.color};cursor:pointer;color:var(--text);font:inherit;border-left:0;border-right:0;border-bottom:0;${mine?.team === t.id ? 'outline:3px solid ' + t.color : ''}" data-action="pick-team" data-team="${t.id}"><div class="tn"><span>${esc(t.name)}</span><span>${t.members}</span></div>${mine?.team === t.id ? '<b>✓ You\'re on this team</b>' : '<span class="small">Tap to switch</span>'}</button>`).join('')}</div>` : '';
      return `<section class="card player-view" style="max-width:640px;margin:0 auto">
        <div class="waiting">${mine ? avatarSVG(mine.avatar, mine.color, 110) : ''}<h2 style="margin-top:12px">You're in, ${esc(mine?.name || '')}!</h2><p>Waiting for the host to start the game</p><div class="dots"><span></span><span></span><span></span></div></div>
        <p class="small" style="text-align:center">${esc(s.modeName)} · ${s.settings.length} questions · ${s.settings.timer ? s.settings.timer + 's timer' : 'no timer'}</p>
        ${teamPick}
        <h3 style="margin-top:20px">In the room (${s.players.length})</h3>
        <div class="players">${s.players.map((p) => `<span class="chip ${p.connected ? '' : 'off'}">${avatarSVG(p.avatar, p.color, 30)}${esc(p.name)}</span>`).join('')}</div>
      </section>`;
    }
    if (s.phase === 'countdown') return countdownView(s);
    if (s.phase === 'final') return finalView(s, false);
    const q = s.question;
    const revealed = s.phase === 'reveal';
    const myAns = me?.answer ?? null;
    const locked = myAns !== null;
    const tiles = q.choices.map((c, i) => {
      const cls = [`c${i}`];
      if (myAns === i) cls.push('picked');
      if (revealed && i === q.answer) cls.push('correct');
      if (revealed && myAns === i && i !== q.answer) cls.push('wrong');
      return `<button class="ans ${cls.join(' ')}" data-action="answer" data-i="${i}" ${locked || revealed ? 'disabled' : ''}><span class="shape">${SHAPES[i]}</span><span>${esc(c)}</span></button>`;
    }).join('');
    const header = `<div class="q-head"><span class="tag">${q.categoryEmoji} ${esc(q.category)}</span><span class="tag">${s.qIndex + 1} / ${s.total}</span></div>`;
    if (!revealed) {
      return `<section class="player-view">${header}
        ${s.deadline ? '<div class="timebar" data-timebar><div style="width:100%"></div></div>' : ''}
        <div class="q-text">${esc(q.text)}</div>
        <div class="answers ${locked ? 'locked' : ''}">${tiles}</div>
        ${locked ? '<p style="text-align:center;margin-top:16px;font-weight:700">🔒 Answer locked in! Waiting for everyone else…</p>' : ''}
        ${scoreBar(s, mine)}</section>`;
    }
    const r = s.lastResults.results.find((x) => x.id === me?.id);
    const correctText = q.choices[q.answer];
    let card;
    if (!r) card = `<div class="result-card none"><div class="big">⏰</div><h2>${s.lastResults.timeUp ? "Time's up!" : 'No answer'}</h2><p>You didn't answer this one.</p></div>`;
    else if (r.correct) card = `<div class="result-card good"><div class="big">🎉 Correct!</div><h2>+${r.gain} points</h2><p>You were the ${ordinal(r.place)} correct answer${r.place <= 5 ? ` (+1 correct, +${r.gain - 1} speed bonus)` : ' (+1 correct)'}</p></div>`;
    else card = `<div class="result-card bad"><div class="big">😬 Not quite</div><h2>+0 points</h2><p>${s.lastResults.timeUp ? "Time's up! " : ''}Better luck on the next one.</p></div>`;
    const compare = `<div class="compare">
      <div class="line yours ${r ? (r.correct ? 'right' : 'wrong') : ''}"><span class="k">Your answer</span><span class="v">${myAns !== null ? `${SHAPES[myAns]} ${esc(q.choices[myAns])}` : '—'}</span><span style="margin-left:auto;font-size:22px">${r ? (r.correct ? '✅' : '❌') : ''}</span></div>
      <div class="line corr"><span class="k">Correct answer</span><span class="v">${SHAPES[q.answer]} ${esc(correctText)}</span></div></div>`;
    return `<section class="player-view">${header}${card}
      <div class="q-text" style="font-size:20px;padding:6px 0 10px">${esc(q.text)}</div>
      ${compare}
      ${scoreBar(s, mine)}
      <p class="small" style="text-align:center;margin-top:14px">Waiting for the host to start the next question…</p></section>`;
  }
  function scoreBar(s, mine) {
    if (!mine) return '';
    const team = s.settings.teamMode ? s.teams.find((t) => t.id === mine.team) : null;
    return `<div class="scorebar"><div class="row">${avatarSVG(mine.avatar, mine.color, 36)}<div><div>${esc(mine.name)}</div><div class="small">${me?.rank ? ordinal(me.rank) + ' place' : ''}${team ? ` · <span style="color:${team.color}">${esc(team.name)} ${team.score}</span>` : ''}</div></div></div><div class="s">${mine.score} pts</div></div>`;
  }

  // ---------- Final
  function finalView(s, isHost) {
    const ranked = [...s.players].sort((a, b) => b.score - a.score);
    let podiumItems;
    if (s.settings.teamMode) {
      const teams = [...s.teams].sort((a, b) => b.score - a.score);
      podiumItems = teams.slice(0, 3).map((t) => ({ face: `<span style="display:inline-block;width:80px;height:80px;border-radius:50%;background:${t.color};box-shadow:var(--shadow)"></span>`, name: t.name, score: t.score }));
    } else {
      podiumItems = ranked.slice(0, 3).map((p) => ({ face: avatarSVG(p.avatar, p.color, 84), name: p.name, score: p.score }));
    }
    const order = [1, 0, 2].filter((i) => podiumItems[i]);
    const podium = `<div class="podium">${order.map((i) => `<div class="step p${i + 1}">${podiumItems[i].face}<div class="nm">${esc(podiumItems[i].name)}</div><div class="pts">${podiumItems[i].score} pts</div><div class="block">${i + 1}</div></div>`).join('')}</div>`;
    const winner = podiumItems[0];
    const mineRank = !isHost && me ? `<div class="scorebar" style="max-width:520px;margin:0 auto 16px"><span>You finished</span><span class="s">${ordinal(me.rank)} · ${me.score} pts</span></div>` : '';
    return `<section style="text-align:center">
      <h3>Final results</h3>
      <h1>${winner ? `🏆 ${esc(winner.name)} wins!` : 'Game over!'}</h1>
      ${podium}
      ${mineRank}
      <div class="card" style="max-width:620px;margin:0 auto;text-align:left"><h3>Full standings</h3><div class="rank-list">${ranked.map((p, i) => { const t = s.settings.teamMode ? s.teams.find((x) => x.id === p.team) : null; return `<div class="rank-item" style="animation-delay:${i * 50}ms"><span class="pos">${i + 1}</span>${avatarSVG(p.avatar, p.color, 32)}${esc(p.name)}${t ? `<span class="team-dot" style="background:${t.color}" title="${esc(t.name)}"></span>` : ''}<span class="sc">${p.score}</span></div>`; }).join('')}</div></div>
      ${isHost ? `<div class="row" style="justify-content:center;margin-top:20px"><button class="btn pink big" data-action="again">Play again with this room</button></div>` : '<p style="margin-top:16px">Thanks for playing! Stay here if your host starts another round.</p>'}
    </section>`;
  }

  // ---------- Actions
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    Sound.init();
    const a = el.dataset.action;
    const st = state?.settings;
    const send = (patch) => socket.emit('host:settings', patch);
    switch (a) {
      case 'home': if (!role) { view = 'home'; history.replaceState(null, '', '/'); render(); } break;
      case 'go-join': view = 'join'; render(); break;
      case 'create':
        socket.emit('host:create', {}, (res) => {
          if (!res.ok) return;
          role = 'host';
          sessionStorage.setItem('qb-host', JSON.stringify({ code: res.code, hostKey: res.hostKey }));
          if (Sound.prefs.music !== false) Sound.music(true);
          render();
        });
        break;
      case 'join': doJoin(); break;
      case 'pick-avatar': profile.avatar = el.dataset.id; drawAvatarPicker(); break;
      case 'pick-color': profile.color = el.dataset.c; drawAvatarPicker(); break;
      case 'set-mode': send({ mode: el.dataset.mode }); break;
      case 'toggle-cat': {
        const id = +el.dataset.id;
        send({ categories: st.categories.includes(id) ? st.categories.filter((x) => x !== id) : [...st.categories, id] });
        break;
      }
      case 'cats-all': send({ categories: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }); break;
      case 'cats-none': send({ categories: [] }); break;
      case 'set-length': send({ length: +el.dataset.n }); break;
      case 'set-timer': send({ timer: +el.dataset.n }); break;
      case 'toggle-teams': send({ teamMode: !st.teamMode }); break;
      case 'set-teams': send({ teamCount: +el.dataset.n }); break;
      case 'cycle-team': {
        if (e.target.closest('.x')) break;
        const p = state.players.find((x) => x.id === el.dataset.id);
        if (p) socket.emit('host:moveplayer', { id: p.id, team: ((p.team ?? -1) + 1) % state.teams.length });
        break;
      }
      case 'kick': e.stopPropagation(); socket.emit('host:kick', { id: el.dataset.id }); break;
      case 'copy-link': navigator.clipboard?.writeText(el.dataset.url).then(() => toast('Join link copied!')); break;
      case 'start': socket.emit('host:start', {}, (res) => { if (!res.ok) { const er = document.getElementById('start-err'); if (er) er.textContent = res.error; } }); break;
      case 'reveal': socket.emit('host:reveal'); break;
      case 'next': socket.emit('host:next'); break;
      case 'end': socket.emit('host:end'); break;
      case 'again': socket.emit('host:lobby'); break;
      case 'pick-team': socket.emit('player:team', { team: +el.dataset.team }); break;
      case 'answer': {
        if (me?.answer !== null && me?.answer !== undefined) break;
        const i = +el.dataset.i;
        me = { ...(me || {}), answer: i }; // optimistic highlight + lock
        Sound.play('lock');
        if (navigator.vibrate) navigator.vibrate(30);
        socket.emit('player:answer', { choice: i });
        render();
        break;
      }
      case 'toggle-music': Sound.music(!Sound.musicOn); renderTop(); break;
      case 'toggle-sfx': Sound.sfx(!Sound.sfxOn); renderTop(); break;
      case 'leave':
        if (role === 'player') { socket.emit('player:leave'); ls.del('qb-player'); }
        if (role === 'host') sessionStorage.removeItem('qb-host');
        role = null; state = null; me = null; view = 'home'; stopConfetti();
        socket.disconnect(); socket.connect();
        render();
        break;
    }
  });

  // ---------- Confetti
  let confettiRAF = null;
  function confetti() {
    const cv = document.getElementById('confetti');
    const c2 = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#ff5c8a', '#ffc94d', '#2ed3b7', '#4d9bff', '#9b6bff', '#ffffff'];
    const parts = Array.from({ length: 180 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, vr: -0.2 + Math.random() * 0.4, c: colors[Math.floor(Math.random() * colors.length)] }));
    const start = Date.now();
    cancelAnimationFrame(confettiRAF);
    (function frame() {
      c2.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (p.y > cv.height + 20 && Date.now() - start < 4000) { p.y = -20; p.x = Math.random() * cv.width; }
        c2.save(); c2.translate(p.x, p.y); c2.rotate(p.r); c2.fillStyle = p.c; c2.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c2.restore();
      }
      if (Date.now() - start < 8000) confettiRAF = requestAnimationFrame(frame); else c2.clearRect(0, 0, cv.width, cv.height);
    })();
  }
  function stopConfetti() { cancelAnimationFrame(confettiRAF); const cv = document.getElementById('confetti'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }

  render();
})();
