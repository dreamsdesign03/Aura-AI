const db = require('./db');

const TARGET_PAGE_ID = '267592620109700';
const TARGET_IG_USER_ID = '17841461905363722';

const META_PAGE_ID = () => String(process.env.META_PAGE_ID || TARGET_PAGE_ID).trim();
const META_INSTAGRAM_ACCOUNT_ID = () => String(process.env.META_IG_USER_ID || process.env.META_INSTAGRAM_ACCOUNT_ID || TARGET_IG_USER_ID).trim();
const GRAPH_VERSION = () => process.env.META_GRAPH_VERSION || 'v20.0';

let cachedDerivedPageToken = null;
let tokenCacheExpiresAt = 0;

/**
 * Safely redact tokens in strings or objects
 */
function redact(obj) {
  if (!obj) return obj;
  let str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  str = str.replace(/EAA[a-zA-Z0-9_\-]+/g, 'EAA***');
  str = str.replace(/access_token=[^&"'\s]+/gi, 'access_token=EAA***');
  return typeof obj === 'string' ? str : JSON.parse(str);
}

/**
 * Derives and in-memory caches the Page Access Token for Aura Laser & Cosmetic Clinic
 * from the user access token (/me/accounts). Never hardcodes, logs, or stores in DB.
 */
async function getDerivedPageToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDerivedPageToken && now < tokenCacheExpiresAt) {
    return cachedDerivedPageToken;
  }

  const userToken = process.env.META_USER_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
  if (!userToken) {
    throw new Error('META_USER_ACCESS_TOKEN is missing in environment');
  }

  const targetPageId = META_PAGE_ID();
  const graphVer = GRAPH_VERSION();

  const url = `https://graph.facebook.com/${graphVer}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(`Failed to derive page token: ${data.error?.message || res.statusText}`);
  }

  const accounts = Array.isArray(data.data) ? data.data : [];
  const targetPage = accounts.find((p) => String(p.id).trim() === targetPageId);

  if (!targetPage || !targetPage.access_token) {
    throw new Error(`CRITICAL: Page ID ${targetPageId} not found in user accounts! Total pages returned: ${accounts.length}`);
  }

  cachedDerivedPageToken = targetPage.access_token;
  tokenCacheExpiresAt = now + 3600 * 1000; // Cache for 1 hour

  console.log(`✅ [Meta Auth] Derived Page Token for "${targetPage.name}" (${targetPage.id}) [Redacted: EAA***]`);
  return cachedDerivedPageToken;
}

/**
 * Fallback accessor for backwards compatibility
 */
const META_PAGE_ACCESS_TOKEN = () => cachedDerivedPageToken || process.env.META_PAGE_ACCESS_TOKEN || '';

let schemaEnsured = false;

/**
 * Idempotent DB schema initializer for Facebook & Instagram omnichannel.
 */
async function ensureMetaSchema(force = false) {
  if (schemaEnsured && !force) return;
  try {
    // 1. meta_conversations
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_conversations (
        id SERIAL PRIMARY KEY,
        lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
        channel TEXT NOT NULL,                -- 'facebook' | 'instagram'
        external_id TEXT,                     -- PSID (Facebook) or IGSID (Instagram)
        sender_id TEXT NOT NULL,              -- Backwards compatibility
        sender_name TEXT,                     -- Full name or username
        sender_username TEXT,                 -- Instagram handle
        sender_avatar TEXT,                   -- Profile picture URL
        unread_count INT DEFAULT 0,
        last_message TEXT,
        last_message_at TIMESTAMPTZ DEFAULT NOW(),
        labels TEXT[] DEFAULT '{}',
        assigned_to TEXT,
        window_expires_at TIMESTAMPTZ,
        ad_id TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_meta_channel_sender UNIQUE (channel, sender_id)
      );
    `);

    // Ensure external_id column and unique constraint
    await db.query(`
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS external_id TEXT;
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}';
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS assigned_to TEXT;
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMPTZ;
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS ad_id TEXT;
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS participant_avatar TEXT;
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;
      UPDATE meta_conversations SET external_id = sender_id WHERE external_id IS NULL AND sender_id IS NOT NULL;
      UPDATE meta_conversations SET sender_avatar = NULL, participant_avatar = NULL WHERE (sender_avatar IS NOT NULL AND sender_avatar NOT LIKE '/api/meta/avatar/%') OR (participant_avatar IS NOT NULL AND participant_avatar NOT LIKE '/api/meta/avatar/%');
      CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_conv_ext ON meta_conversations(channel, external_id);
    `);

    // 2. meta_messages
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INT REFERENCES meta_conversations(id) ON DELETE CASCADE,
        direction TEXT NOT NULL,              -- 'inbound' | 'outbound'
        channel TEXT NOT NULL,                -- 'facebook' | 'instagram'
        external_id TEXT,                     -- Meta message id (mid)
        content TEXT,
        media_url TEXT,
        attachments JSONB DEFAULT '[]',
        shared_post JSONB,
        reactions JSONB DEFAULT '[]',
        meta_message_id TEXT,
        status TEXT DEFAULT 'sent',           -- 'sent', 'delivered', 'read', 'failed'
        error_message TEXT,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS external_id TEXT;
      ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
      ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS shared_post JSONB;
      ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]';
      ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS reaction TEXT;
      ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS reaction_emoji TEXT;
      ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS error_message TEXT;
      UPDATE meta_messages SET external_id = meta_message_id WHERE external_id IS NULL AND meta_message_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_msg_ext ON meta_messages(external_id);
    `);

    // 3. meta_comments
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_comments (
        id SERIAL PRIMARY KEY,
        channel TEXT NOT NULL,                -- 'instagram' | 'facebook'
        external_id TEXT,                     -- Meta comment id
        comment_id TEXT UNIQUE NOT NULL,      -- Backwards compatibility
        post_id TEXT,
        post_url TEXT,
        post_title TEXT,
        media_type TEXT,
        media_thumbnail TEXT,
        sender_id TEXT,
        sender_name TEXT,
        sender_username TEXT,
        sender_avatar TEXT,
        text TEXT NOT NULL,
        like_count INT DEFAULT 0,
        reply_text TEXT,
        replied_at TIMESTAMPTZ,
        replies JSONB DEFAULT '[]',
        hidden BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'pending',        -- 'pending' | 'replied'
        unread BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS external_id TEXT;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS post_title TEXT;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS media_type TEXT;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS media_thumbnail TEXT;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS replies JSONB DEFAULT '[]';
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS author_avatar TEXT;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS parent_id TEXT;
      UPDATE meta_comments SET external_id = comment_id WHERE external_id IS NULL AND comment_id IS NOT NULL;
      UPDATE meta_comments SET sender_avatar = NULL, author_avatar = NULL WHERE (sender_avatar IS NOT NULL AND sender_avatar NOT LIKE '/api/meta/avatar/%') OR (author_avatar IS NOT NULL AND author_avatar NOT LIKE '/api/meta/avatar/%');
      CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_comm_ext ON meta_comments(external_id);
    `);

    // 4. meta_media
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_media (
        id SERIAL PRIMARY KEY,
        external_id TEXT UNIQUE NOT NULL,     -- IG Media ID or FB Post ID
        channel TEXT NOT NULL,                -- 'instagram' | 'facebook'
        caption TEXT,
        media_type TEXT,
        media_product_type TEXT,
        permalink TEXT,
        media_url TEXT,
        thumbnail_url TEXT,
        like_count INT DEFAULT 0,
        comments_count INT DEFAULT 0,
        timestamp TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 5. webhook_events
    await db.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id SERIAL PRIMARY KEY,
        platform TEXT NOT NULL,
        event_type TEXT,
        payload JSONB NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Useful indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_conv_channel_ext ON meta_conversations(channel, external_id);
      CREATE INDEX IF NOT EXISTS idx_meta_conv_last_message ON meta_conversations(last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_meta_msg_conv_id ON meta_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_meta_comments_channel ON meta_comments(channel);
      CREATE INDEX IF NOT EXISTS idx_meta_comments_created ON meta_comments(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_meta_media_channel ON meta_media(channel);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);
    `);

    schemaEnsured = true;
    console.log('✅ [Meta Omnichannel] DB schema verified with strict external_id uniqueness');
  } catch (err) {
    console.error('❌ [Meta Omnichannel] Schema error:', err.message);
  }
}

/**
 * Fetch public user profile from Graph API (Name, Profile Pic)
 */
async function fetchMetaUserProfile({ channel, userId }) {
  if (!userId) return null;
  try {
    const pageToken = await getDerivedPageToken();
    const graphVer = GRAPH_VERSION();
    let url;
    if (channel === 'instagram') {
      url = `https://graph.facebook.com/${graphVer}/${userId}?fields=name,username,profile_pic&access_token=${encodeURIComponent(pageToken)}`;
    } else {
      url = `https://graph.facebook.com/${graphVer}/${userId}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(pageToken)}`;
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
 * Find or create a conversation record in meta_conversations using external_id
 */
async function findOrCreateMetaConversation({ channel, senderId, senderName, senderUsername, senderAvatar, leadId, labels = [], windowExpiresAt = null }) {
  await ensureMetaSchema();
  const extId = String(senderId).trim();

  // 1. Try find existing by external_id
  const existing = await db.query(
    `SELECT * FROM meta_conversations WHERE channel = $1 AND (external_id = $2 OR sender_id = $2) LIMIT 1`,
    [channel, extId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const updated = await db.query(
      `UPDATE meta_conversations
          SET sender_name = COALESCE($1, sender_name),
              sender_username = COALESCE($2, sender_username),
              sender_avatar = COALESCE($3, sender_avatar),
              lead_id = COALESCE($4, lead_id),
              external_id = $5,
              window_expires_at = COALESCE($6, window_expires_at),
              updated_at = NOW()
        WHERE id = $7
        RETURNING *`,
      [senderName || null, senderUsername || null, senderAvatar || null, leadId || null, extId, windowExpiresAt || null, row.id]
    );
    return updated.rows[0];
  }

  // 2. If sender name is missing, attempt to fetch from Graph API
  let fetchedName = senderName;
  let fetchedUsername = senderUsername;
  let fetchedAvatar = senderAvatar;

  if (!fetchedName && !fetchedUsername) {
    const profile = await fetchMetaUserProfile({ channel, userId: extId });
    if (profile) {
      fetchedName = profile.name;
      fetchedUsername = profile.username;
      fetchedAvatar = profile.avatar;
    }
  }

  const fallbackName = fetchedName || (fetchedUsername ? `@${fetchedUsername}` : (channel === 'instagram' ? `@user_${extId.slice(-4)}` : `Facebook User`));

  const inserted = await db.query(
    `INSERT INTO meta_conversations (
       channel, external_id, sender_id, sender_name, sender_username, sender_avatar, lead_id, unread_count, labels, window_expires_at, last_message_at
     ) VALUES ($1, $2, $2, $3, $4, $5, $6, 1, $7, $8, NOW())
     ON CONFLICT (channel, sender_id)
     DO UPDATE SET external_id = EXCLUDED.external_id,
                   sender_name = COALESCE(EXCLUDED.sender_name, meta_conversations.sender_name),
                   sender_username = COALESCE(EXCLUDED.sender_username, meta_conversations.sender_username),
                   sender_avatar = COALESCE(EXCLUDED.sender_avatar, meta_conversations.sender_avatar),
                   updated_at = NOW()
     RETURNING *`,
    [channel, extId, fallbackName, fetchedUsername || null, fetchedAvatar || null, leadId || null, labels, windowExpiresAt || null]
  );

  return inserted.rows[0];
}

/**
 * Persist an inbound or outbound message keyed on external_id
 */
async function persistMetaMessage({
  conversationId,
  direction,
  channel,
  content,
  mediaUrl,
  metaMessageId,
  attachments = [],
  sharedPost = null,
  reactions = [],
  status = 'sent',
  errorMessage = null,
  sentAt = new Date()
}) {
  await ensureMetaSchema();
  const extId = metaMessageId ? String(metaMessageId).trim() : null;

  // A.1: Check if this row already exists (by real Meta message ID)
  let existingRow = null;
  if (extId) {
    const existing = await db.query(
      'SELECT id FROM meta_messages WHERE external_id = $1 OR meta_message_id = $1 LIMIT 1',
      [extId]
    );
    if (existing.rows.length > 0) existingRow = existing.rows[0];
  }

  let msgRow = null;
  const wasNewlyInserted = !existingRow;

  if (existingRow) {
    // UPDATE path: do NOT touch unread_count (A.1)
    const updated = await db.query(
      `UPDATE meta_messages
          SET status = COALESCE($1, status),
              reactions = CASE WHEN jsonb_array_length($2::jsonb) > 0 THEN $2::jsonb ELSE reactions END,
              attachments = CASE WHEN jsonb_array_length($3::jsonb) > 0 THEN $3::jsonb ELSE attachments END,
              shared_post = COALESCE($4::jsonb, shared_post),
              content = COALESCE(NULLIF($5, ''), content)
        WHERE id = $6
        RETURNING *`,
      [status, JSON.stringify(reactions), JSON.stringify(attachments),
       sharedPost ? JSON.stringify(sharedPost) : null, content, existingRow.id]
    );
    msgRow = updated.rows[0];
  } else {
    // INSERT path — genuinely new message
    const r = await db.query(
      `INSERT INTO meta_messages (
         conversation_id, direction, channel, external_id, meta_message_id, content, media_url, attachments, shared_post, reactions, status, error_message, sent_at
       ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12)
       RETURNING *`,
      [
        conversationId,
        direction,
        channel,
        extId,
        content || '',
        mediaUrl || null,
        JSON.stringify(attachments),
        sharedPost ? JSON.stringify(sharedPost) : null,
        JSON.stringify(reactions),
        status,
        errorMessage,
        sentAt instanceof Date ? sentAt : new Date(sentAt)
      ]
    );
    msgRow = r.rows[0];
  }

  // Build human-readable snippet for list preview
  let snippet = content;
  if (!snippet || (snippet.startsWith('[') && snippet.endsWith(']'))) {
    if (sharedPost) {
      const spType = (sharedPost.type || sharedPost.media_type || 'share').toLowerCase();
      if (spType === 'ig_reel' || spType === 'reel') snippet = 'Shared a reel';
      else if (spType === 'ig_post') snippet = 'Shared a post';
      else if (spType === 'story_mention') snippet = 'Mentioned in a story';
      else snippet = 'Shared a post';
    } else if (attachments && attachments.length > 0) {
      const attType = (attachments[0].type || 'attachment').toLowerCase();
      if (attType === 'image') snippet = 'Sent an image';
      else if (attType === 'video' || attType === 'ig_reel') snippet = 'Sent a video';
      else if (attType === 'audio') snippet = 'Sent a voice message';
      else snippet = 'Sent an attachment';
    } else if (mediaUrl) {
      snippet = 'Sent an attachment';
    } else {
      snippet = content || '';
    }
  }

  // A.2: last_message_at = GREATEST(existing, sentAt). Update last_message text only if sentAt wins.
  // A.1: unread_count + 1 ONLY on newly-inserted inbound rows.
  const sentAtDate = sentAt instanceof Date ? sentAt : new Date(sentAt);
  await db.query(
    `UPDATE meta_conversations
        SET last_message = CASE
              WHEN $2::timestamptz >= COALESCE(last_message_at, 'epoch'::timestamptz)
              THEN COALESCE(NULLIF($1, ''), last_message)
              ELSE last_message
            END,
            last_message_at = GREATEST(COALESCE(last_message_at, 'epoch'::timestamptz), $2::timestamptz),
            unread_count = CASE
              WHEN $3 = 'inbound' AND $5 = TRUE
              THEN unread_count + 1
              ELSE unread_count
            END,
            updated_at = NOW()
      WHERE id = $4`,
    [snippet, sentAtDate, direction, conversationId, wasNewlyInserted]
  );

  return msgRow;
}

/**
 * Send an outbound message back to Facebook Messenger or Instagram Direct
 */
async function sendMetaMessage({ channel, recipientId, text, conversationId }) {
  const pageToken = await getDerivedPageToken();
  if (!pageToken) throw new Error('Meta Page Access Token is unavailable');
  if (!recipientId || !text) throw new Error('Recipient ID and message text are required');

  // C.1: Check 24h window expiry before sending
  if (conversationId) {
    const convRow = await db.query(
      'SELECT window_expires_at FROM meta_conversations WHERE id = $1',
      [conversationId]
    );
    if (convRow.rows.length > 0 && convRow.rows[0].window_expires_at) {
      const windowExp = new Date(convRow.rows[0].window_expires_at);
      if (windowExp < new Date()) {
        // TODO: If HUMAN_AGENT permission is approved later via Meta App Review,
        // attach `tag: 'HUMAN_AGENT'` allowing human agent replies up to 7 days.
        // Do NOT enable now; enforce strict 24-hour window.
        const expErr = new Error('24h window expired');
        expErr.code = 'WINDOW_EXPIRED';
        expErr.status = 409;
        expErr.windowExpiredAt = windowExp.toISOString();
        throw expErr;
      }
    }
  }

  const graphVer = GRAPH_VERSION();
  const url = `https://graph.facebook.com/${graphVer}/me/messages?access_token=${encodeURIComponent(pageToken)}`;

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
    const metaCode = resJson.error?.code;
    console.error(`[Meta Send] Error sending ${channel} message to ${recipientId}: code=${metaCode} ${errorMsg}`);

    // C.2: Persist a visible 'failed' bubble
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

    const err = new Error(errorMsg);
    err.code = metaCode;
    err.metaError = resJson.error;
    throw err;
  }

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
 * Persist incoming Instagram or Facebook comment keyed on external_id
 */
async function persistMetaComment({
  channel,
  commentId,
  postId = null,
  postUrl = null,
  postTitle = null,
  mediaType = 'Post',
  mediaThumbnail = null,
  senderId = null,
  senderName = null,
  senderUsername = null,
  senderAvatar = null,
  text,
  likeCount = 0,
  replies = [],
  hidden = false,
  createdAt = new Date()
}) {
  await ensureMetaSchema();
  const extId = String(commentId).trim();

  const r = await db.query(
    `INSERT INTO meta_comments (
       channel, external_id, comment_id, post_id, post_url, post_title, media_type, media_thumbnail,
       sender_id, sender_name, sender_username, sender_avatar, text, like_count, replies, hidden, status, unread, created_at
     ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, 'pending', TRUE, $16)
     ON CONFLICT (comment_id)
     DO UPDATE SET text = EXCLUDED.text,
                   external_id = EXCLUDED.external_id,
                   post_title = COALESCE(EXCLUDED.post_title, meta_comments.post_title),
                   media_type = COALESCE(EXCLUDED.media_type, meta_comments.media_type),
                   media_thumbnail = COALESCE(EXCLUDED.media_thumbnail, meta_comments.media_thumbnail),
                   sender_name = CASE
                     WHEN EXCLUDED.sender_name IS NOT NULL AND EXCLUDED.sender_name NOT IN ('Instagram User', 'Facebook User')
                     THEN EXCLUDED.sender_name
                     WHEN meta_comments.sender_name IS NOT NULL AND meta_comments.sender_name NOT IN ('Instagram User', 'Facebook User')
                     THEN meta_comments.sender_name
                     ELSE COALESCE(EXCLUDED.sender_name, meta_comments.sender_name)
                   END,
                   sender_username = COALESCE(EXCLUDED.sender_username, meta_comments.sender_username),
                   like_count = EXCLUDED.like_count,
                   replies = CASE WHEN jsonb_array_length(EXCLUDED.replies) > 0 THEN EXCLUDED.replies ELSE meta_comments.replies END,
                   hidden = EXCLUDED.hidden,
                   updated_at = NOW()
     RETURNING *`,
    [
      channel,
      extId,
      postId,
      postUrl,
      postTitle,
      mediaType,
      mediaThumbnail,
      senderId,
      senderName,
      senderUsername,
      senderAvatar,
      text,
      likeCount,
      JSON.stringify(replies),
      hidden,
      createdAt
    ]
  );

  return r.rows[0];
}

/**
 * Reply directly to an Instagram or Facebook comment
 */
async function replyToMetaComment({ channel, commentId, message }) {
  const pageToken = await getDerivedPageToken();
  if (!pageToken) throw new Error('Meta Page Access Token is missing');
  if (!commentId || !message) throw new Error('Comment ID and reply message are required');

  const graphVer = GRAPH_VERSION();
  const endpoint = channel === 'instagram' ? 'replies' : 'comments';
  const url = `https://graph.facebook.com/${graphVer}/${commentId}/${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message.trim(),
      access_token: pageToken
    })
  });

  const resJson = await response.json();
  if (!response.ok || resJson.error) {
    const errMsg = resJson.error?.message || 'Failed to post reply to comment';
    console.error(`[Meta Comment Reply] Error on ${channel} comment ${commentId}:`, resJson.error);
    throw new Error(errMsg);
  }

  await db.query(
    `UPDATE meta_comments
        SET reply_text = $1,
            replied_at = NOW(),
            status = 'replied',
            unread = FALSE,
            updated_at = NOW()
      WHERE external_id = $2 OR comment_id = $2`,
    [message.trim(), commentId]
  );

  return { success: true, replyId: resJson.id };
}

/**
 * Like or unlike a Facebook / Instagram comment
 */
async function toggleCommentLike({ channel, commentId }) {
  const pageToken = await getDerivedPageToken();
  const graphVer = GRAPH_VERSION();
  const url = `https://graph.facebook.com/${graphVer}/${commentId}/likes`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: pageToken })
  });
  return await response.json();
}

/**
 * Hide / Unhide a comment
 */
async function toggleCommentVisibility({ commentId, hidden = true }) {
  const pageToken = await getDerivedPageToken();
  const graphVer = GRAPH_VERSION();
  const url = `https://graph.facebook.com/${graphVer}/${commentId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_hidden: hidden, access_token: pageToken })
  });
  const resJson = await response.json();
  if (resJson.success) {
    await db.query('UPDATE meta_comments SET hidden = $1, updated_at = NOW() WHERE external_id = $2 OR comment_id = $2', [hidden, commentId]);
  }
  return resJson;
}

/**
 * Backfill Messenger Conversations (Page ID: 267592620109700)
 */
async function backfillMessengerConversations(limit = 25) {
  try {
    const pageToken = await getDerivedPageToken();
    const pageId = META_PAGE_ID();
    const graphVer = GRAPH_VERSION();

    const url = `https://graph.facebook.com/${graphVer}/${pageId}/conversations?fields=id,updated_time,unread_count,participants,messages.limit(20){id,message,created_time,from,to,attachments,shares}&limit=${limit}&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      console.warn('[Messenger Backfill] API warning:', data.error.message);
      return { count: 0, error: data.error.message };
    }

    let syncedConversations = 0;
    let syncedMessages = 0;

    for (const conv of (data.data || [])) {
      const participants = conv.participants?.data || [];
      const patient = participants.find((p) => String(p.id) !== pageId) || participants[0];
      if (!patient) continue;

      const convRecord = await findOrCreateMetaConversation({
        channel: 'facebook',
        senderId: patient.id,
        senderName: patient.name || `Facebook User`,
        senderAvatar: null
      });

      const messagesList = conv.messages?.data || [];
      for (const msg of messagesList) {
        if (!msg.id) continue;
        const isFromPage = String(msg.from?.id) === pageId;
        const direction = isFromPage ? 'outbound' : 'inbound';
        const attachments = msg.attachments?.data || [];
        const shares = msg.shares?.data || [];
        const sharedPost = shares.length > 0 ? shares[0] : null;
        const mediaUrl = attachments.length > 0 ? (attachments[0].image_data?.url || attachments[0].video_data?.url || attachments[0].file_url) : null;

        await persistMetaMessage({
          conversationId: convRecord.id,
          direction,
          channel: 'facebook',
          content: msg.message || '',
          mediaUrl,
          attachments,
          sharedPost,
          metaMessageId: msg.id,
          status: 'delivered',
          sentAt: msg.created_time ? new Date(msg.created_time) : new Date()
        });
        syncedMessages++;
      }
      syncedConversations++;
    }

    console.log(`✅ [Messenger Backfill] Synced ${syncedConversations} conversations and ${syncedMessages} messages`);
    return { syncedConversations, syncedMessages };
  } catch (err) {
    console.error('[Messenger Backfill] Error:', err.message);
    return { count: 0, error: err.message };
  }
}

/**
 * Backfill Instagram DMs for a specific IGSID (or known users)
 */
async function backfillInstagramThreadForUser(igsid) {
  if (!igsid) return null;
  try {
    const pageToken = await getDerivedPageToken();
    const pageId = META_PAGE_ID();
    const graphVer = GRAPH_VERSION();

    const url = `https://graph.facebook.com/${graphVer}/${pageId}/conversations?platform=instagram&user_id=${igsid}&fields=id,messages{id,message,created_time,from,to,attachments,shares}&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      console.warn(`[IG Thread Backfill] Warning for user ${igsid}:`, data.error.message);
      return null;
    }

    const convList = data.data || [];
    if (convList.length === 0) return null;

    const conv = convList[0];
    const profile = await fetchMetaUserProfile({ channel: 'instagram', userId: igsid });
    const convRecord = await findOrCreateMetaConversation({
      channel: 'instagram',
      senderId: igsid,
      senderName: profile?.name || (profile?.username ? `@${profile.username}` : `@user_${igsid.slice(-4)}`),
      senderUsername: profile?.username || null,
      senderAvatar: profile?.avatar || null
    });

    const messagesList = conv.messages?.data || [];
    for (const msg of messagesList) {
      if (!msg.id) continue;
      const isFromMe = String(msg.from?.id) === META_INSTAGRAM_ACCOUNT_ID() || String(msg.from?.id) === pageId;
      const direction = isFromMe ? 'outbound' : 'inbound';
      const attachments = msg.attachments?.data || [];
      const shares = msg.shares?.data || [];
      const sharedPost = shares.length > 0 ? shares[0] : null;

      await persistMetaMessage({
        conversationId: convRecord.id,
        direction,
        channel: 'instagram',
        content: msg.message || '',
        mediaUrl: attachments[0]?.image_data?.url || attachments[0]?.video_data?.url || null,
        attachments,
        sharedPost,
        metaMessageId: msg.id,
        status: 'delivered',
        sentAt: msg.created_time ? new Date(msg.created_time) : new Date()
      });
    }

    return convRecord;
  } catch (err) {
    console.error('[IG Thread Backfill] Error:', err.message);
    return null;
  }
}

/**
 * Backfill Instagram Media & Comments from Meta Graph API
 */
async function syncInstagramComments() {
  const pageToken = await getDerivedPageToken().catch(() => null);
  const igId = META_INSTAGRAM_ACCOUNT_ID();
  if (!pageToken || !igId) return { synced: 0 };

  try {
    await ensureMetaSchema();
    const graphVer = GRAPH_VERSION();
    const url = `https://graph.facebook.com/${graphVer}/${igId}/media?fields=id,caption,permalink,media_type,media_product_type,thumbnail_url,media_url,timestamp,comments_count,like_count,comments.limit(30){id,text,timestamp,username,like_count,hidden,replies{id,text,username,timestamp}}&limit=40&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn('[Instagram Sync] API returned warning:', data.error.message);
      return { synced: 0, error: data.error.message };
    }

    let count = 0;
    for (const post of (data.data || [])) {
      const postId = String(post.id);
      const postUrl = post.permalink || null;
      const postTitle = (post.caption || 'Instagram Post').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
      const mediaType = post.media_product_type === 'REELS' || post.media_type === 'VIDEO' ? 'Reel' : (post.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post');
      const mediaThumb = post.thumbnail_url || post.media_url || null;
      const likeCount = Number(post.like_count) || 0;
      const commentsCount = Number(post.comments_count) || 0;

      // Upsert into meta_media
      await db.query(
        `INSERT INTO meta_media (
           external_id, channel, caption, media_type, media_product_type, permalink, media_url, thumbnail_url, like_count, comments_count, timestamp, updated_at
         ) VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (external_id)
         DO UPDATE SET caption = EXCLUDED.caption,
                       like_count = EXCLUDED.like_count,
                       comments_count = EXCLUDED.comments_count,
                       thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, meta_media.thumbnail_url),
                       media_url = COALESCE(EXCLUDED.media_url, meta_media.media_url),
                       updated_at = NOW()`,
        [postId, post.caption || '', post.media_type, post.media_product_type, postUrl, post.media_url, mediaThumb, likeCount, commentsCount, post.timestamp ? new Date(post.timestamp) : new Date()]
      ).catch((err) => {
        console.error('[Meta Media Upsert IG] Error:', redact(err?.message || String(err)));
      });

      const commentsList = post.comments?.data || [];
      for (const c of commentsList) {
        if (!c.id || !c.text) continue;
        const createdAt = c.timestamp ? new Date(c.timestamp) : new Date();
        const username = c.username || null;
        const senderName = username ? `@${username}` : `@user_${String(c.id).slice(-4)}`;
        const replies = c.replies?.data || [];

        await persistMetaComment({
          channel: 'instagram',
          commentId: String(c.id),
          postId,
          postUrl,
          postTitle,
          mediaType,
          mediaThumbnail: mediaThumb,
          senderName,
          senderUsername: username,
          text: c.text,
          likeCount: Number(c.like_count) || 0,
          replies,
          hidden: Boolean(c.hidden),
          createdAt
        });
        count++;
      }
    }

    console.log(`✅ [Instagram Sync] Successfully synced ${count} comments & media items`);
    return { synced: count };
  } catch (err) {
    console.error('[Instagram Sync] Error:', err.message);
    return { synced: 0, error: err.message };
  }
}

/**
 * Backfill Facebook Published Posts & Comments
 */
async function syncFacebookComments() {
  const pageToken = await getDerivedPageToken().catch(() => null);
  const pageId = META_PAGE_ID();
  if (!pageToken || !pageId) return { synced: 0 };

  try {
    await ensureMetaSchema();
    const graphVer = GRAPH_VERSION();

    const url = `https://graph.facebook.com/${graphVer}/${pageId}/published_posts?fields=id,message,permalink_url,full_picture,created_time,attachments,comments.summary(true).limit(25){id,message,from{id,name,picture},created_time,like_count,comment_count,permalink_url}&limit=25&access_token=${encodeURIComponent(pageToken)}`;
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
      const postTitle = (post.message || 'Facebook Post').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
      const picture = post.full_picture || post.attachments?.data?.[0]?.media?.image?.src || null;
      const commentsSummary = post.comments?.summary?.total_count || 0;

      // Upsert into meta_media
      await db.query(
        `INSERT INTO meta_media (
           external_id, channel, caption, media_type, permalink, thumbnail_url, comments_count, timestamp, updated_at
         ) VALUES ($1, 'facebook', $2, 'Post', $3, $4, $5, $6, NOW())
         ON CONFLICT (external_id)
         DO UPDATE SET caption = EXCLUDED.caption,
                       comments_count = EXCLUDED.comments_count,
                       thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, meta_media.thumbnail_url),
                       updated_at = NOW()`,
        [postId, post.message || '', postUrl, picture, commentsSummary, post.created_time ? new Date(post.created_time) : new Date()]
      ).catch((err) => {
        console.error('[Meta Media Upsert FB] Error:', redact(err?.message || String(err)));
      });

      const commentsList = post.comments?.data || [];
      for (const c of commentsList) {
        if (!c.id || !c.message) continue;
        const createdAt = c.created_time ? new Date(c.created_time) : new Date();
        const senderName = c.from?.name || null;

        await persistMetaComment({
          channel: 'facebook',
          commentId: String(c.id),
          postId: String(postId),
          postUrl: c.permalink_url || postUrl,
          postTitle,
          mediaType: 'Post',
          mediaThumbnail: picture,
          senderId: c.from?.id ? String(c.from.id) : null,
          senderName,
          text: c.message,
          likeCount: Number(c.like_count) || 0,
          createdAt
        });
        count++;
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
 * Unified sync for omnichannel backfill
 */
async function syncMetaOmnichannel() {
  const [messenger, igComments, fbComments] = await Promise.allSettled([
    backfillMessengerConversations(25),
    syncInstagramComments(),
    syncFacebookComments()
  ]);

  return {
    messenger: messenger.status === 'fulfilled' ? messenger.value : null,
    instagramComments: igComments.status === 'fulfilled' ? igComments.value : null,
    facebookComments: fbComments.status === 'fulfilled' ? fbComments.value : null
  };
}

/**
 * Subscribe Page & Instagram account to Webhook events on startup
 */
async function subscribePageWebhooks() {
  try {
    const pageToken = await getDerivedPageToken();
    const pageId = META_PAGE_ID();
    const igId = META_INSTAGRAM_ACCOUNT_ID() || process.env.META_IG_USER_ID || '17841461905363722';
    const graphVer = GRAPH_VERSION();

    // 1. Subscribe Facebook Page
    const pageUrl = `https://graph.facebook.com/${graphVer}/${pageId}/subscribed_apps`;
    const resPage = await fetch(pageUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        subscribed_fields: 'feed,messages,message_reactions,message_reads,message_deliveries,messaging_postbacks',
        access_token: pageToken
      })
    });
    const dataPage = await resPage.json();
    console.log('✅ [Meta Subscribed Apps] Auto-subscribed Page webhook fields:', dataPage);

    // 2. Subscribe Instagram Business Account
    let dataIG = null;
    if (igId) {
      const igUrl = `https://graph.facebook.com/${graphVer}/${igId}/subscribed_apps`;
      const resIG = await fetch(igUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          subscribed_fields: 'messages,comments,messaging_seen,message_reactions',
          access_token: pageToken
        })
      });
      dataIG = await resIG.json();
      console.log('✅ [Meta Subscribed Apps] Auto-subscribed Instagram webhook fields:', dataIG);
    }

    return { page: dataPage, instagram: dataIG };
  } catch (err) {
    console.warn('[Meta Subscribed Apps] Auto-subscribe warning:', err.message);
    return null;
  }
}

module.exports = {
  ensureMetaSchema,
  getDerivedPageToken,
  fetchMetaUserProfile,
  findOrCreateMetaConversation,
  persistMetaMessage,
  sendMetaMessage,
  persistMetaComment,
  replyToMetaComment,
  toggleCommentLike,
  toggleCommentVisibility,
  backfillMessengerConversations,
  backfillInstagramThreadForUser,
  syncInstagramComments,
  syncFacebookComments,
  syncMetaOmnichannel,
  subscribePageWebhooks,
  META_PAGE_ID,
  META_INSTAGRAM_ACCOUNT_ID,
  GRAPH_VERSION
};
