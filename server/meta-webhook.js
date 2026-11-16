const express = require('express');
const db = require('./db');
const {
  ensureMetaSchema,
  findOrCreateMetaConversation,
  persistMetaMessage,
  fetchMetaUserProfile,
  persistMetaComment,
  replyToMetaComment,
  syncInstagramComments,
  META_PAGE_ID,
  META_INSTAGRAM_ACCOUNT_ID
} = require('./meta');

const router = express.Router();

const VERIFY_TOKEN = () =>
  process.env.META_WEBHOOK_VERIFY_TOKEN ||
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
  'aura_meta_verify_token_2026';

/**
 * Webhook Verification Handshake (GET /api/meta/webhook)
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN()) {
    console.log('✅ [Meta Webhook] Handshake verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('⚠️ [Meta Webhook] Verification token mismatch. Got:', token, 'Expected:', VERIFY_TOKEN());
  return res.sendStatus(403);
});

/**
 * Inbound Webhook Event Handler (POST /api/meta/webhook)
 */
router.post('/webhook', async (req, res) => {
  // Acknowledge immediately to Meta to prevent retry storm
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (!body || !body.entry) return;

    const pageId = META_PAGE_ID();
    const igAccountId = META_INSTAGRAM_ACCOUNT_ID();

    for (const entry of body.entry) {
      const entryId = String(entry.id || '').trim();

      // ────────────────────────────────────────────────────────────────────────
      // 1. MESSAGING EVENTS (Facebook Messenger & Instagram Direct)
      // ────────────────────────────────────────────────────────────────────────
      if (Array.isArray(entry.messaging)) {
        for (const event of entry.messaging) {
          const senderId = String(event.sender?.id || '').trim();
          const recipientId = String(event.recipient?.id || '').trim();

          // Ignore echoes of our own outbound sends
          if (senderId === pageId || senderId === igAccountId) {
            continue;
          }

          // Determine channel:
          // If entryId or recipientId matches Instagram Account ID or object is instagram -> instagram
          const isInstagram =
            body.object === 'instagram' ||
            entryId === igAccountId ||
            recipientId === igAccountId;

          const channel = isInstagram ? 'instagram' : 'facebook';

          // Handle incoming message text / media
          if (event.message) {
            const mid = event.message.mid;
            const text = event.message.text || '';
            const attachments = event.message.attachments || [];
            let mediaUrl = null;
            if (attachments.length > 0 && attachments[0].payload?.url) {
              mediaUrl = attachments[0].payload.url;
            }

            console.log(`📩 [Meta Webhook] New ${channel.toUpperCase()} message from ${senderId}: "${text || '[Media]'}"`);

            // Try to match sender to an existing lead by phone if phone number appears in message
            let matchedLeadId = null;
            const phoneMatch = text.match(/(?:\+91|91|0)?[6-9]\d{9}/);
            if (phoneMatch) {
              const cleanDigits = phoneMatch[0].replace(/\D/g, '').slice(-10);
              const leadCheck = await db.query(
                `SELECT id FROM leads WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $1 LIMIT 1`,
                [cleanDigits]
              );
              if (leadCheck.rows.length > 0) {
                matchedLeadId = leadCheck.rows[0].id;
              }
            }

            // Find or create conversation
            const conv = await findOrCreateMetaConversation({
              channel,
              senderId,
              leadId: matchedLeadId
            });

            // Persist message
            await persistMetaMessage({
              conversationId: conv.id,
              direction: 'inbound',
              channel,
              content: text,
              mediaUrl,
              metaMessageId: mid,
              status: 'delivered'
            });
          }

          // Handle incoming reaction (emoji ❤️, 👍, 😂, etc.)
          if (event.reaction) {
            const mid = event.reaction.mid;
            const action = event.reaction.action; // 'react' | 'unreact'
            const reactionName = event.reaction.reaction || '';
            const emojiMap = {
              love: '❤️',
              like: '👍',
              smile: '😄',
              wow: '😮',
              sad: '😢',
              angry: '😡'
            };
            const emoji = event.reaction.emoji || emojiMap[reactionName] || reactionName;

            console.log(`❤️ [Meta Webhook] Reaction ${action} (${emoji}) on message ${mid} from ${senderId}`);

            if (mid) {
              await db.query(
                `UPDATE meta_messages
                    SET reaction = $1,
                        reaction_emoji = $2
                  WHERE meta_message_id = $3`,
                [action === 'unreact' ? null : reactionName, action === 'unreact' ? null : emoji, mid]
              ).catch(e => console.warn('[Meta Webhook] Reaction update warning:', e.message));
            }
          }

          // Handle read receipt / seen status
          if (event.read) {
            console.log(`👁️ [Meta Webhook] Messages seen by ${senderId}`);
            await db.query(
              `UPDATE meta_messages m
                  SET status = 'read'
                 FROM meta_conversations c
                WHERE m.conversation_id = c.id
                  AND c.channel = $1
                  AND c.sender_id = $2
                  AND m.direction = 'outbound'
                  AND m.status != 'read'`,
              [channel, senderId]
            ).catch(e => console.warn('[Meta Webhook] Read receipt update warning:', e.message));
          }
        }
      }

      // ────────────────────────────────────────────────────────────────────────
      // 2. LEAD ADS & COMMENTS EVENTS (Instagram Comments & Facebook Post Comments)
      // ────────────────────────────────────────────────────────────────────────
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          // A. Instagram Comments
          if (change.field === 'comments' || change.field === 'live_comments') {
            const val = change.value || {};
            const commentId = val.id || val.comment_id;
            const text = val.text || val.message || '';
            const from = val.from || {};
            const media = val.media || {};

            if (commentId && text) {
              console.log(`💬 [Meta Webhook] New Instagram Comment from @${from.username || from.id || 'user'}: "${text}"`);
              await persistMetaComment({
                channel: 'instagram',
                commentId: String(commentId),
                postId: media.id || val.media_id || null,
                senderId: from.id ? String(from.id) : null,
                senderName: from.name || (from.username ? `@${from.username}` : 'Instagram User'),
                senderUsername: from.username || null,
                text
              }).catch(e => console.error('[Meta Webhook] Comment save error:', e.message));
            } else {
              console.log('[Meta Webhook] Comment change received, triggering background sync');
              syncInstagramComments().catch(() => {});
            }
          }

          // B. Facebook Page Post Comments
          if (change.field === 'feed') {
            const val = change.value || {};
            const commentId = val.comment_id || val.id;
            const text = val.message || val.text || '';
            const senderName = val.sender_name || val.from?.name || 'Facebook User';
            const senderId = val.sender_id || val.from?.id || null;
            const postId = val.post_id || null;

            if (commentId && text && (val.item === 'comment' || !val.item)) {
              console.log(`💬 [Meta Webhook] New Facebook Comment from ${senderName}: "${text}"`);
              await persistMetaComment({
                channel: 'facebook',
                commentId: String(commentId),
                postId: postId ? String(postId) : null,
                senderId: senderId ? String(senderId) : null,
                senderName,
                text
              }).catch(e => console.error('[Meta Webhook] FB Comment save error:', e.message));
            }
          }

          // C. Lead Ads Form Submissions
          if (change.field === 'leadgen' && change.value?.leadgen_id) {
            const leadgenId = change.value.leadgen_id;
            console.log(`🎯 [Meta Webhook] New Lead Ad submission received! Lead ID: ${leadgenId}`);

            const pageToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
            if (pageToken) {
              try {
                const leadRes = await fetch(
                  `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(pageToken)}`
                );
                if (leadRes.ok) {
                  const leadData = await leadRes.json();
                  const fieldData = leadData.field_data || [];

                  let fullName = '';
                  let email = '';
                  let phone = '';
                  let concern = 'Meta Ad Lead';

                  for (const f of fieldData) {
                    const name = (f.name || '').toLowerCase();
                    const val = (f.values && f.values[0]) || '';
                    if (name.includes('name') || name.includes('full_name')) fullName = val;
                    else if (name.includes('email')) email = val;
                    else if (name.includes('phone') || name.includes('mobile')) phone = val;
                    else if (name.includes('service') || name.includes('concern') || name.includes('treatment')) concern = val;
                  }

                  const nameParts = fullName.trim().split(/\s+/);
                  const firstName = nameParts[0] || 'Meta';
                  const lastName = nameParts.slice(1).join(' ') || 'Lead';

                  // Normalize phone number
                  let cleanPhone = phone.replace(/[^\d+]/g, '').trim();
                  if (cleanPhone.length === 10 && !cleanPhone.startsWith('+')) {
                    cleanPhone = '+91' + cleanPhone;
                  }

                  // Check if lead already exists by phone
                  const phoneDigits = cleanPhone.replace(/\D/g, '').slice(-10);
                  const existingLead = phoneDigits ? await db.query(
                    `SELECT id, brand_audit_report FROM leads WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $1 LIMIT 1`,
                    [phoneDigits]
                  ) : { rows: [] };

                  let leadId;
                  if (existingLead.rows.length > 0) {
                    leadId = existingLead.rows[0].id;
                    await db.query(
                      `UPDATE leads
                          SET status = 'New',
                              pipeline_stage = 'Lead In',
                              source = 'Meta Lead Ad',
                              brand_audit_report = $1,
                              updated_at = NOW()
                        WHERE id = $2`,
                      [`[New Ad Inquiry: ${concern}] · ${existingLead.rows[0].brand_audit_report || ''}`.slice(0, 500), leadId]
                    );
                    console.log(`✅ [Meta Lead Ad] Updated existing Lead #${leadId} (${firstName} ${lastName}, ${cleanPhone})`);
                  } else {
                    const inserted = await db.query(
                      `INSERT INTO leads (
                         first_name, last_name, email, phone, whatsapp, source, status, pipeline_stage, industry, brand_audit_report, user_id, created_at
                       ) VALUES ($1, $2, $3, $4, $5, 'Meta Lead Ad', 'New', 'Lead In', $6, $7, 1, NOW())
                       RETURNING id`,
                      [firstName, lastName, email, cleanPhone, cleanPhone, concern, `Imported via Meta Lead Ad (Form: ${change.value.form_id || 'Instant Form'})`]
                    );
                    leadId = inserted.rows[0]?.id;
                    console.log(`✅ [Meta Lead Ad] Successfully inserted new Lead #${leadId} (${firstName} ${lastName}, ${cleanPhone})`);
                  }
                }
              } catch (leadErr) {
                console.error('❌ [Meta Lead Ad] Failed to process lead data:', leadErr.message);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ [Meta Webhook] Error processing event:', err.message);
  }
});

/**
 * GET /api/meta/comments - list comments
 */
router.get('/comments', async (req, res) => {
  try {
    await ensureMetaSchema();
    const limit = Number(req.query.limit) || 50;
    const channel = req.query.channel;
    let query = 'SELECT * FROM meta_comments';
    const params = [];
    if (channel) {
      params.push(channel);
      query += ` WHERE channel = $${params.length}`;
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const r = await db.query(query, params);
    res.json({ comments: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/comments/sync - manually sync comments from Meta Graph API
 */
router.post('/comments/sync', async (req, res) => {
  try {
    const result = await syncInstagramComments();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/comments/reply - reply to a comment
 */
router.post('/comments/reply', async (req, res) => {
  try {
    const { commentId, channel, message } = req.body || {};
    if (!commentId || !message) {
      return res.status(400).json({ error: 'commentId and message are required' });
    }

    const result = await replyToMetaComment({
      channel: channel || 'instagram',
      commentId,
      message
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

