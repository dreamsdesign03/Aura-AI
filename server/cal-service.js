/**
 * Cal.com API v2 integration service
 * Handles live sync, rescheduling, and cancellation with Cal.com
 */

function getCalApiKey() {
  return process.env.CAL_API_KEY || process.env.CALCOM_API_KEY || 'cal_live_92ae6d6107040c70be9b0930559ffa17';
}

async function resolveCalBookingUid(row) {
  if (!row) return null;
  if (row.metadata && row.metadata.cal_uid) {
    return String(row.metadata.cal_uid).trim();
  }
  const rawUri = String(row.calendly_uri || '').trim();
  if (!rawUri) return null;
  const stripped = rawUri.replace(/^cal_/, '');
  // If it's already an alphanumeric Cal.com UID (contains letters and digits, >= 10 chars)
  if (stripped.length >= 10 && /[a-zA-Z]/.test(stripped)) {
    return stripped;
  }

  // If it's numeric, query Cal.com API bookings to find its matching UID
  try {
    const apiKey = getCalApiKey();
    const res = await fetch('https://api.cal.com/v2/bookings', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
      }
    });
    if (res.ok) {
      const body = await res.json();
      const bookings = body.data || [];
      const found = bookings.find(b => String(b.id) === String(stripped) || String(b.uid) === String(stripped));
      if (found && found.uid) {
        return found.uid;
      }
    }
  } catch (err) {
    console.warn('[resolveCalBookingUid] lookup error:', err.message);
  }

  return stripped;
}

async function rescheduleCalBooking(uid, newStartIso) {
  if (!uid) return { ok: false, error: 'No Cal.com booking UID available' };
  const apiKey = getCalApiKey();
  const start = new Date(newStartIso).toISOString();

  try {
    const res = await fetch(`https://api.cal.com/v2/bookings/${encodeURIComponent(uid)}/reschedule`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ start })
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = body.error?.message || body.message || `Cal.com reschedule failed (${res.status})`;
      console.warn(`[rescheduleCalBooking] Cal.com API error (${res.status}):`, errMsg);
      return { ok: false, status: res.status, error: errMsg };
    }

    return { ok: true, data: body.data };
  } catch (err) {
    console.warn('[rescheduleCalBooking] Network/API exception:', err.message);
    return { ok: false, error: err.message };
  }
}

async function cancelCalBooking(uid, reason = 'Cancelled by clinic admin') {
  if (!uid) return { ok: false, error: 'No Cal.com booking UID available' };
  const apiKey = getCalApiKey();

  try {
    const res = await fetch(`https://api.cal.com/v2/bookings/${encodeURIComponent(uid)}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = body.error?.message || body.message || `Cal.com cancel failed (${res.status})`;
      console.warn(`[cancelCalBooking] Cal.com API error (${res.status}):`, errMsg);
      return { ok: false, status: res.status, error: errMsg };
    }

    return { ok: true, data: body.data };
  } catch (err) {
    console.warn('[cancelCalBooking] Network/API exception:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getCalApiKey,
  resolveCalBookingUid,
  rescheduleCalBooking,
  cancelCalBooking,
};

