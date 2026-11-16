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
      ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS avatar_error TEXT;

      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS author_avatar TEXT;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;
      ALTER TABLE meta_comments ADD COLUMN IF NOT EXISTS avatar_error TEXT;

      ALTER TABLE meta_avatar_cache ADD COLUMN IF NOT EXISTS error_message TEXT;

      -- Reset bogus placeholder/unsplash URLs in participant_avatar and author_avatar
      UPDATE meta_conversations
         SET participant_avatar = NULL
       WHERE participant_avatar IS NOT NULL
         AND participant_avatar NOT LIKE '/api/meta/avatar/%';

      UPDATE meta_comments
         SET author_avatar = NULL
       WHERE author_avatar IS NOT NULL
         AND author_avatar NOT LIKE '/api/meta/avatar/%';
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
 * Check if an error message/code indicates a permanent permission restriction
 */
function isMetaPermissionError(err) {
  if (!err) return false;
  const code = Number(err.code);
  const subcode = Number(err.error_subcode || err.subcode);
  const msg = String(err.message || err.error || err || '').toLowerCase();

  return (
    code === 100 ||
    code === 10 ||
    code === 200 ||
    code === -2 ||
    subcode === 33 ||
    subcode === 2534084 ||
    msg.includes('permissions') ||
    msg.includes('business asset user profile access') ||
    msg.includes('does not exist') ||
    msg.includes('advanced access') ||
    msg.includes('unsupported get request')
  );
}

/**
 * Fetch avatar for a participant from Meta Graph API
 */
async function fetchAndCacheAvatar({ participantId, channel, rawPictureUrl = null }) {
  await ensureAvatarSchema();
  if (!participantId) return { status: 'fallback', url: null };

  // Instagram comments and WhatsApp: strictly no photo available via Meta API
  if (channel === 'instagram_comment' || channel === 'whatsapp') {
    const reason = channel === 'whatsapp'
      ? 'WhatsApp Cloud API does not provide profile photos'
      : 'Instagram Graph API does not provide commenter profile photos';
    await db.query(
      `INSERT INTO meta_avatar_cache (participant_id, channel, status, error_message, fetched_at)
       VALUES ($1, $2, 'fallback', $3, NOW())
       ON CONFLICT (participant_id, channel)
       DO UPDATE SET status = 'fallback', error_message = EXCLUDED.error_message, fetched_at = NOW()`,
      [participantId, channel, reason]
    ).catch(() => {});
    return { status: 'fallback', url: null };
  }

  // Check if we already have a cached avatar or permission error from the last 7 days
  const cached = await db.query(
    `SELECT avatar_url, status, error_message, fetched_at FROM meta_avatar_cache
      WHERE participant_id = $1 AND channel = $2 LIMIT 1`,
    [participantId, channel]
  );

  if (cached.rows.length > 0) {
    const row = cached.rows[0];
    const isRecent = row.fetched_at && (Date.now() - new Date(row.fetched_at).getTime() < 7 * 24 * 3600 * 1000);

    if (row.status === 'cached' && row.avatar_url && isRecent) {
      return { status: 'cached', url: row.avatar_url };
    }

    // Do NOT loop retries on permission errors within 7 days
    if (row.status === 'fallback' && isRecent && isMetaPermissionError({ message: row.error_message })) {
      return { status: 'fallback', url: null, error: row.error_message };
    }
  }

  let remotePictureUrl = rawPictureUrl;
  let lastError = null;

  // If we don't have a direct picture URL, query Graph API with derived Page Token
  if (!remotePictureUrl) {
    try {
      const pageToken = await getDerivedPageToken();
      const graphVer = GRAPH_VERSION();

      if (channel === 'instagram') {
        const url = `https://graph.facebook.com/${graphVer}/${encodeURIComponent(participantId)}?fields=name,username,profile_pic&access_token=${encodeURIComponent(pageToken)}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
          const errObj = data.error || { message: `HTTP ${res.status}` };
          lastError = `Graph Error (#${errObj.code || res.status}${errObj.error_subcode ? '/' + errObj.error_subcode : ''}): ${errObj.message || 'Unknown'}`
            .replace(/EAA[A-Za-z0-9]+/g, 'EAA***');
          console.error(`❌ [Avatar Fetch] channel=${channel} id=${participantId} code=${errObj.code} subcode=${errObj.error_subcode}: ${lastError}`);
        } else {
          remotePictureUrl = data.profile_pic || null;
        }
      } else if (channel === 'facebook') {
        const url = `https://graph.facebook.com/${graphVer}/${encodeURIComponent(participantId)}?fields=name,profile_pic&access_token=${encodeURIComponent(pageToken)}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
          const errObj = data.error || { message: `HTTP ${res.status}` };
          lastError = `Graph Error (#${errObj.code || res.status}${errObj.error_subcode ? '/' + errObj.error_subcode : ''}): ${errObj.message || 'Unknown'}`
            .replace(/EAA[A-Za-z0-9]+/g, 'EAA***');
          console.error(`❌ [Avatar Fetch] channel=${channel} id=${participantId} code=${errObj.code} subcode=${errObj.error_subcode}: ${lastError}`);
        } else if (data.profile_pic) {
          remotePictureUrl = data.profile_pic;
        } else {
          // Fallback to picture endpoint
          const picUrl = `https://graph.facebook.com/${graphVer}/${encodeURIComponent(participantId)}/picture?redirect=false&type=large&access_token=${encodeURIComponent(pageToken)}`;
          const picRes = await fetch(picUrl);
          const picData = await picRes.json().catch(() => ({}));
          if (picRes.ok && picData.data?.url) {
            remotePictureUrl = picData.data.url;
          } else if (picData.error) {
            const errObj = picData.error;
            lastError = `Graph Error (#${errObj.code || picRes.status}${errObj.error_subcode ? '/' + errObj.error_subcode : ''}): ${errObj.message || 'Unknown'}`
              .replace(/EAA[A-Za-z0-9]+/g, 'EAA***');
            console.error(`❌ [Avatar Fetch /picture] channel=${channel} id=${participantId} code=${errObj.code} subcode=${errObj.error_subcode}: ${lastError}`);
          }
        }
      } else if (channel === 'facebook_comment') {
        // For comments, query comment node for from{id,name,picture.type(large)}
        const commentUrl = `https://graph.facebook.com/${graphVer}/${encodeURIComponent(participantId)}?fields=id,message,from{id,name,picture.type(large)}&access_token=${encodeURIComponent(pageToken)}`;
        const cRes = await fetch(commentUrl);
        const cData = await cRes.json().catch(() => ({}));

        if (cRes.ok && cData.from?.picture?.data?.url) {
          remotePictureUrl = cData.from.picture.data.url;
        } else if (cData.from?.id) {
          // If from has id but no picture
          const fromPicUrl = `https://graph.facebook.com/${graphVer}/${encodeURIComponent(cData.from.id)}/picture?redirect=false&type=large&access_token=${encodeURIComponent(pageToken)}`;
          const fromRes = await fetch(fromPicUrl);
          const fromData = await fromRes.json().catch(() => ({}));
          if (fromRes.ok && fromData.data?.url) {
            remotePictureUrl = fromData.data.url;
          }
        } else if (cData.error) {
          const errObj = cData.error;
          lastError = `Graph Error (#${errObj.code || cRes.status}): ${errObj.message || 'Unknown'}`
            .replace(/EAA[A-Za-z0-9]+/g, 'EAA***');
          console.error(`❌ [Avatar Fetch FB Comment] id=${participantId}: ${lastError}`);
        } else if (!cData.from) {
          lastError = 'Graph API omitted `from` object on comment (Requires Business Asset User Profile Access)';
          console.warn(`⚠️ [Avatar Fetch FB Comment] id=${participantId}: ${lastError}`);
        }
      }
    } catch (apiErr) {
      lastError = `Network/Exception: ${apiErr.message}`.replace(/EAA[A-Za-z0-9]+/g, 'EAA***');
      console.error(`❌ [Avatar Fetch Network Error] channel=${channel} id=${participantId}:`, apiErr.message);
    }
  }

  // If a valid remote picture URL was obtained, download and cache it permanently
  if (remotePictureUrl) {
    const stableUrl = await downloadAndCacheImage({ participantId, channel, sourceUrl: remotePictureUrl });
    if (stableUrl) {
      // Clear avatar_error on success
      if (channel === 'facebook' || channel === 'instagram') {
        await db.query(`UPDATE meta_conversations SET avatar_error = NULL WHERE external_id = $1 OR sender_id = $1`, [participantId]).catch(() => {});
      } else if (channel === 'facebook_comment') {
        await db.query(`UPDATE meta_comments SET avatar_error = NULL WHERE sender_id = $1 OR comment_id = $1`, [participantId]).catch(() => {});
      }
      return { status: 'cached', url: stableUrl };
    }
    lastError = 'Failed to download avatar image from CDN';
  }

  // When no image could be downloaded, store error and keep avatar empty (never store initials/placeholders as images)
  const errorReason = lastError || 'No profile picture returned by Meta Graph API';

  await db.query(
    `INSERT INTO meta_avatar_cache (participant_id, channel, status, error_message, fetched_at)
     VALUES ($1, $2, 'fallback', $3, NOW())
     ON CONFLICT (participant_id, channel)
     DO UPDATE SET status = 'fallback', error_message = EXCLUDED.error_message, fetched_at = NOW()`,
    [participantId, channel, errorReason]
  ).catch(() => {});

  if (channel === 'facebook' || channel === 'instagram') {
    await db.query(
      `UPDATE meta_conversations
          SET participant_avatar = NULL,
              avatar_error = $1,
              avatar_updated_at = NOW()
        WHERE external_id = $2 OR sender_id = $2`,
      [errorReason, participantId]
    ).catch(() => {});
  } else if (channel === 'facebook_comment' || channel === 'instagram_comment') {
    await db.query(
      `UPDATE meta_comments
          SET author_avatar = NULL,
              avatar_error = $1,
              avatar_updated_at = NOW()
        WHERE sender_id = $2 OR comment_id = $2`,
      [errorReason, participantId]
    ).catch(() => {});
  }

  return { status: 'fallback', url: null, error: errorReason };
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
    // Prefer sender_id (real PSID / IGSID) over thread ID (t_...)
    const pId = (c.sender_id && !c.sender_id.startsWith('t_')) ? c.sender_id : c.external_id;
    if (!pId || pId.startsWith('t_')) continue;

    // Check if row already has a cached avatar from the last 7 days with actual cached data
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
    if (cm.channel === 'instagram') {
      // Instagram comments: no API photo available from Meta
      stats.instagram_comment_fallback++;
      stats.total_processed++;
      continue;
    }

    const pId = cm.comment_id || cm.sender_id;
    if (!pId) continue;

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
