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
const { normalizeRole, isAdminRole } = require('./permissions');

const router = express.Router();

function redact(obj) {
  if (!obj) return obj;
  let str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  str = str.replace(/EAA[a-zA-Z0-9_\-]+/g, 'EAA***');
  str = str.replace(/access_token=[^&"'\s]+/gi, 'access_token=EAA***');
  return typeof obj === 'string' ? str : JSON.parse(str);
}

// ────────────────────────────────────────────────────────────────────────
// E.1: Auth middleware protecting /api/meta routes (same as /api/clinic)
// ────────────────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  try {
    let email = null;
    if (req.headers.cookie) {
      const match = /(?:^|;\s*)aura_user_email=([^;]+)/.exec(req.headers.cookie);
      if (match) email = decodeURIComponent(match[1]);
    }
    if (!email) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    const u = await db.query(
      'SELECT id, first_name, last_name, email, username, role FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    if (u.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    req.user = u.rows[0];
    req.user.accessRole = normalizeRole(req.user.role, req.user);
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!isAdminRole(req.user?.accessRole)) {
      return res.status(403).json({ error: 'Admin access required', code: 'ROLE_FORBIDDEN' });
    }
    next();
  });
}

// A.6: Dedicated error logger that never swallows errors and records to webhook_events.error
async function logWebhookError(context, err, eventId = null) {
  const msg = err?.message || String(err || 'Unknown error');
  const redacted = msg.replace(/EAA[a-zA-Z0-9_\-]+/g, 'EAA***');
  console.error(`[Meta Webhook Error][${context}]`, redacted);
  try {
    if (eventId) {
      await db.query('UPDATE webhook_events SET error = $1 WHERE id = $2', [redacted, eventId]);
    } else {
      await db.query(
        'UPDATE webhook_events SET error = $1 WHERE id = (SELECT MAX(id) FROM webhook_events)',
        [redacted]
      );
    }
  } catch (dbErr) {
    console.error('[Meta Webhook] Failed to write error to webhook_events:', dbErr.message);
  }
}

// Auto-subscribe webhook on boot
subscribePageWebhooks().catch((err) => console.warn('[Meta Webhook Init] Auto-subscribe warning:', err.message));

/**
 * Diagnostic Endpoint (GET /api/meta/debug) - Admin only
 */
router.get('/debug', requireAdmin, async (req, res) => {
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
  null;

/**
 * Webhook Verification Handshake (GET /api/meta/webhook)
 * E.2: Remove hardcoded token fallback and never log the token
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = VERIFY_TOKEN();

  if (!expectedToken) {
    console.error('[Meta Webhook] Verification failed: No verify token configured in environment');
    return res.sendStatus(500);
  }

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('✅ [Meta Webhook] Handshake verified successfully with Meta');
    return res.status(200).send(challenge);
  }

  console.warn('⚠️ [Meta Webhook] Verification token mismatch');
  return res.sendStatus(403);
});

/**
 * Inbound Webhook Event Handler (POST /api/meta/webhook)
 * E.2: HMAC-SHA256 signature verification using rawBody and timingSafeEqual
 */
router.post('/webhook', async (req, res) => {
  const appSecret = process.env.META_APP_SECRET;
  const sigHeader = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];

  // Verify HMAC-SHA256 signature
  if (!sigHeader || !sigHeader.startsWith('sha256=')) {
    console.warn('[Meta Webhook Security] Missing or malformed X-Hub-Signature-256 header');
    await db.query(
      "INSERT INTO webhook_events (platform, event_type, payload, error) VALUES ('meta', 'unauthorized', $1::jsonb, 'Missing or malformed X-Hub-Signature-256 header')",
      [JSON.stringify(redact(req.body || {}))]
    ).catch(e => console.error('[Meta Webhook] Signature failure log error:', e.message));
    return res.status(401).json({ error: 'Missing or malformed X-Hub-Signature-256 header' });
  }

  if (!appSecret) {
    console.error('[Meta Webhook Security] META_APP_SECRET not configured');
    await db.query(
      "INSERT INTO webhook_events (platform, event_type, payload, error) VALUES ('meta', 'configuration_error', $1::jsonb, 'META_APP_SECRET not configured')",
      [JSON.stringify(redact(req.body || {}))]
    ).catch(e => console.error('[Meta Webhook] Secret failure log error:', e.message));
    return res.status(500).json({ error: 'META_APP_SECRET not configured' });
  }

  const expectedSig = sigHeader.replace(/^sha256=/, '').trim();
  const rawBuf = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const computedHmac = crypto.createHmac('sha256', appSecret).update(rawBuf).digest('hex');

  let isValid = false;
  try {
    isValid = crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(computedHmac, 'hex'));
  } catch {
    isValid = false;
  }

  if (!isValid) {
    console.warn('[Meta Webhook Security] Invalid HMAC signature detected');
    await db.query(
      "INSERT INTO webhook_events (platform, event_type, payload, error) VALUES ('meta', 'unauthorized', $1::jsonb, 'Invalid X-Hub-Signature-256 HMAC')",
      [JSON.stringify(redact(req.body || {}))]
    ).catch(e => console.error('[Meta Webhook] Signature failure log error:', e.message));
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  // 1. Immediately return 200 OK to Meta after valid signature verification
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (!body || !body.entry) return;

  const pageId = META_PAGE_ID();
  const igAccountId = META_INSTAGRAM_ACCOUNT_ID();

  // Async event logging & processing
  (async () => {
    let currentEventId = null;
    try {
      await ensureMetaSchema();

      // Log event to webhook_events table (redacted)
      const eventLogRes = await db.query(
        `INSERT INTO webhook_events (platform, event_type, payload) VALUES ($1, $2, $3::jsonb) RETURNING id`,
        [
          body.object || 'meta',
          body.entry?.[0]?.messaging ? 'messaging' : (body.entry?.[0]?.changes ? 'changes' : 'other'),
          JSON.stringify(redact(body))
        ]
      ).catch(e => logWebhookError('EventLog', e));
      if (eventLogRes && eventLogRes.rows && eventLogRes.rows.length > 0) {
        currentEventId = eventLogRes.rows[0].id;
      }

      for (const entry of body.entry) {
        const entryId = String(entry.id || '').trim();

        // ────────────────────────────────────────────────────────────────────────
        // HARD RULE 1: Filter strictly for our business
        // Reject entries for any other page/account the token owner manages.
        // Accepts both META_PAGE_ID and META_IG_USER_ID (17841461905363722).
        // ────────────────────────────────────────────────────────────────────────
        const isTargetPage = entryId === pageId;
        const isTargetIG = entryId === igAccountId;
        const isTarget = isTargetPage || isTargetIG;

        if (!isTarget) {
          const sanitizedEntry = JSON.stringify(entry).replace(/EAA[A-Za-z0-9]+/g, 'EAA***');
          console.log(`[Meta Webhook] Rejecting entry from unrelated account: entryId=${entryId}, object=${body.object} (allowed: page=${pageId}, ig=${igAccountId}). Payload: ${sanitizedEntry.slice(0, 160)}`);
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

              // B.1: Store attachments keeping type + payload + title
              const rawAttachments = event.message.attachments || [];
              const attachments = rawAttachments.map(att => {
                const type = att.type || 'attachment';
                const url = att.payload?.url || att.url || att.image_data?.url || att.video_data?.url || att.audio_data?.url || att.file_url || null;
                const title = att.title || att.name || att.payload?.title || null;
                let payload = att.payload || {};

                if (type === 'ig_reel' || type === 'reel') {
                  payload = {
                    reel_video_id: att.payload?.reel_video_id || att.reel_video_id || null,
                    title: title || att.payload?.title || 'Shared reel',
                    url: url || att.payload?.url || null
                  };
                }

                return {
                  type,
                  payload,
                  url,
                  title
                };
              });

              const shares = event.message.shares || [];
              const storyMention = event.message.story_mention || null;
              let sharedPost = null;
              if (shares.length > 0) {
                const sp = shares[0];
                sharedPost = {
                  type: sp.type || 'share',
                  url: sp.link || sp.url || sp.payload?.url || null,
                  title: sp.title || sp.caption || sp.name || null,
                  thumbnail: sp.thumbnail || sp.thumbnail_url || null
                };
              } else if (storyMention) {
                sharedPost = {
                  type: 'story_mention',
                  url: storyMention.link || storyMention.url || null,
                  title: storyMention.title || 'Story Mention',
                  thumbnail: storyMention.thumbnail || null
                };
              }

              // B.1: Do NOT put a link URL in media_url unless type is image
              let mediaUrl = null;
              if (attachments.length > 0 && attachments[0].type === 'image') {
                mediaUrl = attachments[0].url || attachments[0].payload?.url || null;
              }

              // Generate human-readable snippet if text is empty
              let displayContent = text;
              if (!displayContent) {
                if (sharedPost) {
                  const spType = (sharedPost.type || '').toLowerCase();
                  if (spType.includes('reel')) displayContent = 'Shared a reel';
                  else if (spType.includes('story')) displayContent = 'Mentioned in a story';
                  else displayContent = 'Shared a post';
                } else if (attachments.length > 0) {
                  const attType = (attachments[0].type || '').toLowerCase();
                  if (attType === 'image') displayContent = 'Sent an image';
                  else if (attType === 'video' || attType === 'ig_reel') displayContent = 'Sent a video';
                  else if (attType === 'audio') displayContent = 'Sent a voice message';
                  else displayContent = 'Sent an attachment';
                } else {
                  displayContent = 'Sent an attachment';
                }
              }

              console.log(`📩 [Meta Webhook] ${channel.toUpperCase()} message ${isEcho ? '(Echo Outbound)' : '(Inbound)'} customer ${customerId}: "${displayContent}"`);

              // Try to match sender to an existing lead by phone if phone number appears in message
              let matchedLeadId = null;
              const phoneMatch = text.match(/(?:\+91|91|0)?[6-9]\d{9}/);
              if (phoneMatch) {
                const cleanDigits = phoneMatch[0].replace(/\D/g, '').slice(-10);
                const leadCheck = await db.query(
                  `SELECT id FROM leads WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $1 LIMIT 1`,
                  [cleanDigits]
                ).catch(e => logWebhookError('LeadPhoneLookup', e, currentEventId));
                if (leadCheck && leadCheck.rows.length > 0) {
                  matchedLeadId = leadCheck.rows[0].id;
                }
              }

              // Find or create conversation for the customer
              // A.3: Set windowExpiresAt = sentAt + 24h ONLY for inbound (not echo). Echo passes null.
              const sentAtMs = event.timestamp ? Number(event.timestamp) : Date.now();
              const sentAtDate = new Date(sentAtMs);
              const windowExpiresAt = isEcho ? null : new Date(sentAtMs + 24 * 3600 * 1000);

              const conv = await findOrCreateMetaConversation({
                channel,
                senderId: customerId,
                leadId: matchedLeadId,
                windowExpiresAt
              });

              // Persist message with attachments and real Meta message ID
              await persistMetaMessage({
                conversationId: conv.id,
                direction: isEcho ? 'outbound' : 'inbound',
                channel,
                content: displayContent,
                mediaUrl,
                attachments,
                sharedPost,
                metaMessageId: mid,
                status: isEcho ? 'sent' : 'delivered',
                sentAt: sentAtDate,
                countUnread: !isEcho
              });

              // ────────────────────────────────────────────────────────────────────────
              // Step 4 & B.1: For real inbound IG DMs, query Graph API for customer IGSID thread
              // ────────────────────────────────────────────────────────────────────────
              if (channel === 'instagram' && !isEcho && customerId) {
                try {
                  const pageToken = await getDerivedPageToken();
                  const graphVer = process.env.META_GRAPH_VERSION || 'v26.0';
                  const threadUrl = `https://graph.facebook.com/${graphVer}/${pageId}/conversations?platform=instagram&user_id=${encodeURIComponent(customerId)}&fields=id,updated_time,messages.limit(25){id,message,from,to,created_time,attachments,shares}&access_token=${encodeURIComponent(pageToken)}`;
                  console.log(`[Meta Webhook] Querying Graph thread for IGSID ${customerId}...`);
                  const tRes = await fetch(threadUrl);
                  const tData = await tRes.json();
                  const sanitizedTData = JSON.stringify(tData).replace(/EAA[A-Za-z0-9]+/g, 'EAA***');
                  console.log(`[Meta Webhook] Graph thread response for IGSID ${customerId} (HTTP ${tRes.status}):`, sanitizedTData);

                  // Backfill past messages safely (persistMetaMessage will NOT double count unread)
                  if (tRes.ok && Array.isArray(tData.data)) {
                    for (const convItem of tData.data) {
                      if (convItem.messages?.data?.length > 0) {
                        for (const msgItem of convItem.messages.data) {
                          const mId = msgItem.id;
                          const mText = msgItem.message || '';
                          const mFromId = msgItem.from?.id;
                          const mDirection = mFromId === customerId ? 'inbound' : 'outbound';
                          const mRawAtts = msgItem.attachments?.data || [];
                          const mAtts = mRawAtts.map(att => {
                            const type = att.type || (att.image_data ? 'image' : (att.video_data ? 'video' : 'attachment'));
                            const url = att.image_data?.url || att.video_data?.url || att.file_url || att.payload?.url || null;
                            return {
                              type,
                              payload: { url, title: att.title || null },
                              url,
                              title: att.title || null
                            };
                          });
                          const mShares = msgItem.shares?.data || [];
                          let mSharedPost = null;
                          if (mShares.length > 0) {
                            mSharedPost = {
                              type: mShares[0].type || 'share',
                              url: mShares[0].link || mShares[0].url || null,
                              title: mShares[0].title || mShares[0].name || null,
                              thumbnail: mShares[0].thumbnail || null
                            };
                          }
                          let mMediaUrl = null;
                          if (mAtts.length > 0 && mAtts[0].type === 'image') {
                            mMediaUrl = mAtts[0].url;
                          }
                          await persistMetaMessage({
                            conversationId: conv.id,
                            direction: mDirection,
                            channel: 'instagram',
                            content: mText || (mSharedPost ? 'Shared a post' : (mAtts.length > 0 ? 'Sent an attachment' : '')),
                            mediaUrl: mMediaUrl,
                            attachments: mAtts,
                            sharedPost: mSharedPost,
                            metaMessageId: mId,
                            status: 'delivered',
                            sentAt: msgItem.created_time ? new Date(msgItem.created_time) : new Date(),
                            countUnread: false
                          });
                        }
                      }
                    }
                  }
                } catch (err) {
                  logWebhookError('InstagramGraphBackfill', err, currentEventId);
                }
              }
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
                ).catch(e => logWebhookError('ReactionUpdate', e, currentEventId));
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
              ).catch(e => logWebhookError('ReadReceiptUpdate', e, currentEventId));
            }

            // Handle delivery confirmations
            if (event.delivery && Array.isArray(event.delivery.mids)) {
              for (const mid of event.delivery.mids) {
                await db.query(
                  `UPDATE meta_messages SET status = 'delivered' WHERE (external_id = $1 OR meta_message_id = $1) AND status = 'sent'`,
                  [mid]
                ).catch(e => logWebhookError('DeliveryUpdate', e, currentEventId));
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
              const parentId = val.parent_id || null;

              if (commentId && text) {
                const username = from.username || null;
                const isFromClinic = String(from.id) === String(igAccountId) || String(from.id) === String(pageId);
                const authorName = username ? `@${username}` : (from.name || (isFromClinic ? 'Aura Laser & Cosmetic Clinic' : null));

                console.log(`💬 [Meta Webhook] Instagram Comment from ${authorName || '(hidden)'}: "${text}" (isClinicReply: ${isFromClinic})`);

                // A.5: If sender is clinic Page/IG, store as outbound reply and attach to parent
                if (isFromClinic && parentId) {
                  await db.query(
                    `UPDATE meta_comments
                        SET reply_text = $1,
                            replied_at = NOW(),
                            status = 'replied',
                            replies = replies || $2::jsonb,
                            updated_at = NOW()
                      WHERE comment_id = $3`,
                    [text, JSON.stringify([{ id: commentId, text, created_at: new Date() }]), String(parentId)]
                  ).catch(e => logWebhookError('IGParentCommentReplyUpdate', e, currentEventId));
                }

                await persistMetaComment({
                  channel: 'instagram',
                  commentId: String(commentId),
                  postId: media.id || val.media_id || null,
                  senderId: from.id ? String(from.id) : null,
                  senderName: authorName,
                  senderUsername: username,
                  text,
                  unread: !isFromClinic,
                  parentId: parentId ? String(parentId) : null
                }).catch(e => logWebhookError('IGPersistComment', e, currentEventId));
              } else {
                syncInstagramComments().catch(e => logWebhookError('IGSyncComments', e, currentEventId));
              }
            }

            // B. Facebook Feed Comments
            if (change.field === 'feed') {
              const val = change.value || {};
              const verb = val.verb || 'add';
              const commentId = val.comment_id || val.id;
              const postId = val.post_id || null;
              const senderId = val.sender_id || val.from?.id || null;
              const rawText = val.message || val.text || '';
              const item = val.item || '';
              const parentId = val.parent_id || null;

              // Skip non-comment feed events (likes, photos, etc.)
              if (item && item !== 'comment') continue;

              // A.5: Handle remove verb — mark hidden/deleted
              if (verb === 'remove' && commentId) {
                await db.query(
                  "UPDATE meta_comments SET hidden = TRUE, status = 'deleted', updated_at = NOW() WHERE comment_id = $1",
                  [String(commentId)]
                ).catch(e => logWebhookError('FBCommentRemove', e, currentEventId));
                continue;
              }

              // A.5: Handle edited verb — update text
              if (verb === 'edited' && commentId) {
                await db.query(
                  'UPDATE meta_comments SET text = $1, updated_at = NOW() WHERE comment_id = $2',
                  [rawText, String(commentId)]
                ).catch(e => logWebhookError('FBCommentEdit', e, currentEventId));
                continue;
              }

              if (!commentId || !rawText) continue;

              const isPageOwner = senderId && (String(senderId) === String(pageId) || String(senderId) === String(igAccountId));

              // A.5: Never save literal 'Facebook User'. Try real name from webhook payload first.
              let senderName = null;
              if (val.sender_name && val.sender_name !== 'Facebook User') senderName = val.sender_name;
              else if (val.from?.name && val.from.name !== 'Facebook User') senderName = val.from.name;

              // If missing on FB comment, fetch GET /{comment_id}?fields=id,message,from{id,name},created_time,parent{id},permalink_url with page token
              if (!senderName && !isPageOwner && commentId) {
                try {
                  const pgTok = await getDerivedPageToken();
                  const gVer = process.env.META_GRAPH_VERSION || 'v26.0';
                  const cmtRes = await fetch(
                    `https://graph.facebook.com/${gVer}/${encodeURIComponent(commentId)}?fields=id,message,from%7Bid,name%7D,created_time,parent%7Bid%7D,permalink_url&access_token=${encodeURIComponent(pgTok)}`
                  );
                  const cmtData = await cmtRes.json();
                  if (cmtData.from?.name && cmtData.from.name !== 'Facebook User') {
                    senderName = cmtData.from.name;
                  }
                  if (cmtData.error) {
                    logWebhookError('FBCommentNameGraph', new Error(`Graph Error #${cmtData.error.code}: ${cmtData.error.message}`), currentEventId);
                  }
                } catch(e) {
                  logWebhookError('FBCommentNameFetch', e, currentEventId);
                }
                // If still missing keep name NULL (UI shows initials + "Name hidden by Meta"), never literal 'Facebook User'
              }

              // A.5: If sender is clinic Page/IG, store as outbound reply and attach to parent via parent_id
              if (isPageOwner && parentId) {
                await db.query(
                  `UPDATE meta_comments
                      SET reply_text = $1,
                          replied_at = NOW(),
                          status = 'replied',
                          replies = replies || $2::jsonb,
                          updated_at = NOW()
                    WHERE comment_id = $3`,
                  [rawText, JSON.stringify([{ id: commentId, text: rawText, created_at: new Date() }]), String(parentId)]
                ).catch(e => logWebhookError('FBParentCommentReplyUpdate', e, currentEventId));
              }

              console.log(`💬 [Meta Webhook] New Facebook Comment from ${senderName || '(name hidden by Meta)'}: "${rawText}" (isClinicReply: ${isPageOwner})`);
              await persistMetaComment({
                channel: 'facebook',
                commentId: String(commentId),
                postId: postId ? String(postId) : null,
                senderId: senderId ? String(senderId) : null,
                senderName, // null if unknown — UI shows initials + "Name hidden by Meta"
                text: rawText,
                unread: !isPageOwner,
                hidden: false,
                parentId: parentId ? String(parentId) : null
              }).catch(e => logWebhookError('FBPersistComment', e, currentEventId));
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

                  if (phone || email) {
                    const cleanPhone = phone.replace(/\D/g, '');
                    await db.query(
                      `INSERT INTO leads (
                         first_name, last_name, email, phone, company, status, pipeline_stage, notes, source, created_at, updated_at
                       ) VALUES ($1, $2, $3, $4, $5, 'active', 'Prospect', $6, 'Facebook Ad', NOW(), NOW())
                       ON CONFLICT DO NOTHING`,
                      [firstName, lastName, email || null, cleanPhone || null, 'Direct Patient', `Meta Lead Form Inquiry: ${concern}`]
                    ).catch(e => logWebhookError('LeadInsert', e, currentEventId));
                  }
                }
              } catch (leadErr) {
                logWebhookError('LeadgenProcess', leadErr, currentEventId);
              }
            }
          }
        }
      }
    } catch (err) {
      logWebhookError('WebhookMainLoop', err, currentEventId);
    }
  })();
});

/**
 * GET /api/meta/comments - Protected by requireAuth
 */
router.get('/comments', requireAuth, async (req, res) => {
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
 * POST /api/meta/comments/sync - Protected by requireAuth
 */
router.post('/comments/sync', requireAuth, async (req, res) => {
  try {
    const result = await syncMetaOmnichannel();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/comments/reply - Protected by requireAuth
 */
router.post('/comments/reply', requireAuth, async (req, res) => {
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
 * POST /api/meta/comments/like - Protected by requireAuth
 */
router.post('/comments/like', requireAuth, async (req, res) => {
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
 * POST /api/meta/comments/visibility - Protected by requireAuth
 */
router.post('/comments/visibility', requireAuth, async (req, res) => {
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
 * GET /api/meta/avatar-debug - Protected by requireAdmin
 */
router.get('/avatar-debug', requireAdmin, async (req, res) => {
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
 * POST /api/meta/avatar/backfill - Protected by requireAuth
 */
router.post('/avatar/backfill', requireAuth, async (req, res) => {
  try {
    const { backfillAvatars } = require('./avatar-service');
    const stats = await backfillAvatars();
    return res.json({ success: true, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
