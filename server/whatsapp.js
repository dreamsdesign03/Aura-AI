const db = require('./db');

// Helper to sanitize phone numbers into E.164 format (numeric only)
function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned) return '';
  
  // Strip leading zero if present (e.g. 09377756660 -> 9377756660)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  
  // If 10 digits starting with 6,7,8,9 (standard Indian mobile pattern), prepend country code 91
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    cleaned = '91' + cleaned;
  }
  
  return cleaned;
}


// Fetch WhatsApp credentials for a given user, falling back to process.env
async function getWhatsAppCredentials(userId) {
  let settings = null;
  if (userId) {
    try {
      const res = await db.query('SELECT * FROM whatsapp_settings WHERE user_id = $1', [userId]);
      if (res.rows.length > 0) {
        settings = res.rows[0];
      }
    } catch (err) {
      console.warn('[whatsapp] DB fetch settings warning:', err.message);
    }
  }

  const phoneNumberId = settings?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '890723640798276';
  const accessToken = settings?.access_token || process.env.WHATSAPP_ACCESS_TOKEN || 'EAAajLrxVRe0BQuaj5Dsh4mLaUpV5prCHZCUCgHaVGEA5MzjrQ2cromOtG8YT2ziklYZBYF2ZC0NsuAyNUENXZADQgQ2ocR36t0ZB1ra4QiUotZB6f2YZAmFgO3HvpTOZC0poDKoxeZAcKpEJ44LmTRXZB15SifuRuIZAoH2iROi1JboQULQ4HryMEl8Gj81GXaE5wl0fgZDZD';
  const appSecret = settings?.app_secret || process.env.WHATSAPP_APP_SECRET || '';
  const webhookVerifyToken = settings?.webhook_verify_token || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'aura_ai_secure_verify_token';
  const n8nWebhookUrl = settings?.n8n_webhook_url || process.env.WHATSAPP_N8N_WEBHOOK_URL || null;

  return {
    phoneNumberId,
    accessToken,
    appSecret,
    webhookVerifyToken,
    n8nWebhookUrl,
    settings,
  };
}

function registerWhatsAppRoutes(app, resolveUserId) {
  // ── 1. GET /api/settings/whatsapp ──────────────────────────────────────────
  app.get('/api/settings/whatsapp', async (req, res) => {
    try {
      const userId = await resolveUserId(req.query.email, req.headers.cookie);
      const { phoneNumberId, accessToken, appSecret, webhookVerifyToken, n8nWebhookUrl, settings } = await getWhatsAppCredentials(userId);

      res.json({
        hasAccessToken: Boolean(accessToken),
        hasAppSecret: Boolean(appSecret),
        phoneNumberId: phoneNumberId || '',
        webhookVerifyToken: webhookVerifyToken || 'aura_ai_secure_verify_token',
        bookingUrl: settings?.booking_url || '',
        consultantName: settings?.consultant_name || '',
        portfolioUrl: settings?.portfolio_url || '',
        caseStudyUrl: settings?.case_study_url || '',
        companyProfileUrl: settings?.company_profile_url || '',
        hookTemplateName: settings?.hook_template_name || '',
        hookTemplateLang: settings?.hook_template_lang || 'en_US',
        n8nWebhookUrl: n8nWebhookUrl || '',
      });
    } catch (err) {
      console.error('[whatsapp] GET settings error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 2. PUT /api/settings/whatsapp ──────────────────────────────────────────
  app.put('/api/settings/whatsapp', async (req, res) => {
    try {
      const userId = await resolveUserId(req.body.email, req.headers.cookie);
      const {
        phoneNumberId,
        accessToken,
        appSecret,
        webhookVerifyToken,
        bookingUrl,
        consultantName,
        portfolioUrl,
        caseStudyUrl,
        companyProfileUrl,
        hookTemplateName,
        hookTemplateLang,
        n8nWebhookUrl,
      } = req.body;

      // Upsert settings row
      const existing = await db.query('SELECT id, access_token, app_secret FROM whatsapp_settings WHERE user_id = $1', [userId]);

      let finalToken = accessToken;
      let finalSecret = appSecret;

      if (existing.rows.length > 0) {
        if (!finalToken) finalToken = existing.rows[0].access_token;
        if (!finalSecret) finalSecret = existing.rows[0].app_secret;

        await db.query(`
          UPDATE whatsapp_settings
          SET phone_number_id = $1,
              access_token = $2,
              app_secret = $3,
              webhook_verify_token = $4,
              booking_url = $5,
              consultant_name = $6,
              portfolio_url = $7,
              case_study_url = $8,
              company_profile_url = $9,
              hook_template_name = $10,
              hook_template_lang = $11,
              n8n_webhook_url = $12,
              updated_at = NOW()
          WHERE user_id = $13
        `, [
          phoneNumberId, finalToken, finalSecret, webhookVerifyToken,
          bookingUrl, consultantName, portfolioUrl, caseStudyUrl,
          companyProfileUrl, hookTemplateName, hookTemplateLang || 'en_US',
          n8nWebhookUrl || null, userId
        ]);
      } else {
        await db.query(`
          INSERT INTO whatsapp_settings (
            user_id, phone_number_id, access_token, app_secret, webhook_verify_token,
            booking_url, consultant_name, portfolio_url, case_study_url,
            company_profile_url, hook_template_name, hook_template_lang, n8n_webhook_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          userId, phoneNumberId, finalToken, finalSecret, webhookVerifyToken,
          bookingUrl, consultantName, portfolioUrl, caseStudyUrl,
          companyProfileUrl, hookTemplateName, hookTemplateLang || 'en_US',
          n8nWebhookUrl || null
        ]);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[whatsapp] PUT settings error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 3. GET /api/whatsapp/conversations ──────────────────────────────────────
  app.get('/api/whatsapp/conversations', async (req, res) => {
    try {
      const userId = await resolveUserId(req.query.email, req.headers.cookie);

      // Select all conversations along with lead data
      const q = `
        SELECT 
          wc.id,
          wc.lead_id as "leadId",
          wc.phone as "waPhoneNumber",
          wc.status,
          wc.state,
          wc.last_message_at as "lastMessageAt",
          wc.created_at as "createdAt",
          l.id as lead_id,
          l.first_name,
          l.last_name,
          l.email as lead_email,
          l.phone as lead_phone,
          l.company,
          l.designation,
          l.status as lead_status,
          (
            SELECT content FROM whatsapp_messages 
            WHERE conversation_id = wc.id 
            ORDER BY sent_at DESC LIMIT 1
          ) as "lastMessage"
        FROM whatsapp_conversations wc
        LEFT JOIN leads l ON wc.lead_id = l.id
        WHERE l.user_id = $1 OR l.user_id IS NULL
        ORDER BY wc.last_message_at DESC;
      `;

      const result = await db.query(q, [userId]);

      const conversations = result.rows.map(row => ({
        id: row.id,
        leadId: row.leadId,
        waPhoneNumber: row.waPhoneNumber || row.lead_phone || '',
        status: row.status,
        state: row.state || 'all',
        lastMessageAt: row.lastMessageAt,
        lastMessage: row.lastMessage || '',
        lead: row.lead_id ? {
          id: row.lead_id,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.lead_email,
          phone: row.lead_phone,
          whatsapp: row.waPhoneNumber || row.lead_phone,
          company: row.company,
          designation: row.designation,
          status: row.lead_status,
        } : null,
      }));

      res.json({ conversations });
    } catch (err) {
      console.error('[whatsapp] GET conversations error:', err.message);
      res.status(500).json({ error: err.message, conversations: [] });
    }
  });

  // ── 4. GET /api/whatsapp/messages/:id ───────────────────────────────────────
  app.get('/api/whatsapp/messages/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Search by conversation_id OR lead_id OR phone
      const q = `
        SELECT 
          id,
          conversation_id as "conversationId",
          lead_id as "leadId",
          direction,
          COALESCE(content, body, '') as content,
          template_name as "templateName",
          meta_message_id as "metaMessageId",
          status,
          COALESCE(sent_at, timestamp, created_at) as "sentAt",
          created_at as "createdAt"
        FROM whatsapp_messages
        WHERE conversation_id = $1 
           OR lead_id = (SELECT lead_id FROM whatsapp_conversations WHERE id = $1)
           OR lead_id = $1
           OR phone = (SELECT phone FROM whatsapp_conversations WHERE id = $1)
        ORDER BY COALESCE(sent_at, timestamp, created_at) ASC;
      `;

      const result = await db.query(q, [id]);
      res.json({ messages: result.rows });
    } catch (err) {
      console.error('[whatsapp] GET messages error:', err.message);
      res.status(500).json({ error: err.message, messages: [] });
    }
  });

  // ── 5. POST /api/whatsapp/send ──────────────────────────────────────────────
  app.post('/api/whatsapp/send', async (req, res) => {
    try {
      const userId = await resolveUserId(req.body.email, req.headers.cookie);
      const { leadId, phone, message, templateName, templateParams, templateLang } = req.body;

      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required.' });
      }

      const targetPhone = cleanPhoneNumber(phone);
      if (!targetPhone) {
        return res.status(400).json({ error: 'Invalid destination phone number.' });
      }

      const { phoneNumberId, accessToken } = await getWhatsAppCredentials(userId);

      let metaMessageId = null;

      const isTemplate = Boolean(templateName);
      const msgContent = isTemplate ? `[Template: ${templateName}]` : String(message || '');

      let metaPayload = {};

      if (isTemplate) {
        metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: targetPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLang || 'en_US' },
          },
        };
        if (Array.isArray(templateParams) && templateParams.length > 0 && templateName !== 'hello_world') {
          metaPayload.template.components = [
            {
              type: 'body',
              parameters: templateParams.map(param => ({
                type: 'text',
                text: String(param),
              })),
            },
          ];
        }
      } else {
        metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: targetPhone,
          type: 'text',
          text: { body: msgContent },
        };
      }

      const targetUrl = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;
      const maskedToken = accessToken ? `Bearer ****${accessToken.slice(-4)}` : '(NONE)';
      const headersToLog = {
        Authorization: maskedToken,
        'Content-Type': 'application/json',
      };

      console.log('\n===== WHATSAPP SEND ATTEMPT =====');
      console.log('Full URL:', targetUrl);
      console.log('Headers:', JSON.stringify(headersToLog, null, 2));
      console.log('Full Request Body:', JSON.stringify(metaPayload, null, 2));

      let metaRes;
      try {
        metaRes = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metaPayload),
        });
      } catch (netErr) {
        console.error('===== WHATSAPP NETWORK EXCEPTION =====');
        console.error('Request failed to send (Network-level exception):', netErr.message);
        console.error('Error Stack:', netErr.stack);
        console.error('======================================\n');
        return res.status(500).json({ error: `Network-level error sending WhatsApp message: ${netErr.message}` });
      }

      let metaData = {};
      try {
        metaData = await metaRes.json();
      } catch (parseErr) {
        console.error('===== WHATSAPP RESPONSE PARSE ERROR =====');
        console.error('HTTP Status Code:', metaRes.status, metaRes.statusText);
        console.error('Failed to parse Meta response JSON:', parseErr.message);
        console.error('==========================================\n');
        return res.status(500).json({ error: 'Failed to parse Meta API response JSON' });
      }

      console.log('--- META API RAW RESPONSE ---');
      console.log('HTTP Status Code:', metaRes.status);
      console.log('Full Response Body (JSON):');
      console.log(JSON.stringify(metaData, null, 2));

      if (metaData && metaData.error) {
        console.log('--- META ERROR OBJECT DETAILS ---');
        console.log('error.code:', metaData.error.code);
        console.log('error.type:', metaData.error.type);
        console.log('error.message:', metaData.error.message);
        console.log('error.error_data:', metaData.error.error_data !== undefined ? JSON.stringify(metaData.error.error_data, null, 2) : undefined);
      }
      console.log('=================================\n');

      if (!metaRes.ok) {
        console.error('[whatsapp] Meta API call failed:', JSON.stringify(metaData));
        let errorMsg = metaData?.error?.message || metaData?.error?.error_user_msg || 'Meta WhatsApp delivery failed.';
        const code = metaData?.error?.code;

        if (code === 131047) {
          errorMsg = '24-hour window expired. Meta policy requires using an approved Meta Template (e.g., hello_world) to message this lead.';
        } else if (code === 131030) {
          errorMsg = 'Recipient phone number is not added to your Meta Test Number allowed list in Meta Developer Portal.';
        } else if (code === 190) {
          errorMsg = 'Meta Access Token has expired or is invalid. Please update your token in Settings -> WhatsApp.';
        } else if (code === 21212) {
          errorMsg = 'Invalid phone number format. Please ensure country code is included.';
        }

        return res.status(400).json({ error: errorMsg, details: metaData });
      }

      if (metaData.messages && metaData.messages.length > 0) {
        metaMessageId = metaData.messages[0].id;
      }

      // Upsert conversation record in DB
      let convId = null;
      let existingConv = null;
      if (leadId) {
        existingConv = await db.query('SELECT id FROM whatsapp_conversations WHERE lead_id = $1', [leadId]);
      }
      if (!existingConv || existingConv.rows.length === 0) {
        existingConv = await db.query('SELECT id FROM whatsapp_conversations WHERE phone = $1', [phone]);
      }

      if (existingConv && existingConv.rows.length > 0) {
        convId = existingConv.rows[0].id;
        await db.query(`
          UPDATE whatsapp_conversations 
          SET last_message_at = NOW(), phone = COALESCE($1, phone)
          WHERE id = $2
        `, [phone, convId]);
      } else {
        const newConv = await db.query(`
          INSERT INTO whatsapp_conversations (lead_id, phone, status, state, last_message_at)
          VALUES ($1, $2, 'Active', 'all', NOW())
          RETURNING id
        `, [leadId || null, phone]);
        convId = newConv.rows[0].id;
      }

      // Record outbound message in whatsapp_messages table
      const insertedMsg = await db.query(`
        INSERT INTO whatsapp_messages (
          conversation_id, lead_id, direction, content, template_name, meta_message_id, status, sent_at
        ) VALUES ($1, $2, 'outbound', $3, $4, $5, 'sent', NOW())
        RETURNING *
      `, [convId, leadId || null, msgContent, templateName || null, metaMessageId]);

      // Record activity in touchpoints if leadId exists
      if (leadId) {
        try {
          await db.query(`
            INSERT INTO touchpoints (lead_id, channel, subject, body, status, sent_at)
            VALUES ($1, 'WhatsApp', $2, $3, 'Sent', NOW())
          `, [leadId, isTemplate ? `Template: ${templateName}` : 'WhatsApp Message', msgContent]);
        } catch (tpErr) {
          console.warn('[whatsapp] Touchpoint insert error:', tpErr.message);
        }
      }

      res.json({
        success: true,
        metaMessageId,
        simulated: isSimulated,
        message: insertedMsg.rows[0],
      });
    } catch (err) {
      console.error('[whatsapp] POST /api/whatsapp/send error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 6. GET /api/whatsapp/webhook (Meta Webhook Verification) ─────────────
  app.get('/api/whatsapp/webhook', async (req, res) => {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      const { webhookVerifyToken } = await getWhatsAppCredentials(null);

      if (mode && token) {
        if (mode === 'subscribe' && (token === webhookVerifyToken || token === 'aura_ai_whatsapp_verify_token_2026' || token === 'aura_ai_secure_verify_token')) {
          console.log('[whatsapp][webhook] Webhook verified successfully!');
          return res.status(200).send(challenge);
        } else {
          console.warn('[whatsapp][webhook] Verification token mismatch. Expected:', webhookVerifyToken, 'Got:', token);
          return res.sendStatus(403);
        }
      }
      res.sendStatus(400);
    } catch (err) {
      console.error('[whatsapp] GET webhook error:', err.message);
      res.status(500).send('Error');
    }
  });

  // ── 7. POST /api/whatsapp/webhook (Meta & n8n Inbound Webhook Listener) ───
  app.post('/api/whatsapp/webhook', async (req, res) => {
    // 1. Requirement 2: Debug logging BEFORE any parsing logic
    console.log('\n===== INCOMING WHATSAPP WEBHOOK =====');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('RAW Body:');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('=====================================\n');

    try {
      let rawBody = req.body || {};
      if (typeof rawBody === 'string') {
        try {
          rawBody = JSON.parse(rawBody);
        } catch (pErr) {
          console.warn('[Meta Webhook] Could not JSON.parse rawBody string:', pErr.message);
        }
      }
      const root = Array.isArray(rawBody) ? rawBody[0] : rawBody;

      // Ensure database columns exist
      try {
        await db.query(`
          ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS lead_id INT;
          ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS phone TEXT;
          ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
          ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'hook_sent';
          ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS last_message TEXT;
          ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NOW();

          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS conversation_id INT;
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS lead_id INT;
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS phone TEXT;
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound';
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS content TEXT;
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS body TEXT;
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS template_name TEXT;
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS meta_message_id TEXT;
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT NOW();
          ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();
        `);
      } catch (tableErr) {}

      // 1. Drill into value object: if req.body.entry exists -> entry[0].changes[0].value, else root directly
      let value = null;
      if (root.entry && Array.isArray(root.entry) && root.entry[0]?.changes?.[0]?.value) {
        value = root.entry[0].changes[0].value;
      } else if (root.value) {
        value = root.value;
      } else {
        value = root;
      }

      if (!value) {
        console.warn('[Meta Webhook] No valid payload value object found.');
        return res.status(200).json({ success: true, message: 'NO_VALUE_OBJECT' });
      }

      // Handle status updates if present
      if (value.statuses && Array.isArray(value.statuses) && value.statuses.length > 0) {
        for (const statusObj of value.statuses) {
          try {
            await db.query('UPDATE whatsapp_messages SET status = $1 WHERE meta_message_id = $2', [statusObj.status, statusObj.id]);
          } catch {}
        }
      }

      // Check for incoming messages
      const messages = value.messages || root.messages;
      if (Array.isArray(messages) && messages.length > 0) {
        for (const msg of messages) {
          // 3. Extract exact fields
          const senderPhone = String(msg.from || root.from || '').trim();
          const waMessageId = String(msg.id || msg.wamid || root.wamid || `wamid_${Date.now()}`);
          const rawTimestamp = msg.timestamp || root.timestamp;
          const senderName = value.contacts?.[0]?.profile?.name || root.contacts?.[0]?.profile?.name || '';

          let messageText = '';
          if (msg.text?.body) {
            messageText = msg.text.body;
          } else if (msg.type === 'text' && typeof msg.text === 'string') {
            messageText = msg.text;
          } else if (msg.interactive) {
            messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interactive Reply]';
          } else if (msg.button) {
            messageText = msg.button?.text || '[Button Click]';
          } else if (typeof msg.body === 'string') {
            messageText = msg.body;
          } else {
            messageText = msg.text?.body || `[${msg.type || 'Media'} Message]`;
          }

          // 4. Find matching lead by phone number (strip '91' country code or non-digits)
          let cleanDigits = senderPhone.replace(/\D/g, '');
          if (cleanDigits.length > 10) {
            cleanDigits = cleanDigits.slice(-10);
          }

          let leadId = null;
          if (cleanDigits) {
            try {
              const leadMatch = await db.query(
                `SELECT id FROM leads 
                 WHERE REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', '') LIKE '%' || $1
                    OR REPLACE(REPLACE(REPLACE(whatsapp, '+', ''), '-', ''), ' ', '') LIKE '%' || $1
                 LIMIT 1`,
                [cleanDigits]
              );
              if (leadMatch.rows[0]?.id) {
                leadId = leadMatch.rows[0].id;
              }
            } catch (lErr) {
              console.warn('[webhook] Lead phone match query error:', lErr.message);
            }
          }

          // Fallback lead match by senderName if phone match didn't find lead
          if (!leadId && senderName) {
            try {
              const nameMatch = await db.query(
                `SELECT id FROM leads 
                 WHERE LOWER(TRIM(first_name || ' ' || COALESCE(last_name, ''))) LIKE '%' || LOWER($1) || '%'
                    OR LOWER(TRIM(first_name)) LIKE '%' || LOWER($1) || '%'
                 LIMIT 1`,
                [senderName.trim()]
              );
              if (nameMatch.rows[0]?.id) {
                leadId = nameMatch.rows[0].id;
              }
            } catch (nErr) {}
          }

          // 7. Console.log right after extraction
          console.log('[Meta Webhook] PARSED INBOUND MESSAGE:', {
            senderPhone,
            cleanDigits,
            messageText,
            senderName,
            waMessageId,
            leadId: leadId || 'NO LEAD FOUND'
          });

          // 5. Find or create conversation linked to lead / phone
          let convId = null;
          try {
            const convMatch = await db.query(
              `SELECT id FROM whatsapp_conversations 
               WHERE phone = $1 
                  OR (lead_id IS NOT NULL AND lead_id = $2)
                  OR REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', '') LIKE '%' || $3
               LIMIT 1`,
              [senderPhone, leadId, cleanDigits]
            );

            if (convMatch.rows.length > 0) {
              convId = convMatch.rows[0].id;
              await db.query(
                `UPDATE whatsapp_conversations 
                 SET last_message_at = NOW(), state = 'inbound_received', lead_id = COALESCE(lead_id, $1) 
                 WHERE id = $2`,
                [leadId, convId]
              );
            } else {
              const newConv = await db.query(
                `INSERT INTO whatsapp_conversations (lead_id, phone, status, state, last_message_at) 
                 VALUES ($1, $2, 'Active', 'inbound_received', NOW()) 
                 RETURNING id`,
                [leadId, senderPhone]
              );
              convId = newConv.rows[0].id;
            }
          } catch (cErr) {
            console.error('[Meta Webhook] Error upserting conversation:', cErr.message);
          }

          const parsedTs = rawTimestamp ? new Date(typeof rawTimestamp === 'number' ? rawTimestamp * 1000 : parseInt(rawTimestamp, 10) * 1000) : new Date();
          const validTime = isNaN(parsedTs.getTime()) ? new Date() : parsedTs;

          // Save inbound message into whatsapp_messages
          try {
            await db.query(
              `INSERT INTO whatsapp_messages (
                 conversation_id, lead_id, phone, direction, content, body, meta_message_id, status, sent_at, timestamp, created_at
               ) VALUES ($1, $2, $3, 'inbound', $4, $4, $5, 'delivered', $6, $6, NOW())`,
              [convId, leadId, senderPhone, messageText, waMessageId, validTime]
            );
            console.log(`[Meta Webhook] SAVED MSG ID: ${waMessageId} into convId: ${convId} for leadId: ${leadId}`);
          } catch (mErr) {
            console.error('[Meta Webhook] Error inserting message:', mErr.message);
          }

          if (leadId) {
            try {
              await db.query(
                `INSERT INTO touchpoints (lead_id, channel, subject, body, status, sent_at)
                 VALUES ($1, 'WhatsApp', 'Inbound WhatsApp Reply', $2, 'Received', $3)`,
                [leadId, messageText, validTime]
              );
            } catch (tpErr) {}
          }
        }
      }

      return res.status(200).json({ success: true, message: 'EVENT_RECEIVED' });
    } catch (err) {
      console.error('[Meta Webhook Exception]:', err.stack || err.message);
      return res.status(200).json({ success: true, message: 'EVENT_RECEIVED' });
    }
  });
}

module.exports = {
  registerWhatsAppRoutes,
  getWhatsAppCredentials,
};
