require('dotenv').config();

function redact(obj) {
  if (!obj) return obj;
  let str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  str = str.replace(/EAA[a-zA-Z0-9_\-]+/g, 'EAA***');
  str = str.replace(/access_token=[^&"'\s]+/gi, 'access_token=EAA***');
  return typeof obj === 'string' ? str : JSON.parse(str);
}

async function runStep0() {
  const userToken = process.env.META_USER_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
  const targetPageId = String(process.env.META_PAGE_ID || '267592620109700').trim();
  const igUserId = String(process.env.META_IG_USER_ID || process.env.META_INSTAGRAM_ACCOUNT_ID || '17841461905363722').trim();
  const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0';

  console.log('Resolving Page token for Page ID:', targetPageId);
  const accountsRes = await fetch(`https://graph.facebook.com/${graphVersion}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`);
  const accountsData = await accountsRes.json();
  
  if (accountsData.error) {
    throw new Error('Failed to fetch accounts: ' + accountsData.error.message);
  }

  const page = (accountsData.data || []).find(p => String(p.id).trim() === targetPageId);
  if (!page || !page.access_token) {
    throw new Error(`CRITICAL: Page ID ${targetPageId} not found in user accounts! Total pages returned: ${accountsData.data?.length}`);
  }

  const pageToken = page.access_token;
  console.log('Successfully derived Page Token for:', page.name, `(${page.id})`);

  const results = {};

  // 1. GET /debug_token?input_token=<page token>
  try {
    const url = `https://graph.facebook.com/${graphVersion}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    results['1_debug_token'] = {
      status: res.status,
      data: redact({
        type: data.data?.type,
        app_id: data.data?.app_id,
        application: data.data?.application,
        expires_at: data.data?.expires_at,
        is_valid: data.data?.is_valid,
        scopes: data.data?.scopes,
        error: data.error
      })
    };
  } catch (err) {
    results['1_debug_token'] = { status: 500, error: err.message };
  }

  // 2. GET /{PAGE_ID}/conversations?fields=id,updated_time,unread_count&limit=5 (Messenger)
  try {
    const url = `https://graph.facebook.com/${graphVersion}/${targetPageId}/conversations?fields=id,updated_time,unread_count&limit=5&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    results['2_messenger_conversations'] = {
      status: res.status,
      count: data.data?.length || 0,
      data: redact(data)
    };
  } catch (err) {
    results['2_messenger_conversations'] = { status: 500, error: err.message };
  }

  // 3. GET /{PAGE_ID}/conversations?platform=instagram&fields=id&limit=1 (IG DMs)
  try {
    const url = `https://graph.facebook.com/${graphVersion}/${targetPageId}/conversations?platform=instagram&fields=id&limit=1&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    results['3_ig_conversations'] = {
      status: res.status,
      data: redact(data)
    };
  } catch (err) {
    results['3_ig_conversations'] = { status: 500, error: err.message };
  }

  // 4. GET /{IG_USER_ID}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=10
  let sampleMediaId = null;
  try {
    const url = `https://graph.facebook.com/${graphVersion}/${igUserId}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=10&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      sampleMediaId = data.data[0].id;
    }
    results['4_ig_media'] = {
      status: res.status,
      count: data.data?.length || 0,
      sample_id: sampleMediaId,
      data: redact(data)
    };
  } catch (err) {
    results['4_ig_media'] = { status: 500, error: err.message };
  }

  // 5. GET /{media_id}/comments?fields=id,text,timestamp,username,like_count,hidden,replies{id,text,username,timestamp}&limit=10
  try {
    if (sampleMediaId) {
      const url = `https://graph.facebook.com/${graphVersion}/${sampleMediaId}/comments?fields=id,text,timestamp,username,like_count,hidden,replies{id,text,username,timestamp}&limit=10&access_token=${encodeURIComponent(pageToken)}`;
      const res = await fetch(url);
      const data = await res.json();
      results['5_ig_comments'] = {
        status: res.status,
        media_id: sampleMediaId,
        count: data.data?.length || 0,
        data: redact(data)
      };
    } else {
      results['5_ig_comments'] = { status: 'skipped', reason: 'No sampleMediaId found from call 4' };
    }
  } catch (err) {
    results['5_ig_comments'] = { status: 500, error: err.message };
  }

  // 6. GET /{PAGE_ID}/published_posts?fields=id,message,permalink_url,full_picture,created_time,attachments&limit=5
  let samplePostId = null;
  try {
    const url = `https://graph.facebook.com/${graphVersion}/${targetPageId}/published_posts?fields=id,message,permalink_url,full_picture,created_time,attachments&limit=5&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      samplePostId = data.data[0].id;
    }
    results['6_fb_published_posts'] = {
      status: res.status,
      count: data.data?.length || 0,
      sample_id: samplePostId,
      data: redact(data)
    };
  } catch (err) {
    results['6_fb_published_posts'] = { status: 500, error: err.message };
  }

  // 7. GET /{post_id}/comments?fields=id,message,from{id,name,picture},created_time,like_count,comment_count,permalink_url&filter=toplevel&limit=10
  try {
    if (samplePostId) {
      const url = `https://graph.facebook.com/${graphVersion}/${samplePostId}/comments?fields=id,message,from{id,name,picture},created_time,like_count,comment_count,permalink_url&filter=toplevel&limit=10&access_token=${encodeURIComponent(pageToken)}`;
      const res = await fetch(url);
      const data = await res.json();
      results['7_fb_post_comments'] = {
        status: res.status,
        post_id: samplePostId,
        count: data.data?.length || 0,
        data: redact(data)
      };
    } else {
      results['7_fb_post_comments'] = { status: 'skipped', reason: 'No samplePostId found from call 6' };
    }
  } catch (err) {
    results['7_fb_post_comments'] = { status: 500, error: err.message };
  }

  // 8. GET /{PAGE_ID}/subscribed_apps -> list subscribed fields
  try {
    const url = `https://graph.facebook.com/${graphVersion}/${targetPageId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    results['8_subscribed_apps'] = {
      status: res.status,
      data: redact(data)
    };
  } catch (err) {
    results['8_subscribed_apps'] = { status: 500, error: err.message };
  }

  console.log('\n================ STEP 0 DIAGNOSTIC RESULTS ================');
  console.log(JSON.stringify(results, null, 2));
  return results;
}

module.exports = { runStep0 };

if (require.main === module) {
  runStep0().then(() => process.exit(0)).catch(e => { console.error('STEP 0 FAILED:', e); process.exit(1); });
}

