const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
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

// 2. Executive Stats & Dashboard Analytics
app.get('/api/stats', async (req, res) => {
  try {
    const totalLeadsRes = await db.query('SELECT COUNT(*) FROM leads');
    const bantQualifiedRes = await db.query('SELECT COUNT(*) FROM leads WHERE bant_score >= 70 OR bantb_total >= 70');
    const meetingsRes = await db.query('SELECT COUNT(*) FROM meetings');
    const campaignsRes = await db.query('SELECT COUNT(*) FROM campaigns');
    const reportsRes = await db.query('SELECT COUNT(*) FROM daily_reports');

    // Pipeline stage breakdown
    const pipelineRes = await db.query(`
      SELECT COALESCE(pipeline_stage, status, 'New') as stage, COUNT(*) as count 
      FROM leads 
      GROUP BY stage
    `);

    // BANT score distribution
    const bantDistRes = await db.query(`
      SELECT 
        CASE 
          WHEN bant_score >= 80 THEN 'High Intent (80-100)'
          WHEN bant_score >= 50 THEN 'Medium Intent (50-79)'
          ELSE 'Unqualified (<50)'
        END as category,
        COUNT(*) as count
      FROM leads
      GROUP BY category
    `);

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

// 3. Leads API (Get list, Search, Filter)
app.get('/api/leads', async (req, res) => {
  try {
    const { search, status, stage, minBant, limit = 50, page = 1 } = req.query;
    let whereClauses = [];
    let queryParams = [];

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
      website, industry, country, status = 'New', bant_score = 50, deal_value = 0
    } = req.body;

    const insertRes = await db.query(
      `INSERT INTO leads (
        first_name, last_name, email, phone, company, designation, 
        website, industry, country, status, bant_score, deal_value, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *`,
      [first_name, last_name, email, phone, company, designation, website, industry, country, status, bant_score, deal_value]
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

// 4. Campaigns & ICPs
app.get('/api/campaigns', async (req, res) => {
  try {
    const campaignsRes = await db.query('SELECT * FROM campaigns ORDER BY id DESC');
    res.json(campaignsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/icps', async (req, res) => {
  try {
    const icpsRes = await db.query('SELECT * FROM icps ORDER BY id DESC');
    res.json(icpsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. AI Agent Activity Logs & Touchpoints
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

// 6. Daily Reports
app.get('/api/reports', async (req, res) => {
  try {
    const reportsRes = await db.query('SELECT * FROM daily_reports ORDER BY id DESC LIMIT 20');
    res.json(reportsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Live Neon DB Explorer APIs
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

    // Fetch column info
    const colRes = await db.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position ASC
    `, [tableName]);

    // Fetch sample 50 rows safely
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

// Run Custom SQL Query
app.post('/api/db/query', async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql) {
      return res.status(400).json({ error: 'SQL query string required' });
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

app.listen(PORT, () => {
  console.log(`🚀 Aura AI Express Server listening on http://localhost:${PORT}`);
});
