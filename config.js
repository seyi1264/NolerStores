window.NOLER_CONFIG = {
  API_BASE_URL: (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'https://nolerstores-xwlgba.fly.dev',
  // Public key (use your Paystack publishable key here). Never put secret keys in frontend code.
  PAYSTACK_PUBLIC_KEY: 'pk_live_891741e2dc74314cb31eb23c7772af2361c657c0',
  // Supabase: set these to your project URL and anon/public key to enable direct client reads
  SUPABASE_URL: 'https://qdwitcaacikqildqfjtd.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_rZAYk1Lyq4uQqgEd_eeTbQ_D5tj-EMM',
  // A timestamp to force redeploys to pick up changes when needed
  DEPLOYED_AT: '2026-07-27T14:40:00Z',
};
