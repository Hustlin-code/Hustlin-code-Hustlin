/* ─────────────────────────────────────────────────────────
   © 2026 Hustlin' For You · hustlin.org · All rights reserved.
   Proprietary source code — unauthorized copying, reproduction,
   or redistribution of this file, in whole or in part, is
   prohibited without prior written permission.
   ─────────────────────────────────────────────────────────
   Hustlin' — course access + checkout helper
   Requires auth.js loaded first (window.HFY.auth).
   Adds window.HFY.access = { checkCourseAccess, startCheckout }
   ───────────────────────────────────────────────────────── */
(function(){
  if(!window.HFY || !window.HFY.auth){
    console.error('HFY.access: auth.js must load before course-access.js');
    return;
  }

  // Returns true if the currently signed-in user has a paid purchase row
  // for this course. Relies on Supabase RLS to only ever return the
  // caller's own rows (see supabase/schema.sql — "select own purchases").
  // The all-access bundle. Mirrors BUNDLE_KEY in the Edge Functions.
  const BUNDLE_KEY = 'all';

  async function checkCourseAccess(course){
    const user = await window.HFY.auth.getUser();
    if(!user) return false;
    // Either a purchase of this course, or of the bundle that contains it.
    // Same rule the course-content function enforces server-side — this copy
    // exists only so buttons render correctly, and cannot grant anything.
    const { data, error } = await window.HFY_SUPABASE
      .from('purchases')
      .select('id')
      .in('course', course === BUNDLE_KEY ? [BUNDLE_KEY] : [course, BUNDLE_KEY])
      .eq('status', 'paid')
      .limit(1);
    if(error){ console.error('checkCourseAccess error', error); return false; }
    return !!(data && data.length);
  }

  // Kicks off Stripe Checkout for a course by calling the create-checkout-session
  // Edge Function, then redirects the browser to the returned Stripe URL.
  // Throws on failure — caller should catch and show an error to the user.
  // Absolute URL of the directory the current page lives in, trailing slash
  // included. Strips the filename and any query/hash.
  function siteBase(){
    return window.location.href.split(/[?#]/)[0].replace(/[^/]*$/, '');
  }

  async function startCheckout(course, opts){
    opts = opts || {};
    const session = await window.HFY.auth.getSession();
    if(!session){ window.HFY.auth.goToLogin(); return; }

    const res = await fetch(window.HFY_CONFIG.SUPABASE_URL + '/functions/v1/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': window.HFY_CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        course: course,
        // Built from the CURRENT PAGE'S DIRECTORY, not window.location.origin.
        // Origin drops any subdirectory the site is served from — e.g. Live
        // Server pointed at a parent folder serves the site at
        // /Hustlin-main/, so origin + '/checkout-success.html' 404s. Every
        // page that can start checkout (learn.html and the course sales
        // pages) sits alongside checkout-success.html, so the page's own
        // directory is the correct base in both local and production setups.
        success_url: opts.success_url || (siteBase() + 'checkout-success.html?course=' + course + '&session_id={CHECKOUT_SESSION_ID}'),
        cancel_url: opts.cancel_url || window.location.href
      })
    });

    const body = await res.json().catch(()=>({}));
    if(!res.ok || !body.url){
      throw new Error(body.error || ('Checkout failed (' + res.status + ')'));
    }
    window.location.href = body.url;
  }

  window.HFY.access = { checkCourseAccess, startCheckout };
})();
