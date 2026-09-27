/* SSHWeb · Minecraft 农场版 v3 — 指针锁定/摇杆、全鸡可战斗、头顶信息卡、事件播报 */
'use strict';
import * as THREE from './vendor/three.module.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= API ================= */
async function api(path, opts = {}) {
  const res = await fetch('/' + path.replace(/^\//, ''), {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) throw new Error('未登录');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
let toastTimer = 0;
function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (kind === 'err' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ================= 音效 ================= */
const audio = { ctx: null, muted: false };
function ac() {
  if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio.ctx;
}
function sfx(name) {
  if (audio.muted) return;
  try {
    const c = ac(), now = c.currentTime;
    const g = c.createGain(); g.connect(c.destination);
    const o = c.createOscillator();
    const noise = (dur, vol) => {
      const len = c.sampleRate * dur;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = c.createBufferSource(); s.buffer = buf;
      const ng = c.createGain(); ng.gain.value = vol;
      s.connect(ng); ng.connect(c.destination); s.start(now);
    };
    switch (name) {
      case 'swing':
        o.type = 'triangle'; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(120, now + .12);
        g.gain.setValueAtTime(.12, now); g.gain.exponentialRampToValueAtTime(.001, now + .15);
        o.connect(g); o.start(now); o.stop(now + .16); break;
      case 'peck':
        o.type = 'square'; o.frequency.setValueAtTime(700, now); o.frequency.exponentialRampToValueAtTime(200, now + .08);
        g.gain.setValueAtTime(.1, now); g.gain.exponentialRampToValueAtTime(.001, now + .1);
        o.connect(g); o.start(now); o.stop(now + .11); break;
      case 'shoot':
        noise(.08, .25);
        o.type = 'square'; o.frequency.setValueAtTime(900, now); o.frequency.exponentialRampToValueAtTime(80, now + .1);
        g.gain.setValueAtTime(.18, now); g.gain.exponentialRampToValueAtTime(.001, now + .12);
        o.connect(g); o.start(now); o.stop(now + .13); break;
      case 'bow':
        o.type = 'sine'; o.frequency.setValueAtTime(500, now); o.frequency.exponentialRampToValueAtTime(1200, now + .06);
        g.gain.setValueAtTime(.15, now); g.gain.exponentialRampToValueAtTime(.001, now + .1);
        o.connect(g); o.start(now); o.stop(now + .11); break;
      case 'hit':
        noise(.1, .3);
        o.type = 'sawtooth'; o.frequency.setValueAtTime(220, now); o.frequency.exponentialRampToValueAtTime(60, now + .15);
        g.gain.setValueAtTime(.22, now); g.gain.exponentialRampToValueAtTime(.001, now + .18);
        o.connect(g); o.start(now); o.stop(now + .19); break;
      case 'hurt':
        o.type = 'sawtooth'; o.frequency.setValueAtTime(180, now); o.frequency.exponentialRampToValueAtTime(50, now + .25);
        g.gain.setValueAtTime(.25, now); g.gain.exponentialRampToValueAtTime(.001, now + .3);
        o.connect(g); o.start(now); o.stop(now + .31); break;
      case 'die':
        o.type = 'sawtooth'; o.frequency.setValueAtTime(400, now); o.frequency.exponentialRampToValueAtTime(40, now + .5);
        g.gain.setValueAtTime(.25, now); g.gain.exponentialRampToValueAtTime(.001, now + .55);
        o.connect(g); o.start(now); o.stop(now + .56); break;
      case 'break':
        noise(.12, .2);
        o.type = 'square'; o.frequency.setValueAtTime(150, now);
        g.gain.setValueAtTime(.1, now); g.gain.exponentialRampToValueAtTime(.001, now + .12);
        o.connect(g); o.start(now); o.stop(now + .13); break;
      case 'place':
        o.type = 'square'; o.frequency.setValueAtTime(420, now);
        g.gain.setValueAtTime(.08, now); g.gain.exponentialRampToValueAtTime(.001, now + .07);
        o.connect(g); o.start(now); o.stop(now + .08); break;
      case 'pop':
        o.type = 'sine'; o.frequency.setValueAtTime(600, now); o.frequency.setValueAtTime(900, now + .08);
        g.gain.setValueAtTime(.15, now); g.gain.exponentialRampToValueAtTime(.001, now + .2);
        o.connect(g); o.start(now); o.stop(now + .21); break;
      case 'jump':
        o.type = 'sine'; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(500, now + .08);
        g.gain.setValueAtTime(.06, now); g.gain.exponentialRampToValueAtTime(.001, now + .1);
        o.connect(g); o.start(now); o.stop(now + .11); break;
    }
  } catch (e) { /* ignore */ }
}

/* ================= 状态 ================= */
const chickenMaxHP = 100;
const playerMaxHP = 100;
const state = {
  servers: [], statuses: new Map(), chickenHP: new Map(), probeHP: new Map(),
  probes: [],
  me: null, admin: false, players: new Map(),
  myHP: { hp: playerMaxHP, down: false },
  inv: { dirt: 0, wood: 0, stone: 0 },
  materials: 0,
};

/* ================= 入口 ================= */
async function init() {
  let sess = null;
  try { sess = await api('api/session'); } catch (e) { sess = null; }
  state.admin = !!(sess && sess.loggedIn);
  enterFarm();
}
function enterFarm() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  connectGame();
  if (!farm.inited) initFarm();
  buildHotbar();
  updateHud();
  updateStatsPanel();
  if (state.admin) loadAdminData();
}
async function loadAdminData() {
  try {
    state.servers = await api('api/servers');
    farm.syncChickens();
    probeAll();
  } catch (e) { /* ignore */ }
}
async function probeAll() {
  for (const s of state.servers) {
    api('api/servers/' + s.id + '/test', { method: 'POST' })
      .then(r => state.statuses.set(s.id, r.ok ? 'ok' : 'bad'))
      .catch(() => state.statuses.set(s.id, 'unk'));
  }
  setTimeout(() => { farm.updateLabels(true); updateHud(); updateStatsPanel(); }, 3000);
}
async function loadPublicFarm() {
  try {
    const list = await api('api/farm/public');
    state.servers = list.map(x => ({ ...x, guestView: true }));
    farm.syncChickens();
  } catch (e) { /* ignore */ }
}

$('#logoutBtn').onclick = async () => {
  termClose(true);
  try { await api('api/logout', { method: 'POST' }); } catch (e) {}
  location.reload();
};
$('#adminBtn').onclick = () => {
  if (state.admin) openAdmin();
  else openLoginModal();
};
$('#renameBtn').onclick = () => {
  if (state.admin) return;
  exitPointerLock();
  openModal(`
    <button class="modal-close">×</button>
    <h2>✏️ 修改我的昵称</h2>
    <p class="confirm-msg">昵称与你的 IP 绑定持久保存（最多 32 字符），下次进来还在。</p>
    <div class="field"><label>昵称</label><input id="rnName" maxlength="32" value="${esc(state.me ? state.me.name : '')}"></div>
    <div class="modal-actions">
      <button class="mc-btn" id="rnCancel">取消</button>
      <button class="mc-btn" id="rnOk">保存</button>
    </div>`);
  $('#rnCancel').onclick = closeModal;
  $('#rnOk').onclick = () => {
    const n = $('#rnName').value.trim();
    if (!n || n.length > 32) { toast('昵称不能为空且不超过 32 字符', 'err'); return; }
    gsend({ t: 'rename', name: n });
    closeModal();
    toast('昵称已保存');
  };
};
function openLoginModal() {
  exitPointerLock();
  openModal(`
    <button class="modal-close">×</button>
    <h2>🔑 登录</h2>
    <p class="confirm-msg">管理密码：升级为农场主，可连终端、养新鸡。<br>探针查看密码：解锁你部署的密码探针鸡（游客身份即可查看）。</p>
    <div class="field"><label>管理密码</label><input id="lmPass" type="password" autocomplete="current-password"></div>
    <div class="field"><label>探针查看密码（可选）</label><input id="lmProbePass" type="password" placeholder="解锁密码探针"></div>
    <div id="lmErr" class="mc-err hidden"></div>
    <div class="modal-actions">
      <button class="mc-btn" id="lmCancel">继续当游客</button>
      <button class="mc-btn" id="lmOk">登录</button>
    </div>`);
  attachPwToggle('#lmPass'); attachPwToggle('#lmProbePass');
  $('#lmCancel').onclick = closeModal;
  $('#lmPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lmOk').click(); });
  $('#lmOk').onclick = async () => {
    const err = $('#lmErr');
    err.classList.add('hidden');
    const pw = $('#lmPass').value, pp = $('#lmProbePass').value;
    try {
      let did = false;
      if (pp) {
        const r = await fetch('api/probe/unlockpass?pa' + 'ss=' + encodeURIComponent(pp), { credentials: 'same-origin' });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.unlocked > 0) { toast(`已解锁 ${d.unlocked} 只密码探针鸡`); did = true; }
        else if (!pw) throw new Error('该探针密码没有匹配到任何探针');
      }
      if (pw) {
        await api('api/login', { method: 'POST', body: { password: pw } });
        state.admin = true;
        setMyModel(true);
        toast('已登录管理 · 可以打开终端了');
        connectGame(true);
        await loadAdminData();
        did = true;
      }
      if (did) { closeModal(); fetchProbesNow().then(() => { syncProbeChickens(); updateHud(); }); }
    } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
  };
}
$('#guestBtn').onclick = () => enterFarm();

/* ================= 多人 WS ================= */
let gws = null, lastSentPos = 0;
function connectGame(reconnect) {
  if (gws && !reconnect) return;
  if (gws) { try { gws.onclose = null; gws.close(); } catch (e) {} gws = null; }
  state.players.forEach((_, id) => removeRemote(id));
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  gws = new WebSocket(`${proto}://${location.host}/ws/game`);
  gws.onmessage = ev => { try { onGameMsg(JSON.parse(ev.data)); } catch (e) {} };
  gws.onclose = () => {
    gws = null;
    setTimeout(() => { if (!gws && !$('#app').classList.contains('hidden')) connectGame(); }, 2000);
  };
}
function gsend(obj) { if (gws && gws.readyState === 1) gws.send(JSON.stringify(obj)); }
function onGameMsg(m) {
  switch (m.t) {
    case 'init':
      state.me = { id: m.you, name: m.name, cc: m.country, admin: m.admin };
      state.admin = m.admin;
      state.myHP = { hp: m.hp ?? playerMaxHP, down: !!m.down };
      state.materials = m.materials || 0;
      farm.pos.set(m.x || 0, m.y || 0, m.z || 12);
      farm.velY = 0;
      (m.players || []).forEach(p => spawnRemote(p));
      for (const [id, st] of Object.entries(m.chickens || {})) state.chickenHP.set(id, st);
      for (const [id, st] of Object.entries(m.probeHP || {})) state.probeHP.set(id, st);
      for (const [k, v] of Object.entries(m.blocks || {})) applyRemoteBlock(k, v, false);
      setMyModel(m.admin);
      if (state.myHP.down) showDeath('');
      if (m.admin) loadAdminData(); else loadPublicFarm();
      fetchProbesNow().then(() => { syncProbeChickens(); farm.updateLabels(true); updateStatsPanel(); });
      buildHotbar();
      updateHud();
      break;
    case 'join': spawnRemote(m.player); pushEvent(`${m.player.name} 进入了农场`); updateHud(); break;
    case 'bye': removeRemote(m.id); updateHud(); updateStatsPanel(); break;
    case 'pos': moveRemote(m); break;
    case 'hitfx': playHitFx(m); break;
    case 'chickenState': {
      const prev = state.chickenHP.get(m.id);
      state.chickenHP.set(m.id, { hp: m.hp, down: m.down });
      const c = farm.chickenById.get(m.id);
      if (c) {
        setDown(c, m.down, m.hp);
        // 复活：随机换个地点，若该处有建筑就站到建筑顶上（防止地面被建满）
        if (prev && prev.down && !m.down && !c.userData.isProbe) {
          const ang = Math.random() * Math.PI * 2, rad = 4 + Math.random() * 16;
          c.position.x = Math.cos(ang) * rad;
          c.position.z = Math.sin(ang) * rad;
          c.position.y = groundYAt(c.position.x, c.position.z);
          spawnDeathSmoke(c.position);
        }
      }
      farm.updateLabels(true); updateStatsPanel();
      break;
    }
    case 'probeState': {
      const prev = state.probeHP.get(m.id);
      state.probeHP.set(m.id, { hp: m.hp, down: m.down });
      const c = farm.probeById.get(m.id);
      if (c) {
        setDown(c, m.down, m.hp);
        if (prev && prev.down && !m.down) {
          c.position.y = groundYAt(c.position.x, c.position.z);
        }
      }
      farm.updateLabels(true); updateStatsPanel();
      break;
    }
    case 'playerState': {
      const p = state.players.get(m.id);
      if (p) {
        p.info.hp = m.hp; p.info.down = m.down;
        if (m.x !== undefined) { p.tx = m.x; p.tz = m.z; }
        setDown(p.model, m.down, m.hp, playerMaxHP);
      }
      farm.updateLabels(true);
      break;
    }
    case 'hurt':
      state.myHP = { hp: m.hp ?? state.myHP.hp, down: !!m.down };
      farm.hurtTime = .3; sfx('hurt');
      updateMyBar();
      if (m.down) { showDeath(m.from); }
      else toast(`被 ${m.from} 啄了一口！`, 'err');
      break;
    case 'respawn':
      state.myHP = { hp: playerMaxHP, down: false };
      farm.pos.set(m.x, m.y || 0, m.z);
      farm.velY = 0;
      setMyDown(false);
      hideDeath();
      updateMyBar();
      sfx('pop');
      toast('你复活了！');
      break;
    case 'event': pushEvent(m.text); break;
    case 'materials': state.materials = m.n; updateHud(); break;
    case 'toast': toast(m.text); break;
    case 'rename': {
      const p2 = state.players.get(m.id);
      if (p2) { p2.info.name = m.name; farm.updateLabels(true); }
      if (state.me && state.me.id === m.id) { state.me.name = m.name; updateMyBar(); updateHud(); }
      break;
    }
    case 'block': applyRemoteBlock(`${m.x},${m.y},${m.z}`, m.op === 'del' ? '-' : m.type, true); break;
  }
}

/* ================= 事件播报 ================= */
function pushEvent(text) {
  const t = $('#eventTicker');
  t.textContent = '📢 ' + text;
  t.classList.remove('hidden');
  clearTimeout(pushEvent._timer);
  pushEvent._timer = setTimeout(() => t.classList.add('hidden'), 6000);
}

/* ================= 死亡/复活 ================= */
function showDeath(by) {
  $('#deathBy').textContent = by ? `凶手：${by}` : '';
  $('#deathOverlay').classList.remove('hidden');
}
function hideDeath() { $('#deathOverlay').classList.add('hidden'); }
$('#respawnBtn').onclick = () => { gsend({ t: 'playerRevive' }); };

/* ================= 纹理 ================= */
function pixelTexture(size, painter) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  painter(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noiseFill(g, size, base, vary) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = (Math.random() - .5) * vary;
    g.fillStyle = `rgb(${cl(base[0]+v)},${cl(base[1]+v)},${cl(base[2]+v)})`;
    g.fillRect(x, y, 1, 1);
  }
}
const cl = v => Math.max(0, Math.min(255, Math.round(v)));
const TEX = {
  grassTop: pixelTexture(16, g => noiseFill(g, 16, [95, 159, 53], 26)),
  grassSide: pixelTexture(16, g => { noiseFill(g, 16, [121, 85, 58], 22); for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) { const v = (Math.random()-.5)*26; g.fillStyle = `rgb(${cl(95+v)},${cl(159+v)},${cl(53+v)})`; g.fillRect(x, y, 1, 1); } }),
  dirt: pixelTexture(16, g => noiseFill(g, 16, [121, 85, 58], 26)),
  wood: pixelTexture(16, g => { noiseFill(g, 16, [104, 78, 47], 14); g.fillStyle = 'rgba(60,42,22,.5)'; for (let x = 0; x < 16; x += 4) g.fillRect(x, 0, 1, 16); }),
  leaves: pixelTexture(16, g => noiseFill(g, 16, [56, 118, 29], 34)),
  stone: pixelTexture(16, g => noiseFill(g, 16, [125, 125, 125], 20)),
  cobble: pixelTexture(16, g => { noiseFill(g, 16, [118, 118, 118], 30); g.strokeStyle = 'rgba(40,40,40,.7)'; for (let y = 0; y < 16; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(16, y); g.stroke(); for (let x = ((y / 4) % 2) * 4; x < 16; x += 8) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 4); g.stroke(); } } }),
  planks: pixelTexture(16, g => { noiseFill(g, 16, [162, 130, 78], 12); g.fillStyle = 'rgba(90,66,32,.55)'; for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1); g.fillRect(7, 0, 1, 8); g.fillRect(3, 8, 1, 8); }),
  water: pixelTexture(16, g => noiseFill(g, 16, [52, 98, 178], 20)),
  woolWhite: pixelTexture(8, g => noiseFill(g, 8, [238, 238, 235], 10)),
  chickenSkin: pixelTexture(8, g => noiseFill(g, 8, [222, 214, 200], 10)),
  farmerSkin: pixelTexture(8, g => noiseFill(g, 8, [196, 148, 106], 12)),
  farmerShirt: pixelTexture(8, g => noiseFill(g, 8, [58, 110, 190], 14)),
  farmerPants: pixelTexture(8, g => noiseFill(g, 8, [70, 58, 130], 12)),
};
const mat = tex => new THREE.MeshLambertMaterial({ map: tex });
const matC = color => new THREE.MeshLambertMaterial({ color });
const BLOCK_MATS = { dirt: mat(TEX.dirt), wood: mat(TEX.wood), stone: mat(TEX.cobble) };

/* ================= 场景 ================= */
const WORLD = 120;
const FENCE = 26;
const farm = {
  inited: false, scene: null, camera: null, renderer: null, raycaster: null,
  chickens: [], chickenById: new Map(), probeById: new Map(),
  farmer: null, myChicken: null, keys: new Set(),
  yaw: Math.PI * .75, pitch: .42, dist: 10,
  clock: new THREE.Clock(), labelEls: new Map(),
  pos: new THREE.Vector3(0, 0, 12), velY: 0, grounded: true,
  swing: 0, hurtTime: 0, walkT: 0,
  weapon: 'peck', aiming: false,
  arrows: [], fx: [],
  blocks: new Map(), colliders: [],
  buildType: 'dirt',
  cooldown: 0, pointerLocked: false, isTouch: false,
  joyVec: { x: 0, y: 0 }, mineHold: null, leftDown: null, drag: null,
};
const BUILD_SLOTS = [
  { id: 'dirt', name: '泥土', icon: '🟫', range: 8, dmg: 0, cd: .2, sfx: 'place', build: 'dirt' },
  { id: 'wood', name: '木头', icon: '🪵', range: 8, dmg: 0, cd: .2, sfx: 'place', build: 'wood' },
  { id: 'stone', name: '石头', icon: '🪨', range: 8, dmg: 0, cd: .2, sfx: 'place', build: 'stone' },
];
const WEAPONS_ADMIN = [
  { id: 'sword', name: '木剑', icon: '🗡️', range: 7, dmg: 20, cd: 1, sfx: 'swing' },
  { id: 'bow', name: '弓箭', icon: '🏹', range: 60, dmg: 16, cd: 1, sfx: 'bow' },
  { id: 'gun', name: '手枪', icon: '🔫', range: 80, dmg: 12, cd: 1, sfx: 'shoot' },
  { id: 'pick', name: '镐子', icon: '⛏️', range: 6, dmg: 4, cd: 1, sfx: 'swing', mine: true },
  ...BUILD_SLOTS,
];
const WEAPONS_GUEST = [
  { id: 'peck', name: '攻击', icon: '👊', range: 4, dmg: 20, cd: 1, sfx: 'peck' },
  ...BUILD_SLOTS,
  { id: 'demolish', name: '拆除', icon: '⛏️', range: 6, dmg: 0, cd: .5, sfx: 'swing', mine: true },
];
let weaponIdx = 0;
function weapons() { return state.admin ? WEAPONS_ADMIN : WEAPONS_GUEST; }
function curWeapon() { return weapons()[Math.min(weaponIdx, weapons().length - 1)]; }
const BLOCK_NAMES = { dirt: '泥土', wood: '木头', stone: '石头' };

function initFarm() {
  const host = $('#farmHost');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 70, 220);

  const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, .1, 500);
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  host.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xfff4dd, 1.6);
  sun.position.set(40, 70, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.far = 200;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd4ff, .75));
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5d9c3a, .5));

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD, 1, WORLD),
    [mat(TEX.grassSide), mat(TEX.grassSide), mat(TEX.grassTop), mat(TEX.dirt), mat(TEX.grassSide), mat(TEX.grassSide)]
  );
  ground.position.y = -.5;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // 围栏
  const postGeo = new THREE.BoxGeometry(.35, 1.5, .35);
  const woodMat = mat(TEX.wood);
  const addFenceRun = (x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const n = Math.round(len / 2);
    const ang = Math.atan2(dx, dz);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(x1 + dx * t, .75, z1 + dz * t);
      post.castShadow = true;
      scene.add(post);
      if (i < n) for (const ry of [.55, 1.05]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2, .18, .12), woodMat);
        rail.position.set(x1 + dx * (t + .5 / n), ry, z1 + dz * (t + .5 / n));
        rail.rotation.y = ang;
        rail.scale.x = len / n / 2;
        scene.add(rail);
      }
    }
  };
  addFenceRun(-FENCE, -FENCE, FENCE, -FENCE);
  addFenceRun(-FENCE, FENCE, -2.5, FENCE);
  addFenceRun(2.5, FENCE, FENCE, FENCE);
  addFenceRun(-FENCE, -FENCE, -FENCE, FENCE);
  addFenceRun(FENCE, -FENCE, FENCE, FENCE);
  farm.colliders.push(
    { x: 0, z: -FENCE, hx: FENCE, hz: .3, top: 1.5 },
    { x: -(FENCE + 2.5) / 2, z: FENCE, hx: (FENCE - 2.5) / 2, hz: .3, top: 1.5 },
    { x: (FENCE + 2.5) / 2, z: FENCE, hx: (FENCE - 2.5) / 2, hz: .3, top: 1.5 },
    { x: -FENCE, z: 0, hx: .3, hz: FENCE, top: 1.5 },
    { x: FENCE, z: 0, hx: .3, hz: FENCE, top: 1.5 },
  );
  for (const gx of [-2.5, 2.5]) {
    const gp = new THREE.Mesh(new THREE.BoxGeometry(.5, 2.2, .5), mat(TEX.planks));
    gp.position.set(gx, 1.1, FENCE); gp.castShadow = true; scene.add(gp);
    const torch = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .18), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    torch.position.set(gx, 2.35, FENCE); scene.add(torch);
  }

  // 谷仓
  const barn = new THREE.Group();
  const barnBody = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), mat(TEX.planks));
  barnBody.position.y = 2.5; barnBody.castShadow = true; barn.add(barnBody);
  const roofMat = matC(0x8f3b34);
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(4.9, .35, 6.6), roofMat);
  roofL.position.set(-1.9, 6.1, 0); roofL.rotation.z = .5; roofL.castShadow = true; barn.add(roofL);
  const roofR = roofL.clone(); roofR.position.x = 1.9; roofR.rotation.z = -.5; barn.add(roofR);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3, .15), matC(0x4a3018));
  door.position.set(0, 1.5, 3.05); barn.add(door);
  barn.position.set(-18, 0, -16);
  scene.add(barn);
  farm.colliders.push({ x: -18, z: -16, hx: 4, hz: 3, top: 5 });

  // 掩体
  const rockClusters = [[35, 10], [-35, -8], [12, -40], [-10, 40], [42, -30], [-42, 25], [30, 42], [-30, -40]];
  for (const [rx, rz] of rockClusters) {
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), mat(TEX.cobble));
      b.position.set(rx + i * 2.05, .75, rz); b.castShadow = true; b.receiveShadow = true;
      scene.add(b);
      farm.colliders.push({ x: rx + i * 2.05, z: rz, hx: 1, hz: 1, top: 1.5 });
    }
    for (let i = 1; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), mat(TEX.cobble));
      b.position.set(rx, .75, rz + i * 2.05); b.castShadow = true; b.receiveShadow = true;
      scene.add(b);
      farm.colliders.push({ x: rx, z: rz + i * 2.05, hx: 1, hz: 1, top: 1.5 });
    }
  }
  // 树
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 25;
    const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
    if (Math.abs(tx) > 58 || Math.abs(tz) > 58) continue;
    const th = 4 + (Math.random() * 2 | 0);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1, th, 1), mat(TEX.wood));
    trunk.position.set(tx, th / 2, tz); trunk.castShadow = true; scene.add(trunk);
    farm.colliders.push({ x: tx, z: tz, hx: .5, hz: .5, top: th });
    const lv = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), mat(TEX.leaves));
    lv.position.set(tx, th + 1.2, tz); lv.castShadow = true; scene.add(lv);
    const lv2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), mat(TEX.leaves));
    lv2.position.set(tx, th + 3.1, tz); lv2.castShadow = true; scene.add(lv2);
  }
  // 资源堆
  for (const [ox, oz] of [[45, 45], [-45, 45], [45, -45], [-48, -46]]) {
    for (let i = 0; i < 6; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat(TEX.stone));
      st.position.set(ox + (Math.random() - .5) * 8, .8, oz + (Math.random() - .5) * 8);
      st.castShadow = true; st.userData.ore = 'stone'; scene.add(st);
    }
  }
  for (const [ox, oz] of [[-38, 0], [38, 5]]) {
    for (let i = 0; i < 4; i++) {
      const lg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat(TEX.wood));
      lg.position.set(ox + (Math.random() - .5) * 5, .6, oz + (Math.random() - .5) * 5);
      lg.castShadow = true; lg.userData.ore = 'wood'; scene.add(lg);
    }
  }
  for (const [ox, oz] of [[8, 38], [-8, -36]]) {
    for (let i = 0; i < 5; i++) {
      const dt = new THREE.Mesh(new THREE.BoxGeometry(1.2, .8, 1.2), mat(TEX.dirt));
      dt.position.set(ox + (Math.random() - .5) * 6, .4, oz + (Math.random() - .5) * 6);
      dt.castShadow = true; dt.userData.ore = 'dirt'; scene.add(dt);
    }
  }
  const pond = new THREE.Mesh(new THREE.BoxGeometry(9, .2, 7), mat(TEX.water));
  pond.position.set(20, .05, 20); scene.add(pond);
  farm.colliders.push({ x: 20, z: 20, hx: 4.5, hz: 3.5, top: .1 });

  // 云
  for (let i = 0; i < 10; i++) {
    const cw = 6 + Math.random() * 10;
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(cw, 1.2, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .82 }));
    cloud.position.set((Math.random() - .5) * 160, 30 + Math.random() * 12, (Math.random() - .5) * 160);
    cloud.userData.drift = .4 + Math.random() * .8;
    cloud.name = 'cloud';
    scene.add(cloud);
  }

  const farmer = makeFarmerModel();
  farmer.position.copy(farm.pos);
  scene.add(farmer);

  // 白色放置预览框
  const ghost = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95 })
  );
  ghost.visible = false;
  ghost.name = 'ghost';
  scene.add(ghost);
  const ghostFill = new THREE.Mesh(
    new THREE.BoxGeometry(1.01, 1.01, 1.01),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .18, depthWrite: false })
  );
  ghost.add(ghostFill);
  farm.ghost = ghost;

  farm.scene = scene; farm.camera = camera; farm.renderer = renderer;
  farm.raycaster = new THREE.Raycaster();
  farm.farmer = farmer;
  farm.myChicken = null;
  farm.inited = true;
  setHandItem(farmer, 'sword');
  setMyModel(state.admin);

  bindFarmInput(renderer.domElement);
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(tick);
}

function makeFarmerModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.15, .5), mat(TEX.farmerShirt));
  body.position.y = 1.35; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.72, .72, .72), mat(TEX.farmerSkin));
  head.position.y = 2.3; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(.76, .2, .76), matC(0x3a2817));
  hair.position.y = 2.62; g.add(hair);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(.28, 1.05, .28), mat(TEX.farmerSkin));
  armL.geometry.translate(0, -.5, 0); armL.position.set(-.62, 1.9, 0); armL.castShadow = true; g.add(armL);
  const armR = armL.clone(); armR.position.x = .62; g.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(.32, .85, .32), mat(TEX.farmerPants));
  legL.geometry.translate(0, -.42, 0); legL.position.set(-.24, .78, 0); legL.castShadow = true; g.add(legL);
  const legR = legL.clone(); legR.position.x = .24; g.add(legR);
  const hand = new THREE.Group();
  hand.position.set(0, -1.0, .1);
  armR.add(hand);
  g.userData = { armL, armR, legL, legR, head, hand, isPlayer: true, hurtT: 0 };
  return g;
}
function setHandItem(model, weaponId) {
  const hand = model.userData.hand;
  if (!hand) return;
  hand.clear();
  let mesh = null;
  if (weaponId === 'dirt' || weaponId === 'wood' || weaponId === 'stone') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), BLOCK_MATS[weaponId] || BLOCK_MATS.dirt);
    mesh.position.y = .2;
    hand.add(mesh);
    return;
  }
  if (weaponId === 'sword') {
    mesh = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.1, .9, .1), mat(TEX.planks));
    blade.position.y = .45; mesh.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.3, .1, .1), matC(0x6b4a2b));
    mesh.add(guard);
  } else if (weaponId === 'bow') {
    mesh = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(.4, .05, 4, 12, Math.PI), mat(TEX.wood));
    arc.rotation.z = Math.PI / 2; arc.rotation.y = Math.PI / 2; mesh.add(arc);
    const str = new THREE.Mesh(new THREE.BoxGeometry(.02, .8, .02), matC(0xdddddd));
    mesh.add(str);
  } else if (weaponId === 'gun') {
    mesh = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .7), matC(0x444448));
    barrel.position.z = .3; mesh.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.12, .35, .14), mat(TEX.wood));
    grip.position.set(0, -.2, 0); mesh.add(grip);
  } else if (weaponId === 'pick') {
    mesh = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.08, .8, .08), mat(TEX.wood));
    handle.position.y = .4; mesh.add(handle);
    const headp = new THREE.Mesh(new THREE.BoxGeometry(.5, .12, .12), matC(0x9a9aa0));
    headp.position.y = .8; mesh.add(headp);
  }
  if (mesh) hand.add(mesh);
}

/* ---------- 我的形象：游客=随机造型农场主 / 管理员=农场主👑 ---------- */
const SKIN_TONES = [0xc4946a, 0xf0c8a0, 0x8d5a3a, 0xffdbb4, 0xa06840, 0xe0ac69];
const SHIRT_COLORS = [0x3a6ebe, 0xbe3a3a, 0x3abe5a, 0xbe9a3a, 0x7a3abe, 0x3abebc, 0xbe3a8a, 0x555f66];
function hashStr(s) { let h = 0; for (const ch of (s || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
function styleFarmer(g, seed) {
  const h = hashStr(seed);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const shirt = SHIRT_COLORS[(h >> 3) % SHIRT_COLORS.length];
  const pants = SHIRT_COLORS[(h >> 6) % SHIRT_COLORS.length];
  g.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.map === TEX.farmerSkin) o.material = matC(skin);
    else if (o.material.map === TEX.farmerShirt) o.material = matC(shirt);
    else if (o.material.map === TEX.farmerPants) o.material = matC(pants);
  });
}
function setMyModel(isAdmin) {
  if (!farm.inited) return;
  if (!isAdmin) styleFarmer(farm.farmer, (state.me && state.me.id) || 'me');
  else { styleFarmer(farm.farmer, 'farmer'); }
  const cw = curWeapon();
  setHandItem(farm.farmer, cw.id === 'peck' ? 'sword' : cw.id);
  buildHotbar();
  if (state.me) updateMyBar();
}
function myAvatar() { return farm.farmer; }

/* ---------- 鸡模型 ---------- */
function makeChicken() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.7, .55, .95), mat(TEX.woolWhite));
  body.position.y = .62; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), mat(TEX.chickenSkin));
  head.position.set(0, 1.08, .55); head.castShadow = true; g.add(head);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(.1, .16, .22), matC(0xd33a2c));
  comb.position.set(0, 1.34, .55); g.add(comb);
  const beak = new THREE.Mesh(new THREE.BoxGeometry(.14, .1, .18), matC(0xe8952e));
  beak.position.set(0, 1.04, .82); g.add(beak);
  const wattle = new THREE.Mesh(new THREE.BoxGeometry(.08, .12, .1), matC(0xd33a2c));
  wattle.position.set(0, .88, .76); g.add(wattle);
  const legMat = matC(0xe8952e);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(.09, .35, .09), legMat);
  legL.position.set(-.17, .18, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = .17; g.add(legR);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(.12, .38, .6), mat(TEX.chickenSkin));
  wingL.position.set(-.4, .68, 0); g.add(wingL);
  const wingR = wingL.clone(); wingR.position.x = .4; g.add(wingR);
  g.userData = { legL, legR, wingL, wingR, head, isChicken: true, down: false, hurtT: 0, wander: null, wob: 0 };
  return g;
}
/* 统一的倒地/血量姿态（鸡模型通用） */
function setDown(c, down, hp, maxHP) {
  maxHP = maxHP || chickenMaxHP;
  c.userData.down = down;
  if (down) {
    c.rotation.z = Math.PI / 2;
    c.position.y = groundYAt(c.position.x, c.position.z) + .35;
  } else {
    c.rotation.z = 0;
    if (!c.userData.isMine) c.position.y = groundYAt(c.position.x, c.position.z);
  }
}
// 某列 (x,z) 最高方块顶面 y（无方块=0）——复活点/落点计算用
function groundYAt(x, z) {
  let top = 0;
  const bx = Math.round(x), bz = Math.round(z);
  for (const b of farm.blocks.values()) {
    const m = b.mesh.position;
    if (Math.round(m.x) === bx && Math.round(m.z) === bz && m.y + .5 > top) top = m.y + .5;
  }
  return top;
}
function hearts(hp, maxHP) {
  // 5 格进度心：按剩余比例填充，不显示 100 颗
  const frac = Math.max(0, hp) / maxHP;
  const full = Math.ceil(frac * 5);
  return '<span class="hearts">' + '❤'.repeat(full) + '<span class="dim">' + '❤'.repeat(5 - full) + '</span></span>';
}
function flagHTML(cc) {
  cc = (cc || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return '';
  return `<img class="flag" src="vendor/flags/${cc}.png" alt="">`;
}
const fmtUptime = s => {
  if (!s) return '?';
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
  return d > 0 ? `${d}天${h}小时` : h > 0 ? `${h}小时` : `${Math.floor(s % 3600 / 60)}分`;
};

/* ---------- 鸡群同步 ---------- */
farm.syncChickens = function () {
  const seen = new Set();
  state.servers.forEach((s, i) => {
    seen.add(s.id);
    let c = farm.chickenById.get(s.id);
    if (!c) {
      c = makeChicken();
      const ang = (i / Math.max(state.servers.length, 1)) * Math.PI * 2 + i;
      const rad = 5 + (i % 4) * 5 + Math.random() * 3;
      c.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      c.userData.server = s;
      c.userData.wander = { dir: Math.random() * Math.PI * 2, timer: Math.random() * 3, speed: .7 + Math.random() * .7, fleeing: 0, stop: false };
      farm.scene.add(c);
      farm.chickens.push(c);
      farm.chickenById.set(s.id, c);
      const el = document.createElement('div');
      el.className = 'sv-label';
      $('#labels').appendChild(el);
      farm.labelEls.set(s.id, el);
      const st = state.chickenHP.get(s.id);
      setDown(c, st ? st.down : false, st ? st.hp : chickenMaxHP);
    }
    c.userData.server = s;
  });
  for (const [id, c] of [...farm.chickenById]) {
    if (!seen.has(id)) {
      farm.scene.remove(c);
      farm.chickens = farm.chickens.filter(x => x !== c);
      farm.chickenById.delete(id);
      farm.labelEls.get(id)?.remove();
      farm.labelEls.delete(id);
    }
  }
  syncProbeChickens();
  farm.updateLabels(true);
  updateHud();
  updateStatsPanel();
};

/* ---------- 探针鸡 ---------- */
function syncProbeChickens() {
  const seen = new Set();
  state.probes.forEach((pr, i) => {
    seen.add(pr.id);
    let c = farm.probeById.get(pr.id);
    if (!c) {
      c = makeChicken(); // 探针鸡 = 普通鸡，只是头顶信息不同
      const ang = Math.PI * .5 + i * .9;
      c.position.set(Math.cos(ang) * (FENCE - 4), 0, Math.sin(ang) * (FENCE - 4));
      c.userData.probe = pr;
      c.userData.isProbe = true;
      c.userData.wander = { dir: Math.random() * Math.PI * 2, timer: Math.random() * 3, speed: .5, fleeing: 0, stop: false };
      farm.scene.add(c);
      farm.chickens.push(c);
      farm.probeById.set(pr.id, c);
      const el = document.createElement('div');
      el.className = 'sv-label probe';
      $('#labels').appendChild(el);
      farm.labelEls.set('probe:' + pr.id, el);
      const st = state.probeHP.get(pr.id);
      setDown(c, st ? st.down : false, st ? st.hp : chickenMaxHP);
    }
    c.userData.probe = pr;
  });
  for (const [id, c] of [...farm.probeById]) {
    if (!seen.has(id)) {
      farm.scene.remove(c);
      farm.chickens = farm.chickens.filter(x => x !== c);
      farm.probeById.delete(id);
      farm.labelEls.get('probe:' + id)?.remove();
      farm.labelEls.delete('probe:' + id);
    }
  }
  farm.updateLabels(true);
  updateStatsPanel();
}
async function fetchProbesNow() {
  try { state.probes = await api('api/probes/public'); } catch (e) {}
}
async function pollProbes() {
  await fetchProbesNow();
  if (farm.inited) syncProbeChickens();
  farm.updateLabels(true);
  updateStatsPanel();
  setTimeout(pollProbes, 5000);
}

/* ---------- 头顶信息（DOM 标签） ---------- */
farm.updateLabels = function (force) {
  // SSH 鸡
  for (const s of state.servers) {
    const el = farm.labelEls.get(s.id);
    const c = farm.chickenById.get(s.id);
    if (!el || !c) continue;
    const st = state.statuses.get(s.id);
    const hpst = state.chickenHP.get(s.id) || { hp: chickenMaxHP, down: false };
    const html = `<span class="nm2">${esc(s.name)}${st === 'bad' ? ' 💤' : ''}</span><br>${hpst.down ? '<span class="pdown">💀 倒地</span>' : hearts(hpst.hp, chickenMaxHP)}`;
    const cls = 'sv-label sm' + (hpst.down ? ' down' : '');
    if (force || el.dataset.html !== html) { el.dataset.html = html; el.className = cls; el.innerHTML = html; }
  }
  // 探针鸡：头顶大信息卡（参考用户截图样式）
  for (const pr of state.probes) {
    const el = farm.labelEls.get('probe:' + pr.id);
    const c = farm.probeById.get(pr.id);
    if (!el || !c) continue;
    const hpst = state.probeHP.get(pr.id) || { hp: chickenMaxHP, down: false };
    let html;
    if (pr.locked) {
      html = `<div class="phead">${esc(pr.name || pr.hostname || '探针')} 🔒</div>` +
        `<div class="prow dim2">输入查看密码解锁（右上角登录处）</div>` +
        (hpst.down ? '<div class="pdown">💀 倒地</div>' : hearts(hpst.hp, chickenMaxHP));
    } else {
      const nm = pr.name || pr.hostname || '探针';
      const memPct = pr.memTotal ? Math.round(pr.memUsed / pr.memTotal * 100) : 0;
      const diskPct = pr.diskTotal ? Math.round(pr.diskUsed / pr.diskTotal * 100) : 0;
      const cpuModel = pr.cpuModel ? `${pr.cpuModel}${pr.cpuCores ? ' ×' + pr.cpuCores : ''}` : '';
      html = `<div class="phead">${flagHTML(pr.cc)}<span class="nm2">${esc(nm)}</span>${pr.online ? '' : ' 💤'}</div>` +
        `<div class="prow net">↓${fmtRate(pr.rxRate)}&nbsp;&nbsp;↑${fmtRate(pr.txRate)}</div>` +
        `<div class="prow">CPU ${Math.round(pr.cpu || 0)}% · 内存 ${memPct}% · 磁盘 ${diskPct}%</div>` +
        (pr.load1 !== undefined ? `<div class="prow sub">负载 ${(+pr.load1 || 0).toFixed(2)} · 在线 ${fmtUptime(pr.uptime)} · 进程 ${pr.procs || 0}</div>` : '') +
        (cpuModel ? `<div class="prow sub">${esc(cpuModel)}</div>` : '') +
        `<div class="prow sub">内存 ${fmtKB(pr.memUsed)}/${fmtKB(pr.memTotal)}</div>` +
        `<div class="prow sub">磁盘 ${fmtKB(pr.diskUsed)}/${fmtKB(pr.diskTotal)}</div>` +
        (hpst.down ? '<div class="pdown">💀 倒地</div>' : hearts(hpst.hp, chickenMaxHP));
    }
    const cls = 'sv-label probe' + (pr.online ? '' : ' off') + (hpst.down ? ' down' : '');
    if (force || el.dataset.html !== html) { el.dataset.html = html; el.className = cls; el.innerHTML = html; }
  }
  // 远程玩家
  for (const [, p] of state.players) {
    const el = p.labelEl;
    const hp = p.info.hp ?? playerMaxHP;
    const html = `<span class="nm2">${esc(p.info.name)}${p.info.admin ? ' 👑' : ''} ${flagHTML(p.info.country)}</span><br>${p.info.down ? '<span class="pdown">💀 倒地</span>' : hearts(hp, playerMaxHP)}`;
    if (el.dataset.html !== html || force) { el.dataset.html = html; el.className = 'sv-label sm pl' + (p.info.down ? ' down' : ''); el.innerHTML = html; }
  }
  // 我自己（游客鸡状态下也在头顶显示）
  updateMyBar();
};
function updateMyBar() {
  if (!state.me) return;
  const el = myLabelEl();
  const hp = state.myHP.hp;
  const html = `<span class="nm2">${esc(state.me.name)}${state.admin ? ' 👑' : ''} ${flagHTML(state.me.cc)}</span><br>${state.myHP.down ? '<span class="pdown">💀 倒地</span>' : hearts(hp, playerMaxHP)}`;
  if (el.dataset.html !== html) { el.dataset.html = html; el.className = 'sv-label sm pl me' + (state.myHP.down ? ' down' : ''); el.innerHTML = html; }
}
function myLabelEl() {
  let el = farm.labelEls.get('me');
  if (!el) {
    el = document.createElement('div');
    el.className = 'sv-label sm pl me';
    $('#labels').appendChild(el);
    farm.labelEls.set('me', el);
  }
  return el;
}
const fmtKB = kb => kb >= 1073741824 ? (kb / 1073741824).toFixed(1) + 'TB' : kb >= 1048576 ? (kb / 1048576).toFixed(1) + 'GB' : kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : (kb || 0) + 'KB';
const fmtRate = b => b >= 1048576 ? (b / 1048576).toFixed(2) + 'MB/s' : b >= 1024 ? (b / 1024).toFixed(1) + 'KB/s' : (b || 0) + 'B/s';

/* ---------- 左上统计 ---------- */
function updateStatsPanel() {
  const probesOnline = state.probes.filter(p => p.online).length;
  const svOnline = [...state.statuses.values()].filter(v => v === 'ok').length;
  let angry = 0;
  for (const [, st] of state.chickenHP) if (st.down) angry++;
  for (const [, st] of state.probeHP) if (st.down) angry++;
  $('#statProbes').textContent = `📡 探针鸡在线 ${probesOnline}/${state.probes.length}`;
  $('#statServers').textContent = `🐔 网站鸡在线 ${state.admin ? svOnline + '/' + state.servers.length : state.servers.length + ' 只'}`;
  $('#statAngry').textContent = `💢 暴躁鸡 ${angry} 只`;
  $('#statMats').textContent = `🎒 我的材料 ${state.materials}`;
  $('#statTip').textContent = '💡 每天添加一个探针 → 材料 +100';
}

/* ---------- 远程玩家 ---------- */
function spawnRemote(p) {
  if (!p || !p.id || state.players.has(p.id)) return;
  const model = makeFarmerModel();
  if (!p.admin) styleFarmer(model, p.id || p.name);
  model.position.set(p.x || 0, 0, p.z || 12);
  model.rotation.y = p.ry || 0;
  farm.scene.add(model);
  const el = document.createElement('div');
  el.className = 'sv-label pl';
  $('#labels').appendChild(el);
  state.players.set(p.id, { info: p, model, labelEl: el, tx: p.x || 0, tz: p.z || 12, try_: p.ry || 0, moving: false });
  setHandItem(model, 'sword');
  setDown(model, !!p.down, p.hp ?? playerMaxHP, playerMaxHP);
  farm.updateLabels(true);
  updateHud();
}
function removeRemote(id) {
  const p = state.players.get(id);
  if (!p) return;
  farm.scene.remove(p.model);
  p.labelEl?.remove();
  state.players.delete(id);
}
function moveRemote(m) {
  const p = state.players.get(m.id);
  if (!p) return;
  p.tx = m.x; p.tz = m.z; p.try_ = m.ry;
  p.moving = !!m.mv;
}

/* ---------- 指针锁定 / 摇杆 ---------- */
function requestLock() {
  const cv = farm.renderer.domElement;
  if (!farm.isTouch && cv.requestPointerLock) cv.requestPointerLock();
}
function exitPointerLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  farm.pointerLocked = !!document.pointerLockElement;
  $('#lockHint').classList.toggle('hidden', farm.pointerLocked);
});

function bindFarmInput(canvas) {
  farm.isTouch = matchMedia('(pointer: coarse)').matches;
  if (farm.isTouch) {
    $('#joystick').classList.remove('hidden');
    initJoystick();
  } else {
    $('#lockHint').classList.remove('hidden');
  }

  window.addEventListener('keydown', e => {
    if (!$('#modal').classList.contains('hidden') || !$('#terminal').classList.contains('hidden')) return;
    if (e.code === 'KeyE') { e.preventDefault(); openAdmin(); return; }
    if (e.code === 'KeyQ') { cycleWeapon(1); return; }
    if (e.code === 'KeyF') { interactNear(); return; }
    if (e.code === 'Space') { e.preventDefault(); doJump(); return; }
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= weapons().length) selectWeapon(n - 1);
    }
    farm.keys.add(e.code);
  });
  window.addEventListener('keyup', e => farm.keys.delete(e.code));
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', e => {
    if (!$('#terminal').classList.contains('hidden')) return;
    ac();
    if (state.myHP.down) return;
    if (!farm.pointerLocked && !farm.isTouch) { requestLock(); return; }
    if (e.button === 0) {
      farm.swing = .25;
      const w = curWeapon();
      sfx(w.sfx);
      if (farm.cooldown <= 0) {
        farm.cooldown = w.cd;
        primaryAction();
      }
    }
  });
  document.addEventListener('mousemove', e => {
    if (!farm.pointerLocked) return;
    farm.yaw -= e.movementX * .0025;
    farm.pitch = Math.max(-.55, Math.min(1.2, farm.pitch + e.movementY * .0022));
  });

  // 触屏：右半屏拖动视角 + 点按攻击
  let touchView = null;
  canvas.addEventListener('touchstart', e => {
    if (!$('#terminal').classList.contains('hidden')) return;
    ac();
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * .45 && !touchView) {
        touchView = { id: t.identifier, x: t.clientX, y: t.clientY, moved: 0, t: performance.now() };
      }
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (!touchView) return;
    for (const t of e.changedTouches) {
      if (t.identifier === touchView.id) {
        const dx = t.clientX - touchView.x, dy = t.clientY - touchView.y;
        touchView.moved += Math.abs(dx) + Math.abs(dy);
        farm.yaw -= dx * .006;
        farm.pitch = Math.max(-.55, Math.min(1.2, farm.pitch + dy * .005));
        touchView.x = t.clientX; touchView.y = t.clientY;
      }
    }
  }, { passive: true });
  canvas.addEventListener('touchend', e => {
    if (!touchView) return;
    for (const t of e.changedTouches) {
      if (t.identifier === touchView.id) {
        if (touchView.moved < 15 && performance.now() - touchView.t < 400 && !state.myHP.down) {
          farm.swing = .25;
          const w = curWeapon();
          sfx(w.sfx);
          if (farm.cooldown <= 0) { farm.cooldown = w.cd; primaryAction(); }
        }
        touchView = null;
      }
    }
  }, { passive: true });

  // 长按挖矿（触屏镐子）
  farm.mineHold = null;
}
function initJoystick() {
  const joy = $('#joystick'), stick = joy.querySelector('.stick');
  let jid = null, cx = 0, cy = 0;
  const R = 55;
  joy.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    jid = t.identifier;
    const r = joy.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    if (jid === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== jid) continue;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = dx / len * R; dy = dy / len * R; }
      stick.style.transform = `translate(${dx}px,${dy}px)`;
      farm.joyVec.x = dx / R; farm.joyVec.y = dy / R;
    }
  }, { passive: true });
  const end = e => {
    if (jid === null) return;
    for (const t of e.changedTouches) if (t.identifier === jid) {
      jid = null;
      stick.style.transform = '';
      farm.joyVec.x = 0; farm.joyVec.y = 0;
    }
  };
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);
}
function doJump() {
  if (!farm.grounded || state.myHP.down) return;
  farm.velY = 8.0;
  farm.grounded = false;
  sfx('jump');
}

/* ---------- 武器 ---------- */
function selectWeapon(i) {
  const ws = weapons();
  weaponIdx = ((i % ws.length) + ws.length) % ws.length;
  farm.weapon = ws[weaponIdx].id;
  setHandItem(farm.farmer, farm.weapon === 'peck' ? 'sword' : farm.weapon);
  buildHotbar();
  const w = ws[weaponIdx];
  toast(`手持：${w.icon} ${w.name}`);
}
function cycleWeapon(d) { selectWeapon(weaponIdx + d); }

/* ---------- 攻击（屏幕中心射线） ---------- */
function primaryAction() {
  const w = curWeapon();
  if (w.mine) { tryMineOrBreakCenter(); return; }
  if (w.build) { placeBlockCenter(w.build); return; }
  if (w.id === 'gun') {
    farm.raycaster.setFromCamera(new THREE.Vector2(0, 0), farm.camera);
    farm.raycaster.far = w.range;
    spawnTracer();
    resolveHit(w, true);
    return;
  }
  if (w.id === 'bow') { shootArrow(w); return; }
  farm.raycaster.setFromCamera(new THREE.Vector2(0, 0), farm.camera);
  farm.raycaster.far = w.range + 2;
  resolveHit(w, false);
}
function collectTargets() {
  const targets = [];
  for (const c of farm.chickens) {
    if (c.userData.down) continue;
    c.traverse(o => { if (o.isMesh) { o.userData.hitRoot = c; targets.push(o); } });
  }
  for (const [id, p] of state.players) {
    if (p.info.down) continue;
    p.model.traverse(o => { if (o.isMesh) { o.userData.hitRoot = p.model; o.userData.hitId = id; o.userData.hitIsPlayer = true; targets.push(o); } });
  }
  return targets;
}
function resolveHit(w, isGun) {
  const hits = farm.raycaster.intersectObjects(collectTargets(), false);
  let root = null, pid = null, isPlayer = false;
  if (hits.length) {
    root = hits[0].object.userData.hitRoot;
    pid = hits[0].object.userData.hitId || null;
    isPlayer = !!hits[0].object.userData.hitIsPlayer;
  } else {
    // 屏幕中心 100px 容差
    const rect = farm.renderer.domElement.getBoundingClientRect();
    const wpx = rect.width, hpx = rect.height;
    let bestD = 100;
    const probe_ = (obj3d, id, yOff) => {
      _v.copy(obj3d.position); _v.y += yOff; _v.project(farm.camera);
      if (_v.z > 1) return;
      const d3 = obj3d.position.distanceTo(farm.pos);
      if (d3 > w.range) return;
      const sx = (_v.x * .5 + .5) * wpx, sy = (-_v.y * .5 + .5) * hpx;
      const d = Math.hypot(sx - wpx / 2, sy - hpx / 2);
      if (d < bestD) { bestD = d; root = obj3d; pid = id; isPlayer = !!id; }
    };
    for (const c of farm.chickens) if (!c.userData.down) probe_(c, null, .8);
    for (const [id, p] of state.players) if (!p.info.down) probe_(p.model, id, p.info.admin ? 1.5 : .8);
  }
  if (!root) return;
  const hp = root.position.clone(); hp.y += isPlayer ? 1.5 : .8;
  if (isPlayer) {
    gsend({ t: 'hit', target: 'player', id: pid, dmg: w.dmg, x: hp.x, y: hp.y, z: hp.z });
    spawnHitParticles(hp, 0xff5555);
    spawnDamageNumber(hp, w.dmg);
    sfx('hit');
  } else if (root.userData.isProbe) {
    const id = root.userData.probe.id;
    gsend({ t: 'hit', target: 'probe', id, dmg: w.dmg, x: hp.x, y: hp.y, z: hp.z });
    localProbeDamage(id, w.dmg, hp);
  } else {
    const svId = root.userData.server?.id;
    if (!svId) return;
    gsend({ t: 'hit', target: 'chicken', id: svId, dmg: w.dmg, x: hp.x, y: hp.y, z: hp.z });
    localChickenDamage(svId, w.dmg, hp);
  }
}
function localChickenDamage(svId, dmg, at) {
  const st = state.chickenHP.get(svId) || { hp: chickenMaxHP, down: false };
  if (st.down) return;
  st.hp = Math.max(0, st.hp - dmg);
  if (st.hp <= 0) st.down = true;
  state.chickenHP.set(svId, st);
  const c = farm.chickenById.get(svId);
  if (c) {
    if (c.userData.wander) c.userData.wander.fleeing = 2.5;
    c.userData.hurtT = .35;
    spawnHitParticles(at, 0xffffff);
    spawnDamageNumber(at, dmg);
    sfx('hit');
    setDown(c, st.down, st.hp);
    if (st.down) { sfx('die'); spawnDeathSmoke(c.position); }
  }
  farm.updateLabels(true);
  updateStatsPanel();
}
function localProbeDamage(id, dmg, at) {
  const st = state.probeHP.get(id) || { hp: chickenMaxHP, down: false };
  if (st.down) return;
  st.hp = Math.max(0, st.hp - dmg);
  if (st.hp <= 0) st.down = true;
  state.probeHP.set(id, st);
  const c = farm.probeById.get(id);
  if (c) {
    if (c.userData.wander) c.userData.wander.fleeing = 2.5;
    c.userData.hurtT = .35;
    spawnHitParticles(at, 0xffffff);
    spawnDamageNumber(at, dmg);
    sfx('hit');
    setDown(c, st.down, st.hp);
    if (st.down) { sfx('die'); spawnDeathSmoke(c.position); }
  }
  farm.updateLabels(true);
  updateStatsPanel();
}
function playHitFx(m) {
  const at = new THREE.Vector3(m.x || 0, m.y || 1, m.z || 0);
  spawnHitParticles(at, m.kind === 'player' ? 0xff5555 : 0xffffff);
  spawnDamageNumber(at, m.dmg);
  sfx('hit');
  if (m.kind === 'chicken') {
    const c = farm.chickenById.get(m.id);
    if (c && !c.userData.down) { if (c.userData.wander) c.userData.wander.fleeing = 2.5; c.userData.hurtT = .35; }
  } else if (m.kind === 'probe') {
    const c = farm.probeById.get(m.id);
    if (c && !c.userData.down) { if (c.userData.wander) c.userData.wander.fleeing = 2.5; c.userData.hurtT = .35; }
  }
}

/* ---------- 弓箭/曳光/粒子 ---------- */
function shootArrow(w) {
  const dir = new THREE.Vector3(0, 0, .5).unproject(farm.camera).sub(farm.camera.position).normalize();
  const arrow = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .8), matC(0x8a6b3f));
  arrow.position.copy(farm.camera.position).addScaledVector(dir, 1.2);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .15), matC(0xcccccc));
  tip.position.z = .45; arrow.add(tip);
  farm.scene.add(arrow);
  farm.arrows.push({ mesh: arrow, dir, speed: 45, life: 3, dmg: w.dmg });
}
function spawnTracer() {
  const dir = farm.raycaster.ray.direction.clone();
  const from = farm.camera.position.clone().addScaledVector(dir, 1);
  const to = from.clone().addScaledVector(dir, 60);
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: .9 }));
  farm.scene.add(line);
  farm.fx.push({ obj: line, life: .08 });
  spawnHitParticles(from, 0xffcc44, 4);
}
function spawnHitParticles(at, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, .09), new THREE.MeshBasicMaterial({ color }));
    p.position.copy(at);
    farm.scene.add(p);
    farm.fx.push({ obj: p, life: .5, vel: new THREE.Vector3((Math.random() - .5) * 4, Math.random() * 4, (Math.random() - .5) * 4) });
  }
}
function spawnDeathSmoke(at) {
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.14, .14, .14), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: .85 }));
    p.position.copy(at); p.position.y += .6;
    farm.scene.add(p);
    farm.fx.push({ obj: p, life: .9, fade: true, vel: new THREE.Vector3((Math.random() - .5) * 2.5, Math.random() * 2.5, (Math.random() - .5) * 2.5) });
  }
}
function spawnDamageNumber(at, dmg) {
  const el = document.createElement('div');
  el.className = 'dmg-num';
  el.textContent = '-' + dmg;
  $('#labels').appendChild(el);
  _v.copy(at).project(farm.camera);
  const w = farm.renderer.domElement.clientWidth, h = farm.renderer.domElement.clientHeight;
  el.style.left = ((_v.x * .5 + .5) * w) + 'px';
  el.style.top = ((-_v.y * .5 + .5) * h) + 'px';
  setTimeout(() => el.remove(), 900);
}

/* ---------- 挖矿 / 建造（屏幕中心） ---------- */
function centerRay(far) {
  farm.raycaster.setFromCamera(new THREE.Vector2(0, 0), farm.camera);
  farm.raycaster.far = far;
  return farm.raycaster;
}
function tryMineOrBreakCenter() {
  centerRay(8 + farm.dist + 4);
  const mineables = [];
  farm.scene.traverse(o => { if (o.isMesh && (o.userData.ore || o.userData.placed)) mineables.push(o); });
  const hits = farm.raycaster.intersectObjects(mineables, false);
  if (!hits.length) { toast('视野中心没有可挖的方块（对准土堆/木堆/矿脉）'); return; }
  const obj = hits[0].object;
  const type = obj.userData.ore || obj.userData.placed;
  sfx('break');
  spawnHitParticles(obj.position, type === 'stone' ? 0x999999 : type === 'wood' ? 0x8a6b3f : 0x79553a);
  if (obj.userData.placed) {
    const key = obj.userData.key;
    farm.blocks.delete(key);
    farm.scene.remove(obj);
    gsend({ t: 'block', op: 'del', x: obj.userData.bx, y: obj.userData.by, z: obj.userData.bz });
  } else {
    if (state.admin) {
      obj.visible = false;
      state.inv[type] = (state.inv[type] || 0) + 1;
      toast(`+1 ${BLOCK_NAMES[type]}（背包：${state.inv[type]}）`);
      setTimeout(() => { obj.visible = true; }, 30000);
    } else {
      toast('只能拆除玩家建造的方块', 'err');
    }
  }
}
// 准星指向的放置格（白色预览框共用）——返回 {bx,by,bz} 或 null
function computePlaceCell() {
  centerRay(farm.dist + 12);
  const ground = farm.scene.getObjectByName('ground');
  const placedMeshes = [...farm.blocks.values()].map(b => b.mesh);
  const hits = farm.raycaster.intersectObjects([ground, ...placedMeshes], false);
  if (!hits.length) return null;
  const hit = hits[0];
  if (hit.distance > 8 + farm.dist + 2) return null;
  const n = hit.face.normal.clone();
  const p = hit.point.clone().addScaledVector(n, .5);
  const bx = Math.round(p.x), by = Math.max(0, Math.round(p.y - .5)), bz = Math.round(p.z);
  if (Math.abs(bx) > WORLD / 2 - 2 || Math.abs(bz) > WORLD / 2 - 2 || by > 20) return null;
  return { bx, by, bz };
}
function placeBlockCenter(type) {
  if (state.admin) {
    if ((state.inv[type] || 0) <= 0) { toast(`没有${BLOCK_NAMES[type]}，用镐子左键挖`, 'err'); return; }
  } else {
    if (state.materials <= 0) { toast('建造材料不足，明天添加一个探针可获得 +100', 'err'); return; }
  }
  const cell = computePlaceCell();
  if (!cell) return;
  const { bx, by, bz } = cell;
  const key = `${bx},${by},${bz}`;
  if (farm.blocks.has(key)) return;
  // 不能放在自己站着的格子里（精确按格判断，允许贴着身前建造）
  const myCellX = Math.round(farm.pos.x), myCellZ = Math.round(farm.pos.z);
  const myCellY = Math.floor(farm.pos.y);
  if (bx === myCellX && bz === myCellZ && by >= myCellY && by <= myCellY + 1) { toast('不能放在自己脚下'); return; }
  if (state.admin) state.inv[type]--;
  else { state.materials = Math.max(0, state.materials - 1); updateStatsPanel(); }
  addBlockMesh(key, bx, by, bz, type);
  gsend({ t: 'block', op: 'add', x: bx, y: by, z: bz, type });
  sfx('place');
  updateHud();
}
function addBlockMesh(key, x, y, z, type) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), BLOCK_MATS[type] || BLOCK_MATS.dirt);
  mesh.position.set(x, y + .5, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.placed = type;
  mesh.userData.key = key;
  mesh.userData.bx = x; mesh.userData.by = y; mesh.userData.bz = z;
  farm.scene.add(mesh);
  farm.blocks.set(key, { mesh, type });
}
function applyRemoteBlock(key, val, fromWS) {
  if (val === '-') {
    const b = farm.blocks.get(key);
    if (b) { farm.scene.remove(b.mesh); farm.blocks.delete(key); if (fromWS) sfx('break'); }
    return;
  }
  if (farm.blocks.has(key)) return;
  const parts = key.split(',').map(Number);
  addBlockMesh(key, parts[0], parts[1], parts[2], val);
  if (fromWS) sfx('place');
}

/* ---------- F 交互：倒地鸡（管理员；探针鸡不需要 F 查看） ---------- */
function interactNear() {
  if (!$('#terminal').classList.contains('hidden') || !$('#modal').classList.contains('hidden')) return;
  if (!state.admin) return;
  let best = null, bd = 4.5;
  for (const c of farm.chickens) {
    if (c.userData.isProbe) continue;
    const d = c.position.distanceTo(farm.pos);
    if (d >= bd) continue;
    if (c.userData.down) { best = c; bd = d; }
  }
  if (!best) return;
  openChickenMenu(best);
}
function openChickenMenu(c) {
  const s = c.userData.server;
  if (!state.admin) {
    toast('击倒了鸡！管理身份才能交互，请点右上角「管理登录」');
    return;
  }
  exitPointerLock();
  openModal(`
    <button class="modal-close">×</button>
    <h2>🐔 ${esc(s.name)} <span class="tag bad">已击倒</span></h2>
    <div class="notice">${esc(s.region || '未分组')}${s.host ? ' · ' + esc(s.user + '@' + s.host + ':' + s.port) : ''} · 10 秒未交互将自动复活</div>
    <div class="modal-actions" style="justify-content:space-between">
      <button class="mc-btn" id="ckRevive">❤ 复活这只鸡</button>
      <div style="display:flex;gap:8px">
        <button class="mc-btn" id="ckTerm">🖥️ 进入终端</button>
      </div>
    </div>`);
  $('#ckRevive').onclick = () => { reviveChicken(s.id); closeModal(); };
  $('#ckTerm').onclick = () => { closeModal(); termOpen(s); };
}
function reviveChicken(id) {
  gsend({ t: 'revive', id });
  state.chickenHP.set(id, { hp: chickenMaxHP, down: false });
  const c = farm.chickenById.get(id);
  if (c) {
    c.position.set(
      Math.max(-FENCE + 2, Math.min(FENCE - 2, farm.pos.x + (Math.random() - .5) * 2)),
      0,
      Math.max(-FENCE + 2, Math.min(FENCE - 2, farm.pos.z + (Math.random() - .5) * 2 - 2)));
    setDown(c, false, chickenMaxHP);
    sfx('pop');
    spawnHitParticles(c.position.clone().setY(1), 0x55ff55, 14);
  }
  farm.updateLabels(true);
  updateStatsPanel();
}
function setMyDown(down) {
  const av = myAvatar();
  if (!av) return;
  av.userData.down = down;
  if (down) { av.rotation.z = Math.PI / 2; av.position.y = .35; }
  else { av.rotation.z = 0; }
  if (farm.myChicken && !down) farm.myChicken.position.copy(farm.pos);
}

/* ---------- 探针卡片 ---------- */
function openProbeCard(pr) {
  if (!pr) return;
  exitPointerLock();
  const fresh = state.probes.find(x => x.id === pr.id) || pr;
  if (fresh.locked) {
    openModal(`
      <button class="modal-close">×</button>
      <h2>📡 ${esc(fresh.name || fresh.hostname || '探针')} <span class="tag">🔒 密码保护</span></h2>
      <p class="confirm-msg">这只探针鸡需要查看密码才能显示状态（也可以在右上角「管理登录」里输入）。</p>
      <div class="field"><label>查看密码</label><input id="pbPass" type="password"></div>
      <div id="pbErr" class="mc-err hidden"></div>
      <div class="modal-actions"><button class="mc-btn" id="pbOk">解锁</button></div>`);
    attachPwToggle('#pbPass');
    $('#pbPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pbOk').click(); });
    $('#pbOk').onclick = async () => {
      try {
        const r = await fetch('api/probe/unlock?id=' + encodeURIComponent(fresh.id) + '&pa' + 'ss=' + encodeURIComponent($('#pbPass').value), { credentials: 'same-origin' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || '解锁失败');
        await fetchProbesNow();
        const p2 = state.probes.find(x => x.id === fresh.id);
        closeModal();
        openProbeCard(p2 || fresh);
      } catch (e) { const el = $('#pbErr'); el.textContent = e.message; el.classList.remove('hidden'); }
    };
    return;
  }
  const cpu = Math.round(fresh.cpu || 0);
  const memPct = fresh.memTotal ? Math.round(fresh.memUsed / fresh.memTotal * 100) : 0;
  const diskPct = fresh.diskTotal ? Math.round(fresh.diskUsed / fresh.diskTotal * 100) : 0;
  openModal(`
    <button class="modal-close">×</button>
    <h2>📡 ${esc(fresh.name || fresh.hostname || '探针')} <span class="tag ${fresh.online ? 'ok' : 'bad'}">${fresh.online ? '在线' : '离线'}</span></h2>
    ${fresh.hostname ? `<div class="notice" style="margin-top:0">主机：${esc(fresh.hostname)} · ${esc(fresh.os || '')} · IP：${esc(fresh.ip || '?')} ${flagHTML(fresh.cc)}</div>` : ''}
    <div class="probe-stats">
      <div class="pstat"><label>CPU</label><div class="pbar"><i style="width:${cpu}%"></i></div><b>${cpu}%</b></div>
      <div class="pstat"><label>内存</label><div class="pbar"><i style="width:${memPct}%"></i></div><b>${fmtKB(fresh.memUsed)} / ${fmtKB(fresh.memTotal)} (${memPct}%)</b></div>
      <div class="pstat"><label>硬盘</label><div class="pbar"><i style="width:${diskPct}%"></i></div><b>${fmtKB(fresh.diskUsed)} / ${fmtKB(fresh.diskTotal)} (${diskPct}%)</b></div>
      <div class="pstat"><label>网速</label><div class="pnet"><span>↓ ${fmtRate(fresh.rxRate)}</span><span>↑ ${fmtRate(fresh.txRate)}</span></div></div>
    </div>
    <div class="notice">探针只有统计功能，没有 SSH 能力。任何人都可以在右上角「📡 加入」部署自己的探针。</div>
    <div class="modal-actions"><button class="mc-btn" id="pbClose">关闭</button></div>`);
  $('#pbClose').onclick = closeModal;
}

/* ---------- 加入（公开，任何人） ---------- */
$('#joinBtn').onclick = openJoinModal;
async function openJoinModal() {
  exitPointerLock();
  openModal(`
    <button class="modal-close">×</button>
    <h2>📡 部署公开探针</h2>
    <p class="confirm-msg">任何人都可以部署！生成一键安装命令，在任意 Linux 服务器执行后，农场里会多一只探针鸡，头顶实时显示状态。探针只有统计功能，没有 SSH 权限。</p>
    <div class="field"><label>备注名（可选，默认用主机名）</label><input id="pjName" type="text" placeholder="如 日本探针"></div>
    <div class="field"><label>可见性</label>
      <select id="pjPublic">
        <option value="1">完全公开 — 所有人可见</option>
        <option value="0">密码查看 — 仅知道密码的人可见</option>
      </select>
    </div>
    <div class="field hidden" id="pjPassBox"><label>查看密码（≥4 位）</label><input id="pjPass" type="text" placeholder="查看此鸡状态的密码"></div>
    <div class="field"><label style="display:flex;gap:8px;align-items:center;cursor:pointer">
      <input type="checkbox" id="pjMask" checked> IP 第三段掩码（如 1.2.xxx.4，对非管理员生效）
    </label></div>
    <div class="modal-actions"><button class="mc-btn" id="pjGen">生成安装命令</button></div>`);
  $('#pjPublic').onchange = () => $('#pjPassBox').classList.toggle('hidden', $('#pjPublic').value === '1');
  $('#pjGen').onclick = async () => {
    const isPub = $('#pjPublic').value === '1';
    const pass = $('#pjPass').value;
    if (!isPub && pass.length < 4) return toast('查看密码至少 4 位', 'err');
    try {
      const r = await api('api/probe/join', { method: 'POST', body: {
        public: isPub, viewPass: isPub ? '' : pass, maskIP: $('#pjMask').checked, name: $('#pjName').value.trim(),
      }});
      openModal(`
        <button class="modal-close">×</button>
        <h2>📡 一键安装探针</h2>
        <p class="confirm-msg">在目标服务器上以 root/sudo 执行：</p>
        <div class="copybox" id="pjCmd">${esc(r.install)}</div>
        <button class="mc-btn sm" id="pjCopy">📋 复制安装命令</button>
        <p class="confirm-msg" style="margin-top:16px">卸载（随时在目标机执行）：</p>
        <div class="copybox" id="pjRm">${esc(r.uninstall)}</div>
        <button class="mc-btn sm" id="pjCopy2">📋 复制卸载命令</button>
        <div class="notice">安装后 10 秒内农场会出现这只探针鸡。agent 是 systemd 服务 sshweb-probe，每 5 秒上报一次，纯 bash 无二进制依赖。</div>
        <div class="modal-actions"><button class="mc-btn" id="pjDone">完成</button></div>`);
      const copy = sel => { navigator.clipboard.writeText($(sel).textContent).then(() => toast('已复制')); };
      $('#pjCopy').onclick = () => copy('#pjCmd');
      $('#pjCopy2').onclick = () => copy('#pjRm');
      $('#pjDone').onclick = () => { closeModal(); pollProbesOnce(); };
    } catch (e) { toast(e.message, 'err'); }
  };
}
async function pollProbesOnce() { await fetchProbesNow(); if (farm.inited) syncProbeChickens(); farm.updateLabels(true); }

/* ---------- 主循环 ---------- */
const _v = new THREE.Vector3();
const shortestAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
function tick() {
  const dt = Math.min(farm.clock.getDelta(), .05);
  const t = farm.clock.elapsedTime;
  if (farm.cooldown > 0) farm.cooldown -= dt;
  const myDown = state.myHP.down;

  const k = farm.keys;
  let mx = farm.joyVec.x, mz = farm.joyVec.y;
  if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
  const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
  const speed = sprint ? 9 : 5;
  const moving = !myDown && (Math.abs(mx) > .1 || Math.abs(mz) > .1);
  if (moving) {
    const f = { x: -Math.sin(farm.yaw), z: -Math.cos(farm.yaw) };
    const r = { x: -f.z, z: f.x };
    let dirX = f.x * -mz + r.x * mx;
    let dirZ = f.z * -mz + r.z * mx;
    const dl = Math.hypot(dirX, dirZ) || 1;
    dirX /= dl; dirZ /= dl;
    farm.pos.x = Math.max(-WORLD / 2 + 2, Math.min(WORLD / 2 - 2, farm.pos.x + dirX * speed * dt));
    farm.pos.z = Math.max(-WORLD / 2 + 2, Math.min(WORLD / 2 - 2, farm.pos.z + dirZ * speed * dt));
    farm.walkT += dt * (sprint ? 13 : 9);
    const targetRot = Math.atan2(dirX, dirZ);
    farm.farmer.rotation.y += shortestAngle(targetRot - farm.farmer.rotation.y) * Math.min(1, dt * 10);
  }
  resolveCollisions();

  // 跳跃/重力
  const prevY = farm.pos.y;
  farm.velY -= 20 * dt;
  farm.pos.y += farm.velY * dt;
  farm.grounded = false;
  if (farm.pos.y <= 0) { farm.pos.y = 0; farm.velY = 0; farm.grounded = true; }
  // 落在玩家方块上
  for (const b of farm.blocks.values()) {
    const bp = b.mesh.position;
    if (Math.abs(bp.x - farm.pos.x) < .8 && Math.abs(bp.z - farm.pos.z) < .8) {
      const top = bp.y + .5;
      if (prevY >= top - .15 && farm.pos.y < top && farm.velY <= 0) {
        farm.pos.y = top; farm.velY = 0; farm.grounded = true;
      }
    }
  }
  // 落在静态建筑上（石墙/围栏/谷仓顶面）；上升时也允许穿过顶面
  if (!farm.grounded) {
    const R = .62;
    for (const col of farm.colliders) {
      if (col.top <= 0) continue;
      if (Math.abs(farm.pos.x - col.x) > col.hx + R || Math.abs(farm.pos.z - col.z) > col.hz + R) continue;
      // 下落且脚从顶面上方穿过 → 落在顶上
      if (farm.velY <= 0 && prevY >= col.top - .05 && farm.pos.y < col.top) {
        farm.pos.y = col.top; farm.velY = 0; farm.grounded = true;
        break;
      }
      // 身体在顶面高度以下且水平嵌入 → 顶起（宽容判定，避免卡进墙里）
      if (farm.pos.y < col.top - .05 && farm.pos.y > col.top - 1.1 && prevY >= col.top - .3) {
        farm.pos.y = col.top; farm.velY = Math.max(0, farm.velY); farm.grounded = true;
        break;
      }
    }
  }
  // 动画
  const ud = farm.farmer.userData;
  const sw = moving ? Math.sin(farm.walkT) * .8 : 0;
  ud.armL.rotation.x = sw; ud.legR.rotation.x = sw;
  ud.armR.rotation.x = -sw; ud.legL.rotation.x = -sw;
  if (farm.swing > 0) {
    farm.swing -= dt;
    ud.armR.rotation.x = -2.4 * Math.max(0, farm.swing / .25);
  }
  farm.farmer.position.copy(farm.pos);
  if (myDown) farm.farmer.rotation.z = Math.PI / 2;
  else farm.farmer.rotation.z = 0;
  if (farm.myChicken) {
    farm.myChicken.visible = false;
    farm.myChicken.position.copy(farm.pos);
    if (!myDown) farm.myChicken.position.y = farm.pos.y;
    farm.myChicken.rotation.y = farm.farmer.rotation.y;
    const cu = farm.myChicken.userData;
    if (!farm.grounded) {
      // 空中扇翅膀！
      cu.wingL.rotation.z = Math.sin(t * 28) * 1.1 + .3;
      cu.wingR.rotation.z = -cu.wingL.rotation.z;
      cu.legL.rotation.x = .4; cu.legR.rotation.x = .4;
    } else if (moving) {
      cu.wob += dt * (sprint ? 20 : 13);
      cu.legL.rotation.x = Math.sin(cu.wob) * .7;
      cu.legR.rotation.x = -Math.sin(cu.wob) * .7;
      cu.wingL.rotation.z = sprint ? Math.sin(t * 22) * .4 : Math.sin(cu.wob * .7) * .1;
      cu.wingR.rotation.z = -cu.wingL.rotation.z;
    } else {
      cu.wingL.rotation.z *= .9; cu.wingR.rotation.z *= .9;
      cu.legL.rotation.x *= .8; cu.legR.rotation.x *= .8;
    }
    if (myDown) { farm.myChicken.rotation.z = Math.PI / 2; }
  }

  // 白色放置预览框
  const cw2 = curWeapon();
  if (farm.ghost) {
    if (cw2.build && !myDown && $('#modal').classList.contains('hidden') && $('#terminal').classList.contains('hidden')) {
      const cell = computePlaceCell();
      const cellOK = cell && !farm.blocks.has(`${cell.bx},${cell.by},${cell.bz}`) &&
        !(cell.bx === Math.round(farm.pos.x) && cell.bz === Math.round(farm.pos.z) &&
          cell.by >= Math.floor(farm.pos.y) && cell.by <= Math.floor(farm.pos.y) + 1);
      if (cellOK) {
        farm.ghost.visible = true;
        farm.ghost.position.set(cell.bx, cell.by + .5, cell.bz);
      } else farm.ghost.visible = false;
    } else farm.ghost.visible = false;
  }

  // 长按挖矿（触屏）
  if (farm.mineHold) {
    farm.mineHold.t += dt;
    if (farm.mineHold.t > .5 && farm.cooldown <= 0) {
      farm.mineHold.t = .15;
      tryMineOrBreakCenter();
    }
  }

  // 位置广播 10Hz
  const now = performance.now();
  if (now - lastSentPos > 100) {
    lastSentPos = now;
    gsend({ t: 'pos', x: +farm.pos.x.toFixed(2), z: +farm.pos.z.toFixed(2), ry: +farm.farmer.rotation.y.toFixed(2), mv: moving ? 1 : 0 });
  }

  // 远程玩家插值
  for (const [, p] of state.players) {
    const m = p.model;
    m.position.x += (p.tx - m.position.x) * Math.min(1, dt * 8);
    m.position.z += (p.tz - m.position.z) * Math.min(1, dt * 8);
    m.rotation.y += shortestAngle((p.try_ || 0) - m.rotation.y) * Math.min(1, dt * 8);
    if (p.info.down) { m.rotation.z = Math.PI / 2; continue; }
    m.rotation.z = 0;
    if (p.moving) {
      p.wt = (p.wt || 0) + dt * 10;
      const u2 = m.userData;
      if (false) {
        u2.legL.rotation.x = Math.sin(p.wt) * .7; u2.legR.rotation.x = -Math.sin(p.wt) * .7;
        u2.wingL.rotation.z = Math.sin(p.wt * .7) * .12; u2.wingR.rotation.z = -u2.wingL.rotation.z;
      } else if (u2.isPlayer) {
        u2.armL.rotation.x = Math.sin(p.wt) * .8; u2.legR.rotation.x = Math.sin(p.wt) * .8;
        u2.armR.rotation.x = -Math.sin(p.wt) * .8; u2.legL.rotation.x = -Math.sin(p.wt) * .8;
      }
    }
  }

  // 鸡 AI
  for (const c of farm.chickens) {
    if (c.userData.down) continue;
    const w = c.userData.wander;
    if (!w) continue;
    if (w.fleeing > 0) w.fleeing -= dt;
    w.timer -= dt;
    if (w.timer <= 0) { w.dir = Math.random() * Math.PI * 2; w.timer = 2 + Math.random() * 4; w.stop = Math.random() < .3; }
    const toFarmer = _v.copy(farm.pos).sub(c.position);
    const dFar = toFarmer.length();
    let spd = w.stop && w.fleeing <= 0 ? 0 : w.speed;
    let dir = w.dir;
    if (!myDown && (dFar < 3 || w.fleeing > 0)) {
      dir = Math.atan2(-toFarmer.x, -toFarmer.z);
      spd = w.fleeing > 0 ? 4.2 : 2.6;
      w.stop = false;
    }
    for (const [, p] of state.players) {
      const d2 = p.model.position.distanceTo(c.position);
      if (d2 < 2.5) {
        dir = Math.atan2(c.position.x - p.model.position.x, c.position.z - p.model.position.z);
        spd = Math.max(spd, 3);
      }
    }
    if (spd > 0) {
      c.position.x += Math.sin(dir) * spd * dt;
      c.position.z += Math.cos(dir) * spd * dt;
      c.rotation.y += shortestAngle(dir - c.rotation.y) * Math.min(1, dt * 8);
      c.userData.wob += dt * (spd > 3 ? 20 : 12);
      const cu = c.userData;
      cu.legL.rotation.x = Math.sin(cu.wob) * .7;
      cu.legR.rotation.x = -Math.sin(cu.wob) * .7;
      cu.wingL.rotation.z = w.fleeing > 0 ? Math.sin(t * 30) * .9 + .4 : Math.sin(cu.wob * .7) * .12;
      cu.wingR.rotation.z = -cu.wingL.rotation.z;
      cu.head.position.y = 1.08 + Math.abs(Math.sin(cu.wob)) * .05;
    }
    c.position.x = Math.max(-FENCE + 1.5, Math.min(FENCE - 1.5, c.position.x));
    c.position.z = Math.max(-FENCE + 1.5, Math.min(FENCE - 1.5, c.position.z));
    // 贴合建筑顶面行走；遇到 2 格以上的墙就掉头
    if (!c.userData.down) {
      const gy = groundYAt(c.position.x, c.position.z);
      if (gy - c.position.y > 1.05) {
        w.dir = Math.random() * Math.PI * 2;
        c.position.x -= Math.sin(dir) * spd * dt * 2;
        c.position.z -= Math.cos(dir) * spd * dt * 2;
      }
      c.position.y += (groundYAt(c.position.x, c.position.z) - c.position.y) * Math.min(1, dt * 6);
    }
    if (c.userData.hurtT > 0) {
      c.userData.hurtT -= dt;
      const f = Math.max(0, c.userData.hurtT / .35);
      c.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(f, 0, 0); });
    }
  }

  // 箭矢
  for (let i = farm.arrows.length - 1; i >= 0; i--) {
    const a = farm.arrows[i];
    a.life -= dt;
    a.mesh.position.addScaledVector(a.dir, a.speed * dt);
    a.mesh.lookAt(a.mesh.position.clone().add(a.dir));
    let done = a.life <= 0 || a.mesh.position.y < 0;
    if (!done) {
      for (const c of farm.chickens) {
        if (c.userData.down) continue;
        if (a.mesh.position.distanceTo(c.position.clone().setY(.8)) < .9) {
          if (c.userData.isProbe) {
            gsend({ t: 'hit', target: 'probe', id: c.userData.probe.id, dmg: a.dmg, x: a.mesh.position.x, y: a.mesh.position.y + .3, z: a.mesh.position.z });
            localProbeDamage(c.userData.probe.id, a.dmg, a.mesh.position.clone());
          } else {
            const svId = c.userData.server?.id;
            if (svId) {
              gsend({ t: 'hit', target: 'chicken', id: svId, dmg: a.dmg, x: a.mesh.position.x, y: a.mesh.position.y + .3, z: a.mesh.position.z });
              localChickenDamage(svId, a.dmg, a.mesh.position.clone());
            }
          }
          done = true; break;
        }
      }
      if (!done) for (const [id, p] of state.players) {
        if (p.info.down) continue;
        if (a.mesh.position.distanceTo(p.model.position.clone().setY(1.2)) < 1.1) {
          gsend({ t: 'hit', target: 'player', id, dmg: a.dmg, x: a.mesh.position.x, y: a.mesh.position.y, z: a.mesh.position.z });
          spawnHitParticles(a.mesh.position, 0xff5555); sfx('hit');
          done = true; break;
        }
      }
    }
    if (done) { farm.scene.remove(a.mesh); farm.arrows.splice(i, 1); }
  }

  // 特效
  for (let i = farm.fx.length - 1; i >= 0; i--) {
    const f = farm.fx[i];
    f.life -= dt;
    if (f.vel) { f.obj.position.addScaledVector(f.vel, dt); f.vel.y -= 9 * dt; }
    if (f.fade && f.obj.material) f.obj.material.opacity = Math.max(0, f.life);
    if (f.life <= 0) { farm.scene.remove(f.obj); farm.fx.splice(i, 1); }
  }

  // 云
  farm.scene.traverse(o => {
    if (o.name === 'cloud') {
      o.position.x += o.userData.drift * dt;
      if (o.position.x > 90) o.position.x = -90;
    }
  });

  // 相机：第三人称跟随（pitch 可为负 → 仰视：相机降到最低点后抬高注视点）
  const minCamY = farm.pos.y + .6;
  const cyRaw = farm.pos.y + 2 + farm.dist * Math.sin(farm.pitch);
  const cy = Math.max(minCamY, cyRaw);
  const hd = farm.dist * Math.cos(farm.pitch);
  farm.camera.position.set(
    farm.pos.x + Math.sin(farm.yaw) * hd,
    cy,
    farm.pos.z + Math.cos(farm.yaw) * hd
  );
  // 相机被地面托住时，把差值补偿到注视点高度 → 视线向上抬
  farm.camera.lookAt(farm.pos.x, farm.pos.y + 1.4 + Math.max(0, minCamY - cyRaw), farm.pos.z);

  // 受击红闪
  const cv = farm.renderer.domElement;
  if (farm.hurtTime > 0) {
    farm.hurtTime -= dt;
    cv.style.filter = `saturate(1.5) brightness(${1 + farm.hurtTime}) sepia(.3) hue-rotate(-18deg)`;
  } else if (cv.style.filter) cv.style.filter = '';

  farm.renderer.render(farm.scene, farm.camera);
  updateLabelPositions();
  updateFPrompt();
}

function resolveCollisions() {
  const R = .45;
  const py = farm.pos.y;
  const check = (col) => {
    if (py >= col.top - .05) return;
    const dx = farm.pos.x - col.x, dz = farm.pos.z - col.z;
    const ox = col.hx + R - Math.abs(dx), oz = col.hz + R - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) farm.pos.x += (dx > 0 ? ox : -ox);
      else farm.pos.z += (dz > 0 ? oz : -oz);
    }
  };
  for (const col of farm.colliders) {
    if (Math.abs(farm.pos.x - col.x) > col.hx + 2 || Math.abs(farm.pos.z - col.z) > col.hz + 2) continue;
    check(col);
  }
  for (const b of farm.blocks.values()) {
    const bp = b.mesh.position;
    if (Math.abs(bp.x - farm.pos.x) > 2 || Math.abs(bp.z - farm.pos.z) > 2) continue;
    check({ x: bp.x, z: bp.z, hx: .5, hz: .5, top: bp.y + .5 });
  }
  for (const c of farm.chickens) {
    if (c.userData.down) continue;
    const dx = c.position.x - farm.pos.x, dz = c.position.z - farm.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < .42 * .42 && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (.42 - d);
      c.position.x += (dx / d) * push;
      c.position.z += (dz / d) * push;
    }
  }
}

function updateLabelPositions() {
  if (!farm.camera) return;
  const w = farm.renderer.domElement.clientWidth, h = farm.renderer.domElement.clientHeight;
  const proj = (pos3, yOff, el) => {
    _v.copy(pos3); _v.y += yOff; _v.project(farm.camera);
    if (_v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = ((_v.x * .5 + .5) * w) + 'px';
    el.style.top = ((-_v.y * .5 + .5) * h) + 'px';
  };
  for (const s of state.servers) {
    const el = farm.labelEls.get(s.id), c = farm.chickenById.get(s.id);
    if (el && c) proj(c.position, c.userData.down ? 1.0 : 1.9, el);
  }
  for (const pr of state.probes) {
    const el = farm.labelEls.get('probe:' + pr.id), c = farm.probeById.get(pr.id);
    if (el && c) proj(c.position, c.userData.down ? 1.0 : 2.0, el);
  }
  for (const [, p] of state.players) {
    if (p.labelEl) proj(p.model.position, 3.1, p.labelEl);
  }
  // 我自己的标签
  const me = myAvatar();
  if (me) {
    const el = myLabelEl();
    proj(me.position, 3.1, el);
  }
}

// F 提示
let _fThrottle = 0;
function updateFPrompt() {
  const now = performance.now();
  if (now - _fThrottle < 150) return;
  _fThrottle = now;
  const fbtn = $('#fPrompt');
  if (!$('#terminal').classList.contains('hidden') || state.myHP.down) { fbtn.classList.add('hidden'); return; }
  let near = null, nd = 4.5;
  for (const c of farm.chickens) {
    const d = c.position.distanceTo(farm.pos);
    if (d >= nd) continue;
    if (c.userData.isProbe) continue; // 探针鸡头顶已有信息，不再需要 F 查看
    if (c.userData.down && state.admin) { near = c; nd = d; }
  }
  fbtn.classList.toggle('hidden', !near);
  if (near) fbtn.textContent = `按 F 交互 · ${near.userData.server?.name || '鸡'}`;
}
function onResize() {
  const host = $('#farmHost');
  farm.camera.aspect = host.clientWidth / host.clientHeight;
  farm.camera.updateProjectionMatrix();
  farm.renderer.setSize(host.clientWidth, host.clientHeight);
}

/* ================= HUD ================= */
function buildHotbar() {
  const hb = $('#hotbar');
  const ws = weapons();
  hb.innerHTML = ws.map((w, i) => `
    <button class="slot ${i === weaponIdx ? 'sel' : ''}" data-w="${i}" title="${w.name}${w.range > 10 ? ' · 远程' : ' · 近战'}${w.mine ? ' · 左键挖矿' : ''}${w.build ? ' · 放置方块' : ''}">
      <span class="num">${i + 1}</span><span class="emoji">${w.icon}</span><span class="nm">${w.name}</span>
    </button>`).join('');
  hb.querySelectorAll('.slot').forEach(b => b.onclick = () => selectWeapon(parseInt(b.dataset.w, 10)));
}
function updateHud() {
  $('#adminBtn').textContent = state.admin ? '☰ 管理 (E)' : '🔑 登录';
  $('#logoutBtn').style.display = state.admin ? '' : 'none';
  $('#renameBtn').style.display = state.admin ? 'none' : '';
  updateStatsPanel();
}

/* ================= 终端（仅管理员） ================= */
const term = { term: null, ws: null, fit: null, serverId: null, search: null, send: null };
const QUICK_CMDS = [
  ['', '常用命令…'],
  ['htop', 'htop 进程监控'], ['df -h', '磁盘占用'], ['free -h', '内存使用'],
  ['uptime', '系统负载'], ['ss -tlnp', '监听端口'],
  ['systemctl status sshd', 'sshd 状态'], ['journalctl -xe --no-pager -n 50', '最近日志'],
  ['tail -f /var/log/syslog', '跟踪 syslog'], ['ps aux --sort=-%cpu | head', 'CPU 排行'],
  ['last -n 20', '登录记录'], ['whoami; hostname; ip a', '快速自检'],
];
function xtermTheme() {
  return {
    background: '#101113', foreground: '#e8e8ea',
    cursor: '#3ecf8e', cursorAccent: '#101113',
    selectionBackground: 'rgba(62,207,142,.28)',
    black: '#3a3b40', red: '#e06c75', green: '#3ecf8e', yellow: '#d9bc85',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#dcdce0',
    brightBlack: '#6b6d76', brightRed: '#ff7b84', brightGreen: '#5fe6a8', brightYellow: '#ffd98a',
    brightBlue: '#7cc3ff', brightMagenta: '#d996ee', brightCyan: '#6fd3e0', brightWhite: '#ffffff',
  };
}
async function termOpen(s) {
  if (!state.admin) { openLoginModal(); return; }
  if (term.ws) termClose(true);
  exitPointerLock();
  $('#terminal').classList.remove('hidden');
  $('#termName').textContent = s.name;
  $('#termAddr').textContent = `${s.user}@${s.host}:${s.port}`;
  $('#termDot').className = 'status-dot';

  const hostEl = $('#termHost');
  hostEl.innerHTML = '';
  const t = new Terminal({
    fontSize: 14,
    fontFamily: '"JetBrains Mono","SF Mono","Cascadia Code",Consolas,"Noto Sans Mono CJK SC",monospace',
    theme: xtermTheme(), scrollback: 8000, allowProposedApi: true, cursorBlink: true,
    macOptionIsMeta: true, rightClickSelectsWord: true,
  });
  const fit = new FitAddon.FitAddon();
  t.loadAddon(fit);
  const search = new SearchAddon.SearchAddon();
  t.loadAddon(search);
  t.open(hostEl);
  term.term = t; term.fit = fit; term.search = search; term.serverId = s.id;
  requestAnimationFrame(() => { fit.fit(); t.focus(); });

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?server=${encodeURIComponent(s.id)}`);
  ws.binaryType = 'arraybuffer';
  term.ws = ws;
  const send = (kind, payload) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const body = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    const msg = new Uint8Array(body.length + 1);
    msg[0] = kind; msg.set(body, 1);
    ws.send(msg);
  };
  term.send = send;
  ws.onopen = () => { $('#termDot').className = 'status-dot ok'; pushResize(); };
  ws.onclose = () => {
    $('#termDot').className = 'status-dot bad';
    if (term.term) term.term.write('\r\n\x1b[90m[连接已断开，点重连或关闭]\x1b[0m\r\n');
  };
  ws.onerror = () => { $('#termDot').className = 'status-dot bad'; };
  ws.onmessage = ev => {
    const u8 = new Uint8Array(ev.data);
    if (!u8.length) return;
    const kind = u8[0], body = u8.subarray(1);
    if ((kind === 2 || kind === 4) && term.term) term.term.write(body);
  };
  t.onData(d => send(1, d));
  t.attachCustomKeyEventHandler(ev => {
    if (ev.type !== 'keydown') return true;
    if (ev.ctrlKey && ev.altKey) {
      const k2 = ev.key.toLowerCase();
      const map = { c: termCopy, v: termPaste, r: termReconnect, l: termClearBuf, s: termFindPrompt, d: () => termCloseWithRevive() };
      if (map[k2]) { ev.preventDefault(); map[k2](); return false; }
      return false;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); termCloseWithRevive(); return false; }
    return true;
  });
  const qc = $('#quickCmd');
  qc.innerHTML = QUICK_CMDS.map(([cmd, label]) => `<option value="${esc(cmd)}">${esc(label)}</option>`).join('');
  qc.value = '';
  qc.onchange = () => { if (!qc.value) return; send(1, qc.value + '\n'); qc.value = ''; t.focus(); };
  window.addEventListener('resize', termFitNow);
}
function pushResize() {
  if (!term.fit || !term.term || !term.ws || term.ws.readyState !== WebSocket.OPEN) return;
  term.fit.fit();
  const { cols, rows } = term.term;
  term.send(3, JSON.stringify({ cols, rows }));
}
function termFitNow() { if (!$('#terminal').classList.contains('hidden')) pushResize(); }
function termClose(silent) {
  window.removeEventListener('resize', termFitNow);
  if (term.ws) { try { term.ws.close(); } catch (e) {} }
  if (term.term) { try { term.term.dispose(); } catch (e) {} }
  term.ws = null; term.term = null; term.fit = null; term.search = null; term.serverId = null;
  $('#terminal').classList.add('hidden');
  if (!silent) farm.keys.clear();
}
function termCloseWithRevive() {
  const id = term.serverId;
  termClose();
  if (id) {
    reviveChicken(id);
    toast('鸡已原地满血复活');
  }
}
$('#termClose').onclick = termCloseWithRevive;
$('#termReconnect').onclick = termReconnect;
function termReconnect() { const s = state.servers.find(x => x.id === term.serverId); if (s) termOpen(s); else toast('服务器已不存在', 'err'); }
async function termCopy() {
  const sel = term.term && term.term.getSelection();
  if (!sel) return toast('没有选中文本');
  try { await navigator.clipboard.writeText(sel); toast('已复制选区'); }
  catch (e) { legacyCopy(sel); }
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('已复制选区'); } catch (e) { toast('复制失败', 'err'); }
  ta.remove();
}
async function termPaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && term.send) { term.send(1, text); term.term.focus(); }
  } catch (e) { toast('浏览器未授权剪贴板，用 Ctrl+Shift+V', 'err'); }
}
function termClearBuf() { if (term.term) { term.term.clear(); term.term.focus(); } }
function termFindPrompt() {
  const q = window.prompt('在终端输出中查找：');
  if (q && term.search) term.search.findNext(q);
}
$('#termCopy').onclick = termCopy;
$('#termPaste').onclick = termPaste;
$('#termClear').onclick = termClearBuf;

/* ================= 弹层 ================= */
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
function openModal(html) {
  $('#modal').innerHTML = `<div class="modal-box">${html}</div>`;
  $('#modal').classList.remove('hidden');
  const c = $('#modal').querySelector('.modal-close');
  if (c) c.onclick = closeModal;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden') && $('#terminal').classList.contains('hidden')) closeModal();
});
function uiConfirm(message, { title = '确认操作', okText = '确定', danger = false } = {}) {
  return new Promise(resolve => {
    openModal(`
      <button class="modal-close">×</button>
      <h2>${esc(title)}</h2>
      <p class="confirm-msg">${esc(message).replace(/\n/g, '<br>')}</p>
      <div class="modal-actions">
        <button class="mc-btn" data-r="0">取消</button>
        <button class="mc-btn ${danger ? 'danger' : ''}" data-r="1">${esc(okText)}</button>
      </div>`);
    $('#modal').querySelectorAll('[data-r]').forEach(b => {
      b.onclick = () => { const v = b.dataset.r === '1'; closeModal(); resolve(v); };
    });
    $('#modal').querySelector('.modal-close').onclick = () => { closeModal(); resolve(false); };
  });
}
function attachPwToggle(sel) {
  const inp = $(sel);
  if (!inp || inp.dataset.eye) return;
  inp.dataset.eye = '1';
  const wrap = document.createElement('div');
  wrap.className = 'pw-wrap';
  inp.parentNode.insertBefore(wrap, inp);
  wrap.appendChild(inp);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pw-eye'; btn.title = '显示/隐藏密码'; btn.textContent = '👁';
  wrap.appendChild(btn);
  btn.onclick = () => {
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁';
    inp.focus();
  };
}

/* ================= 管理面板 ================= */
function openAdmin() {
  if (!state.admin) { openLoginModal(); return; }
  exitPointerLock();
  const probeRows = state.probes.map(pr => {
    const nm = pr.name || pr.hostname || '探针';
    return `<tr data-pid="${esc(pr.id)}">
      <td><b>📡 ${esc(nm)}</b><br><span class="mono">${esc(pr.hostname || '等待 agent 上报…')}${pr.ip ? ' · ' + esc(pr.ip) : ''}</span></td>
      <td>${pr.public ? '<span class="tag ok">公开</span>' : '<span class="tag">密码</span>'} ${pr.maskIP ? '<span class="tag">掩码</span>' : ''}</td>
      <td>${pr.online ? '<span class="tag ok">在线</span>' : '<span class="tag bad">离线</span>'}</td>
      <td><div class="row-actions">
        <button class="ic-btn" data-pact="view" title="查看状态">📊</button>
        <button class="ic-btn danger" data-pact="del" title="移除探针">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
  const rows = state.servers.map(s => {
    const st = state.statuses.get(s.id);
    const hp = state.chickenHP.get(s.id) || { hp: chickenMaxHP, down: false };
    const tag = hp.down ? '<span class="tag bad">已击倒</span>' : st === 'ok' ? '<span class="tag ok">在线</span>' : st === 'bad' ? '<span class="tag bad">离线</span>' : '<span class="tag">未检测</span>';
    return `<tr data-id="${esc(s.id)}">
      <td><b>${esc(s.name)}</b><br><span class="mono">${esc(s.user)}@${esc(s.host)}:${s.port}</span></td>
      <td>${esc(s.region || '未分组')}</td>
      <td>${tag} <span class="tag">❤${hp.hp}</span></td>
      <td><div class="row-actions">
        <button class="ic-btn" data-act="term" title="打开终端">▶</button>
        <button class="ic-btn" data-act="heal" title="满血复活">❤</button>
        <button class="ic-btn" data-act="edit" title="编辑">✎</button>
        <button class="ic-btn danger" data-act="del" title="删除">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
  openModal(`
    <button class="modal-close">×</button>
    <h2>🐔 农场管理</h2>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="mc-btn sm" id="admAdd">+ 添加服务器（新鸡）</button>
      <button class="mc-btn sm" id="admJoin">📡 部署公开探针</button>
      <button class="mc-btn sm" id="admPw">修改管理密码</button>
    </div>
    ${state.servers.length ? `<table class="sv-table">
      <thead><tr><th>服务器</th><th>区域</th><th>状态</th><th style="text-align:right">操作</th></tr></thead>
      <tbody>${rows}</tbody></table>` : '<div class="notice">农场还没有鸡。点「添加服务器」引入第一只。</div>'}
    ${probeRows ? `<h3 style="margin:18px 0 8px;font-size:.9rem">📡 公开探针</h3>
    <table class="sv-table"><thead><tr><th>探针</th><th>可见性</th><th>状态</th><th style="text-align:right">操作</th></tr></thead><tbody>${probeRows}</tbody></table>` : ''}
  `);
  $('#admAdd').onclick = () => openForm(null);
  $('#admJoin').onclick = () => openJoinModal();
  $('#admPw').onclick = openPwModal;
  $$('#modal [data-pact]').forEach(b => {
    b.onclick = async () => {
      const id = b.closest('tr').dataset.pid;
      if (b.dataset.pact === 'view') {
        const pr = state.probes.find(x => x.id === id);
        closeModal(); openProbeCard(pr);
      }
      if (b.dataset.pact === 'del') {
        if (!await uiConfirm('移除这个探针？agent 上报会被拒绝，建议同时在目标机执行卸载命令。', { title: '移除探针', okText: '移除', danger: true })) return;
        await api('api/probes?id=' + encodeURIComponent(id), { method: 'DELETE' });
        await fetchProbesNow();
        if (farm.inited) syncProbeChickens();
        farm.updateLabels(true);
        openAdmin();
        toast('探针已移除');
      }
    };
  });
  $$('#modal .sv-table [data-act]').forEach(b => {
    b.onclick = async () => {
      const id = b.closest('tr').dataset.id;
      const s = state.servers.find(x => x.id === id);
      if (b.dataset.act === 'term') { closeModal(); termOpen(s); }
      if (b.dataset.act === 'heal') {
        reviveChicken(id);
        sfx('pop'); toast(`${s.name} 已复活`); openAdmin();
      }
      if (b.dataset.act === 'edit') openForm(s);
      if (b.dataset.act === 'del') {
        if (!await uiConfirm(`删除「${s.name}」？这只鸡将永久离开农场。`, { title: '删除服务器', okText: '删除', danger: true })) return;
        if (term.serverId === s.id) termClose(true);
        await api('api/servers/' + s.id, { method: 'DELETE' });
        await loadAdminData(); farm.syncChickens(); updateHud(); toast('已删除'); openAdmin();
      }
    };
  });
}

function openPwModal() {
  openModal(`
    <button class="modal-close">×</button>
    <h2>修改管理密码</h2>
    <div class="field"><label>原密码</label><input id="pwOld" type="password" autocomplete="current-password"></div>
    <div class="field"><label>新密码（至少 6 位）</label><input id="pwNew" type="password" autocomplete="new-password"></div>
    <div class="notice">密码保存在数据目录 data.json（0600）。</div>
    <div class="modal-actions">
      <button class="mc-btn" id="mCancel">取消</button>
      <button class="mc-btn" id="mSave">保存</button>
    </div>`);
  attachPwToggle('#pwOld'); attachPwToggle('#pwNew');
  $('#mCancel').onclick = closeModal;
  $('#mSave').onclick = async () => {
    try {
      await api('api/password', { method: 'POST', body: { old: $('#pwOld').value, new: $('#pwNew').value } });
      closeModal(); toast('密码已修改');
    } catch (e) { toast(e.message, 'err'); }
  };
}

function openForm(s) {
  const isKey = s && s.authKind === 'key';
  openModal(`
    <button class="modal-close">×</button>
    <h2>${s ? '编辑服务器' : '添加服务器（新鸡入场）'}</h2>
    <div class="row">
      <div class="field"><label>备注名称</label><input id="fName" type="text" placeholder="如 上海生产机" value="${esc(s && s.name)}"></div>
      <div class="field"><label>区域 / 分组</label><input id="fRegion" type="text" placeholder="如 上海 / 深圳 / 家庭" value="${esc(s && s.region)}" list="regionList">
        <datalist id="regionList">${[...new Set(state.servers.map(x => x.region).filter(Boolean))].map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      </div>
    </div>
    <div class="row">
      <div class="field" style="flex:2 1 240px"><label>主机地址</label><input id="fHost" type="text" placeholder="IP 或域名" value="${esc(s && s.host)}"></div>
      <div class="field" style="flex:0 1 110px"><label>端口</label><input id="fPort" type="number" min="1" max="65535" value="${s ? s.port : 22}"></div>
    </div>
    <div class="row">
      <div class="field"><label>登录用户</label><input id="fUser" type="text" placeholder="root / ubuntu / …" value="${esc(s && s.user)}"></div>
      <div class="field"><label>认证方式</label>
        <select id="fAuth"><option value="password" ${!isKey ? 'selected' : ''}>密码</option><option value="key" ${isKey ? 'selected' : ''}>SSH 私钥</option></select>
      </div>
    </div>
    <div class="field" id="boxPw"><label>登录密码</label><input id="fPass" type="password" placeholder="${s ? '留空则保持原密码' : 'SSH 登录密码'}" autocomplete="new-password"></div>
    <div class="field hidden" id="boxKey">
      <label>私钥（PEM）</label><textarea id="fKey" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea>
      <div class="hint">仅支持 OpenSSH / PEM 格式</div>
    </div>
    <div class="field hidden" id="boxKeyPass"><label>私钥口令（可选）</label><input id="fKeyPass" type="password" autocomplete="new-password"></div>
    <div class="notice">凭据以 0600 权限保存在面板本机 data.json；列表接口不会下发密码与私钥。游客只能看到鸡的名字。</div>
    <div class="modal-actions">
      <button class="mc-btn" id="mCancel">取消</button>
      <button class="mc-btn" id="mSave">保存</button>
    </div>`);
  attachPwToggle('#fPass'); attachPwToggle('#fKeyPass');
  const syncAuth = () => {
    const key = $('#fAuth').value === 'key';
    $('#boxPw').classList.toggle('hidden', key);
    $('#boxKey').classList.toggle('hidden', !key);
    $('#boxKeyPass').classList.toggle('hidden', !key);
  };
  $('#fAuth').onchange = syncAuth; syncAuth();
  $('#mCancel').onclick = closeModal;
  $('#mSave').onclick = async () => {
    const body = {
      id: s ? s.id : '', name: $('#fName').value.trim(), host: $('#fHost').value.trim(),
      port: parseInt($('#fPort').value || '22', 10), user: $('#fUser').value.trim(),
      note: '', region: $('#fRegion').value.trim(), authKind: $('#fAuth').value,
      password: $('#fPass').value, privateKey: $('#fKey').value, keyPass: $('#fKeyPass').value,
    };
    try {
      await api('api/servers', { method: 'POST', body });
      closeModal(); await loadAdminData(); farm.syncChickens(); updateHud(); toast(s ? '已保存' : '新鸡已入场 🐔');
    } catch (e) { toast(e.message, 'err'); }
  };
}

init();
pollProbes();
if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  window.__farm = farm; window.__state = state; window.__termOpen = termOpen; window.__sfx = sfx;
}
