/* ─────────────────────────────────────────────────────────
   © 2026 Hustlin' For You · hustlin.org · All rights reserved.
   Proprietary source code — unauthorized copying, reproduction,
   or redistribution of this file, in whole or in part, is
   prohibited without prior written permission.
   ─────────────────────────────────────────────────────────
   Hustlin' — Supabase Auth helper
   Requires (loaded before this file, on every page that uses it):
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
     <script src="supabase-config.js"></script>
     <script src="app.js"></script>   (defines window.HFY)
   Adds window.HFY.auth = { ... }
   ───────────────────────────────────────────────────────── */
(function(){
  if(!window.supabase || !window.HFY_CONFIG){
    console.error('HFY.auth: supabase-js or HFY_CONFIG not loaded before auth.js');
    return;
  }
  if(!window.HFY){ console.error('HFY.auth: app.js must load before auth.js'); return; }

  const client = window.supabase.createClient(
    window.HFY_CONFIG.SUPABASE_URL,
    window.HFY_CONFIG.SUPABASE_ANON_KEY
  );
  window.HFY_SUPABASE = client;

  async function getSession(){
    const { data, error } = await client.auth.getSession();
    if(error){ console.error(error); return null; }
    return data.session || null;
  }

  async function getUser(){
    const session = await getSession();
    return session ? session.user : null;
  }

  async function signUp(email, password){
    return client.auth.signUp({ email, password });
  }

  async function signIn(email, password){
    return client.auth.signInWithPassword({ email, password });
  }

  // Absolute URL of the directory the current page lives in, trailing slash
  // included. Used instead of window.location.origin so the site keeps working
  // when it's served from a subdirectory (e.g. Live Server pointed at a parent
  // folder puts the site at /Hustlin-main/).
  function siteBase(){
    return window.location.href.split(/[?#]/)[0].replace(/[^/]*$/, '');
  }

  // ─── Google sign-in ──────────────────────────────────
  // Always returns the user to auth-callback.html — one fixed, clean URL that
  // is easy to whitelist in Supabase's Redirect URLs. The page the user should
  // actually land on is stashed in sessionStorage rather than smuggled through
  // the OAuth round trip as a query param, which keeps the redirect allow-list
  // simple and avoids wildcard-matching surprises with nested paths and
  // query strings.
  const OAUTH_REDIRECT_KEY = 'hfy_oauth_redirect';

  async function signInWithGoogle(redirectTarget){
    try{
      sessionStorage.setItem(OAUTH_REDIRECT_KEY, redirectTarget || 'index.html');
    }catch(e){ /* private browsing — we'll fall back to index.html */ }

    return client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: siteBase() + 'auth-callback.html' }
    });
  }

  // Where auth-callback.html should send the user once the session is live.
  function consumeOAuthRedirect(){
    let target = 'index.html';
    try{
      target = sessionStorage.getItem(OAUTH_REDIRECT_KEY) || target;
      sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
    }catch(e){ /* ignore */ }
    // Never follow an absolute URL out of the site — that would turn this into
    // an open redirect if anything ever wrote a hostile value into storage.
    if(/^[a-z][a-z0-9+.-]*:/i.test(target) || target.indexOf('//') === 0) return 'index.html';
    return target;
  }

  async function signOut(){
    await client.auth.signOut();
  }

  // Sends a "reset your password" email. redirectTo must be an absolute
  // URL — Supabase appends its own recovery token as a URL fragment and
  // sends the user straight there, so it has to point at reset-password.html
  // regardless of which page (course folder or root) kicked this off.
  async function resetPasswordForEmail(email){
    return client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
  }

  // Sets a new password. Only works while the user has an active session —
  // either a normal signed-in session, or the temporary "recovery" session
  // Supabase establishes automatically when the user lands on
  // reset-password.html via the emailed link.
  async function updatePassword(newPassword){
    return client.auth.updateUser({ password: newPassword });
  }

  function onAuthChange(cb){
    client.auth.onAuthStateChange((_event, session) => cb(session, _event));
  }

  // Redirect helper: send the user to login, remembering where to come back to.
  function goToLogin(){
    const back = encodeURIComponent(window.location.href);
    window.location.href = window.HFY.homeHref('login.html') + '?redirect=' + back;
  }

  // ─── Session auto-expiry ─────────────────────────────
  // Supabase's client refreshes the session indefinitely on its own, so a
  // signed-in user would otherwise never get logged out. We layer a simple
  // "haven't been back in N days" rule on top: every page load stamps
  // localStorage with the current time, and if too much time has passed
  // since the last stamp, we force a sign-out before anything else runs.
  const MAX_INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const LAST_ACTIVE_KEY = 'hfy_last_active';

  async function enforceSessionExpiry(){
    try{
      const session = await getSession();
      if(!session) return;
      const last = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0', 10);
      const now = Date.now();
      if(last && (now - last) > MAX_INACTIVITY_MS){
        await signOut();
        localStorage.removeItem(LAST_ACTIVE_KEY);
        return;
      }
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
    }catch(e){ console.error('HFY.auth: session expiry check failed', e); }
  }

  // ─── Account nav — sign-in indicator + Sign Out ──────
  // Injected automatically into the shared nav on any page that loads
  // auth.js. No per-page markup needed.
  function initialsFor(user){
    const email = (user && user.email) || '';
    return email ? email[0].toUpperCase() : '?';
  }

  function closeAccountMenu(e){
    const el = document.getElementById('hfy-account');
    if(el && (!e || !el.contains(e.target))) el.classList.remove('open');
  }

  // Supabase fires onAuthStateChange once immediately on page load (event
  // 'INITIAL_SESSION') in addition to our own ready() call below, so two
  // overlapping calls to renderAccountNav() are expected. Both are async
  // (they await getUser() before checking for an existing element), so
  // without this lock they'd race past each other's "does #hfy-account
  // exist yet?" check and each build a duplicate. Sharing one in-flight
  // promise means the second caller just waits on the first's result.
  let renderInFlight = null;
  function renderAccountNav(){
    if(renderInFlight) return renderInFlight;
    renderInFlight = renderAccountNavImpl().finally(function(){ renderInFlight = null; });
    return renderInFlight;
  }

  async function renderAccountNavImpl(){
    const host = document.querySelector('.nav-stages') || document.querySelector('.nav');
    if(!host) return;
    // Clean up any stray duplicates from before this lock existed (e.g. a
    // cached page load), keeping only the first.
    const existing = document.querySelectorAll('#hfy-account');
    for(let i=1;i<existing.length;i++) existing[i].remove();
    let wrap = existing[0] || null;
    const user = await getUser();

    if(!user){
      if(wrap) wrap.remove();
      return;
    }

    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = 'hfy-account';
      wrap.className = 'hfy-account';
      wrap.innerHTML =
        '<button type="button" class="hfy-account-btn" id="hfy-account-toggle">' +
          '<span class="hfy-account-avatar"></span>' +
          '<span class="hfy-account-label">Account</span>' +
          '<span class="hfy-account-chevron">▾</span>' +
        '</button>' +
        '<div class="hfy-account-menu">' +
          '<div class="hfy-account-email"></div>' +
          '<button type="button" class="hfy-account-signout">Sign Out</button>' +
        '</div>';
      host.appendChild(wrap);

      wrap.querySelector('#hfy-account-toggle').addEventListener('click', function(e){
        e.stopPropagation();
        wrap.classList.toggle('open');
      });
      wrap.querySelector('.hfy-account-signout').addEventListener('click', async function(){
        await signOut();
        localStorage.removeItem(LAST_ACTIVE_KEY);
        window.location.reload();
      });
      document.addEventListener('click', closeAccountMenu);
    }

    wrap.querySelector('.hfy-account-avatar').textContent = initialsFor(user);
    wrap.querySelector('.hfy-account-email').textContent = user.email || '';
  }

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(async function(){
    await enforceSessionExpiry();
    renderAccountNav();
  });

  onAuthChange(function(){ renderAccountNav(); });

  window.HFY.auth = {
    client, getSession, getUser, signUp, signIn, signOut, onAuthChange, goToLogin,
    renderAccountNav, resetPasswordForEmail, updatePassword,
    signInWithGoogle, consumeOAuthRedirect, siteBase
  };
})();
