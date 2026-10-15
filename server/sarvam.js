// Sarvam Samvaad "Instant Outbound" calling integration.
// Dispatches a single outbound call attempt via the Sarvam outbounds API.

async function dispatchSarvamCall({ phoneE164, vars, metadata }) {
  const orgId = process.env.SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID;

  const url = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${orgId}/workspaces/${workspaceId}/outbounds`;

  const body = {
    app_config: {
      app_id: process.env.SARVAM_APP_ID,
      app_version: Number(process.env.SARVAM_APP_VERSION || 13),
      connection_config: {
        connection_id: process.env.SARVAM_CONNECTION_ID,
        agent_phone_number: process.env.SARVAM_AGENT_NUMBER
      },
      agent_variables: vars || {}
    },
    user_config: {
      user_phone_number: phoneE164
    },
    webhook_config: {
      url: process.env.SARVAM_WEBHOOK_URL,
      metadata: metadata || {}
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.SARVAM_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message || data?.detail || data?.error || res.statusText);
  }

  return data;
}

// Pure mapping of a Sarvam webhook payload to the bulk engine's vocabulary.
function mapSarvamOutcome(payload) {
  const status = String(payload?.status || '').toLowerCase();
  const fv = payload?.final_agent_variables || {};
  const disposition = String(fv.call_disposition || '').toLowerCase();

  let callStatus;
  let outcome;
  if (status === 'no_answer' || status === 'busy' || status === 'failed') {
    callStatus = status;
    outcome = status;
  } else {
    callStatus = 'completed';
    if (disposition === 'booked' || disposition === 'rescheduled' || disposition === 'confirmed') outcome = 'booked';
    else if (disposition === 'do_not_call') outcome = 'do_not_call';
    else if (disposition === 'not_interested') outcome = 'not_interested';
    else outcome = 'not_booked';
  }

  let summary = fv.call_summary || '';
  if (!summary && Array.isArray(payload?.interaction_transcript) && payload.interaction_transcript.length > 0) {
    summary = payload.interaction_transcript
      .slice(-2)
      .map(t => `${t?.role}: ${t?.en_text}`)
      .join(' ');
  }
  if (payload?.interaction_id) {
    summary = `${summary} [interaction_id: ${payload.interaction_id}]`.trim();
  }

  const confirmedSlot = outcome === 'booked' ? (fv.confirmed_slot || '') : '';

  return { callStatus, outcome, summary, confirmedSlot };
}

module.exports = { dispatchSarvamCall, mapSarvamOutcome };
