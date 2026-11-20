// Arqade shared admin panel — appears on every game page for admin-tagged accounts.
// All powers are enforced server-side by POST /api/admin; this is just the UI.
// ---- Remember the last games played, for the portal's Continue rows (up to 3) ----
try {
  if (location.pathname.indexOf('/games/') === 0) {
    var rp = location.pathname.replace(/\.html$/, '');
    var rt = document.title.replace(/ — Arqade$/, '');
    var rlist = [];
    try { rlist = JSON.parse(localStorage.getItem('arq_recent_games') || '[]'); } catch (e) { rlist = []; }
    if (!Array.isArray(rlist)) rlist = [];
    if (!rlist.length) { try { var rold = JSON.parse(localStorage.getItem('arq_last_game') || 'null'); if (rold && rold.p) rlist = [rold]; } catch (e) {} }
    rlist = rlist.filter(function (g) { return g && g.p !== rp; });
    rlist.unshift({ p: rp, t: rt });
    localStorage.setItem('arq_recent_games', JSON.stringify(rlist.slice(0, 3)));
  }
} catch (e) {}
// ---- Appearance: background, theme color and liquid glass, set in the Settings game ----
// Stored in localStorage (arq_bg / arq_accent / arq_glass) and applied on every page
// that loads this file — the portal and all games. Mining Simulator has its own copy.
function arqApplyAppearance() {
  var bg = '', accent = '', glass = false, mode = 'dark';
  try {
    bg = localStorage.getItem('arq_bg') || '';
    accent = localStorage.getItem('arq_accent') || '';
    glass = localStorage.getItem('arq_glass') === '1';
    mode = localStorage.getItem('arq_mode') || 'dark';
  } catch (e) {}
  var old = document.getElementById('arq-appearance');
  if (old) old.remove();
  var BGS = {
    ocean: 'linear-gradient(160deg,#041e33,#0a3d5c)',
    sunset: 'linear-gradient(160deg,#2b0a1e,#571d3a 60%,#7a2d2d)',
    forest: 'linear-gradient(160deg,#06231a,#0d4630)',
    purple: 'linear-gradient(160deg,#1b1035,#3b2070)',
    space: 'linear-gradient(160deg,#050510,#141433)',
    candy: 'linear-gradient(160deg,#33102b,#6d2055)'
  };
  var css = '';
  var isPhoto = !!(bg && bg.indexOf('data:image') === 0);
  if (mode === 'light' && !isPhoto) css += 'body{background:linear-gradient(160deg,#f4f6fb,#dde3ee) !important;background-attachment:fixed !important;}\n';
  else if (bg && BGS[bg]) css += 'body{background:' + BGS[bg] + ' !important;background-attachment:fixed !important;}\n';
  else if (bg && bg.charAt(0) === '#') css += 'body{background:' + bg + ' !important;}\n';
  else if (bg && bg.indexOf('data:image') === 0) css += 'body{background-color:#12121c !important;background-image:url("' + bg + '") !important;background-size:cover !important;background-position:center !important;background-repeat:no-repeat !important;background-attachment:scroll !important;}\n';
  if (accent) {
    css += 'header{border-bottom-color:' + accent + ' !important;}\n';
    css += 'header h1{color:' + accent + ' !important;}\n';
    css += '.play{background:' + accent + ' !important;}\n';
    css += '.card:hover{border-color:' + accent + ' !important;}\n';
    css += '.seg button.on,.wide.gold{background:' + accent + ' !important;border-color:' + accent + ' !important;}\n';
    css += '#arq-broadcast-bar{border-color:' + accent + ' !important;}#arq-broadcast-bar .from{color:' + accent + ' !important;}\n';
    css += '#arq-play-gate .card{border-color:' + accent + ' !important;}\n';
  }
  if (mode === 'light') {
    css += 'body{color:#1d1d28 !important;}\n';
    css += '.card,.panel,header,#account-bar,.modal{background:#ffffff !important;color:#1d1d28 !important;border-color:#d4d8e2 !important;}\n';
    css += 'h2,h3{color:#14141f !important;}\n';
    css += '.sub,.who,.muted{color:#4a4a5c !important;opacity:1 !important;}\n';
    css += 'label{color:#2a2a3a !important;}\n';
    css += 'input,select,textarea{background:#ffffff !important;color:#1d1d28 !important;border-color:#c6cbda !important;}\n';
    css += '.seg button{background:#e6e9f2 !important;color:#1d1d28 !important;border-color:#c6cbda !important;}\n';
    css += '.seg button.on{color:#191920 !important;}\n';
    css += '#arq-broadcast-bar{background:#fff8e1 !important;color:#5c4a00 !important;}\n';
  }
  if (glass) {
    if (mode === 'light') css += '.card,.panel,header,#account-bar,.modal,#arq-play-gate .card,#arq-broadcast-bar{background:rgba(255,255,255,.55) !important;color:#1d1d28 !important;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);border-color:rgba(255,255,255,.65) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 28px rgba(30,40,80,.18) !important;}\n';
    else css += '.card,.panel,header,#account-bar,.modal,#arq-play-gate .card,#arq-broadcast-bar{background:rgba(28,28,46,.52) !important;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);border-color:rgba(255,255,255,.22) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 8px 28px rgba(0,0,0,.35) !important;}\n';
    css += 'button,.btn,.action,.modeBtn{backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);}\n';
  }
  if (!css) return;
  var st = document.createElement('style');
  st.id = 'arq-appearance';
  st.textContent = css;
  document.head.appendChild(st);
}
try { arqApplyAppearance(); } catch (e) {}
(async () => {
  // ---- Global broadcast banner: Dylan's broadcast shows on EVERY game, for every player ----
  // (Mining Simulator has its own built-in bar and doesn't load this file, so no double banner there.)
  if (!document.getElementById('broadcast-bar') && !document.getElementById('arq-broadcast-bar')) {
    const bstyle = document.createElement('style');
    bstyle.textContent = `
  #arq-broadcast-bar { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 99997; max-width: min(680px, 92vw); background: #191920; color: #ffe9a8; border: 2px solid #f5c542; border-radius: 12px; box-shadow: 0 0 18px rgba(245,197,66,.55), 0 6px 18px rgba(0,0,0,.5); padding: 9px 16px; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 16px; font-weight: 700; text-align: center; pointer-events: none; display: none; }
  #arq-broadcast-bar .from { color: #f5c542; white-space: nowrap; }
  `;
    document.head.appendChild(bstyle);
    const bbar = document.createElement('div');
    bbar.id = 'arq-broadcast-bar';
    bbar.innerHTML = '📢 <span class="from">👑 OWNER:</span> <span id="arq-broadcast-text"></span>';
    document.body.appendChild(bbar);
    let lastMsg = null;
    const checkBroadcast = async () => {
      try {
        const r = await fetch('/api/broadcast').then((x) => x.json());
        const msg = (r && r.message) || '';
        if (msg === lastMsg) return;
        lastMsg = msg;
        if (msg) {
          bbar.querySelector('#arq-broadcast-text').textContent = msg;
          bbar.style.display = 'block';
        } else {
          bbar.style.display = 'none';
        }
      } catch (e) { /* ignore — the next poll tries again */ }
    };
    checkBroadcast();
    setInterval(checkBroadcast, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkBroadcast(); });
  }

  // ---- Account required to play (Dylan's rule, 2026-11-09) ----
  // Guests opening any game page get this sign-in / create-account gate.
  // The portal stays open for browsing; Mining Simulator has its own gate and doesn't load this file.
  function showPlayGate() {
    if (document.getElementById('arq-play-gate')) return;
    const style = document.createElement('style');
    style.textContent = `
  #arq-play-gate { position: fixed; inset: 0; z-index: 1000000; background: rgba(8,8,14,.88); display: flex; align-items: center; justify-content: center; padding: 16px; font-family: 'Segoe UI', system-ui, sans-serif; }
  #arq-play-gate .card { background: #1e1e30; color: #eee; border: 2px solid #f5c542; border-radius: 16px; padding: 24px 22px; width: min(380px, 94vw); box-shadow: 0 14px 44px rgba(0,0,0,.65); text-align: center; }
  #arq-play-gate h2 { margin: 0 0 6px; font-size: 23px; }
  #arq-play-gate p { margin: 0 0 14px; font-size: 14.5px; opacity: .85; line-height: 1.45; }
  #arq-play-gate input { width: 100%; box-sizing: border-box; background: #12121c; color: #eee; border: 1px solid #55557a; border-radius: 9px; padding: 11px 12px; font-size: 16px; margin-bottom: 9px; }
  #arq-play-gate button.go { width: 100%; background: #f5c542; color: #191920; border: none; border-radius: 9px; padding: 12px; font-size: 16.5px; font-weight: 800; cursor: pointer; }
  #arq-play-gate button.go:disabled { opacity: .55; }
  #arq-play-gate .switch { margin-top: 12px; font-size: 14px; }
  #arq-play-gate .switch a, #arq-play-gate .back { color: #f5c542; cursor: pointer; text-decoration: underline; }
  #arq-play-gate .err { color: #ff9a9a; font-size: 14px; min-height: 19px; margin: 2px 0 8px; }
  #arq-play-gate .back { display: inline-block; margin-top: 10px; font-size: 13.5px; opacity: .85; }
  `;
    document.head.appendChild(style);
    const gate = document.createElement('div');
    gate.id = 'arq-play-gate';
    gate.innerHTML = `
      <div class="card">
        <h2>🔒 Sign in to play</h2>
        <p>Arqade games need a free account. One account works for every game, and your scores save to the leaderboards.</p>
        <input id="pg-user" type="text" placeholder="Username" autocomplete="username" maxlength="32">
        <input id="pg-pass" type="password" placeholder="Password" autocomplete="current-password">
        <input id="pg-name" type="text" placeholder="Display name (new accounts)" maxlength="24" style="display:none">
        <div class="err" id="pg-err"></div>
        <button class="go" id="pg-go">Sign in &amp; play</button>
        <div class="switch" id="pg-switch">New here? <a id="pg-toggle">Create an account</a></div>
        <a class="back" href="/">← Back to Arqade home</a>
      </div>`;
    document.body.appendChild(gate);
    document.body.style.overflow = 'hidden';
    let mode = 'signin';
    const q = (sel) => gate.querySelector(sel);
    const err = (m) => { q('#pg-err').textContent = m || ''; };
    q('#pg-toggle').addEventListener('click', () => {
      mode = mode === 'signin' ? 'signup' : 'signin';
      q('#pg-name').style.display = mode === 'signup' ? 'block' : 'none';
      q('#pg-go').textContent = mode === 'signup' ? 'Create account & play' : 'Sign in & play';
      q('#pg-switch').firstChild.textContent = mode === 'signup' ? 'Already have an account? ' : 'New here? ';
      q('#pg-toggle').textContent = mode === 'signup' ? 'Sign in' : 'Create an account';
      err('');
    });
    const submit = async () => {
      const username = q('#pg-user').value.trim();
      const password = q('#pg-pass').value;
      if (!username || !password) { err('Type your username and password.'); return; }
      const btn = q('#pg-go'); btn.disabled = true; err('');
      try {
        const body = mode === 'signup'
          ? { username, password, displayName: (q('#pg-name').value.trim() || username.slice(0, 24)) }
          : { username, password };
        const r = await fetch(mode === 'signup' ? '/api/signup' : '/api/signin', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { err(data.error || 'Something went wrong — try again.'); btn.disabled = false; return; }
        location.reload();
      } catch (e) { err('Network problem — check your connection and try again.'); btn.disabled = false; }
    };
    q('#pg-go').addEventListener('click', submit);
    gate.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const u = q('#pg-user'); if (u) u.focus();
  }

  let user = null;
  let guest = false;
  try {
    const r = await fetch('/api/me');
    if (r.ok) user = (await r.json()).user;
    else if (r.status === 401) guest = true;
  } catch (e) { /* network hiccup — fail open, so a blip never locks a signed-in player out */ }
  if (!user) {
    if (guest && location.pathname.startsWith('/games/')) showPlayGate();
    return;
  }
  if (!(user.isAdmin || user.isModerator || user.isDeveloper || user.isOwner)) return;

  const css = `
  #arq-admin-btn { position: fixed; right: 14px; bottom: 14px; z-index: 99998; background: #f5c542; color: #191920; border: none; border-radius: 24px; padding: 10px 16px; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.5); font-family: 'Segoe UI', system-ui, sans-serif; }
  #arq-admin { position: fixed; right: 14px; bottom: 62px; z-index: 99999; width: min(336px, 94vw); max-height: 78vh; overflow-y: auto; background: #1e1e30; color: #eee; border: 2px solid #f5c542; border-radius: 14px; padding: 14px; font-family: 'Segoe UI', system-ui, sans-serif; box-shadow: 0 10px 34px rgba(0,0,0,.6); }
  #arq-admin h3 { font-size: 17px; margin: 0 0 2px; }
  #arq-admin h4 { font-size: 12px; letter-spacing: .6px; opacity: .65; margin: 14px 0 6px; text-transform: uppercase; }
  #arq-admin .who { font-size: 12.5px; opacity: .75; margin-bottom: 4px; }
  #arq-admin .row { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
  #arq-admin button { background: #fff; color: #191920; border: 1px solid #bbb; border-radius: 8px; padding: 7px 10px; font-size: 13.5px; font-weight: 700; cursor: pointer; }
  #arq-admin button.danger { border-color: #d9534f; color: #a33; }
  #arq-admin input, #arq-admin select { flex: 1; min-width: 0; background: #12121c; color: #eee; border: 1px solid #55557a; border-radius: 8px; padding: 7px 9px; font-size: 13.5px; }
  #arq-admin #arq-status { font-size: 13px; min-height: 18px; margin-top: 8px; color: #ffd95e; }
  #arq-admin .game-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
  #arq-admin .game-row span { flex: 1; font-size: 13.5px; }
  #arq-admin .game-row button { padding: 5px 9px; font-size: 12.5px; }
  #arq-admin .close { float: right; background: none; border: none; color: #eee; font-size: 17px; cursor: pointer; padding: 0 2px; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'arq-admin-btn';
  btn.textContent = '🔧 Admin';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'arq-admin';
  panel.style.display = 'none';
  panel.innerHTML = `
    <button class="close" title="Close">✕</button>
    <h3>🔧 Admin panel</h3>
    <div class="who">Signed in as <b></b> — one account for the whole site. Each game has its own panel below.</div>
    <h4>⛏️ Mining Simulator</h4>
    <div class="row">
      <button data-cmd="coins">+1M coins</button>
      <button data-cmd="gems">+100 gems</button>
      <button data-cmd="god">God mode</button>
    </div>
    <div class="row">
      <button data-cmd="heal">Heal</button>
      <button data-cmd="upgrades">Max upgrades</button>
      <button data-cmd="achievements">All achievements</button>
      <button data-cmd="stage100">Go to stage 100</button>
    </div>
    <div class="row" style="margin-top:8px;"><input id="arq-gift-user" placeholder="🎁 Gift to (username)"></div>
    <div class="row">
      <input id="arq-gift-coins" type="number" min="0" placeholder="🪙 Coins">
      <input id="arq-gift-gems" type="number" min="0" placeholder="💎 Gems">
      <button id="arq-gift-btn">🎁 Gift</button>
    </div>
    <div class="row" style="margin-top:8px;">
      <input id="arq-reset" placeholder="Username to reset">
      <button id="arq-reset-btn" class="danger">Reset progress</button>
    </div>
    <div class="row"><button id="arq-reset-self" class="danger">Reset MY progress</button></div>
    <h4 id="arq-hooks-title">🚓 City Pursuit 3D</h4>
    <div id="arq-game-hooks"></div>
    <div class="game-row"><span>🏆 My best cash haul</span><button data-score-game="pursuit3d">Reset</button></div>
    <h4>👆 Clicker Simulator</h4>
    <div class="row"><input id="arq-cs-coins" type="number" min="0" placeholder="Coins amount"><button id="arq-cs-coins-btn">Set coins</button></div>
    <div class="row"><input id="arq-cs-tokens" type="number" min="0" placeholder="Tokens amount"><button id="arq-cs-tokens-btn">Set tokens</button></div>
    <div class="row"><input id="arq-cs-rebirths" type="number" min="0" placeholder="Rebirth level"><button id="arq-cs-rebirths-btn">Set rebirth</button></div>
    <div class="who">Sets your Clicker Simulator save directly — works while you're on the Clicker Simulator page.</div>
    <h4>🎮 More games — my best scores</h4>
    <div id="arq-more-games"></div>
    <h4>Broadcast</h4>
    <div class="row">
      <input id="arq-broadcast" placeholder="Global message…" maxlength="500">
      <button id="arq-broadcast-btn">📢 Send</button>
    </div>
    <h4>Ban / unban</h4>
    <div class="row">
      <input id="arq-ban" placeholder="Username">
      <button id="arq-ban-btn" class="danger">Ban</button>
      <button id="arq-unban-btn">Unban</button>
    </div>
    ${user.canGiveTags ? `
    <h4>🏷️ Give / remove tags (owner)</h4>
    <div class="row">
      <input id="arq-tag-user" placeholder="Username for tag">
      <select id="arq-tag-select" style="flex:0 0 auto;">
        <option value="admin">🛠️ Admin</option>
        <option value="moderator">🛡️ Moderator</option>
        <option value="developer">💻 Developer</option>
      </select>
    </div>
    <div class="row">
      <button id="arq-tag-grant">Give tag</button>
      <button id="arq-tag-revoke">Remove tag</button>
    </div>` : ''}
    <h4>Danger zone</h4>
    <div class="row"><button id="arq-wipe" class="danger">Delete ALL accounts</button></div>
    <div id="arq-status"></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.who b').textContent = user.displayName;
  const status = msg => { panel.querySelector('#arq-status').textContent = msg; };
  const val = id => panel.querySelector(id).value.trim();

  async function admin(command, extra) {
    const r = await fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...(extra || {}) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'That did not work.');
    return d;
  }

  btn.onclick = () => { renderHooks(); panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };
  panel.querySelector('.close').onclick = () => { panel.style.display = 'none'; };

  panel.querySelectorAll('[data-cmd]').forEach(b => {
    b.onclick = async () => {
      const cmd = b.dataset.cmd;
      const extra = cmd === 'coins' ? { amount: 1000000 } : cmd === 'gems' ? { amount: 100 } : cmd === 'upgrades' ? { pick: 50, armor: 50, bag: 50 } : {};
      try { await admin(cmd, extra); status('✅ Done — Mining Simulator updated.'); }
      catch (ex) { status('⚠️ ' + ex.message); }
    };
  });
  panel.querySelector('#arq-broadcast-btn').onclick = async () => {
    const message = val('#arq-broadcast');
    try { await admin('broadcast', { message }); panel.querySelector('#arq-broadcast').value = ''; status(message ? '📢 Broadcast sent!' : '📢 Broadcast cleared.'); }
    catch (ex) { status('⚠️ ' + ex.message); }
  };
  async function ban(banFlag) {
    const target = val('#arq-ban');
    if (!target) return status('Enter a username.');
    if (!confirm(`${banFlag ? 'Ban' : 'Unban'} "${target}"?`)) return;
    try { const r = await admin(banFlag ? 'ban' : 'unban', { target }); status(r.banned ? `🚫 Banned ${r.username}.` : `✅ Unbanned ${r.username}.`); panel.querySelector('#arq-ban').value = ''; }
    catch (ex) { status('⚠️ ' + ex.message); }
  }
  panel.querySelector('#arq-ban-btn').onclick = () => ban(true);
  panel.querySelector('#arq-unban-btn').onclick = () => ban(false);
  panel.querySelector('#arq-gift-btn').onclick = async () => {
    const target = val('#arq-gift-user');
    const coins = Number(panel.querySelector('#arq-gift-coins').value) || 0;
    const gems = Number(panel.querySelector('#arq-gift-gems').value) || 0;
    if (!target) return status('Enter a username.');
    try { const r = await admin('gift', { target, coins, gems }); status(`🎁 Gave ${r.coins} coins and ${r.gems} gems to ${r.username}.`); }
    catch (ex) { status('⚠️ ' + ex.message); }
  };
  async function reset(target, isSelf) {
    const label = isSelf ? 'your own' : `"${target}"'s`;
    if (!confirm(`Reset ${label} progress? Coins, gems, upgrades, achievements — everything. Cannot be undone.`)) return;
    if (!confirm(`Really wipe ${label} progress?`)) return;
    try {
      const r = await admin('reset', { target: isSelf ? user.username : target });
      status(`🔄 Reset ${r.username}'s progress.`);
      if (r.self) location.reload();
    } catch (ex) { status('⚠️ ' + ex.message); }
  }
  panel.querySelector('#arq-reset-btn').onclick = () => { const t = val('#arq-reset'); if (t) reset(t, false); else status('Enter a username.'); };
  panel.querySelector('#arq-reset-self').onclick = () => reset(null, true);
  if (user.canGiveTags) {
    async function changeTag(grant) {
      const target = val('#arq-tag-user');
      const tag = panel.querySelector('#arq-tag-select').value;
      if (!target) return status('Enter a username.');
      if (!confirm(`${grant ? 'GIVE' : 'REMOVE'} the ${tag.toUpperCase()} tag ${grant ? 'to' : 'from'} "${target}"?`)) return;
      try {
        const r = await admin('tag', { target, tag, grant });
        status(r.granted ? `🏷️ Gave the ${r.tag} tag to ${r.username}!` : `🏷️ Removed the ${r.tag} tag from ${r.username}.`);
        panel.querySelector('#arq-tag-user').value = '';
      } catch (ex) { status('⚠️ ' + ex.message); }
    }
    panel.querySelector('#arq-tag-grant').onclick = () => changeTag(true);
    panel.querySelector('#arq-tag-revoke').onclick = () => changeTag(false);
  }
  const MORE_GAMES = [
    ['🐍 Snake', 'snake'], ['🧱 Breakout', 'breakout'], ['🐤 Flappy Bird', 'flappy'],
    ['🃏 Memory Match', 'memory'], ['🔢 2048', '2048'], ['🪙 Coin Clicker', 'clicker'],
    ['👆 Clicker Simulator', 'clickersim'],
    ['🏓 Pong', 'pong'], ['💣 Minesweeper', 'minesweeper'], ['👾 Space Invaders', 'invaders'],
    ['🌕 Lunar Lander', 'lander'], ['🏎️ Turbo Racer 3D', 'racer'], ['🂡 Blackjack', 'blackjack'],
    ['✏️ Word Guess', 'word'],
  ];
  const moreEl = panel.querySelector('#arq-more-games');
  for (const [name, key] of MORE_GAMES) {
    const row = document.createElement('div');
    row.className = 'game-row';
    row.innerHTML = '<span></span><button>Reset</button>';
    row.querySelector('span').textContent = name;
    row.querySelector('button').dataset.scoreGame = key;
    moreEl.appendChild(row);
  }
  panel.querySelectorAll('[data-score-game]').forEach(b => {
    b.onclick = async () => {
      const game = b.dataset.scoreGame;
      if (!confirm('Reset your best score in this game? Cannot be undone.')) return;
      try { await admin('resetScore', { game }); status('🏆 Best score cleared — fresh start next game!'); }
      catch (ex) { status('⚠️ ' + ex.message); }
    };
  });
  // Clicker Simulator setters: the game page exposes window.ARQ_CS_ADMIN (its save is local).
  function csSet(inputSel, fn) {
    const inp = panel.querySelector(inputSel);
    if (!window.ARQ_CS_ADMIN) { status('👆 Open Clicker Simulator first — these set buttons only work on that page.'); return; }
    const v = Number(inp.value);
    if (!isFinite(v) || v < 0) { status('⚠️ Type a number (0 or more) first.'); return; }
    try { status(window.ARQ_CS_ADMIN[fn](Math.floor(v))); inp.value = ''; }
    catch (ex) { status('⚠️ ' + ex.message); }
  }
  panel.querySelector('#arq-cs-coins-btn').onclick = () => csSet('#arq-cs-coins', 'setCoins');
  panel.querySelector('#arq-cs-tokens-btn').onclick = () => csSet('#arq-cs-tokens', 'setTokens');
  panel.querySelector('#arq-cs-rebirths-btn').onclick = () => csSet('#arq-cs-rebirths', 'setRebirths');

  // Live in-game powers: a game page can register window.ARQ_GAME_ADMIN = { actions: [{label, run}] }.
  let hooksBuilt = false;
  function renderHooks() {
    if (hooksBuilt) return;
    const hooks = window.ARQ_GAME_ADMIN;
    const box = panel.querySelector('#arq-game-hooks');
    if (!hooks || !Array.isArray(hooks.actions) || !hooks.actions.length) {
      box.innerHTML = '<div class="who">Open this panel inside City Pursuit 3D for live powers (cash, wanted, repairs).</div>';
      return;
    }
    hooksBuilt = true;
    if (hooks.title) panel.querySelector('#arq-hooks-title').textContent = hooks.title;
    box.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'row';
    for (const a of hooks.actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.onclick = () => { try { const m = a.run(); status(m || '✅ Done.'); } catch (ex) { status('⚠️ ' + ex.message); } };
      row.appendChild(b);
    }
    box.appendChild(row);
  }
  renderHooks();
  panel.querySelector('#arq-wipe').onclick = async () => {
    if (!confirm('Delete ALL accounts and all saved progress? This cannot be undone.')) return;
    if (!confirm('Really wipe everything? You will be signed out.')) return;
    try { await admin('wipe', {}); location.reload(); }
    catch (ex) { status('⚠️ ' + ex.message); }
  };

  /* ------- fullscreen button (every page) ------- */
  (function () {
    if (document.getElementById('arq-fs-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'arq-fs-btn';
    btn.type = 'button';
    btn.textContent = '⛶ Fullscreen';
    btn.setAttribute('aria-label', 'Toggle fullscreen');
    btn.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:900;background:rgba(30,30,48,.88);color:#f5c542;border:1.5px solid #55557a;border-radius:999px;padding:8px 14px;font:700 13px "Segoe UI",system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.4);';
    document.body.appendChild(btn);
    var toastEl = null;
    function fsToast(msg) {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:9999;background:#262640;color:#eee;border:1.5px solid #55557a;border-radius:10px;padding:10px 16px;font:600 14px "Segoe UI",system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.5);pointer-events:none;transition:opacity .3s;';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.style.opacity = '1';
      clearTimeout(fsToast._t);
      fsToast._t = setTimeout(function () { toastEl.style.opacity = '0'; }, 2400);
    }
    function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
    function sync() { btn.textContent = fsEl() ? '⛶ Exit fullscreen' : '⛶ Fullscreen'; }
    btn.addEventListener('click', function () {
      try {
        if (fsEl()) {
          var exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) exit.call(document);
        } else {
          var el = document.documentElement;
          var req = el.requestFullscreen || el.webkitRequestFullscreen;
          if (!req) { fsToast('⛶ Fullscreen isn\'t available in this browser.'); return; }
          var p = req.call(el);
          if (p && p.catch) p.catch(function () { fsToast('⛶ Fullscreen was blocked — try tapping again.'); });
        }
      } catch (e) { fsToast('⛶ Fullscreen isn\'t available here.'); }
      setTimeout(sync, 300);
    });
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  })();
})();
