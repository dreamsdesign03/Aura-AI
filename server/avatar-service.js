const db = require('./db');
const { getDerivedPageToken, GRAPH_VERSION } = require('./meta');

let avatarSchemaEnsured = false;

/**
 * Ensure meta_avatar_cache table and avatar columns exist
 */
async function ensureAvatarSchema() {
  if (avatarSchemaEnsured) return;
  try {
    avatarSchemaEnsured = true;
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_avatar_cache (
        participant_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        avatar_url TEXT,
        image_data BYTEA,
        mime_type TEXT DEFAULT 'image/jpeg',
        status TEXT DEFAULT 'cached', -- 'cached' | 'fallback' | 'failed'
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (participant_id, channel)
      );

      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS participant_avatar TEXT;
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS author_avatar TEXT;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

      -- Sync existing columns
      UPDATE meta_conversations SET participant_avatar = sender_avatar WHERE participant_avatar IS NULL AND sender_avatar IS NOT NULL;
      UPDATE meta_comments SET author_avatar = sender_avatar WHERE author_avatar IS NULL AND sender_avatar IS NOT NULL;
    `);
    console.log('✅ [Avatar Service] DB schema verified');
  } catch (err) {
    console.error('❌ [Avatar Service] Schema error:', err.message);
  }
}

/**
 * Download an image and cache it as BYTEA in database
 */
async function downloadAndCacheImage({ participantId, channel, sourceUrl }) {
  if (!sourceUrl || !participantId) return null;

  try {
    const res = await fetch(sourceUrl, { headers: { 'User-Agent': 'AuraAI-AvatarCache/1.0' } });
    if (!res.ok) {
      console.warn(`[Avatar Cache] Failed to download image from ${sourceUrl}: ${res.status}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Stable URL served from our API
    const stableUrl = `/api/meta/avatar/${channel}/${encodeURIComponent(participantId)}`;

    await db.query(
      `INSERT INTO meta_avatar_cache (participant_id, channel, avatar_url, image_data, mime_type, status, fetched_at)
       VALUES ($1, $2, $3, $4, $5, 'cached', NOW())
       ON CONFLICT (participant_id, channel)
       DO UPDATE SET avatar_url = EXCLUDED.avatar_url,
                     image_data = EXCLUDED.image_data,
                     mime_type = EXCLUDED.mime_type,
                     status = 'cached',
                     fetched_at = NOW()`,
      [participantId, channel, stableUrl, buffer, contentType]
    );

    // Update conversation or comment row
    if (channel === 'facebook' || channel === 'instagram') {
      await db.query(
        `UPDATE meta_conversations
            SET participant_avatar = $1,
                sender_avatar = $1,
                avatar_updated_at = NOW()
          WHERE external_id = $2 OR sender_id = $2`,
        [stableUrl, participantId]
      );
    } else if (channel === 'facebook_comment' || channel === 'instagram_comment') {
      await db.query(
        `UPDATE meta_comments
            SET author_avatar = $1,
                sender_avatar = $1,
                avatar_updated_at = NOW()
          WHERE sender_id = $2 OR comment_id = $2`,
        [stableUrl, participantId]
      );
    }

    return stableUrl;
  } catch (err) {
    console.warn(`[Avatar Cache] Error downloading image for ${channel}/${participantId}:`, err.message);
    return null;
  }
}

/**
 * Fetch avatar for a participant from Meta Graph API
 */
async function fetchAndCacheAvatar({ participantId, channel, rawPictureUrl = null }) {
  await ensureAvatarSchema();
  if (!participantId) return { status: 'fallback', url: null };

  // Instagram comments and WhatsApp: strictly no photo available via API
  if (channel === 'instagram_comment' || channel === 'whatsapp') {
    await db.query(
      `INSERT INTO meta_avatar_cache (participant_id, channel, status, fetched_at)
       VALUES ($1, $2, 'fallback', NOW())
       ON CONFLICT (participant_id, channel)
       DO UPDATE SET status = 'fallback', fetched_at = NOW()`,
      [participantId, channel]
    ).catch(() => {});
    return { status: 'fallback', url: null };
  }

  // Check if we already have a cached avatar from the last 7 days
  const cached = await db.query(
    `SELECT avatar_url, status, fetched_at FROM meta_avatar_cache
      WHERE participant_id = $1 AND channel = $2 LIMIT 1`,
    [participantId, channel]
  );

  if (cached.rows.length > 0) {
    const row = cached.rows[0];
    const isRecent = row.fetched_at && (Date.now() - new Date(row.fetched_at).getTime() < 7 * 24 * 3600 * 1000);
    if (row.status === 'cached' && row.avatar_url && isRecent) {
      return { status: 'cached', url: row.avatar_url };
    }
  }

  let remotePictureUrl = rawPictureUrl;

  // If we don't have a direct picture URL, query Graph API with derived Page Token
  if (!remotePictureUrl) {
    try {
      const pageToken = await getDerivedPageToken();
      const graphVer = GRAPH_VERSION();

      if (channel === 'instagram') {
        const res = await fetch(`https://graph.facebook.com/${graphVer}/${participantId}?fields=name,username,profile_pic&access_token=${encodeURIComponent(pageToken)}`);
        const data = await res.json();
        remotePictureUrl = data.profile_pic || null;
      } else if (channel === 'facebook') {
        const res = await fetch(`https://graph.facebook.com/${graphVer}/${participantId}?fields=name,profile_pic&access_token=${encodeURIComponent(pageToken)}`);
        const data = await res.json();
        if (data.profile_pic) {
          remotePictureUrl = data.profile_pic;
        } else {
          // Fallback to picture endpoint
          const picRes = await fetch(`https://graph.facebook.com/${graphVer}/${participantId}/picture?redirect=false&type=large&access_token=${encodeURIComponent(pageToken)}`);
          const picData = await picRes.json();
          remotePictureUrl = picData.data?.url || null;
        }
      } else if (channel === 'facebook_comment') {
        const picRes = await fetch(`https://graph.facebook.com/${graphVer}/${participantId}/picture?redirect=false&type=large&access_token=${encodeURIComponent(pageToken)}`);
        const picData = await picRes.json();
        remotePictureUrl = picData.data?.url || null;
      }
    } catch (apiErr) {
      // Never block on avatar failure
    }
  }

  if (remotePictureUrl) {
    const stableUrl = await downloadAndCacheImage({ participantId, channel, sourceUrl: remotePictureUrl });
    if (stableUrl) {
      return { status: 'cached', url: stableUrl };
    }
  }

  // Mark fallback in cache
  await db.query(
    `INSERT INTO meta_avatar_cache (participant_id, channel, status, fetched_at)
     VALUES ($1, $2, 'fallback', NOW())
     ON CONFLICT (participant_id, channel)
     DO UPDATE SET status = 'fallback', fetched_at = NOW()`,
    [participantId, channel]
  ).catch(() => {});

  return { status: 'fallback', url: null };
}

/**
 * One-time / scheduled backfill job for all conversations and comments
 * Rate limited to max ~5 requests per second (200ms delay between calls)
 */
async function backfillAvatars() {
  await ensureAvatarSchema();
  console.log('🚀 [Avatar Backfill] Starting rate-limited avatar backfill...');

  const stats = {
    messenger_cached: 0,
    messenger_fallback: 0,
    instagram_dm_cached: 0,
    instagram_dm_fallback: 0,
    facebook_comment_cached: 0,
    facebook_comment_fallback: 0,
    instagram_comment_fallback: 0,
    whatsapp_fallback: 0,
    total_processed: 0
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 1. Messenger & Instagram Conversations
  const convs = await db.query(`
    SELECT id, channel, external_id, sender_id, sender_name, sender_username, participant_avatar
      FROM meta_conversations
  `);

  for (const c of convs.rows) {
    const pId = c.external_id || c.sender_id;
    if (!pId) continue;

    // Check if row already has a cached avatar from the last 7 days
    const isCached = c.participant_avatar && c.participant_avatar.startsWith('/api/meta/avatar/');
    if (isCached) {
      if (c.channel === 'instagram') stats.instagram_dm_cached++;
      else stats.messenger_cached++;
      stats.total_processed++;
      continue;
    }

    const res = await fetchAndCacheAvatar({
      participantId: pId,
      channel: c.channel
    });

    if (res.status === 'cached') {
      if (c.channel === 'instagram') stats.instagram_dm_cached++;
      else stats.messenger_cached++;
    } else {
      if (c.channel === 'instagram') stats.instagram_dm_fallback++;
      else stats.messenger_fallback++;
    }

    stats.total_processed++;
    await sleep(220); // Rate-limit to max ~4.5 requests/sec
  }

  // 2. Facebook and Instagram Comments
  const comments = await db.query(`
    SELECT id, channel, comment_id, sender_id, sender_name, sender_username, author_avatar
      FROM meta_comments
  `);

  for (const cm of comments.rows) {
    const pId = cm.sender_id || cm.comment_id;
    if (!pId) continue;

    if (cm.channel === 'instagram') {
      // Instagram comments: no API photo available
      stats.instagram_comment_fallback++;
      stats.total_processed++;
      continue;
    }

    const isCached = cm.author_avatar && cm.author_avatar.startsWith('/api/meta/avatar/');
    if (isCached) {
      stats.facebook_comment_cached++;
      stats.total_processed++;
      continue;
    }

    const res = await fetchAndCacheAvatar({
      participantId: pId,
      channel: 'facebook_comment'
    });

    if (res.status === 'cached') {
      stats.facebook_comment_cached++;
    } else {
      stats.facebook_comment_fallback++;
    }

    stats.total_processed++;
    await sleep(220);
  }

  // 3. WhatsApp Conversations (pure fallback as WhatsApp API does not provide profile photos)
  const waConvs = await db.query(`SELECT count(*) FROM whatsapp_conversations`).catch(() => ({ rows: [{ count: 0 }] }));
  stats.whatsapp_fallback = Number(waConvs.rows[0]?.count || 0);

  console.log('✅ [Avatar Backfill] Completed avatar backfill:', stats);
  return stats;
}

module.exports = {
  ensureAvatarSchema,
  fetchAndCacheAvatar,
  downloadAndCacheImage,
  backfillAvatars
};
