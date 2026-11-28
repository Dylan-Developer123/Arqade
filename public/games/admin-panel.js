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
  // Squarespace-exact auth form (Dylan's pick, 2026-11-28): white card, centered
  // "Create Account" / "Sign In" title, First/Last name side by side, Email,
  // Create Password + Re-type Password, underline-only fields, no labels or helper
  // text, dark button, mode link under the button. Used by the play gate (blocking)
  // and by the portal Play Now popup (dismissible, opens immediately on the portal).
  const AUTH_STYLE = `
  .arq-auth { position: fixed; inset: 0; z-index: 1000000; background: rgba(8,8,14,.88); display: flex; align-items: center; justify-content: center; padding: 16px; font-family: 'Segoe UI', system-ui, sans-serif; }
  .arq-auth .card { position: relative; background: #ffffff; color: #191920; border: none; border-radius: 4px; padding: 44px 46px 34px; width: min(560px, 94vw); box-sizing: border-box; box-shadow: 0 14px 44px rgba(0,0,0,.65); text-align: center; }
  .arq-auth h2 { margin: 0 0 26px; font-size: 28px; font-weight: 400; color: #111113; }
  .arq-auth input { width: 100%; box-sizing: border-box; background: transparent; color: #191920; border: none; border-bottom: 1px solid #d9d9d9; border-radius: 0; padding: 10px 2px; font-size: 15.5px; margin-bottom: 22px; }
  .arq-auth input::placeholder { color: #9a9aa0; }
  .arq-auth input:focus { outline: none; border-bottom: 2px solid #191920; }
  .arq-auth .namerow { display: flex; gap: 26px; }
  .arq-auth .namerow input { flex: 1; min-width: 0; }
  .arq-auth button.go { width: 100%; background: #3d3d3d; color: #ffffff; border: none; border-radius: 3px; padding: 15px; font-size: 15px; cursor: pointer; margin-top: 10px; }
  .arq-auth button.go:disabled { opacity: .55; }
  .arq-auth .switch { margin-top: 20px; font-size: 13.5px; color: #3c3c43; }
  .arq-auth .switch a, .arq-auth .back { color: #111113; cursor: pointer; text-decoration: none; }
  .arq-auth .switch a:hover, .arq-auth .back:hover { text-decoration: underline; }
  .arq-auth .err { color: #b3261e; font-size: 14px; min-height: 19px; margin: 2px 0 8px; }
  .arq-auth .back { display: inline-block; margin-top: 12px; font-size: 13.5px; opacity: .85; }
  .arq-auth .x { position: absolute; top: 10px; right: 14px; background: none; border: none; font-size: 22px; color: #55555e; cursor: pointer; line-height: 1; padding: 4px; }
  @media (max-width: 560px) { .arq-auth .card { padding: 34px 22px 26px; } }
  `;
  let authStyleDone = false;
  function ensureAuthStyle() {
    if (authStyleDone) return;
    authStyleDone = true;
    const s = document.createElement('style');
    s.textContent = AUTH_STYLE;
    document.head.appendChild(s);
  }
  function makeAuthOverlay(id, opts) {
    ensureAuthStyle();
    const ov = document.createElement('div');
    ov.id = id;
    ov.className = 'arq-auth';
    ov.innerHTML = `
      <div class="card">
        ${opts.dismissible ? '<button class="x" aria-label="Close">&times;</button>' : ''}
        <h2>Sign In</h2>
        <div class="namerow" style="display:none">
          <input class="f-first" type="text" placeholder="First Name" autocomplete="given-name" maxlength="24">
          <input class="f-last" type="text" placeholder="Last Name" autocomplete="family-name" maxlength="24">
        </div>
        <input class="f-email" type="email" placeholder="Email" autocomplete="email" maxlength="254">
        <input class="f-pass" type="password" placeholder="Password" autocomplete="current-password">
        <input class="f-pass2" type="password" placeholder="Re-type Password" autocomplete="new-password" style="display:none">
        <div class="err"></div>
        <button class="go">Sign in</button>
        <div class="switch"><span class="sw-text">Don't have an account?</span> <a class="toggle">Create account</a></div>
        ${opts.backLink ? '<a class="back" href="/">← Back to Arqade home</a>' : ''}
      </div>`;
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    let mode = 'signin';
    const q = (s) => ov.querySelector(s);
    const err = (m) => { q('.err').textContent = m || ''; };
    function setMode(m) {
      mode = m;
      const su = m === 'signup';
      q('h2').textContent = su ? 'Create Account' : 'Sign In';
      q('.namerow').style.display = su ? 'flex' : 'none';
      q('.f-pass2').style.display = su ? 'block' : 'none';
      q('.f-pass').placeholder = su ? 'Create Password' : 'Password';
      q('.f-pass').setAttribute('autocomplete', su ? 'new-password' : 'current-password');
      q('.go').textContent = su ? 'Create account' : 'Sign in';
      q('.sw-text').textContent = su ? 'Already have an account?' : "Don't have an account?";
      q('.toggle').textContent = su ? 'Sign in' : 'Create account';
      err('');
    }
    q('.toggle').addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));
    function close() { ov.remove(); document.body.style.overflow = ''; }
    if (opts.dismissible) {
      q('.x').addEventListener('click', close);
      ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    }
    const submit = async () => {
      const email = q('.f-email').value.trim();
      const password = q('.f-pass').value;
      if (!email || !password) { err('Type your email and password.'); return; }
      const btn = q('.go'); btn.disabled = true; err('');
      try {
        let body;
        if (mode === 'signup') {
          if (!q('.f-first').value.trim()) { err('Enter your first name.'); btn.disabled = false; return; }
          if (password !== q('.f-pass2').value) { err('Passwords do not match.'); btn.disabled = false; return; }
          const displayName = (q('.f-first').value.trim() + ' ' + q('.f-last').value.trim()).trim().slice(0, 24);
          body = { username: '', password, displayName, email };
        } else {
          body = { username: email, password };
        }
        const r = await fetch(mode === 'signup' ? '/api/signup' : '/api/signin', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { err(data.error || 'Something went wrong — try again.'); btn.disabled = false; return; }
        opts.onSuccess();
      } catch (e) { err('Network problem — check your connection and try again.'); btn.disabled = false; }
    };
    q('.go').addEventListener('click', submit);
    ov.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape' && opts.dismissible) close();
    });
    setMode(opts.startMode || 'signin');
    const f = q('.f-email'); if (f) f.focus();
    return ov;
  }
  function showPlayGate() {
    if (document.getElementById('arq-play-gate')) return;
    makeAuthOverlay('arq-play-gate', { dismissible: false, backLink: true, startMode: 'signin', onSuccess: () => location.reload() });
  }
  // Dylan's rule (2026-11-28): clicking Play Now as a guest pops the create/sign-in
  // form up immediately, right on the portal — after signing in you go straight
  // to the game you tapped.
  function showAuthPopup(targetHref) {
    if (document.getElementById('arq-auth-popup') || document.getElementById('arq-play-gate')) return;
    makeAuthOverlay('arq-auth-popup', { dismissible: true, backLink: false, startMode: 'signin', onSuccess: () => { if (targetHref) location.href = targetHref; else location.reload(); } });
  }
  function armPlayNowPopup() {
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a.card, #continueSlot a') : null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!(href.startsWith('/games/') || href === '/miner-cat-2')) return;
      e.preventDefault();
      showAuthPopup(href);
    });
  }

  // Required-email gate: shown to a signed-in player whose account has no email yet.
  function showEmailGate() {
    if (document.getElementById('arq-email-gate')) return;
    const st = document.createElement('style');
    st.textContent = `
  #arq-email-gate { position: fixed; inset: 0; z-index: 100001; background: rgba(10,10,18,.72); display: flex; align-items: center; justify-content: center; font-family: 'Segoe UI', system-ui, sans-serif; }
  #arq-email-gate .card { background: #ffffff; color: #191920; border-radius: 12px; padding: 34px 30px 28px; width: min(400px, 94vw); box-shadow: 0 14px 44px rgba(0,0,0,.65); text-align: center; }
  #arq-email-gate h2 { margin: 0 0 6px; font-size: 25px; font-weight: 600; color: #111113; }
  #arq-email-gate p { margin: 0 0 18px; font-size: 14.5px; color: #6a6a72; line-height: 1.45; }
  #arq-email-gate input { width: 100%; box-sizing: border-box; background: #ffffff; color: #191920; border: 1px solid #c9c9ce; border-radius: 6px; padding: 13px 14px; font-size: 16px; margin-bottom: 10px; }
  #arq-email-gate button { width: 100%; background: #111113; color: #ffffff; border: none; border-radius: 6px; padding: 14px; font-size: 16.5px; font-weight: 700; cursor: pointer; }
  #arq-email-gate button:disabled { opacity: .55; }
  #arq-email-gate .err { color: #b3261e; font-size: 14px; min-height: 19px; margin: 2px 0 8px; }`;
    document.head.appendChild(st);
    const gate = document.createElement('div');
    gate.id = 'arq-email-gate';
    gate.innerHTML = `
      <div class="card">
        <h2>Add your email</h2>
        <p>Your account doesn't have an email yet. Add one — from now on you can sign in with it.</p>
        <input id="eg-email" type="email" placeholder="Email" autocomplete="email" maxlength="254">
        <div class="err" id="eg-err"></div>
        <button id="eg-go">Save email</button>
      </div>`;
    document.body.appendChild(gate);
    document.body.style.overflow = 'hidden';
    const save = async () => {
      const em = gate.querySelector('#eg-email').value.trim();
      const errEl = gate.querySelector('#eg-err');
      const btn = gate.querySelector('#eg-go');
      btn.disabled = true; errEl.textContent = '';
      try {
        const r = await fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { errEl.textContent = d.error || 'Could not save — try again.'; btn.disabled = false; return; }
        gate.remove();
        document.body.style.overflow = '';
      } catch (e) { errEl.textContent = 'Network problem — check your connection and try again.'; btn.disabled = false; }
    };
    gate.querySelector('#eg-go').addEventListener('click', save);
    gate.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    const inp = gate.querySelector('#eg-email'); if (inp) inp.focus();
  }

  let user = null;
  let guest = false;
  try {
    const r = await fetch('/api/me');
    if (r.ok) user = (await r.json()).user;
    else if (r.status === 401) guest = true;
  } catch (e) { /* network hiccup — fail open, so a blip never locks a signed-in player out */ }
  if (!user) {
    if (guest) {
      armPlayNowPopup();
      if (location.pathname.startsWith('/games/')) showPlayGate();
    }
    return;
  }
  // Dylan's rule (2026-11-28): an account without an email must add one.
  if (!user.email) showEmailGate();
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
    <h4><img src="/orb.svg" alt="" style="width:14px;height:14px;vertical-align:-2px;"> Orbs</h4>
    <div class="who">Your balance: <b id="arq-orbs-bal">…</b></div>
    <div class="row">
      <input id="arq-orbs-amt" type="number" min="0" placeholder="Amount">
      <button id="arq-orbs-set">Set mine</button>
      <button id="arq-orbs-add">Give me</button>
    </div>
    <div class="row">
      <input id="arq-orbs-user" placeholder="Player username">
      <button id="arq-orbs-give">🎁 Give</button>
      <button id="arq-orbs-setuser">Set theirs</button>
    </div>
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
    ${user.isOwner ? `<div class="row"><button id="arq-backup">⬇ Backup all data</button></div>` : ''}
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
    ['👆 Clicker Simulator', 'clickersim'], ['🧊 Bloxcraft', 'bloxcraft'],
    ['🏓 Pong', 'pong'], ['💣 Minesweeper', 'minesweeper'], ['👾 Space Invaders', 'invaders'],
    ['🌕 Lunar Lander', 'lander'], ['🏎️ Turbo Racer 3D', 'racer'],
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
  // Orbs: set or add to any player's server-side balance.
  const orbsBalEl = panel.querySelector('#arq-orbs-bal');
  if (typeof user.orbs === 'number') orbsBalEl.textContent = user.orbs.toLocaleString();
  async function orbs(mode, target) {
    const amt = Number(panel.querySelector('#arq-orbs-amt').value);
    if (!isFinite(amt) || amt < 0) return status('⚠️ Type an amount (0 or more) first.');
    try {
      const r = await admin('orbs', { mode, amount: Math.floor(amt), ...(target ? { target } : {}) });
      if (!target) orbsBalEl.textContent = r.orbs.toLocaleString();
      status(mode === 'set'
        ? `✅ Set ${r.username}'s Orbs to ${r.orbs.toLocaleString()}.`
        : `✅ Gave ${Math.floor(amt).toLocaleString()} Orbs to ${r.username} — they now have ${r.orbs.toLocaleString()}.`);
    } catch (ex) { status('⚠️ ' + ex.message); }
  }
  panel.querySelector('#arq-orbs-set').onclick = () => orbs('set');
  panel.querySelector('#arq-orbs-add').onclick = () => orbs('add');
  panel.querySelector('#arq-orbs-give').onclick = () => { const t = val('#arq-orbs-user'); if (t) orbs('add', t); else status('Enter a username.'); };
  panel.querySelector('#arq-orbs-setuser').onclick = () => { const t = val('#arq-orbs-user'); if (t) orbs('set', t); else status('Enter a username.'); };

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
  const backupBtn = panel.querySelector('#arq-backup');
  if (backupBtn) backupBtn.onclick = async () => {
    try {
      status('⏳ Building backup…');
      const d = await admin('backup', {});
      const blob = new Blob([JSON.stringify(d.backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'arqade-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      status('✅ Backup downloaded. Keep that file private — it holds every account.');
    } catch (ex) { status('⚠️ ' + ex.message); }
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
    // Orbs balance pill — signed-in players only, sits above the fullscreen pill.
    fetch('/api/me', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.user) return;
      var pill = document.createElement('div');
      pill.id = 'arq-orbs-pill';
      pill.innerHTML = '<img src="/orb.svg" alt="" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px;">' + (d.user.orbs || 0);
      pill.title = 'Your Orbs — claim task rewards on the portal';
      pill.style.cssText = 'position:fixed;left:12px;bottom:56px;z-index:900;background:rgba(30,30,48,.88);color:#f5c542;border:1.5px solid #55557a;border-radius:999px;padding:6px 13px;font:700 13px "Segoe UI",system-ui,sans-serif;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.4);';
      document.body.appendChild(pill);
    }).catch(function () {});
    // Gamepass pill — on a game page, that game's 2X pass, bought with Orbs (owned server-side).
    (function () {
      var m = location.pathname.match(/^\/games\/([a-z0-9-]+)/);
      if (!m) return;
      var game = m[1];
      var PASS_GAMES = ['snake', 'breakout', 'flappy', 'memory', '2048', 'clicker', 'pong', 'minesweeper', 'invaders', 'lander', 'racer', 'word', 'pursuit3d', 'clickersim', 'bloxcraft'];
      if (PASS_GAMES.indexOf(game) === -1) return;
      var label = game === 'clickersim' ? '2X Clicks' : '2X Score';
      fetch('/api/orbs/pass?game=' + game, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d) return;
        var pill = document.createElement('button');
        pill.id = 'arq-pass-pill';
        pill.style.cssText = 'position:fixed;left:12px;bottom:100px;z-index:900;border-radius:999px;padding:6px 13px;font:700 13px "Segoe UI",system-ui,sans-serif;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer;';
        function paint() {
          if (d.owned) {
            pill.textContent = '\u2B50 ' + label + ' ON';
            pill.style.background = 'rgba(20,60,30,.9)'; pill.style.color = '#7be495'; pill.style.border = '1.5px solid #2f7a44'; pill.style.cursor = 'default';
            pill.title = 'You own this gamepass - ' + label + ' is active in this game.';
          } else {
            pill.innerHTML = '\u2B50 ' + label + ' - <img src="/orb.svg" alt="" style="width:14px;height:14px;vertical-align:-2px;"> ' + d.price + ' - Buy';
            pill.style.background = 'rgba(30,30,48,.88)'; pill.style.color = '#f5c542'; pill.style.border = '1.5px solid #f5c542'; pill.style.cursor = 'pointer';
            pill.title = 'Buy the ' + label + ' gamepass for this game with Orbs - yours forever.';
          }
        }
        paint();
        pill.addEventListener('click', function () {
          if (d.owned) return;
          pill.textContent = 'Buying...';
          fetch('/api/orbs/buy-pass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: game }) })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
              if (!res.ok) { pill.textContent = '\u26A0\uFE0F ' + (res.j.error || 'Could not buy.'); setTimeout(paint, 2800); return; }
              d.owned = true; d.orbs = res.j.orbs;
              paint();
              if (typeof window.ARQ_PASS_BOUGHT === 'function') window.ARQ_PASS_BOUGHT(game);
            })
            .catch(function () { pill.textContent = '\u26A0\uFE0F Connection hiccup - tap again.'; setTimeout(paint, 2800); });
        });
        document.body.appendChild(pill);
      }).catch(function () {});
    })();
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
// ---- Controller support (Gamepad API) --------------------------------------
// Translates a paired controller into the keyboard/mouse input the games
// already use. Left stick + D-pad move (WASD + arrows), A = Space, B = Esc,
// X = F, Y = E, Start = Enter. Right stick drives a cursor for menus and
// mouse games; A clicks when the cursor is out. Idle until a pad connects.
(function () {
  if (!('getGamepads' in navigator)) return;
  var DEFS = {
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', kc: 38 }, ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', kc: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', kc: 37 }, ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', kc: 39 },
    KeyW: { key: 'w', code: 'KeyW', kc: 87 }, KeyA: { key: 'a', code: 'KeyA', kc: 65 },
    KeyS: { key: 's', code: 'KeyS', kc: 83 }, KeyD: { key: 'd', code: 'KeyD', kc: 68 },
    Space: { key: ' ', code: 'Space', kc: 32 }, Escape: { key: 'Escape', code: 'Escape', kc: 27 },
    KeyF: { key: 'f', code: 'KeyF', kc: 70 }, KeyE: { key: 'e', code: 'KeyE', kc: 69 },
    Enter: { key: 'Enter', code: 'Enter', kc: 13 }
  };
  var held = {};
  var cursor = null, cx = 0, cy = 0, cursorOn = false, aWas = false, running = false;
  function fire(type, name) {
    var d = DEFS[name];
    var ev = new KeyboardEvent(type, { key: d.key, code: d.code, bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { value: d.kc }); Object.defineProperty(ev, 'which', { value: d.kc }); } catch (e) {}
    (document.body || document).dispatchEvent(ev);
  }
  function setKey(name, on) {
    if (held[name] === on) return;
    held[name] = on;
    fire(on ? 'keydown' : 'keyup', name);
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:9999;background:#262640;color:#eee;border:1.5px solid #55557a;border-radius:10px;padding:10px 16px;font:600 14px "Segoe UI",system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.5);pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2400);
  }
  function showCursor() {
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.style.cssText = 'position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2.5px solid #f5c542;background:rgba(245,197,66,.25);z-index:9998;pointer-events:none;';
      document.body.appendChild(cursor);
      cx = innerWidth / 2; cy = innerHeight / 2;
    }
    cursor.style.display = 'block';
    cursor.style.left = cx + 'px'; cursor.style.top = cy + 'px';
    cursorOn = true;
  }
  function hideCursor() { if (cursor) cursor.style.display = 'none'; cursorOn = false; }
  document.addEventListener('mousemove', hideCursor);
  function clickAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return;
    var o = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }
  function frame() {
    var gps = navigator.getGamepads ? navigator.getGamepads() : [];
    var gp = null;
    for (var i = 0; i < gps.length; i++) if (gps[i] && gps[i].connected) { gp = gps[i]; break; }
    if (!gp) { running = false; for (var k in held) setKey(k, false); hideCursor(); return; }
    requestAnimationFrame(frame);
    var b = function (n) { return !!(gp.buttons[n] && gp.buttons[n].pressed); };
    var ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, T = 0.35;
    var up = b(12) || ay < -T, dn = b(13) || ay > T, lf = b(14) || ax < -T, rt = b(15) || ax > T;
    setKey('ArrowUp', up); setKey('KeyW', up);
    setKey('ArrowDown', dn); setKey('KeyS', dn);
    setKey('ArrowLeft', lf); setKey('KeyA', lf);
    setKey('ArrowRight', rt); setKey('KeyD', rt);
    setKey('Space', b(0)); setKey('Escape', b(1)); setKey('KeyF', b(2)); setKey('KeyE', b(3)); setKey('Enter', b(9));
    // Right stick = cursor (suppressed while pointer-locked, e.g. Bloxcraft play)
    var rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    if (!document.pointerLockElement && (Math.abs(rx) > 0.25 || Math.abs(ry) > 0.25)) {
      cx = Math.max(4, Math.min(innerWidth - 4, cx + rx * 14));
      cy = Math.max(4, Math.min(innerHeight - 4, cy + ry * 14));
      showCursor();
    }
    if (cursorOn && b(0) && !aWas) clickAt(cx, cy);
    aWas = b(0);
  }
  addEventListener('gamepadconnected', function () {
    toast('🎮 Controller connected');
    if (!running) { running = true; requestAnimationFrame(frame); }
  });
})();
