const { Client } = require('pg');

const NEON_DB_URL = 'postgresql://neondb_owner:npg_Yx39FAMrXPeG@ep-muddy-cell-azvgujn9-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

module.exports = async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`/login?error=${encodeURIComponent(error || 'no_code')}`);
  }

  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect('/login?error=oauth_not_configured');
    }

    // 1. Exchange code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData);
      const errMsg = tokenData.error_description || tokenData.error || 'token_exchange_failed';
      return res.redirect(`/login?error=${encodeURIComponent(errMsg)}`);
    }

    // 2. Fetch Google User Profile
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const profile = await userRes.json();
    if (!profile.email) {
      return res.redirect('/login?error=no_email');
    }

    // 3. Insert or Update User in Neon PostgreSQL DB
    const connectionString = process.env.DATABASE_URL || NEON_DB_URL;
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [profile.email]);
      
      if (existingUser.rows.length === 0) {
        await client.query(
          `INSERT INTO users (first_name, last_name, email, onboarding_completed, created_at)
           VALUES ($1, $2, $3, false, NOW())`,
          [profile.given_name || 'User', profile.family_name || '', profile.email]
        );
      }
      await client.end();
    } catch (dbErr) {
      console.error('Database insertion error:', dbErr);
    }

    // Redirect with email parameter so App.jsx authenticates immediately
    res.redirect(`/?auth=success&email=${encodeURIComponent(profile.email)}`);
  } catch (err) {
    console.error('Google OAuth Callback Server Error:', err);
    res.redirect(`/login?error=${encodeURIComponent(err.message || 'server_error')}`);
  }
};
