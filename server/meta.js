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

    // Useful indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_conv_channel_sender ON meta_conversations(channel, sender_id);
      CREATE INDEX IF NOT EXISTS idx_meta_conv_last_message ON meta_conversations(last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_meta_msg_conv_id ON meta_messages(conversation_id);
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

module.exports = {
  ensureMetaSchema,
  fetchMetaUserProfile,
  findOrCreateMetaConversation,
  persistMetaMessage,
  sendMetaMessage,
  META_PAGE_ID,
  META_INSTAGRAM_ACCOUNT_ID
};

