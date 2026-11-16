const db = require('./db');

const META_PAGE_ACCESS_TOKEN = () =>
  process.env.META_PAGE_ACCESS_TOKEN ||
  process.env.WHATSAPP_ACCESS_TOKEN ||
  '';

const META_PAGE_ID = () => String(process.env.META_PAGE_ID || '267592620109700').trim();
const META_INSTAGRAM_ACCOUNT_ID = () => String(process.env.META_INSTAGRAM_ACCOUNT_ID || '17841461905363722').trim();

/**
 * Idempotent DB schema initializer for Facebook & Instagram omnichannel.
 */
async function ensureMetaSchema() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_conversations (
        id SERIAL PRIMARY KEY,
        lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
        channel TEXT NOT NULL,                -- 'facebook' | 'instagram'
        sender_id TEXT NOT NULL,              -- PSID (Facebook) or IGSID (Instagram)
        sender_name TEXT,                     -- Full name or username
        sender_username TEXT,                 -- Instagram handle
        sender_avatar TEXT,                   -- Profile picture URL
        unread_count INT DEFAULT 0,
        last_message TEXT,
        last_message_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_meta_channel_sender UNIQUE (channel, sender_id)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INT REFERENCES meta_conversations(id) ON DELETE CASCADE,
        direction TEXT NOT NULL,              -- 'inbound' | 'outbound'
        channel TEXT NOT NULL,                -- 'facebook' | 'instagram'
        content TEXT,
        media_url TEXT,
        meta_message_id TEXT,
        status TEXT DEFAULT 'sent',           -- 'sent', 'delivered', 'read', 'failed'
        error_message TEXT,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_comments (
        id SERIAL PRIMARY KEY,
        channel TEXT NOT NULL,                -- 'instagram' | 'facebook'
        comment_id TEXT UNIQUE NOT NULL,
        post_id TEXT,
        post_url TEXT,
        sender_id TEXT,
        sender_name TEXT,
        sender_username TEXT,
        sender_avatar TEXT,
        text TEXT NOT NULL,
        reply_text TEXT,
        replied_at TIMESTAMPTZ,
        status TEXT DEFAULT 'pending',        -- 'pending' | 'replied'
        unread BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Useful indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_conv_channel_sender ON meta_conversations(channel, sender_id);
      CREATE INDEX IF NOT EXISTS idx_meta_conv_last_message ON meta_conversations(last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_meta_msg_conv_id ON meta_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_meta_comments_channel ON meta_comments(channel);
      CREATE INDEX IF NOT EXISTS idx_meta_comments_created ON meta_comments(created_at DESC);
    `);

    console.log('✅ [Meta Omnichannel] DB schema verified and ready');
  } catch (err) {
    console.error('❌ [Meta Omnichannel] Schema error:', err.message);
  }
}

/**
 * Fetch public user profile from Graph API (Name, Profile Pic)
 */
async function fetchMetaUserProfile({ channel, userId }) {
  const token = META_PAGE_ACCESS_TOKEN();
  if (!token || !userId) return null;

  try {
    let url;
    if (channel === 'instagram') {
      // Instagram user profile
      url = `https://graph.facebook.com/v19.0/${userId}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`;
    } else {
      // Facebook user profile (PSID)
      url = `https://graph.facebook.com/v19.0/${userId}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(token)}`;
    }

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name: data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : null),
      username: data.username || null,
      avatar: data.profile_pic || null
    };
  } catch {
    return null;
  }
}

/**
 * Find or create a conversation record in meta_conversations
 */
async function findOrCreateMetaConversation({ channel, senderId, senderName, senderUsername, senderAvatar, leadId }) {
  await ensureMetaSchema();

  // Try find existing
  const existing = await db.query(
    `SELECT * FROM meta_conversations WHERE channel = $1 AND sender_id = $2 LIMIT 1`,
    [channel, senderId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    // Update profile info if newly available
    if ((!row.sender_name && senderName) || (!row.sender_username && senderUsername) || (!row.sender_avatar && senderAvatar) || (!row.lead_id && leadId)) {
      const updated = await db.query(
        `UPDATE meta_conversations
            SET sender_name = COALESCE($1, sender_name),
                sender_username = COALESCE($2, sender_username),
                sender_avatar = COALESCE($3, sender_avatar),
                lead_id = COALESCE($4, lead_id),
                updated_at = NOW()
          WHERE id = $5
          RETURNING *`,
        [senderName || null, senderUsername || null, senderAvatar || null, leadId || null, row.id]
      );
      return updated.rows[0];
    }
    return row;
  }

  // If sender name is missing, attempt to fetch from Graph API
  let fetchedName = senderName;
  let fetchedUsername = senderUsername;
  let fetchedAvatar = senderAvatar;

  if (!fetchedName && !fetchedUsername) {
    const profile = await fetchMetaUserProfile({ channel, userId: senderId });
    if (profile) {
      fetchedName = profile.name;
      fetchedUsername = profile.username;
      fetchedAvatar = profile.avatar;
    }
  }

  const fallbackName = fetchedName || fetchedUsername || (channel === 'instagram' ? `@user_${senderId.slice(-4)}` : `FB User ${senderId.slice(-4)}`);

  const inserted = await db.query(
    `INSERT INTO meta_conversations (
       channel, sender_id, sender_name, sender_username, sender_avatar, lead_id, unread_count, last_message_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
     ON CONFLICT (channel, sender_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [channel, senderId, fallbackName, fetchedUsername || null, fetchedAvatar || null, leadId || null]
  );

  return inserted.rows[0];
}

/**
 * Persist an inbound or outbound message
 */
async function persistMetaMessage({
  conversationId,
  direction,
  channel,
  content,
  mediaUrl,
  metaMessageId,
  status = 'sent',
  errorMessage = null
}) {
  const r = await db.query(
    `INSERT INTO meta_messages (
       conversation_id, direction, channel, content, media_url, meta_message_id, status, error_message, sent_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [conversationId, direction, channel, content || '', mediaUrl || null, metaMessageId || null, status, errorMessage]
  );

  // Update conversation last message and unread count
  await db.query(
    `UPDATE meta_conversations
        SET last_message = $1,
            last_message_at = NOW(),
            unread_count = CASE WHEN $2 = 'inbound' THEN unread_count + 1 ELSE unread_count END,
            updated_at = NOW()
      WHERE id = $3`,
    [content || (mediaUrl ? '[Media attachment]' : ''), direction, conversationId]
  );

  return r.rows[0];
}

/**
 * Send an outbound message back to Facebook Messenger or Instagram Direct
 */
async function sendMetaMessage({ channel, recipientId, text, conversationId }) {
  const token = META_PAGE_ACCESS_TOKEN();
  if (!token) {
    throw new Error('Meta Page Access Token is missing from server configuration');
  }

  if (!recipientId || !text) {
    throw new Error('Recipient ID and message text are required');
  }

  // Meta Graph API Send Message Endpoint
  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`;

  const payload = {
    recipient: { id: recipientId },
    message: { text: text.trim() },
    messaging_type: 'RESPONSE'
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const resJson = await response.json();

  if (!response.ok || resJson.error) {
    const errorMsg = resJson.error?.message || 'Failed to send message via Meta API';
    console.error(`[Meta Send] Error sending ${channel} message to ${recipientId}:`, resJson.error);

    if (conversationId) {
      await persistMetaMessage({
        conversationId,
        direction: 'outbound',
        channel,
        content: text,
        status: 'failed',
        errorMessage: errorMsg
      });
    }

    throw new Error(errorMsg);
  }

  // Save successful outbound message
  let savedMsg = null;
  if (conversationId) {
    savedMsg = await persistMetaMessage({
      conversationId,
      direction: 'outbound',
      channel,
      content: text,
      metaMessageId: resJson.message_id || null,
      status: 'sent'
    });
  }

  return {
    success: true,
    messageId: resJson.message_id,
    recipientId: resJson.recipient_id,
    message: savedMsg
  };
}

/**
 * Persist incoming Instagram or Facebook comment
 */
async function persistMetaComment({
  channel,
  commentId,
  postId = null,
  postUrl = null,
  senderId = null,
  senderName = null,
  senderUsername = null,
  senderAvatar = null,
  text
}) {
  await ensureMetaSchema();

  const r = await db.query(
    `INSERT INTO meta_comments (
       channel, comment_id, post_id, post_url, sender_id, sender_name, sender_username, sender_avatar, text, status, unread, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', TRUE, NOW())
     ON CONFLICT (comment_id)
     DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()
     RETURNING *`,
    [channel, commentId, postId, postUrl, senderId, senderName, senderUsername, senderAvatar, text]
  );

  return r.rows[0];
}

/**
 * Reply directly to an Instagram or Facebook comment
 */
async function replyToMetaComment({ channel, commentId, message }) {
  const token = META_PAGE_ACCESS_TOKEN();
  if (!token) throw new Error('Meta Page Access Token is missing');
  if (!commentId || !message) throw new Error('Comment ID and reply message are required');

  // Both Instagram & Facebook use POST /{comment_id}/replies or /{comment_id}/comments
  const endpoint = channel === 'instagram' ? 'replies' : 'comments';
  const url = `https://graph.facebook.com/v19.0/${commentId}/${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message.trim(),
      access_token: token
    })
  });

  const resJson = await response.json();
  if (!response.ok || resJson.error) {
    const errMsg = resJson.error?.message || 'Failed to post reply to comment';
    console.error(`[Meta Comment Reply] Error on ${channel} comment ${commentId}:`, resJson.error);
    throw new Error(errMsg);
  }

  // Update in database
  await db.query(
    `UPDATE meta_comments
        SET reply_text = $1,
            replied_at = NOW(),
            status = 'replied',
            unread = FALSE,
            updated_at = NOW()
      WHERE comment_id = $2`,
    [message.trim(), commentId]
  );

  return { success: true, replyId: resJson.id };
}

/**
 * Sync Instagram Comments from Meta Graph API
 */
async function syncInstagramComments() {
  const token = META_PAGE_ACCESS_TOKEN();
  const igId = META_INSTAGRAM_ACCOUNT_ID();
  if (!token || !igId) return { synced: 0 };

  try {
    await ensureMetaSchema();
    const url = `https://graph.facebook.com/v19.0/${igId}/media?fields=id,caption,permalink,timestamp,comments_count,comments{id,text,timestamp,username,from}&limit=30&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn('[Instagram Sync] API returned warning:', data.error.message);
      return { synced: 0, error: data.error.message };
    }

    let count = 0;
    for (const post of (data.data || [])) {
      const commentsList = post.comments?.data || [];
      for (const c of commentsList) {
        if (!c.id || !c.text) continue;
        const createdAt = c.timestamp ? new Date(c.timestamp) : new Date();
        const username = c.username || c.from?.username || null;
        const senderName = username ? `@${username}` : 'Instagram User';

        await db.query(
          `INSERT INTO meta_comments (
             channel, comment_id, post_id, post_url, sender_id, sender_name, sender_username, text, status, unread, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (comment_id)
           DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()`,
          ['instagram', String(c.id), String(post.id), post.permalink || null, c.from?.id ? String(c.from.id) : null, senderName, username, c.text, 'pending', true, createdAt]
        );
        count++;
      }
    }

    console.log(`✅ [Instagram Sync] Successfully synced ${count} comments from Instagram API`);
    return { synced: count };
  } catch (err) {
    console.error('[Instagram Sync] Error:', err.message);
    return { synced: 0, error: err.message };
  }
}

/**
 * Sync Facebook Page Comments from Meta Graph API
 */
async function syncFacebookComments() {
  const userToken = META_PAGE_ACCESS_TOKEN();
  const pageId = META_PAGE_ID();
  if (!userToken || !pageId) return { synced: 0 };

  try {
    await ensureMetaSchema();

    // 1. Resolve Page Access Token
    let pageToken = userToken;
    try {
      const pageRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`);
      const pageData = await pageRes.json();
      if (pageData.access_token) {
        pageToken = pageData.access_token;
      }
    } catch (_) {}

    // 2. Fetch recent Page posts
    const url = `https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,permalink_url,created_time&limit=25&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn('[Facebook Sync] Posts API warning:', data.error.message);
      return { synced: 0, error: data.error.message };
    }

    let count = 0;
    for (const post of (data.data || [])) {
      const postId = post.id;
      const postUrl = post.permalink_url;

      try {
        const cRes = await fetch(`https://graph.facebook.com/v19.0/${postId}/comments?fields=id,message,created_time,from&access_token=${encodeURIComponent(pageToken)}`);
        const cData = await cRes.json();
        const commentsList = cData.data || [];

        for (const c of commentsList) {
          if (!c.id || !c.message) continue;
          const createdAt = c.created_time ? new Date(c.created_time) : new Date();
          const senderName = c.from?.name || 'Facebook User';

          await db.query(
            `INSERT INTO meta_comments (
               channel, comment_id, post_id, post_url, sender_id, sender_name, text, status, unread, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', TRUE, $8)
             ON CONFLICT (comment_id)
             DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()`,
            ['facebook', String(c.id), String(postId), postUrl || null, c.from?.id ? String(c.from.id) : null, senderName, c.message, createdAt]
          );
          count++;
        }
      } catch (cErr) {
        // Individual post comment fetch error
      }
    }

    console.log(`✅ [Facebook Sync] Successfully synced ${count} comments from Facebook Page`);
    return { synced: count };
  } catch (err) {
    console.error('[Facebook Sync] Error:', err.message);
    return { synced: 0, error: err.message };
  }
}

/**
 * Unified sync for both Instagram and Facebook comments
 */
async function syncMetaComments() {
  const [ig, fb] = await Promise.allSettled([
    syncInstagramComments(),
    syncFacebookComments()
  ]);
  return {
    instagram: ig.status === 'fulfilled' ? ig.value : null,
    facebook: fb.status === 'fulfilled' ? fb.value : null
  };
}

module.exports = {
  ensureMetaSchema,
  fetchMetaUserProfile,
  findOrCreateMetaConversation,
  persistMetaMessage,
  sendMetaMessage,
  persistMetaComment,
  replyToMetaComment,
  syncInstagramComments,
  syncFacebookComments,
  syncMetaComments,
  META_PAGE_ID,
  META_INSTAGRAM_ACCOUNT_ID
};

