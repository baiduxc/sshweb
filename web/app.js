/* SSHWeb 前端 · 北欧极简 · xterm.js 终端 */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- 图标 ---------------- */
const ICONS = {
  moon: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m7-7-7 7 7 7"/></svg>',
  paste: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  refresh: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6"/></svg>',
  expand: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>',
  github: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12z"/></svg>',
  terminal: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 9 3 3-3 3M12 15h6"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4v16h16v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  eye: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeoff: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.8 10.8 0 0 1 12 19c-7 0-11-7-11-7a19.6 19.6 0 0 1 5.1-5.9M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a19.5 19.5 0 0 1-2.2 3.2M9.9 9.9a3 3 0 0 0 4.2 4.2M1 1l22 22"/></svg>',
};
function renderIcons(root) { (root || document).querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = ICONS[el.dataset.icon] || ''; }); }

/* ---------------- 主题 ---------------- */
function refreshThemeBtn() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#themeBtn').innerHTML = dark ? ICONS.sun : ICONS.moon;
}
$('#themeBtn').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  localStorage.setItem('sw_theme', t);
  refreshThemeBtn();
  if (term.term) term.term.options.theme = xtermTheme();
};
function initTheme() {
  document.documentElement.dataset.theme = localStorage.getItem('sw_theme') || 'light';
  refreshThemeBtn();
}

/* ---------------- API ---------------- */
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

/* ---------------- 状态 ---------------- */
const state = { servers: [], view: 'list' };

/* ---------------- 登录 ---------------- */
async function init() {
  initTheme();
  renderIcons();
  let sess = null;
  try { sess = await api('api/session'); } catch (e) { sess = null; }
  if (sess && sess.loggedIn) showApp(); else showLogin();
}
function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
async function showApp() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  await loadServers();
  renderList();
}
$('#loginBtn').onclick = doLogin;
$('#loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  const btn = $('#loginBtn'), err = $('#loginErr');
  btn.disabled = true; err.classList.add('hidden');
  try {
    await api('api/login', { method: 'POST', body: { password: $('#loginPass').value } });
    showApp();
  } catch (e) {
    err.textContent = e.message; err.classList.remove('hidden');
  } finally { btn.disabled = false; }
}
$('#brandHome').onclick = () => {
  if (state.view === 'term') termClose();
  else { $('#view-list').classList.remove('hidden'); $('#view-term').classList.add('hidden'); }
};
$('#pwBtn').onclick = openPwModal;
function openPwModal() {
  $('#modal').innerHTML = `
  <div class="modal-box" style="max-width:420px">
    <button class="modal-close" id="mClose">×</button>
    <h2>修改管理密码</h2>
    <div class="field"><label>原密码</label><input id="pwOld" type="password" autocomplete="current-password"></div>
    <div class="field"><label>新密码（至少 6 位）</label><input id="pwNew" type="password" autocomplete="new-password"></div>
    <div class="notice" style="margin:0">密码保存在数据目录的 data.json 中（0600）。容器部署时首次启动可用环境变量 SSHWEB_PASSWORD 指定初始密码。</div>
    <div class="modal-actions">
      <button class="btn secondary" id="mCancel">取消</button>
      <button class="btn" id="mSave">保存</button>
    </div>
  </div>`;
  $('#modal').classList.remove('hidden');
  attachPwToggle('#pwOld');
  attachPwToggle('#pwNew');
  $('#mClose').onclick = $('#mCancel').onclick = closeModal;
  $('#mSave').onclick = async () => {
    try {
      await api('api/password', { method: 'POST', body: { old: $('#pwOld').value, new: $('#pwNew').value } });
      closeModal(); toast('密码已修改');
    } catch (e) { toast(e.message, 'err'); }
  };
}
$('#logoutBtn').onclick = async () => {
  termClose(true);
  try { await api('api/logout', { method: 'POST' }); } catch (e) {}
  showLogin();
};

/* ---------------- 服务器列表 ---------------- */
function hostCountDesc() {
  const n = state.servers.length;
  const regions = new Set(state.servers.map(s => s.region || '未分组')).size;
  $('#pageDesc').textContent = n ? `共 ${n} 台主机 · ${regions} 个区域` : '添加主机，随时进入网页终端';
}
async function loadServers() {
  state.servers = await api('api/servers');
}

function initials(name) {
  const t = name.trim();
  return /^[\x00-\x7F]/.test(t) ? t.slice(0, 2) : t.slice(0, 1);
}
function ago(ts) {
  if (!ts || ts.startsWith('0001')) return '';
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 90) return '刚刚';
  if (d < 5400) return Math.round(d / 60) + ' 分钟前';
  if (d < 172800) return Math.round(d / 3600) + ' 小时前';
  return Math.round(d / 86400) + ' 天前';
}

function renderList() {
  hostCountDesc();
  const wrap = $('#serverGroups');
  const topBtns = `<button class="btn ghost sm" id="hkBtn" title="快捷键说明">⌘ 快捷键</button>
    <button class="btn" id="addBtn">+ 添加服务器</button>`;
  if (!state.servers.length) {
    wrap.innerHTML = `<div class="card empty"><span class="empty-title">还没有服务器</span><p>添加第一台 Linux 主机，浏览器里直接进终端。</p><p><button class="btn" id="emptyAdd">+ 添加服务器</button></p></div>`;
    $('#emptyAdd').onclick = () => openForm(null);
    $('#topActions').innerHTML = topBtns;
    bindTopBtns();
    return;
  }
  // 分组：region 为空归"未分组"，放最后
  const groups = new Map();
  for (const s of state.servers) {
    const k = (s.region || '').trim() || '未分组';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const keys = [...groups.keys()].sort((x, y) => (x === '未分组') - (y === '未分组') || x.localeCompare(y, 'zh'));
  const pin = '<span class="pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg></span>';
  wrap.innerHTML = keys.map(k => `
    <section class="region-block">
      <div class="region-head">${pin}<b>${esc(k)}</b><span class="cnt">${groups.get(k).length}</span></div>
      <div class="grid cols-2">
        ${groups.get(k).map(s => serverCardHTML(s)).join('')}
      </div>
    </section>`).join('');
  $('#topActions').innerHTML = topBtns;
  bindTopBtns();
  $$('.server-card').forEach(card => {
    const s = state.servers.find(x => x.id === card.dataset.id);
    card.onclick = e => { if (!e.target.closest('button')) termOpen(s); };
    card.querySelector('[data-act=term]').onclick = e => { e.stopPropagation(); termOpen(s); };
    card.querySelector('[data-act=edit]').onclick = e => { e.stopPropagation(); openForm(s); };
    card.querySelector('[data-act=del]').onclick = e => { e.stopPropagation(); delServer(s); };
    probe(card, s);
  });
}

function serverCardHTML(s) {
  return `
    <div class="card server-card" data-id="${esc(s.id)}" title="点击进入终端">
      <div class="sc-ops">
        <button class="ic-btn" data-act="term" title="打开终端" aria-label="打开终端">${ICONS.terminal}</button>
        <button class="ic-btn" data-act="edit" title="编辑" aria-label="编辑">${ICONS.edit}</button>
        <button class="ic-btn danger" data-act="del" title="删除" aria-label="删除">${ICONS.trash}</button>
      </div>
      <div class="sc-head">
        <div class="sc-avatar">${esc(initials(s.name))}</div>
        <div class="sc-id"><b>${esc(s.name)}</b><small>${esc(s.user)}@${esc(s.host)}:${s.port}</small></div>
      </div>
      <div class="sc-meta">
        <span class="tag">${s.authKind === 'key' ? '私钥' : '密码'}</span>
        ${s.note ? `<span class="tag">${esc(s.note)}</span>` : ''}
        <span class="tag" data-role="status">检测中…</span>
        ${s.lastUsed && !String(s.lastUsed).startsWith('0001') ? `<span class="tag">上次连接 ${ago(s.lastUsed)}</span>` : ''}
      </div>
    </div>`;
}

function bindTopBtns() {
  $('#addBtn').onclick = () => openForm(null);
  $('#hkBtn').onclick = openHotkeys;
}

async function probe(card, s) {
  const el = card.querySelector('[data-role=status]');
  const avatar = card.querySelector('.sc-avatar');
  try {
    const r = await api('api/servers/' + s.id + '/test', { method: 'POST' });
    if (r.ok) { el.className = 'tag ok'; el.textContent = r.uname || '在线'; el.title = [r.hostname, r.uptime].filter(Boolean).join(' · '); avatar.classList.add('online'); }
    else { el.className = 'tag bad'; el.textContent = '离线'; el.title = r.error; }
  } catch (e) { el.className = 'tag'; el.textContent = '未知'; }
}

async function delServer(s) {
  if (!confirm(`删除「${s.name}」？该操作不可恢复。`)) return;
  if (term.serverId === s.id) termClose();
  await api('api/servers/' + s.id, { method: 'DELETE' });
  await loadServers(); renderList(); toast('已删除');
}

/* ---------------- 密码明文切换 ---------------- */
// 给密码输入框套上眼睛切换按钮：wrap(input) 结构 .pw-wrap > input + button
function attachPwToggle(inputSel, btnId) {
  const inp = $(inputSel);
  if (!inp) return;
  const wrap = document.createElement('div');
  wrap.className = 'pw-wrap';
  inp.parentNode.insertBefore(wrap, inp);
  wrap.appendChild(inp);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pw-eye';
  btn.title = '显示/隐藏密码';
  btn.setAttribute('aria-label', '显示或隐藏密码');
  btn.innerHTML = ICONS.eye;
  wrap.appendChild(btn);
  btn.onclick = () => {
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.innerHTML = show ? ICONS.eyeoff : ICONS.eye;
    inp.focus();
  };
}

/* ---------------- 添加/编辑表单 ---------------- */
function openForm(s) {
  const isKey = s && s.authKind === 'key';
  $('#modal').innerHTML = `
  <div class="modal-box">
    <button class="modal-close" id="mClose">×</button>
    <h2>${s ? '编辑服务器' : '添加服务器'}</h2>
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
    <div class="notice" style="margin:0">凭据以 0600 权限保存在面板本机 data.json；列表接口不会下发密码与私钥。</div>
    <div class="modal-actions">
      <button class="btn secondary" id="mCancel">取消</button>
      <button class="btn" id="mSave">保存</button>
    </div>
  </div>`;
  $('#modal').classList.remove('hidden');
  attachPwToggle('#fPass');
  attachPwToggle('#fKeyPass');
  const syncAuth = () => {
    const key = $('#fAuth').value === 'key';
    $('#boxPw').classList.toggle('hidden', key);
    $('#boxKey').classList.toggle('hidden', !key);
    $('#boxKeyPass').classList.toggle('hidden', !key);
  };
  $('#fAuth').onchange = syncAuth; syncAuth();
  $('#mClose').onclick = $('#mCancel').onclick = closeModal;
  $('#mSave').onclick = async () => {
    const body = {
      id: s ? s.id : '', name: $('#fName').value.trim(), host: $('#fHost').value.trim(),
      port: parseInt($('#fPort').value || '22', 10), user: $('#fUser').value.trim(),
      note: '', region: $('#fRegion').value.trim(), authKind: $('#fAuth').value,
      password: $('#fPass').value, privateKey: $('#fKey').value, keyPass: $('#fKeyPass').value,
    };
    try {
      await api('api/servers', { method: 'POST', body });
      closeModal(); await loadServers(); renderList(); toast(s ? '已保存' : '已添加');
    } catch (e) { toast(e.message, 'err'); }
  };
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
/* 点击遮罩空白不关闭：防止误触丢掉填了一半的表单（用 取消/Esc 关闭） */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.view !== 'term' && !$('#modal').classList.contains('hidden')) closeModal();
});

/* ---------------- 快捷键说明 ---------------- */
const HOTKEYS = [
  ['Ctrl+C / Ctrl+D', '中断 / 退出（原样传给 shell）'],
  ['Tab / 方向键', '命令补全 / 翻历史'],
  ['Ctrl+R', '增量搜索历史'],
  ['Ctrl+Alt+C', '复制终端选区'],
  ['Ctrl+Alt+V', '粘贴剪贴板到终端'],
  ['Ctrl+Alt+L', '清屏'],
  ['Ctrl+Alt+F / F11', '终端全屏'],
  ['Ctrl+Alt+R', '重连当前会话'],
  ['Ctrl+Alt+S', '搜索输出内容'],
  ['Ctrl+Alt+D', '断开返回列表'],
  ['双击 / 三击', '选词 / 选行'],
  ['macOS Option', '等同 Alt（macOptionIsMeta）'],
];
function openHotkeys() {
  $('#modal').innerHTML = `
  <div class="modal-box">
    <button class="modal-close" id="mClose">×</button>
    <h2>终端快捷键</h2>
    <div class="hotkeys" style="margin-top:18px">
      ${HOTKEYS.map(([k, d]) => `<div class="hk"><kbd>${esc(k)}</kbd><span>${esc(d)}</span></div>`).join('')}
    </div>
    <div class="notice" style="margin-top:22px">Ctrl+Alt 组合为面板级操作，会被浏览器拦截；其余按键（含 Ctrl+C、Tab、方向键）全部原样传给远端 shell。</div>
  </div>`;
  $('#modal').classList.remove('hidden');
  $('#mClose').onclick = closeModal;
}

/* ---------------- 终端 ---------------- */
const QUICK_CMDS = [
  ['', '常用命令…'],
  ['htop', 'htop 进程监控'], ['top -c', 'top 经典监控'],
  ['df -h', '磁盘占用'], ['free -h', '内存使用'],
  ['uptime', '系统负载'], ['ss -tlnp', '监听端口'],
  ['systemctl status sshd', 'sshd 状态'], ['journalctl -xe --no-pager -n 50', '最近日志'],
  ['tail -f /var/log/syslog', '跟踪 syslog'], ['tail -f /var/log/auth.log', '跟踪登录日志'],
  ['ps aux --sort=-%cpu | head', 'CPU 排行'], ['ps aux --sort=-%mem | head', '内存排行'],
  ['last -n 20', '登录记录'], ['whoami; hostname; ip a', '快速自检'],
  ['wget -qO- ipinfo.io', '出口 IP'],
];

const term = { term: null, ws: null, fit: null, serverId: null, search: null };

function xtermTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    background: dark ? '#101113' : '#16171a',
    foreground: '#e8e8ea',
    cursor: '#3ecf8e', cursorAccent: '#101113',
    selectionBackground: 'rgba(62,207,142,.28)',
    black: '#3a3b40', red: '#e06c75', green: '#3ecf8e', yellow: '#d9bc85',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#dcdce0',
    brightBlack: '#6b6d76', brightRed: '#ff7b84', brightGreen: '#5fe6a8', brightYellow: '#ffd98a',
    brightBlue: '#7cc3ff', brightMagenta: '#d996ee', brightCyan: '#6fd3e0', brightWhite: '#ffffff',
  };
}

async function termOpen(s) {
  if (term.ws) termClose();
  state.view = 'term';
  $('#view-list').classList.add('hidden');
  $('#view-term').classList.remove('hidden');
  document.body.classList.add('term-on');
  $('#termName').textContent = s.name;
  $('#termAddr').textContent = `${s.user}@${s.host}:${s.port}`;
  $('#termDot').className = 'status-dot';

  const hostEl = $('#termHost');
  hostEl.innerHTML = '';
  const t = new Terminal({
    fontSize: 14,
    fontFamily: '"JetBrains Mono","SF Mono","Cascadia Code","Fira Code",Consolas,"Noto Sans Mono CJK SC",monospace',
    theme: xtermTheme(),
    scrollback: 8000,
    allowProposedApi: true,
    cursorBlink: true,
    macOptionIsMeta: true,          // macOS Option 即 Alt（Meta 键位）
    rightClickSelectsWord: true,
    wordSeparator: ' ()[]{}\'"`',   // 双击选中 URL/路径更完整
    windowsMode: 'inherit',
    overviewRulerWidth: 8,
  });
  const fit = new FitAddon.FitAddon();
  t.loadAddon(fit);
  const search = new SearchAddon.SearchAddon();
  t.loadAddon(search);
  try { t.loadAddon(new WebLinksAddon.WebLinksAddon()); } catch (e) {}
  t.open(hostEl);
  term.term = t; term.fit = fit; term.search = search; term.serverId = s.id;
  requestAnimationFrame(() => { fit.fit(); t.focus(); });

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?server=${encodeURIComponent(s.id)}`);
  ws.binaryType = 'arraybuffer';
  term.ws = ws;

  const send = (kind, payload) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    let body;
    if (typeof payload === 'string') body = new TextEncoder().encode(payload);
    else body = payload;
    const msg = new Uint8Array(body.length + 1);
    msg[0] = kind; msg.set(body, 1);
    ws.send(msg);
  };
  term.send = send;

  ws.onopen = () => { $('#termDot').className = 'status-dot ok'; pushResize(); };
  ws.onclose = () => {
    $('#termDot').className = 'status-dot bad';
    if (term.term) term.term.write('\r\n\x1b[90m[连接已断开，点右上角重连]\x1b[0m\r\n');
  };
  ws.onerror = () => { $('#termDot').className = 'status-dot bad'; };
  ws.onmessage = ev => {
    const u8 = new Uint8Array(ev.data);
    if (!u8.length) return;
    const kind = u8[0], body = u8.subarray(1);
    if (kind === 2 || kind === 4) term.term ? term.term.write(body) : null;
  };

  t.onData(d => send(1, d));

  // 面板级快捷键只在 Ctrl+Alt 组合下拦截，其余全透传给 SSH
  t.attachCustomKeyEventHandler(ev => {
    if (ev.type !== 'keydown') return true;
    if (ev.ctrlKey && ev.altKey) {
      const k = ev.key.toLowerCase();
      const map = {
        c: termCopy, v: termPaste, f: termFullscreen, r: termReconnect,
        l: termClearBuf, s: termFindPrompt, d: () => termClose(true),
      };
      if (map[k]) { ev.preventDefault(); map[k](); return false; }
      return false; // Ctrl+Alt+其它：吞掉避免浏览器默认
    }
    if (ev.key === 'F11') { ev.preventDefault(); termFullscreen(); return false; }
    return true; // Ctrl+C / Ctrl+D / Tab / 方向键 … 全部给远端 shell
  });

  // 快速命令
  const qc = $('#quickCmd');
  qc.innerHTML = QUICK_CMDS.map(([cmd, label]) => `<option value="${esc(cmd)}">${esc(label)}</option>`).join('');
  qc.value = '';
  qc.onchange = () => {
    if (!qc.value) return;
    send(1, qc.value + '\n');
    qc.value = '';
    t.focus();
  };

  buildKbBar(t, send);
  window.addEventListener('resize', termFitNow);
}

function pushResize() {
  if (!term.fit || !term.term || !term.ws || term.ws.readyState !== WebSocket.OPEN) return;
  term.fit.fit();
  const { cols, rows } = term.term;
  term.send(3, JSON.stringify({ cols, rows }));
}
function termFitNow() { if (state.view === 'term') pushResize(); }

function termClose(silent) {
  window.removeEventListener('resize', termFitNow);
  if (document.body.classList.contains('term-full')) document.body.classList.remove('term-full');
  if (term.ws) { try { term.ws.close(); } catch (e) {} }
  if (term.term) { try { term.term.dispose(); } catch (e) {} }
  term.ws = null; term.term = null; term.fit = null; term.search = null; term.serverId = null;
  state.view = 'list';
  document.body.classList.remove('term-on');
  if (!silent) { $('#view-term').classList.add('hidden'); $('#view-list').classList.remove('hidden'); }
  else { document.body.classList.remove('term-on'); }
}

$('#termBack').onclick = () => termClose();
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
  } catch (e) {
    toast('浏览器未授权剪贴板，用工具栏左侧粘贴或 Ctrl+Shift+V', 'err');
  }
}
function termClearBuf() { if (term.term) { term.term.clear(); term.term.focus(); } }
function termFullscreen() {
  document.body.classList.toggle('term-full');
  setTimeout(() => { pushResize(); term.term && term.term.focus(); }, 120);
}
function termFindPrompt() {
  const q = window.prompt('在终端输出中查找：');
  if (q && term.search) term.search.findNext(q);
}
$('#termCopy').onclick = termCopy;
$('#termPaste').onclick = termPaste;
$('#termClear').onclick = termClearBuf;
$('#termFullscreen').onclick = termFullscreen;

/* 移动端辅助键（窄屏显示） */
function buildKbBar(t, send) {
  const hostEl = $('#termHost');
  let bar = $('.kb-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'kb-bar';
    $('.term-shell').appendChild(bar);
  }
  const sticky = { ctrl: false, alt: false };
  const keys = [
    ['esc', 'ESC', '\x1b'], ['ctrl', 'CTRL', null, 'ctrl'], ['alt', 'ALT', null, 'alt'],
    ['tab', 'TAB', '\t'], ['up', '↑', '\x1b[A'], ['down', '↓', '\x1b[B'],
    ['left', '←', '\x1b[D'], ['right', '→', '\x1b[C'], ['|', '|', '|'],
    ['~', '~', '~'], ['-', '-', '-'], ['/', '/', '/'], ['del', 'DEL', '\x7f'],
  ];
  bar.innerHTML = '';
  for (const [id, label, code, stick] of keys) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      if (stick) {
        sticky[stick] = !sticky[stick];
        b.classList.toggle('sticky-on', sticky[stick]);
        if (sticky.ctrl && sticky.alt) {}
        return;
      }
      let payload = code;
      if (sticky.ctrl) payload = ctrlCode(label) || code;
      if (sticky.ctrl) { sticky.ctrl = false; bar.querySelector('[data-k=ctrl]') && bar.querySelector('[data-k=ctrl]').classList.remove('sticky-on'); }
      if (sticky.alt && code) payload = '\x1b' + code;
      if (sticky.alt) { sticky.alt = false; bar.querySelector('[data-k=alt]') && bar.querySelector('[data-k=alt]').classList.remove('sticky-on'); }
      send(1, payload);
      t.focus();
    };
    b.dataset.k = id;
    bar.appendChild(b);
  }
  // 触屏粘贴
  const pb = document.createElement('button');
  pb.textContent = '粘贴'; pb.onclick = termPaste;
  bar.appendChild(pb);
}
function ctrlCode(letter) {
  const m = { C: '\x03', D: '\x04', L: '\x0c', A: '\x01', E: '\x05', K: '\x0b', U: '\x15', W: '\x17', R: '\x12' };
  return m[letter] || null;
}

/* 双击选词进剪贴板（xterm 已自带选中），滚轮缩放字号 */
document.addEventListener('keydown', e => {
  if (state.view !== 'term') return;
  if (e.key === 'Escape' && document.body.classList.contains('term-full')) {
    document.body.classList.remove('term-full'); pushResize();
  }
}, true);

/* ---------------- 顶栏滚动磨砂 ---------------- */
const onScrollShade = () => {
  document.body.classList.toggle('scrolled', (window.scrollY || 0) > 4);
};
window.addEventListener('scroll', onScrollShade, true);
onScrollShade();

init();
