/* ─────────────────────────────────────────────────────────
   © 2026 Hustlin' For You · hustlin.org · All rights reserved.
   Proprietary source code — unauthorized copying, reproduction,
   or redistribution of this file, in whole or in part, is
   prohibited without prior written permission.
   ─────────────────────────────────────────────────────────
   Hustlin' — Supabase public config
   These are PUBLIC values (safe to ship in client JS):
   - the anon key is designed to be exposed; real access control
     happens via Row Level Security policies in Supabase, not by
     hiding this key.
   Never put the Stripe SECRET key or the Supabase service_role
   key in this file or in any file that ships to the browser.
   ───────────────────────────────────────────────────────── */
window.HFY_CONFIG = {
  SUPABASE_URL: 'https://zddtobudaxyrndjgvhfd.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHRvYnVkYXh5cm5kamd2aGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MTkxNTAsImV4cCI6MjEwMDI5NTE1MH0.anaXZp2dikH5mnIJVLOkRgWMpkss3YlyKQy9Ma22lL4',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_51Tw15DEWy2wCZwx1MxrAcJcijSaYDAojbvBbwiddCvwwsoif5HetXpmMPlL6qhdyYc7iFtHuUap08i3VUOmnfLJY005twK9Rbh',

  // Course catalog — DISPLAY ONLY, and only used as a fallback for marketing
  // pages. The real prices, storage paths, and free-stage rules live in the
  // public.courses table and are read server-side by the Edge Functions, so
  // editing anything below in the browser changes what a visitor *sees*, never
  // what they're charged or what they can open.
  COURSES: {
    fl:    { name: 'Financial Literacy',           price: 0,     free: true  },
    ta:    { name: 'Technical Analysis',           price: 27.95, free: false },
    econ:  { name: 'Economics for Traders',        price: 27.95, free: false },
    fund:  { name: 'Fundamental Analysis Mastery', price: 27.95, free: false },
    psych: { name: 'Trading Psychology Mastery',   price: 27.95, free: false },
    dwg:   { name: 'Disability Wealth Guide',      price: 0,     free: true  }
  }
};
