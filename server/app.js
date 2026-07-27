const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// 1. Health check & DB connection test
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as current_time, current_database() as db_name');
    res.json({
      status: 'connected',
      timestamp: result.rows[0].current_time,
      database: result.rows[0].db_name,
      message: 'Successfully connected to Neon PostgreSQL Database'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// 2. Google OAuth Integration Endpoints
app.get('/api/auth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

  if (!clientId) {
    return res.redirect('/login?error=oauth_not_configured');
  }

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent('openid email profile')}&` +
    `access_type=offline&` +
    `prompt=consent`;

  res.redirect(googleAuthUrl);
});

app.get('/api/auth/google/callback', async (req, res) => {
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

    const firstName = profile.given_name || (profile.name ? profile.name.split(' ')[0] : 'User');
    const lastName = profile.family_name || (profile.name && profile.name.split(' ').length > 1 ? profile.name.split(' ').slice(1).join(' ') : '');

    try {
      const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [profile.email]);
      if (existingUser.rows.length === 0) {
        await db.query(
          `INSERT INTO users (first_name, last_name, email, password_hash, is_active, onboarding_completed, created_at)
           VALUES ($1, $2, $3, 'oauth_google', true, false, NOW())`,
          [firstName, lastName, profile.email]
        );
      } else {
        await db.query(
          `UPDATE users SET first_name = COALESCE(NULLIF($1, ''), first_name), last_name = COALESCE(NULLIF($2, ''), last_name), is_active = true WHERE email = $3`,
          [firstName, lastName, profile.email]
        );
      }
    } catch (dbErr) {
      console.error('Database connection warning in Google callback:', dbErr);
    }

    res.setHeader('Set-Cookie', `aura_user_email=${encodeURIComponent(profile.email)}; Path=/; SameSite=Lax; Max-Age=2592000`);
    res.redirect(`/?auth=success&email=${encodeURIComponent(profile.email)}`);
  } catch (err) {
    console.error('Google OAuth Callback Server Error:', err);
    res.redirect(`/login?error=${encodeURIComponent(err.message || 'server_error')}`);
  }
});

// 3. Auth Current User Status Check
app.get('/api/auth/me', async (req, res) => {
  let email = req.query.email;

  // Fallback: read email from aura_user_email cookie
  if (!email && req.headers.cookie) {
    const cookies = {};
    req.headers.cookie.split(';').forEach(c => {
      const [key, ...rest] = c.split('=');
      cookies[key.trim()] = decodeURIComponent(rest.join('='));
    });
    email = cookies.aura_user_email;
  }

  if (!email) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const namePart = email.split('@')[0];
  const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

  try {
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length > 0) {
      const dbUser = userRes.rows[0];
      return res.status(200).json({
        id: dbUser.id,
        firstName: dbUser.first_name || formattedName,
        lastName: dbUser.last_name || '',
        email: dbUser.email,
        isActive: dbUser.is_active ?? false,
        onboardingCompleted: dbUser.onboarding_completed ?? true
      });
    }
  } catch (err) {
    console.error('DB query error in /api/auth/me:', err.message);
  }

  // User not found — not registered yet
  return res.status(401).json({ error: 'not_registered' });
});

// Standard Login API
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'not_registered' });
    }

    const user = userRes.rows[0];
    await db.query('UPDATE users SET is_active = true WHERE email = $1', [email]);

    res.json({ success: true, user: { ...user, is_active: true } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout — set is_active = false
app.post('/api/auth/logout', async (req, res) => {
  try {
    let email = null;
    if (req.headers.cookie) {
      const cookies = {};
      req.headers.cookie.split(';').forEach(c => {
        const [key, ...rest] = c.split('=');
        cookies[key.trim()] = decodeURIComponent(rest.join('='));
      });
      email = cookies.aura_user_email;
    }
    if (email) {
      await db.query('UPDATE users SET is_active = false WHERE email = $1', [email]);
    }
    res.clearCookie('aura_user_email');
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.json({ success: true });
  }
});

// Update Profile API
app.patch('/api/users/me', async (req, res) => {
  try {
    const { firstName, lastName, email, companyName, designation, city, teamSize } = req.body;
    const updateRes = await db.query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        company_name = COALESCE($3, company_name),
        designation = COALESCE($4, designation),
        city = COALESCE($5, city),
        team_size = COALESCE($6, team_size),
        onboarding_completed = true
       WHERE email = $7 RETURNING *`,
      [firstName, lastName, companyName, designation, city, teamSize, email]
    );

    res.json(updateRes.rows[0] || { success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Executive Stats & Dashboard Analytics
app.get('/api/stats', async (req, res) => {
  try {
    const { email } = req.query;
    let userFilter = '';
    let userParams = [];

    if (email) {
      const userRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRes.rows.length > 0) {
        userFilter = 'WHERE user_id = $1';
        userParams = [userRes.rows[0].id];
      }
    }

    const totalLeadsRes = await db.query(`SELECT COUNT(*) FROM leads ${userFilter}`, userParams);
    const bantQualifiedRes = await db.query(`SELECT COUNT(*) FROM leads ${userFilter ? userFilter + ' AND' : 'WHERE'} (bant_score >= 70 OR bantb_total >= 70)`, userParams);
    const meetingsRes = await db.query(`SELECT COUNT(*) FROM meetings ${userFilter ? 'WHERE lead_id IN (SELECT id FROM leads ' + userFilter + ')' : ''}`, userParams);
    const campaignsRes = await db.query(`SELECT COUNT(*) FROM campaigns ${userFilter}`, userParams);
    const reportsRes = await db.query('SELECT COUNT(*) FROM daily_reports');

    const pipelineRes = await db.query(`
      SELECT COALESCE(pipeline_stage, status, 'New') as stage, COUNT(*) as count 
      FROM leads ${userFilter}
      GROUP BY stage
    `, userParams);

    const bantDistRes = await db.query(`
      SELECT 
        CASE 
          WHEN bant_score >= 80 THEN 'High Intent (80-100)'
          WHEN bant_score >= 50 THEN 'Medium Intent (50-79)'
          ELSE 'Unqualified (<50)'
        END as category,
        COUNT(*) as count
      FROM leads ${userFilter}
      GROUP BY category
    `, userParams);

    res.json({
      totalLeads: parseInt(totalLeadsRes.rows[0].count) || 0,
      bantQualified: parseInt(bantQualifiedRes.rows[0].count) || 0,
      meetingsBooked: parseInt(meetingsRes.rows[0].count) || 0,
      activeCampaigns: parseInt(campaignsRes.rows[0].count) || 0,
      dailyReportsCount: parseInt(reportsRes.rows[0].count) || 0,
      pipelineBreakdown: pipelineRes.rows,
      bantDistribution: bantDistRes.rows
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Leads API
app.get('/api/leads', async (req, res) => {
  try {
    const { search, status, stage, minBant, limit = 50, page = 1, email } = req.query;
    let whereClauses = [];
    let queryParams = [];

    // Filter by user if email is provided
    if (email) {
      const userRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRes.rows.length > 0) {
        whereClauses.push(`user_id = $${queryParams.length + 1}`);
        queryParams.push(userRes.rows[0].id);
      }
    }

    if (search) {
      queryParams.push(`%${search}%`);
      const paramIndex = queryParams.length;
      whereClauses.push(`(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR company ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
    }

    if (status) {
      queryParams.push(status);
      whereClauses.push(`status = $${queryParams.length}`);
    }

    if (stage) {
      queryParams.push(stage);
      whereClauses.push(`pipeline_stage = $${queryParams.length}`);
    }

    if (minBant) {
      queryParams.push(parseInt(minBant));
      whereClauses.push(`(bant_score >= $${queryParams.length} OR bantb_total >= $${queryParams.length})`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countRes = await db.query(`SELECT COUNT(*) FROM leads ${whereString}`, queryParams);
    const totalCount = parseInt(countRes.rows[0].count);

    queryParams.push(parseInt(limit));
    const limitIndex = queryParams.length;
    queryParams.push(offset);
    const offsetIndex = queryParams.length;

    const leadsRes = await db.query(
      `SELECT * FROM leads ${whereString} ORDER BY id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      queryParams
    );

    res.json({
      leads: leadsRes.rows,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new Lead
app.post('/api/leads', async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone, company, designation,
      website, industry, country, status = 'New', bant_score = 50, deal_value = 0,
      userEmail
    } = req.body;

    let userId = null;
    if (userEmail) {
      const userRes = await db.query('SELECT id FROM users WHERE email = $1', [userEmail]);
      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
      }
    }

    const insertRes = await db.query(
      `INSERT INTO leads (
        user_id, first_name, last_name, email, phone, company, designation, 
        website, industry, country, status, bant_score, deal_value, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *`,
      [userId, first_name, last_name, email, phone, company, designation, website, industry, country, status, bant_score, deal_value]
    );

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Error creating lead:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update Lead
app.put('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, company, status, pipeline_stage, bant_score, deal_value } = req.body;

    const updateRes = await db.query(
      `UPDATE leads SET 
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        company = COALESCE($4, company),
        status = COALESCE($5, status),
        pipeline_stage = COALESCE($6, pipeline_stage),
        bant_score = COALESCE($7, bant_score),
        deal_value = COALESCE($8, deal_value),
        updated_at = NOW()
      WHERE id = $9 RETURNING *`,
      [first_name, last_name, email, company, status, pipeline_stage, bant_score, deal_value, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(updateRes.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Lead
app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM leads WHERE id = $1', [id]);
    res.json({ message: 'Lead deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Campaigns & ICPs
app.get('/api/campaigns', async (req, res) => {
  try {
    const { email } = req.query;
    let query = 'SELECT * FROM campaigns';
    let params = [];

    if (email) {
      const userRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRes.rows.length > 0) {
        query += ' WHERE user_id = $1';
        params = [userRes.rows[0].id];
      }
    }

    query += ' ORDER BY id DESC';
    const campaignsRes = await db.query(query, params);
    res.json(campaignsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/icps', async (req, res) => {
  try {
    const { email } = req.query;
    let query = 'SELECT * FROM icps';
    let params = [];

    if (email) {
      const userRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRes.rows.length > 0) {
        query += ' WHERE user_id = $1';
        params = [userRes.rows[0].id];
      }
    }

    query += ' ORDER BY id DESC';
    const icpsRes = await db.query(query, params);
    res.json(icpsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. AI Agent Activity Logs
app.get('/api/agent-logs', async (req, res) => {
  try {
    let logs = [];
    try {
      const logsRes = await db.query('SELECT * FROM agent_activity_log ORDER BY id DESC LIMIT 50');
      logs = logsRes.rows;
    } catch (e) {
      try {
        const actRes = await db.query('SELECT * FROM agent_activities ORDER BY id DESC LIMIT 50');
        logs = actRes.rows;
      } catch (e2) {
        logs = [];
      }
    }
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Daily Reports
app.get('/api/reports', async (req, res) => {
  try {
    const reportsRes = await db.query('SELECT * FROM daily_reports ORDER BY id DESC LIMIT 20');
    res.json(reportsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Live Neon DB Explorer APIs
app.get('/api/db/tables', async (req, res) => {
  try {
    const tablesRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name ASC
    `);
    res.json(tablesRes.rows.map(r => r.table_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db/table/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;

    const colRes = await db.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position ASC
    `, [tableName]);

    const dataRes = await db.query(`SELECT * FROM "${tableName}" LIMIT 50`);

    res.json({
      tableName,
      columns: colRes.rows,
      rows: dataRes.rows,
      rowCount: dataRes.rows.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run Custom SQL Query (Admin only)
app.post('/api/db/query', async (req, res) => {
  try {
    const { sql, email } = req.body;
    if (!sql) {
      return res.status(400).json({ error: 'SQL query string required' });
    }

    // Basic admin check
    const ADMIN_EMAIL = 'admin@aurai.clinic';
    if (!email || email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    }

    // Only allow SELECT queries
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT')) {
      return res.status(403).json({ error: 'Only SELECT queries are allowed.' });
    }

    const queryRes = await db.query(sql);
    res.json({
      command: queryRes.command,
      rowCount: queryRes.rowCount,
      rows: queryRes.rows,
      fields: queryRes.fields ? queryRes.fields.map(f => f.name) : []
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = app;
