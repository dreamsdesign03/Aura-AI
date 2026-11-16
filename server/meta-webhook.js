const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const {
  ensureMetaSchema,
  findOrCreateMetaConversation,
  persistMetaMessage,
  fetchMetaUserProfile,
  persistMetaComment,
  replyToMetaComment,
  toggleCommentLike,
  toggleCommentVisibility,
  syncInstagramComments,
  syncMetaOmnichannel,
  subscribePageWebhooks,
  getDerivedPageToken,
  META_PAGE_ID,
  META_INSTAGRAM_ACCOUNT_ID
} = require('./meta');

const router = express.Router();

function redact(obj) {
  if (!obj) return obj;
  let str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  str = str.replace(/EAA[a-zA-Z0-9_\-]+/g, 'EAA***');
  str = str.replace(/access_token=[^&"'\s]+/gi, 'access_token=EAA***');
  return typeof obj === 'string' ? str : JSON.parse(str);
}

// Auto-subscribe webhook on boot
subscribePageWebhooks().catch((err) => console.warn('[Meta Webhook Init] Auto-subscribe warning:', err.message));

/**
 * Diagnostic Endpoint (GET /api/meta/debug) - Admin only / protected
 */
router.get('/debug', async (req, res) => {
  try {
    const { runStep0 } = require('./step0-diagnose');
    const results = await runStep0();
    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const VERIFY_TOKEN = () =>
  process.env.META_WEBHOOK_VERIFY_TOKEN ||
  process.env.META_VERIFY_TOKEN ||
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
  // 1. Immediately return 200 OK to Meta to avoid retry storms
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (!body || !body.entry) return;

  const pageId = META_PAGE_ID();
  const igAccountId = META_INSTAGRAM_ACCOUNT_ID();

  // Async event logging & processing
  (async () => {
    try {
      await ensureMetaSchema();

      // Log event to webhook_events table (redacted)
      await db.query(
        `INSERT INTO webhook_events (platform, event_type, payload) VALUES ($1, $2, $3::jsonb)`,
        [
          body.object || 'meta',
          body.entry?.[0]?.messaging ? 'messaging' : (body.entry?.[0]?.changes ? 'changes' : 'other'),
          JSON.stringify(redact(body))
        ]
      ).catch(() => {});

      for (const entry of body.entry) {
        const entryId = String(entry.id || '').trim();

        // ────────────────────────────────────────────────────────────────────────
        // HARD RULE 1: Filter strictly for our business
        // Reject entries for any of the other 13 pages the token owner manages.
        // ────────────────────────────────────────────────────────────────────────
        const isTargetPage = entryId === pageId;
        const isTargetIG = entryId === igAccountId;
        if (!isTargetPage && !isTargetIG && body.object !== 'page' && body.object !== 'instagram') {
          console.log(`[Meta Webhook] Ignoring entry from unrelated account: ${entryId}`);
          continue;
        }

        // ────────────────────────────────────────────────────────────────────────
        // 1. MESSAGING EVENTS (Facebook Messenger & Instagram Direct)
        // ────────────────────────────────────────────────────────────────────────
        if (Array.isArray(entry.messaging)) {
          for (const event of entry.messaging) {
            const senderId = String(event.sender?.id || '').trim();
            const recipientId = String(event.recipient?.id || '').trim();

            const isInstagram =
              body.object === 'instagram' ||
              entryId === igAccountId ||
              recipientId === igAccountId ||
              senderId === igAccountId;

            const channel = isInstagram ? 'instagram' : 'facebook';
            const isEcho = Boolean(event.message?.is_echo || senderId === pageId || senderId === igAccountId);
            const customerId = isEcho ? recipientId : senderId;

            // Handle incoming message or outbound echo
            if (event.message) {
              const mid = event.message.mid;
              const text = event.message.text || '';
              const attachments = event.message.attachments || [];
              const shares = event.message.shares || [];
              const sharedPost = shares.length > 0 ? shares[0] : null;
              let mediaUrl = null;
              if (attachments.length > 0) {
                mediaUrl = attachments[0].payload?.url || attachments[0].image_data?.url || attachments[0].video_data?.url || null;
              }

              console.log(`📩 [Meta Webhook] ${channel.toUpperCase()} message ${isEcho ? '(Echo Outbound)' : '(Inbound)'} customer ${customerId}: "${text || '[Media]'}"`);

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

              // Find or create conversation for the customer
              const conv = await findOrCreateMetaConversation({
                channel,
                senderId: customerId,
                leadId: matchedLeadId,
                windowExpiresAt: new Date(Date.now() + 24 * 3600 * 1000)
              });

              // Persist message
              await persistMetaMessage({
                conversationId: conv.id,
                direction: isEcho ? 'outbound' : 'inbound',
                channel,
                content: text,
                mediaUrl,
                attachments,
                sharedPost,
                metaMessageId: mid,
                status: isEcho ? 'sent' : 'delivered',
                sentAt: event.timestamp ? new Date(event.timestamp) : new Date()
              });
            }

            // Handle message reactions
            if (event.reaction) {
              const mid = event.reaction.mid;
              const action = event.reaction.action;
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

              console.log(`❤️ [Meta Webhook] Reaction ${action} (${emoji}) on mid ${mid}`);
              if (mid) {
                await db.query(
                  `UPDATE meta_messages
                      SET reaction = $1,
                          reaction_emoji = $2
                    WHERE external_id = $3 OR meta_message_id = $3`,
                  [action === 'unreact' ? null : reactionName, action === 'unreact' ? null : emoji, mid]
                ).catch(() => {});
              }
            }

            // Handle read receipts
            if (event.read) {
              await db.query(
                `UPDATE meta_messages m
                    SET status = 'read'
                   FROM meta_conversations c
                  WHERE m.conversation_id = c.id
                    AND c.channel = $1
                    AND (c.external_id = $2 OR c.sender_id = $2)
                    AND m.direction = 'outbound'
                    AND m.status != 'read'`,
                [channel, customerId]
              ).catch(() => {});
            }

            // Handle delivery confirmations
            if (event.delivery && Array.isArray(event.delivery.mids)) {
              for (const mid of event.delivery.mids) {
                await db.query(
                  `UPDATE meta_messages SET status = 'delivered' WHERE (external_id = $1 OR meta_message_id = $1) AND status = 'sent'`,
                  [mid]
                ).catch(() => {});
              }
            }
          }
        }

        // ────────────────────────────────────────────────────────────────────────
        // 2. COMMENTS & FEED EVENTS (Instagram & Facebook Post/Reel Comments)
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
                const username = from.username || null;
                const authorName = username ? `@${username}` : (from.name || `@user_${String(commentId).slice(-4)}`);
                console.log(`💬 [Meta Webhook] New Instagram Comment from ${authorName}: "${text}"`);
                await persistMetaComment({
                  channel: 'instagram',
                  commentId: String(commentId),
                  postId: media.id || val.media_id || null,
                  senderId: from.id ? String(from.id) : null,
                  senderName: authorName,
                  senderUsername: username,
                  text
                }).catch(() => {});
              } else {
                syncInstagramComments().catch(() => {});
              }
            }

            // B. Facebook Feed Comments
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
                }).catch(() => {});
              }
            }

            // C. Lead Ads Form Submissions
            if (change.field === 'leadgen' && change.value?.leadgen_id) {
              const leadgenId = change.value.leadgen_id;
              console.log(`🎯 [Meta Webhook] New Lead Ad submission! Lead ID: ${leadgenId}`);

              try {
                const pageToken = await getDerivedPageToken();
                const leadRes = await fetch(
                  `https://graph.facebook.com/v20.0/${leadgenId}?access_token=${encodeURIComponent(pageToken)}`
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

                  let cleanPhone = phone.replace(/[^\d+]/g, '').trim();
                  if (cleanPhone.length === 10 && !cleanPhone.startsWith('+')) {
                    cleanPhone = '+91' + cleanPhone;
                  }

                  const phoneDigits = cleanPhone.replace(/\D/g, '').slice(-10);
                  const existingLead = phoneDigits ? await db.query(
                    `SELECT id, brand_audit_report FROM leads WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $1 LIMIT 1`,
                    [phoneDigits]
                  ) : { rows: [] };

                  if (existingLead.rows.length > 0) {
                    await db.query(
                      `UPDATE leads
                          SET status = 'New',
                              pipeline_stage = 'Lead In',
                              source = 'Meta Lead Ad',
                              brand_audit_report = $1,
                              updated_at = NOW()
                        WHERE id = $2`,
                      [`[New Ad Inquiry: ${concern}] · ${existingLead.rows[0].brand_audit_report || ''}`.slice(0, 500), existingLead.rows[0].id]
                    );
                  } else {
                    await db.query(
                      `INSERT INTO leads (
                         first_name, last_name, email, phone, whatsapp, source, status, pipeline_stage, industry, brand_audit_report, user_id, created_at
                       ) VALUES ($1, $2, $3, $4, $5, 'Meta Lead Ad', 'New', 'Lead In', $6, $7, 1, NOW())`,
                      [firstName, lastName, email, cleanPhone, cleanPhone, concern, `Imported via Meta Lead Ad (Form: ${change.value.form_id || 'Instant Form'})`]
                    );
                  }
                }
              } catch (leadErr) {
                console.error('❌ [Meta Lead Ad] Failed to process lead data:', leadErr.message);
              }
            }
          }
        }
      }
    } catch (asyncErr) {
      console.error('❌ [Meta Webhook] Async processing error:', asyncErr.message);
    }
  })();
});

/**
 * GET /api/meta/comments - list comments
 */
router.get('/comments', async (req, res) => {
  try {
    await ensureMetaSchema();
    const limit = Number(req.query.limit) || 100;
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
    const result = await syncMetaOmnichannel();
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

/**
 * POST /api/meta/comments/like - like a comment
 */
router.post('/comments/like', async (req, res) => {
  try {
    const { commentId, channel } = req.body || {};
    if (!commentId) return res.status(400).json({ error: 'commentId is required' });
    const result = await toggleCommentLike({ channel, commentId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/comments/visibility - hide or unhide a comment
 */
router.post('/comments/visibility', async (req, res) => {
  try {
    const { commentId, hidden } = req.body || {};
    if (!commentId) return res.status(400).json({ error: 'commentId is required' });
    const result = await toggleCommentVisibility({ commentId, hidden: Boolean(hidden) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/meta/avatar-debug - Diagnostic route for testing participant avatar fetching
 * Query: ?channel=messenger|instagram&id=<participant_id>
 */
router.get('/avatar-debug', async (req, res) => {
  try {
    const rawChannel = (req.query.channel || 'messenger').toLowerCase();
    const channel = (rawChannel === 'messenger' || rawChannel === 'facebook') ? 'messenger' : 'instagram';
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing required query parameter: id' });
    }

    const { getDerivedPageToken, GRAPH_VERSION } = require('./meta');
    const pageToken = await getDerivedPageToken();
    const graphVer = GRAPH_VERSION();
    const fields = channel === 'instagram' ? 'name,username,profile_pic' : 'name,profile_pic';

    const url = `https://graph.facebook.com/${graphVer}/${encodeURIComponent(id)}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`;
    const graphRes = await fetch(url);
    const rawJson = await graphRes.json().catch(() => ({}));

    // Redact any access tokens or secrets from the response
    const sanitizedString = JSON.stringify(rawJson).replace(/EAA[A-Za-z0-9]+/g, 'EAA***');
    const sanitizedData = JSON.parse(sanitizedString);

    return res.status(200).json({
      channel,
      id,
      fieldsRequested: fields,
      graphStatus: graphRes.status,
      response: sanitizedData
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/meta/avatar/:channel/:id - Serve cached avatar binary image
 */
router.get('/avatar/:channel/:id', async (req, res) => {
  try {
    const { channel, id } = req.params;
    const participantId = decodeURIComponent(id);

    const r = await db.query(
      `SELECT image_data, mime_type, fetched_at FROM meta_avatar_cache
        WHERE participant_id = $1 AND channel = $2 AND status = 'cached' AND image_data IS NOT NULL LIMIT 1`,
      [participantId, channel]
    );

    if (r.rows.length === 0 || !r.rows[0].image_data) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.status(404).send('Avatar not cached');
    }

    res.set('Content-Type', r.rows[0].mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400'); // 7 days
    return res.send(r.rows[0].image_data);
  } catch (err) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/avatar/backfill - Trigger rate-limited avatar backfill
 */
router.post('/avatar/backfill', async (req, res) => {
  try {
    const { backfillAvatars } = require('./avatar-service');
    const stats = await backfillAvatars();
    return res.json({ success: true, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
