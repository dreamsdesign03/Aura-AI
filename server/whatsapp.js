const db = require('./db');
const { WHATSAPP_TEMPLATES } = require('./whatsapp-templates');

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

// Template variable cleanup: Meta rejects newlines, tabs and 4+ consecutive spaces.
function sanitizeTplValue(v) {
  return String(v == null ? '' : v)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {4,}/g, ' ')
    .trim();
}

// Map a Meta error object to a status + user-facing message.
function classifyTemplateError(err) {
  const code = Number(err?.code);
  if (code === 131026) return { status: 'not_whatsapp', message: 'This is not a WhatsApp active number' };
  if (code === 132001) return { status: 'failed', message: 'Template not approved yet' };
  if (code === 131030) return { status: 'failed', message: 'Number not in allowed recipient list' };
  if (code === 131049) return { status: 'failed', message: 'Meta blocked this marketing message (Meta Error 131049: Frequency cap reached, recipient opted out, or self-messaging limit)' };
  if (code === 131047) return { status: 'failed', message: '24-hour window expired. Send an approved Meta template.' };
  return { status: 'failed', message: err?.error_data?.details || err?.error_user_msg || err?.message || 'Meta WhatsApp delivery failed.' };
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
          COALESCE(wc.wa_phone_number, wc.phone) as "waPhoneNumber",
          wc.status,
          wc.state,
          COALESCE(wc.last_message_at, wc.updated_at, wc.created_at) as "lastMessageAt",
          COALESCE(wc.updated_at, wc.last_message_at, wc.created_at) as "updatedAt",
          wc.created_at as "createdAt",
          wc.unread_count as "unreadCount",
          l.id as lead_id,
          l.first_name,
          l.last_name,
          l.email as lead_email,
          l.phone as lead_phone,
          l.company,
          l.designation,
          l.status as lead_status,
          COALESCE(wc.last_message, (
            SELECT COALESCE(content, body, '') FROM whatsapp_messages 
            WHERE conversation_id = wc.id OR lead_id = wc.lead_id
            ORDER BY COALESCE(sent_at, timestamp, created_at) DESC LIMIT 1
          ), '') as "lastMessage"
        FROM whatsapp_conversations wc
        LEFT JOIN leads l ON wc.lead_id = l.id
        WHERE l.user_id = $1 OR l.user_id IS NULL OR wc.lead_id IS NULL
        ORDER BY COALESCE(wc.last_message_at, wc.updated_at, wc.created_at) DESC;
      `;

      const result = await db.query(q, [userId]);

      const conversations = result.rows.map(row => ({
        id: row.id,
        leadId: row.leadId,
        waPhoneNumber: row.waPhoneNumber || row.lead_phone || '',
        status: row.status,
        state: row.state || 'all',
        lastMessageAt: row.lastMessageAt,
        updatedAt: row.updatedAt || row.lastMessageAt,
        lastMessage: row.lastMessage || '',
        unreadCount: Number(row.unreadCount || 0),
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
        } : {
          id: null,
          firstName: row.waPhoneNumber || 'WhatsApp Contact',
          lastName: '',
          phone: row.waPhoneNumber || '',
          whatsapp: row.waPhoneNumber || '',
          company: '',
        },
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
      const rawId = req.params.id || req.query.id;
      if (!rawId || rawId === 'undefined' || rawId === 'null' || isNaN(Number(rawId))) {
        return res.json({ messages: [] });
      }
      const targetId = Number(rawId);

      const q = `
        SELECT 
          m.id,
          m.conversation_id as "conversationId",
          m.lead_id as "leadId",
          m.direction,
          COALESCE(m.content, m.body, '') as content,
          COALESCE(m.body, m.content, '') as body,
          m.template_name as "templateName",
          COALESCE(m.meta_message_id, m.wa_message_id, '') as "metaMessageId",
          COALESCE(m.wa_message_id, m.meta_message_id, '') as "waMessageId",
          m.status,
          COALESCE(m.sent_at, m.timestamp, m.created_at, NOW()) as "sentAt",
          COALESCE(m.timestamp, m.sent_at, m.created_at, NOW()) as "timestamp"
        FROM whatsapp_messages m
        WHERE m.conversation_id = $1 
           OR (m.lead_id IS NOT NULL AND m.lead_id = $1)
           OR m.conversation_id IN (SELECT wc.id FROM whatsapp_conversations wc WHERE wc.lead_id = $1 OR wc.id = $1)
           OR m.lead_id IN (SELECT wc.lead_id FROM whatsapp_conversations wc WHERE wc.id = $1 AND wc.lead_id IS NOT NULL)
           OR (
             m.phone IS NOT NULL AND length(m.phone) >= 7 AND
             REPLACE(REPLACE(REPLACE(m.phone, '+', ''), '-', ''), ' ', '') LIKE '%' || COALESCE((
                SELECT REPLACE(REPLACE(REPLACE(wc.phone, '+', ''), '-', ''), ' ', '') 
                FROM whatsapp_conversations wc WHERE wc.id = $1 AND length(wc.phone) >= 7 LIMIT 1
             ), '___NONE___')
           )
           OR (
             m.phone IS NOT NULL AND length(m.phone) >= 7 AND
             REPLACE(REPLACE(REPLACE(m.phone, '+', ''), '-', ''), ' ', '') LIKE '%' || COALESCE((
                SELECT REPLACE(REPLACE(REPLACE(l.phone, '+', ''), '-', ''), ' ', '') 
                FROM leads l WHERE l.id = $1 AND length(l.phone) >= 7 LIMIT 1
             ), '___NONE___')
           )
        ORDER BY COALESCE(m.sent_at, m.timestamp, m.created_at, NOW()) ASC, m.id ASC LIMIT 300;
      `;

      const result = await db.query(q, [targetId]);
      
      // Marker 6: Fetching log
      console.log("===== FETCHING MESSAGES FOR CONVERSATION =====", targetId);
      console.log("MESSAGES RETURNED:", result.rows.length, result.rows.map(m => ({ id: m.id, direction: m.direction, content: m.content })));

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
      let msgContent = String(message || '');
      if (isTemplate && !msgContent) {
        if (templateName === 'hello_world') {
          msgContent = 'Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.';
        } else if (templateName === 'audit_followup') {
          msgContent = 'Hi Mansi 👋 Wanted to check in on your audit.';
        } else {
          msgContent = `[Template: ${templateName}]`;
        }
      }

      let metaPayload = {};

      if (isTemplate) {
        const isAuraTemplate = templateName === 'auraai_lead_send_template';
        const codeLang = isAuraTemplate ? 'en' : (templateLang || 'en');
        metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: targetPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: codeLang },
          },
        };
        if (Array.isArray(templateParams) && templateParams.length > 0 && templateName !== 'hello_world') {
          if (isAuraTemplate) {
            const firstNameVal = String(templateParams[0] || '').trim().split(/\s+/)[0] || 'there';
            const companyVal = String(templateParams[1] || '').trim() || 'your store';
            metaPayload.template.components = [
              {
                type: 'header',
                parameters: [
                  { type: 'text', parameter_name: 'first_name', text: firstNameVal }
                ]
              },
              {
                type: 'body',
                parameters: [
                  { type: 'text', parameter_name: 'company', text: companyVal }
                ]
              }
            ];
          } else if (templateName === 'aura_lead_appointment_booking' || templateName.includes('appointment')) {
            const firstNameVal = String(templateParams[0] || '').trim().split(/\s+/)[0] || 'there';
            metaPayload.template.components = [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: firstNameVal }
                ]
              }
            ];
          } else {
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

        // Auto-retry if parameter count mismatch (e.g. 2 params sent when Meta expects 1)
        if (isTemplate && errorMsg.includes('localizable_params') && metaPayload.template?.components?.[0]?.parameters?.length > 1) {
          console.log('[whatsapp] Retrying template send with 1 parameter...');
          metaPayload.template.components[0].parameters = [metaPayload.template.components[0].parameters[0]];
          const retryRes = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(metaPayload),
          });
          const retryData = await retryRes.json().catch(() => ({}));
          if (retryRes.ok && retryData?.messages?.[0]?.id) {
            metaMessageId = retryData.messages[0].id;
            metaData = retryData;
            metaRes = retryRes;
          }
        }

        if (!metaRes.ok) {
          const code = metaData?.error?.code;

          if (code === 131047) {
            errorMsg = '24-hour window expired. Meta policy requires using an approved Meta Template (e.g., hello_world) to message this lead.';
          } else if (code === 131049) {
            errorMsg = 'Meta Ecosystem Protection (Error 131049): Meta blocked delivery because this recipient reached Meta’s daily marketing template limit, opted out of marketing, or is the registered sender phone number.';
          } else if (code === 131030) {
            errorMsg = 'Recipient phone number is not added to your Meta Test Number allowed list in Meta Developer Portal.';
          } else if (code === 190) {
            errorMsg = 'Meta Access Token has expired or is invalid. Please update your token in Settings -> WhatsApp.';
          } else if (code === 21212) {
            errorMsg = 'Invalid phone number format. Please ensure country code is included.';
          }

          return res.status(400).json({ error: errorMsg, details: metaData });
        }
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
          SET last_message = $1, last_message_at = NOW(), updated_at = NOW(), phone = COALESCE($2, phone), wa_phone_number = COALESCE(wa_phone_number, $2)
          WHERE id = $3
        `, [msgContent, phone, convId]);
      } else {
        const newConv = await db.query(`
          INSERT INTO whatsapp_conversations (lead_id, phone, wa_phone_number, status, state, last_message, last_message_at, updated_at)
          VALUES ($1, $2, $2, 'Active', 'all', $3, NOW(), NOW())
          RETURNING id
        `, [leadId || null, phone, msgContent]);
        convId = newConv.rows[0].id;
      }

      // Record outbound message in whatsapp_messages table
      const insertedMsg = await db.query(`
        INSERT INTO whatsapp_messages (
          conversation_id, lead_id, phone, direction, content, body, template_name, meta_message_id, wa_message_id, status, sent_at, timestamp, created_at
        ) VALUES ($1, $2, $3, 'outbound', $4, $4, $5, $6, $6, 'sent', NOW(), NOW(), NOW())
        RETURNING *
      `, [convId, leadId || null, phone, msgContent, templateName || null, metaMessageId]);

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
        message: insertedMsg.rows[0],
      });
    } catch (err) {
      console.error('[whatsapp] POST /api/whatsapp/send error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 5b. GET /api/whatsapp/templates ─────────────────────────────────────────
  app.get('/api/whatsapp/templates', (req, res) => {
    res.json({ templates: WHATSAPP_TEMPLATES });
  });

  // ── 5c. POST /api/whatsapp/send-template ────────────────────────────────────
  // Manual template send with NAMED variables. No opt-in gating. Never auto-retries.
  app.post('/api/whatsapp/send-template', async (req, res) => {
    try {
      const userId = await resolveUserId(req.body.email, req.headers.cookie);
      const { leadId, phone, name, company, templateId } = req.body;

      const tpl = WHATSAPP_TEMPLATES.find(t => t.id === templateId);
      if (!tpl) return res.status(400).json({ success: false, status: 'failed', error: 'Unknown template.' });

      const targetPhone = cleanPhoneNumber(phone);
      if (!/^\d{11,15}$/.test(targetPhone)) {
        return res.status(400).json({ success: false, status: 'skipped', error: 'No valid phone number.' });
      }

      const values = {
        first_name: sanitizeTplValue(String(name || '').trim().split(/\s+/)[0]) || 'there',
        company: sanitizeTplValue(company) || 'your store',
      };
      const renderedText = `Hi ${values.first_name},\n\n` + tpl.body.replace(/{{(\w+)}}/g, (_, k) => values[k] ?? '');

      let leadData = null;
      if (leadId) {
        try {
          const leadRes = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
          if (leadRes.rows.length > 0) leadData = leadRes.rows[0];
        } catch (err) {}
      }

      if (leadData && leadData.wa_status && (leadData.wa_status === 'dnc' || leadData.wa_status === 'replied')) {
        return res.status(200).json({ success: false, status: 'skipped', error: `Lead status is ${leadData.wa_status}` });
      }

      let status = 'sent';
      let wamid = null;
      let errCode = null;
      let errMsg = null;

      if (tpl.name === 'auraai_leads') {
        const webhookUrl = process.env.N8N_SEND_WEBHOOK_URL;
        if (!webhookUrl) {
          status = 'failed';
          errMsg = 'N8N_SEND_WEBHOOK_URL not configured';
        } else {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            
            const n8nRes = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lead_id: leadId,
                phone: targetPhone,
                company: company || '',
                name: name || '',
                template: 'auraai_leads'
              }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const n8nData = await n8nRes.json().catch(() => ({}));
            
            if (n8nRes.ok && (n8nData.ok || n8nData.success)) {
              wamid = n8nData.wamid || null;
            } else {
              status = 'failed';
              errCode = n8nData.error_code != null ? String(n8nData.error_code) : null;
              errMsg = n8nData.error || 'N8N webhook failed';
            }
          } catch (err) {
            status = 'failed';
            errMsg = err.name === 'AbortError' ? 'Webhook timeout' : `Webhook error: ${err.message}`;
          }
        }
      } else {
        const metaPayload = {
          messaging_product: 'whatsapp',
          to: targetPhone,
          type: 'template',
          template: {
            name: tpl.name,
            language: { code: tpl.language },
            components: [
              {
                type: 'header',
                parameters: [
                  { type: 'text', parameter_name: 'first_name', text: values.first_name }
                ]
              },
              {
                type: 'body',
                parameters: [
                  { type: 'text', parameter_name: 'company', text: values.company }
                ]
              }
            ],
          },
        };

        const { phoneNumberId, accessToken } = await getWhatsAppCredentials(userId);
        console.log('[whatsapp] TEMPLATE SEND ->', targetPhone, JSON.stringify(metaPayload));

        try {
          const metaRes = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(metaPayload),
          });
          const metaData = await metaRes.json().catch(() => ({}));
          console.log('[whatsapp] TEMPLATE SEND RESPONSE', metaRes.status, JSON.stringify(metaData));

          if (!metaRes.ok || metaData?.error) {
            const c = classifyTemplateError(metaData?.error);
            status = c.status;
            errCode = metaData?.error?.code != null ? String(metaData.error.code) : null;
            errMsg = c.message;
          } else {
            wamid = metaData?.messages?.[0]?.id || null;
          }
        } catch (netErr) {
          status = 'failed';
          errMsg = `Network error: ${netErr.message}`;
        }
      }

      // Log in the same tables the existing send uses (failures must never turn a sent message into an error)
      try {
        let convId = null;
        let conv = null;
        if (leadId) conv = await db.query('SELECT id FROM whatsapp_conversations WHERE lead_id = $1', [leadId]);
        if (!conv || conv.rows.length === 0) conv = await db.query('SELECT id FROM whatsapp_conversations WHERE phone = $1 OR phone = $2', [targetPhone, String(phone)]);
        if (conv.rows.length > 0) {
          convId = conv.rows[0].id;
          if (status === 'sent') {
            await db.query('UPDATE whatsapp_conversations SET last_message = $1, last_message_at = NOW(), updated_at = NOW() WHERE id = $2', [renderedText, convId]);
          }
        } else if (status === 'sent') {
          const nc = await db.query(`
            INSERT INTO whatsapp_conversations (lead_id, phone, wa_phone_number, status, state, last_message, last_message_at, updated_at)
            VALUES ($1, $2, $2, 'Active', 'all', $3, NOW(), NOW()) RETURNING id
          `, [leadId || null, targetPhone, renderedText]);
          convId = nc.rows[0].id;
        }

        await db.query(`
          INSERT INTO whatsapp_messages (
            conversation_id, lead_id, phone, direction, content, body, template_name, meta_message_id, wa_message_id, status, error_code, error_message, sent_at, timestamp, created_at
          ) VALUES ($1, $2, $3, 'outbound', $4, $4, $5, $6, $6, $7, $8, $9, NOW(), NOW(), NOW())
        `, [convId, leadId || null, targetPhone, renderedText, tpl.name, wamid, status, errCode, errMsg]);

        if (leadId && status === 'sent') {
          await db.query(`
            INSERT INTO touchpoints (lead_id, channel, subject, body, status, sent_at)
            VALUES ($1, 'WhatsApp', $2, $3, 'Sent', NOW())
          `, [leadId, `Template: ${tpl.name}`, renderedText]);
          
          if (leadData && 'wa_status' in leadData) {
            try {
              await db.query('UPDATE leads SET wa_status = $1, wa_message_id = $2 WHERE id = $3', ['sent', wamid, leadId]);
            } catch (e) {}
          }
        }
      } catch (logErr) {
        console.warn('[whatsapp] template log error:', logErr.message);
      }

      res.json({ success: status === 'sent', status, wamid, errorCode: errCode, error: errMsg, renderedText });
    } catch (err) {
      console.error('[whatsapp] POST /api/whatsapp/send-template error:', err.message);
      res.status(500).json({ success: false, status: 'failed', error: err.message });
    }
  });

  // ── 5d. POST /api/whatsapp/template-status ──────────────────────────────────
  // Lets the UI pick up async webhook results (e.g. 131026) for wamids it just sent.
  app.post('/api/whatsapp/template-status', async (req, res) => {
    try {
      const ids = (Array.isArray(req.body.wamids) ? req.body.wamids : []).filter(Boolean);
      if (ids.length === 0) return res.json({ statuses: [] });
      const r = await db.query(
        `SELECT meta_message_id AS wamid, status, error_code AS "errorCode", error_message AS "errorMessage"
         FROM whatsapp_messages WHERE meta_message_id = ANY($1::text[])`,
        [ids]
      );
      res.json({ statuses: r.rows });
    } catch (err) {
      res.status(500).json({ error: err.message, statuses: [] });
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
    console.log("===== [WHATSAPP WEBHOOK RECEIVED] =====");
    console.log("RAW BODY:", JSON.stringify(req.body, null, 2));

    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS debug_logs (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          event_type TEXT,
          data JSONB
        );
      `);
      await db.query(`INSERT INTO debug_logs (event_type, data, created_at) VALUES ('webhook_received', $1::jsonb, NOW())`, [JSON.stringify(req.body || {})]);
    } catch (e) {}

    try {
      let rawBody = req.body || {};
      if (typeof rawBody === 'string') {
        try { rawBody = JSON.parse(rawBody); } catch (pErr) {}
      }

      // ── Outbound Agent Reply Handling (from n8n / AI Agent Aria) ──
      if (rawBody && rawBody.direction === 'outbound') {
        const content = rawBody.content ? String(rawBody.content).trim() : '';
        let leadId = rawBody.lead_id ? Number(rawBody.lead_id) : null;
        let phone = rawBody.phone ? String(rawBody.phone).trim() : '';
        const waMessageId = rawBody.wa_message_id ? String(rawBody.wa_message_id).trim() : null;

        // Validation check
        if (!content || (!leadId && !phone)) {
          return res.status(400).json({
            success: false,
            error: "Missing required fields: 'content' and at least 'phone' or 'lead_id' must be provided."
          });
        }

        // Extract last 10 digits for phone matching
        let cleanDigits = phone.replace(/\D/g, '');
        if (cleanDigits.length > 10) cleanDigits = cleanDigits.slice(-10);

        // Resolve lead if missing
        if (!leadId && cleanDigits && cleanDigits.length >= 7) {
          try {
            const leadMatch = await db.query(
              `SELECT id, phone, whatsapp FROM leads 
               WHERE REPLACE(REPLACE(REPLACE(COALESCE(phone,''), '+', ''), '-', ''), ' ', '') LIKE '%' || $1
                  OR REPLACE(REPLACE(REPLACE(COALESCE(whatsapp,''), '+', ''), '-', ''), ' ', '') LIKE '%' || $1
               ORDER BY id DESC LIMIT 1`,
              [cleanDigits]
            );
            if (leadMatch.rows[0]?.id) {
              leadId = leadMatch.rows[0].id;
            }
          } catch (lErr) {
            console.error('[WHATSAPP WEBHOOK] Outbound lead lookup error:', lErr.message);
          }
        }

        // If leadId present but phone empty, fetch phone from lead
        if (leadId && !phone) {
          try {
            const leadRes = await db.query(`SELECT phone, whatsapp FROM leads WHERE id = $1`, [leadId]);
            if (leadRes.rows[0]) {
              phone = leadRes.rows[0].phone || leadRes.rows[0].whatsapp || '';
              if (!cleanDigits && phone) {
                cleanDigits = phone.replace(/\D/g, '');
                if (cleanDigits.length > 10) cleanDigits = cleanDigits.slice(-10);
              }
            }
          } catch (pErr) {}
        }

        // Idempotency check: if wa_message_id exists, skip insert & return success
        if (waMessageId) {
          try {
            const existing = await db.query(
              `SELECT id FROM whatsapp_messages WHERE wa_message_id = $1 OR meta_message_id = $1 LIMIT 1`,
              [waMessageId]
            );
            if (existing.rows.length > 0) {
              return res.status(200).json({
                success: true,
                message: "OUTBOUND_EXISTS",
                id: existing.rows[0].id
              });
            }
          } catch (eErr) {}
        }

        // Upsert conversation in whatsapp_conversations
        let convId = null;
        try {
          const convMatch = await db.query(
            `SELECT id FROM whatsapp_conversations 
             WHERE (lead_id IS NOT NULL AND lead_id = $1)
                OR phone = $2 
                OR wa_phone_number = $2
                OR (length($3) >= 7 AND REPLACE(REPLACE(REPLACE(COALESCE(phone, wa_phone_number, ''), '+', ''), '-', ''), ' ', '') LIKE '%' || $3)
             ORDER BY id DESC LIMIT 1`,
            [leadId, phone, cleanDigits]
          );

          if (convMatch.rows.length > 0) {
            convId = convMatch.rows[0].id;
            await db.query(
              `UPDATE whatsapp_conversations 
               SET last_message = $1, last_message_at = NOW(), updated_at = NOW(), state = 'ai_replied', lead_id = COALESCE(lead_id, $2), phone = COALESCE(phone, $3), wa_phone_number = COALESCE(wa_phone_number, $3) 
               WHERE id = $4`,
              [content, leadId, phone, convId]
            );
          } else {
            const newConv = await db.query(
              `INSERT INTO whatsapp_conversations (lead_id, phone, wa_phone_number, status, state, last_message, last_message_at, updated_at, unread_count) 
               VALUES ($1, $2, $2, 'Active', 'ai_replied', $3, NOW(), NOW(), 0) 
               RETURNING id`,
              [leadId, phone, content]
            );
            convId = newConv.rows[0].id;
          }
        } catch (cErr) {
          console.error('[WHATSAPP WEBHOOK] Error upserting conversation for outbound:', cErr.message);
        }

        // Insert message row into whatsapp_messages
        const finalWaMsgId = waMessageId || `wamid_outbound_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const insertedMsg = await db.query(
          `INSERT INTO whatsapp_messages (
             conversation_id, lead_id, phone, direction, content, body, meta_message_id, wa_message_id, status, sent_at, timestamp, created_at
           ) VALUES ($1, $2, $3, 'outbound', $4, $4, $5, $5, 'sent', NOW(), NOW(), NOW())
           RETURNING id`,
          [convId, leadId, phone, content, finalWaMsgId]
        );

        const insertedId = insertedMsg.rows[0].id;

        // Record touchpoint and touch lead's updated_at
        if (leadId) {
          try {
            await db.query(
              `INSERT INTO touchpoints (lead_id, channel, subject, body, status, sent_at)
               VALUES ($1, 'WhatsApp', 'Aria AI WhatsApp Reply', $2, 'Sent', NOW())`,
              [leadId, content]
            );
          } catch (tpErr) {}
          try {
            await db.query(`UPDATE leads SET updated_at = NOW() WHERE id = $1`, [leadId]);
          } catch (lErr) {}
        }

        return res.status(200).json({
          success: true,
          message: "OUTBOUND_SAVED",
          id: insertedId
        });
      }
      let root = Array.isArray(rawBody) ? (rawBody[0] || {}) : rawBody;
      if (root.body) root = root.body;
      if (typeof root === 'string') {
        try { root = JSON.parse(root); } catch (pErr) {}
      }
      if (Array.isArray(root)) root = root[0] || {};

      let value = root;
      if (root.entry && Array.isArray(root.entry) && root.entry[0]) {
        const entry0 = root.entry[0];
        if (entry0.changes && Array.isArray(entry0.changes) && entry0.changes[0]?.value) {
          value = entry0.changes[0].value;
        } else {
          value = entry0;
        }
      } else if (root.changes && Array.isArray(root.changes) && root.changes[0]?.value) {
        value = root.changes[0].value;
      } else if (root.value) {
        value = root.value;
      }

      // Handle status updates
      if (value.statuses && Array.isArray(value.statuses) && value.statuses.length > 0) {
        for (const statusObj of value.statuses) {
          try {
            console.log("[WHATSAPP STATUS UPDATE]:", statusObj.id, "->", statusObj.status);
            const statusErr = statusObj.status === 'failed' && Array.isArray(statusObj.errors) ? statusObj.errors[0] : null;
            if (statusErr) {
              // 131026 = recipient not on WhatsApp
              const failStatus = Number(statusErr.code) === 131026 ? 'not_whatsapp' : 'failed';
              await db.query(
                'UPDATE whatsapp_messages SET status = $1, error_code = $2, error_message = $3 WHERE meta_message_id = $4 OR wa_message_id = $4',
                [failStatus, String(statusErr.code), statusErr.error_data?.details || statusErr.message || statusErr.title || null, statusObj.id]
              );
            } else {
              await db.query('UPDATE whatsapp_messages SET status = $1 WHERE meta_message_id = $2 OR wa_message_id = $2', [statusObj.status, statusObj.id]);
            }
          } catch {}
        }
      }

      let messages = value.messages || root.messages || (Array.isArray(value) ? value : null);
      if (!messages && (value.from || value.text || value.body || value.wamid || value.id)) {
        messages = [value];
      }

      if (Array.isArray(messages) && messages.length > 0) {
        for (const msg of messages) {
          const senderPhone = String(msg.from || msg.sender || root.from || value.from || '').trim();
          const waMessageId = String(msg.id || msg.wamid || root.wamid || `wamid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
          const rawTimestamp = msg.timestamp || root.timestamp || value.timestamp;
          const senderName = value.contacts?.[0]?.profile?.name || root.contacts?.[0]?.profile?.name || msg.name || '';

          let messageText = '';
          if (msg.text?.body) {
            messageText = msg.text.body;
          } else if (msg.type === 'text' && typeof msg.text === 'string') {
            messageText = msg.text;
          } else if (typeof msg.text === 'string') {
            messageText = msg.text;
          } else if (msg.interactive) {
            messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interactive Reply]';
          } else if (msg.button) {
            messageText = msg.button?.text || '[Button Click]';
          } else if (typeof msg.body === 'string') {
            messageText = msg.body;
          } else if (msg.message?.conversation) {
            messageText = msg.message.conversation;
          } else {
            messageText = msg.text?.body || `[${msg.type || 'Media'} Message]`;
          }

          console.log("===== [PARSED INBOUND MESSAGE] =====");
          console.log({ senderPhone, messageText, waMessageId, senderName });

          let cleanDigits = senderPhone.replace(/\D/g, '');
          if (cleanDigits.length > 10) cleanDigits = cleanDigits.slice(-10);

          let leadId = null;
          if (cleanDigits && cleanDigits.length >= 7) {
            try {
              const leadMatch = await db.query(
                `SELECT id FROM leads 
                 WHERE REPLACE(REPLACE(REPLACE(COALESCE(phone,''), '+', ''), '-', ''), ' ', '') LIKE '%' || $1
                    OR REPLACE(REPLACE(REPLACE(COALESCE(whatsapp,''), '+', ''), '-', ''), ' ', '') LIKE '%' || $1
                 ORDER BY id DESC LIMIT 1`,
                [cleanDigits]
              );
              if (leadMatch.rows[0]?.id) leadId = leadMatch.rows[0].id;
            } catch (lErr) {
              console.error("[WHATSAPP WEBHOOK] Lead lookup error:", lErr.message);
            }
          }

          if (!leadId && senderName) {
            try {
              const nameMatch = await db.query(
                `SELECT id FROM leads 
                 WHERE LOWER(TRIM(first_name || ' ' || COALESCE(last_name, ''))) LIKE '%' || LOWER($1) || '%'
                    OR LOWER(TRIM(first_name)) LIKE '%' || LOWER($1) || '%'
                 ORDER BY id DESC LIMIT 1`,
                [senderName.trim()]
              );
              if (nameMatch.rows[0]?.id) leadId = nameMatch.rows[0].id;
            } catch (nErr) {}
          }

          console.log("[WHATSAPP WEBHOOK] Matched lead ID:", leadId ? leadId : "NO MATCH FOUND");

          let convId = null;
          try {
            const convMatch = await db.query(
              `SELECT id FROM whatsapp_conversations 
               WHERE phone = $1 
                  OR wa_phone_number = $1
                  OR (lead_id IS NOT NULL AND lead_id = $2)
                  OR (length($3) >= 7 AND REPLACE(REPLACE(REPLACE(COALESCE(phone, wa_phone_number, ''), '+', ''), '-', ''), ' ', '') LIKE '%' || $3)
               ORDER BY id DESC LIMIT 1`,
              [senderPhone, leadId, cleanDigits]
            );

            if (convMatch.rows.length > 0) {
              convId = convMatch.rows[0].id;
              await db.query(
                `UPDATE whatsapp_conversations 
                 SET last_message = $1, last_message_at = NOW(), updated_at = NOW(), state = 'inbound_received', unread_count = COALESCE(unread_count, 0) + 1, lead_id = COALESCE(lead_id, $2), phone = COALESCE(phone, $3), wa_phone_number = COALESCE(wa_phone_number, $3) 
                 WHERE id = $4`,
                [messageText, leadId, senderPhone, convId]
              );
              console.log("[WHATSAPP WEBHOOK] Updated conversation ID:", convId);
            } else {
              const newConv = await db.query(
                `INSERT INTO whatsapp_conversations (lead_id, phone, wa_phone_number, status, state, last_message, last_message_at, updated_at, unread_count) 
                 VALUES ($1, $2, $2, 'Active', 'inbound_received', $3, NOW(), NOW(), 1) 
                 RETURNING id`,
                [leadId, senderPhone, messageText]
              );
              convId = newConv.rows[0].id;
              console.log("[WHATSAPP WEBHOOK] Created conversation ID:", convId);
            }
          } catch (cErr) {
            console.error('[WHATSAPP WEBHOOK] Error upserting conversation:', cErr.stack || cErr.message);
          }

          const parsedTs = rawTimestamp ? new Date(typeof rawTimestamp === 'number' ? rawTimestamp * 1000 : parseInt(rawTimestamp, 10) * 1000) : new Date();
          const validTime = isNaN(parsedTs.getTime()) ? new Date() : parsedTs;

          try {
            const savedMsg = await db.query(
              `INSERT INTO whatsapp_messages (
                 conversation_id, lead_id, phone, direction, content, body, meta_message_id, wa_message_id, status, sent_at, timestamp, created_at
               ) VALUES ($1, $2, $3, 'inbound', $4, $4, $5, $5, 'delivered', $6, $6, NOW()) RETURNING *`,
              [convId, leadId, senderPhone, messageText, waMessageId, validTime]
            );
            console.log("===== [INBOUND MESSAGE SAVED SUCCESSFULLY IN DB] =====", savedMsg.rows[0]);
          } catch (mErr) {
            console.error("===== [INBOUND MESSAGE SAVE FAILED] =====", mErr.stack || mErr.message);
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
