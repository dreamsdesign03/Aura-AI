const { Client } = require('pg');

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

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const profile = await userRes.json();
    if (!profile.email) {
      return res.redirect('/login?error=no_email');
    }

    const firstName = profile.given_name || (profile.name ? profile.name.split(' ')[0] : '');
    const lastName = profile.family_name || (profile.name && profile.name.split(' ').length > 1 ? profile.name.split(' ').slice(1).join(' ') : '');

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error('DATABASE_URL is not set');
      return res.redirect('/login?error=db_not_configured');
    }

    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [profile.email]);

      if (existingUser.rows.length === 0) {
        await client.query(
          `INSERT INTO users (first_name, last_name, email, password_hash, is_active, onboarding_completed, created_at)
           VALUES ($1, $2, $3, 'oauth_google', true, true, NOW())`,
          [firstName, lastName, profile.email]
        );
      } else {
        await client.query(
          `UPDATE users SET first_name = COALESCE(NULLIF($1, ''), first_name), last_name = COALESCE(NULLIF($2, ''), last_name), is_active = true WHERE email = $3`,
          [firstName, lastName, profile.email]
        );
      }
      await client.end();
    } catch (dbErr) {
      console.error('Database error in Google callback:', dbErr);
    }

    res.setHeader('Set-Cookie', `aura_user_email=${encodeURIComponent(profile.email)}; Path=/; SameSite=Lax; Max-Age=2592000; HttpOnly`);
    res.redirect(`/?auth=success&email=${encodeURIComponent(profile.email)}`);
  } catch (err) {
    console.error('Google OAuth Callback Server Error:', err);
    res.redirect(`/login?error=${encodeURIComponent(err.message || 'server_error')}`);
  }
};
