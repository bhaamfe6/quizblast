// Quiz Party — real-time multiplayer trivia server
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const fs = require('fs');
const QRCode = require('qrcode');
const { MODES } = require('./questions');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 20;
const SPEED_BONUS = [5, 4, 3, 2, 1]; // bonus for 1st..5th correct answer; everyone else correct gets +0 bonus
const REVEAL_ANSWER_DELAY_MS = 600;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/modes', (_req, res) => {
  res.json(Object.entries(MODES).map(([id, m]) => ({
    id, name: m.name, tagline: m.tagline, emoji: m.emoji,
    categories: m.categories.map((c, i) => ({ id: i, name: c.name, emoji: c.emoji, count: c.questions.length })),
  })));
});
app.get('/api/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.u || '').slice(0, 300), { type: 'svg', margin: 1, color: { dark: '#1b1240', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch { res.status(400).end(); }
});
// Tells the client which optional audio files exist in public/audio
app.get('/api/audio', (_req, res) => {
  const dir = path.join(__dirname, 'public', 'audio');
  const has = (f) => fs.existsSync(path.join(dir, f));
  res.json({ music: has('music.mp3'), buzzer: has('buzzer.mp3') });
});
// LAN addresses so phones on the same Wi-Fi can join when the host opens localhost
function lanAddresses() {
  const out = [];
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  // Prefer typical home/office ranges
  return out.sort((a, b) => (/^(192\.168|10\.|172\.)/.test(b) ? 1 : 0) - (/^(192\.168|10\.|172\.)/.test(a) ? 1 : 0));
}
app.get('/api/info', (_req, res) => res.json({ lan: lanAddresses(), port: Number(PORT) }));
app.get('/healthz', (_req, res) => res.send('ok'));

/** @type {Map<string, any>} */
const rooms = new Map();
const TEAM_PRESETS = [
  { name: 'Red Rockets', color: '#ff5470' },
  { name: 'Blue Comets', color: '#3da9fc' },
  { name: 'Green Geckos', color: '#2cb67d' },
  { name: 'Gold Stars', color: '#ffb547' },
];

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}
function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function cleanName(s) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, 16);
}

function buildRound(modeId, categoryIds, count) {
  const mode = MODES[modeId];
  const cats = categoryIds.map((i) => ({ i, c: mode.categories[i] })).filter((x) => x.c);
  // Shuffle each category, then interleave so the round mixes categories evenly.
  const pools = cats.map(({ i, c }) => shuffle(c.questions).map((q) => ({ q, cat: i })));
  const out = [];
  let k = 0;
  while (out.length < count && pools.some((p) => p.length)) {
    const p = pools[k % pools.length];
    if (p.length) out.push(p.shift());
    k++;
  }
  return out.map(({ q, cat }) => {
    const [text, correct, ...wrong] = q;
    const choices = shuffle([correct, ...wrong]);
    return {
      text,
      choices,
      answer: choices.indexOf(correct),
      category: mode.categories[cat].name,
      categoryEmoji: mode.categories[cat].emoji,
    };
  });
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, avatar: p.avatar, color: p.color, team: p.team,
    score: p.score, connected: p.connected, answered: p.answer !== null,
    streak: p.streak,
  }));
}
function teamScores(room) {
  if (!room.settings.teamMode) return [];
  return room.teams.map((t, i) => {
    const members = [...room.players.values()].filter((p) => p.team === i);
    return { ...t, id: i, score: members.reduce((s, p) => s + p.score, 0), members: members.length };
  });
}
function roomState(room) {
  const q = room.questions[room.qIndex];
  return {
    code: room.code,
    phase: room.phase,
    settings: room.settings,
    modeName: MODES[room.settings.mode]?.name,
    players: publicPlayers(room),
    teams: room.settings.teamMode ? teamScores(room) : [],
    qIndex: room.qIndex,
    total: room.questions.length,
    question: q && room.phase !== 'lobby' ? {
      text: q.text, choices: q.choices, category: q.category, categoryEmoji: q.categoryEmoji,
      answer: room.phase === 'reveal' || room.phase === 'final' ? q.answer : undefined,
    } : null,
    deadline: room.deadline,
    serverNow: Date.now(),
    lastResults: room.phase === 'reveal' || room.phase === 'final' ? room.lastResults : null,
  };
}
function broadcast(room) {
  const state = roomState(room);
  io.to(room.code).emit('state', state);
  // Each player gets their own answer privately
  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('me', { id: p.id, answer: p.answer, score: p.score, team: p.team, lastGain: p.lastGain, rank: rankOf(room, p.id) });
  }
}
function rankOf(room, id) {
  const sorted = [...room.players.values()].sort((a, b) => b.score - a.score);
  const me = room.players.get(id);
  return me ? sorted.filter((p) => p.score > me.score).length + 1 : null;
}

function startQuestion(room) {
  clearTimeout(room.timer);
  room.phase = 'question';
  room.qStart = Date.now();
  room.correctOrder = 0;
  for (const p of room.players.values()) { p.answer = null; p.answerAt = null; p.lastGain = 0; }
  const secs = room.settings.timer;
  room.deadline = secs ? room.qStart + secs * 1000 : null;
  if (secs) room.timer = setTimeout(() => reveal(room, true), secs * 1000 + 250);
  broadcast(room);
}

function reveal(room, timeUp = false) {
  if (room.phase !== 'question') return;
  clearTimeout(room.timer);
  const q = room.questions[room.qIndex];
  const answered = [...room.players.values()].filter((p) => p.answer !== null).sort((a, b) => a.answerAt - b.answerAt);
  const results = [];
  let order = 0;
  for (const p of room.players.values()) { p.lastGain = 0; }
  for (const p of answered) {
    if (p.answer === q.answer) {
      const bonus = SPEED_BONUS[order] ?? 0;
      order++;
      p.lastGain = 1 + bonus;
      p.score += p.lastGain;
      p.streak = (p.streak || 0) + 1;
      results.push({ id: p.id, correct: true, place: order, gain: p.lastGain, ms: p.answerAt - room.qStart });
    } else {
      p.streak = 0;
      results.push({ id: p.id, correct: false, gain: 0, ms: p.answerAt - room.qStart });
    }
  }
  for (const p of room.players.values()) if (p.answer === null) p.streak = 0;
  const counts = q.choices.map((_, i) => answered.filter((p) => p.answer === i).length);
  room.lastResults = { results, counts, timeUp, noAnswer: room.players.size - answered.length };
  room.phase = 'reveal';
  room.deadline = null;
  broadcast(room);
}

function next(room) {
  if (room.qIndex + 1 >= room.questions.length) {
    room.phase = 'final';
    broadcast(room);
    return;
  }
  room.qIndex++;
  startQuestion(room);
}

function autoBalanceTeam(room) {
  const counts = room.teams.map((_, i) => [...room.players.values()].filter((p) => p.team === i).length);
  return counts.indexOf(Math.min(...counts));
}

io.on('connection', (socket) => {
  let ctx = { room: null, role: null, playerId: null };

  socket.on('host:create', (_, cb) => {
    const code = makeCode();
    const room = {
      code, hostSocket: socket.id, hostKey: Math.random().toString(36).slice(2),
      phase: 'lobby', players: new Map(), questions: [], qIndex: 0, deadline: null, timer: null,
      teams: TEAM_PRESETS.slice(0, 2),
      settings: { mode: 'office', categories: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], length: 20, timer: 20, teamMode: false, teamCount: 2 },
      lastResults: null, createdAt: Date.now(),
    };
    rooms.set(code, room);
    socket.join(code);
    ctx = { room, role: 'host' };
    cb?.({ ok: true, code, hostKey: room.hostKey });
    broadcast(room);
  });

  socket.on('host:resume', ({ code, hostKey }, cb) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.hostKey !== hostKey) return cb?.({ ok: false });
    room.hostSocket = socket.id;
    socket.join(room.code);
    ctx = { room, role: 'host' };
    cb?.({ ok: true, code: room.code });
    broadcast(room);
  });

  const isHost = () => ctx.role === 'host' && ctx.room && ctx.room.hostSocket === socket.id;

  socket.on('host:settings', (s) => {
    if (!isHost() || ctx.room.phase !== 'lobby') return;
    const room = ctx.room;
    const st = room.settings;
    if (s.mode && MODES[s.mode] && s.mode !== st.mode) { st.mode = s.mode; st.categories = MODES[s.mode].categories.map((_, i) => i); }
    if (Array.isArray(s.categories)) st.categories = s.categories.filter((i) => Number.isInteger(i) && i >= 0 && i < 10);
    if ([20, 40, 60].includes(s.length)) st.length = s.length;
    if ([0, 10, 15, 20, 30, 45].includes(s.timer)) st.timer = s.timer;
    if (typeof s.teamMode === 'boolean') st.teamMode = s.teamMode;
    if ([2, 3, 4].includes(s.teamCount)) st.teamCount = s.teamCount;
    room.teams = TEAM_PRESETS.slice(0, st.teamCount);
    if (st.teamMode) {
      for (const p of room.players.values()) if (p.team === null || p.team >= st.teamCount) p.team = autoBalanceTeam(room);
    }
    broadcast(room);
  });

  socket.on('host:moveplayer', ({ id, team }) => {
    if (!isHost()) return;
    const p = ctx.room.players.get(id);
    if (p && Number.isInteger(team) && team >= 0 && team < ctx.room.teams.length) { p.team = team; broadcast(ctx.room); }
  });
  socket.on('host:kick', ({ id }) => {
    if (!isHost()) return;
    const p = ctx.room.players.get(id);
    if (!p) return;
    if (p.socketId) io.to(p.socketId).emit('kicked');
    ctx.room.players.delete(id);
    broadcast(ctx.room);
  });

  socket.on('host:start', (_, cb) => {
    if (!isHost()) return;
    const room = ctx.room;
    if (!room.players.size) return cb?.({ ok: false, error: 'Wait for at least one player to join.' });
    if (!room.settings.categories.length) return cb?.({ ok: false, error: 'Pick at least one category.' });
    const available = room.settings.categories.reduce((s, i) => s + MODES[room.settings.mode].categories[i].questions.length, 0);
    if (available < room.settings.length) return cb?.({ ok: false, error: `Those categories hold ${available} questions. Pick more categories for a ${room.settings.length}-question round.` });
    room.questions = buildRound(room.settings.mode, room.settings.categories, room.settings.length);
    room.qIndex = 0;
    for (const p of room.players.values()) { p.score = 0; p.streak = 0; }
    if (room.settings.teamMode) for (const p of room.players.values()) if (p.team === null) p.team = autoBalanceTeam(room);
    room.phase = 'countdown';
    broadcast(room);
    setTimeout(() => startQuestion(room), 3500);
    cb?.({ ok: true });
  });
  socket.on('host:reveal', () => { if (isHost()) reveal(ctx.room); });
  socket.on('host:next', () => { if (isHost() && ctx.room.phase === 'reveal') next(ctx.room); });
  socket.on('host:end', () => { if (isHost()) { clearTimeout(ctx.room.timer); ctx.room.phase = 'final'; broadcast(ctx.room); } });
  socket.on('host:lobby', () => {
    if (!isHost()) return;
    const room = ctx.room;
    clearTimeout(room.timer);
    room.phase = 'lobby'; room.questions = []; room.qIndex = 0; room.lastResults = null;
    for (const p of room.players.values()) { p.score = 0; p.answer = null; p.streak = 0; p.lastGain = 0; }
    broadcast(room);
  });

  socket.on('player:join', ({ code, name, avatar, color, playerId, team }, cb) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return cb?.({ ok: false, error: 'No room with that code. Check with your host.' });
    // Rejoin
    if (playerId && room.players.has(playerId)) {
      const p = room.players.get(playerId);
      p.socketId = socket.id; p.connected = true;
      socket.join(room.code);
      ctx = { room, role: 'player', playerId };
      cb?.({ ok: true, playerId, code: room.code });
      return broadcast(room);
    }
    name = cleanName(name);
    if (!name) return cb?.({ ok: false, error: 'Please enter a name.' });
    if (room.players.size >= MAX_PLAYERS) return cb?.({ ok: false, error: 'This room is full (20 players max).' });
    if ([...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) return cb?.({ ok: false, error: 'Someone already has that name. Try another.' });
    const id = Math.random().toString(36).slice(2, 10);
    let t = null;
    if (room.settings.teamMode) t = Number.isInteger(team) && team >= 0 && team < room.teams.length ? team : autoBalanceTeam(room);
    const p = { id, name, avatar: String(avatar || 'fox').slice(0, 20), color: String(color || '#7f5af0').slice(0, 9), team: t, score: 0, answer: null, answerAt: null, lastGain: 0, streak: 0, socketId: socket.id, connected: true };
    room.players.set(id, p);
    socket.join(room.code);
    ctx = { room, role: 'player', playerId: id };
    cb?.({ ok: true, playerId: id, code: room.code });
    broadcast(room);
  });

  socket.on('player:team', ({ team }) => {
    if (ctx.role !== 'player' || ctx.room.phase !== 'lobby' || !ctx.room.settings.teamMode) return;
    const p = ctx.room.players.get(ctx.playerId);
    if (p && Number.isInteger(team) && team >= 0 && team < ctx.room.teams.length) { p.team = team; broadcast(ctx.room); }
  });

  socket.on('player:answer', ({ choice }) => {
    if (ctx.role !== 'player') return;
    const room = ctx.room;
    const p = room.players.get(ctx.playerId);
    if (!p || room.phase !== 'question' || p.answer !== null) return; // locked in
    const q = room.questions[room.qIndex];
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return;
    if (room.deadline && Date.now() > room.deadline) return;
    p.answer = choice;
    p.answerAt = Date.now();
    broadcast(room);
    const all = [...room.players.values()].filter((x) => x.connected).every((x) => x.answer !== null);
    if (all) setTimeout(() => reveal(room), REVEAL_ANSWER_DELAY_MS);
  });

  socket.on('player:leave', () => {
    if (ctx.role !== 'player') return;
    ctx.room.players.delete(ctx.playerId);
    broadcast(ctx.room);
    ctx = { room: null };
  });

  socket.on('disconnect', () => {
    if (ctx.role === 'player' && ctx.room) {
      const p = ctx.room.players.get(ctx.playerId);
      if (p && p.socketId === socket.id) {
        p.connected = false;
        broadcast(ctx.room);
        // If everyone left still connected has answered, move on
        const room = ctx.room;
        if (room.phase === 'question') {
          const live = [...room.players.values()].filter((x) => x.connected);
          if (live.length && live.every((x) => x.answer !== null)) reveal(room);
        }
      }
    }
  });
});

// Clean up rooms older than 12 hours
setInterval(() => {
  const cutoff = Date.now() - 12 * 3600 * 1000;
  for (const [code, r] of rooms) if (r.createdAt < cutoff) { clearTimeout(r.timer); rooms.delete(code); }
}, 3600 * 1000);

server.listen(PORT, () => {
  console.log(`QuizBlast is running!`);
  console.log(`  Host screen:  http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  Phones on your Wi-Fi join at:  http://${ip}:${PORT}`);
});
