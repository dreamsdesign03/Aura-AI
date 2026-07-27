const { Client } = require('pg');

module.exports = async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`/login?error=${error || 'no_code'}`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `https://${req.headers.host}/api/auth/google/callback`;

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
      console.error('Google token exchange error:', tokenData);
      return res.redirect('/login?error=token_exchange_failed');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const profile = await userRes.json();
    if (!profile.email) {
      return res.redirect('/login?error=no_email');
    }

    const connectionString = process.env.DATABASE_URL;
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();

    const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [profile.email]);
    let user;

    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];
    } else {
      const newUserRes = await client.query(
        `INSERT INTO users (first_name, last_name, email, onboarding_completed, created_at)
         VALUES ($1, $2, $3, false, NOW()) RETURNING *`,
        [profile.given_name || '', profile.family_name || '', profile.email]
      );
      user = newUserRes.rows[0];
    }
    await client.end();

    res.redirect(`/?auth=success&email=${encodeURIComponent(user.email)}`);
  } catch (err) {
    console.error('Google OAuth Callback Error:', err);
    res.redirect('/login?error=server_error');
  }
};
