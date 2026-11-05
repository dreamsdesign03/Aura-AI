/**
 * Conversation intelligence for AI phone calls.
 *
 * Ports the three-way conversation taxonomy used by Health-Insight-AI
 * (marketing_sales | patient_consultation | customer_care) into Aura AI and
 * classifies a call from its stored metadata + transcript.
 *
 * This module is purely additive: it never writes to the database and does not
 * change any existing call-handling behaviour.
 */

const CONVERSATION_TYPES = ['marketing_sales', 'patient_consultation', 'customer_care'];

const CONVERSATION_TYPE_LABELS = {
  marketing_sales: 'Marketing & Sales',
  patient_consultation: 'Patient Consultation',
  customer_care: 'Customer Care',
};

const PURPOSE_LABELS = {
  bulk_campaign: 'Bulk campaign',
  single_call: 'Direct outbound',
  inbound_call: 'Inbound',
  proposal_call: 'Proposal call',
  patient_consultation: 'Patient consultation',
  follow_up: 'Post-treatment follow-up',
  treatment_query: 'Treatment inquiry',
  appointment_booking: 'Appointment booking',
  payment_reminder: 'Payment reminder',
  general: 'General front-desk',
};

// Values already normalised by older Aura APIs / Health-Insight.
const LEGACY_TYPE_MAP = {
  marketing_sales: 'marketing_sales',
  sales_call: 'marketing_sales',
  patient_consultation: 'patient_consultation',
  consultation: 'patient_consultation',
  customer_care: 'customer_care',
};

// Stored booking_type values that strongly imply one conversation type.
const BOOKING_TYPE_HINTS = {
  marketing_sales: ['marketing_sales', 'sales_call', 'bulk_campaign', 'single_call', 'proposal_call', 'appointment_booking', 'treatment_query'],
  patient_consultation: ['patient_consultation', 'consultation', 'follow_up'],
  customer_care: ['customer_care', 'inbound_call', 'general', 'payment_reminder'],
};

// Phrases (English + Hindi/Gujarati in Devanagari/Gujarati script) per type.
const KEYWORD_SIGNALS = {
  patient_consultation: [
    ['doctor', 2], ['dr.', 2], ['prescription', 3], ['medicine', 2], ['medicines', 2],
    ['dose', 2], ['dosage', 2], ['aftercare', 3], ['after care', 3],
    ['post treatment', 3], ['post-treatment', 3], ['side effect', 3], ['side effects', 3],
    ['infection', 2], ['healing', 2], ['swelling', 2], ['pain', 1], ['sore', 1],
    ['follow up', 2], ['follow-up', 2], ['review', 1], ['report', 1],
    ['session', 1], ['sessions completed', 3], ['treatment plan', 2],
    ['laser session', 2], ['procedure', 2], ['skin', 1], ['acne', 1],
    ['hair fall', 1], ['pigmentation', 1], ['dermatologist', 2],
    ['दवा', 3], ['दवाई', 3], ['डॉक्टर', 3], ['सारवार', 2], ['इलाज', 2],
    ['मरहम', 2], ['परेशानी', 1], ['रिपोर्ट', 1],
    ['દવા', 3], ['ડૉક્ટર', 3], ['સારવાર', 2], ['ઇલાજ', 2], ['મલમ', 2],
  ],
  marketing_sales: [
    ['price', 3], ['pricing', 3], ['cost', 3], ['offer', 3], ['discount', 3],
    ['deal', 2], ['package', 2], ['packages', 2], ['plan', 1], ['book', 2],
    ['booking', 2], ['appointment', 2], ['interested', 2], ['enquiry', 2],
    ['inquiry', 2], ['new patient', 3], ['first time', 2], ['consultation', 2],
    ['treatment', 1], ['quotation', 2], ['quote', 2], ['emi', 2], ['advance', 1],
    ['कीमत', 3], ['ऑफर', 3], ['पैकेज', 3], ['बुक', 2], ['बुकिंग', 2],
    ['अपॉइंटमेंट', 2], ['जांच', 1], ['इलाज', 1],
    ['કિંમત', 3], ['ઓફર', 3], ['પેકેજ', 3], ['બુક', 2], ['બુકિંગ', 2],
    ['એપોઇન્ટમેન્ટ', 2],
  ],
  customer_care: [
    ['complaint', 3], ['reschedule', 3], ['cancel', 2], ['cancellation', 2],
    ['refund', 3], ['not working', 2], ['issue', 2], ['problem', 2],
    ['support', 2], ['help', 1], ['waiting', 1], ['callback', 2], ['call back', 2],
    ['query', 1], ['information', 1], ['front desk', 1],
    ['शिकायत', 3], ['रद्द', 2], ['फरियाद', 2], ['मदद', 2], ['जानकारी', 1],
    ['ફરિયાદ', 3], ['રદ', 2], ['મદદ', 2], ['જાણકારી', 1],
  ],
};

function normalizeConversationType(value) {
  const v = String(value || '').trim().toLowerCase();
  return LEGACY_TYPE_MAP[v] || (CONVERSATION_TYPES.includes(v) ? v : null);
}

function conversationTypeLabel(value) {
  const type = normalizeConversationType(value);
  return type ? CONVERSATION_TYPE_LABELS[type] : 'Unclassified';
}

function purposeLabel(bookingType) {
  const key = String(bookingType || '').trim().toLowerCase();
  return PURPOSE_LABELS[key] || (key ? key.replace(/_/g, ' ') : 'Call');
}

/** Turn a stored transcript (JSONB array, JSON string, or object) into plain text. */
function transcriptToText(transcript) {
  if (!transcript) return '';
  let turns = transcript;
  if (typeof turns === 'string') {
    try { turns = JSON.parse(turns); } catch { return turns; }
  }
  if (Array.isArray(turns)) {
    return turns
      .map((t) => {
        if (!t) return '';
        if (typeof t === 'string') return t;
        return [t.en_text, t.indic_text, t.content, t.text, t.transcript]
          .filter((s) => typeof s === 'string' && s.trim())
          .join(' ');
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof turns === 'object') {
    return [turns.en_text, turns.indic_text, turns.content, turns.text]
      .filter((s) => typeof s === 'string' && s.trim())
      .join(' ');
  }
  return '';
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
    if (count >= 3) break; // cap so one repeated word cannot dominate
  }
  return count;
}

/**
 * Classify a call into marketing_sales / patient_consultation / customer_care.
 *
 * @param {object} call  Row-ish object with direction, booking_type, transcript,
 *                       transcript_summary, provider, pipeline_stage.
 * @returns {{type:string,label:string,confidence:number,source:string,matched:string[]}}
 */
function classifyConversation(call = {}) {
  const direction = String(call.direction || 'outbound').toLowerCase();
  const bookingType = String(call.booking_type || '').toLowerCase();
  const provider = String(call.provider || '').toLowerCase();
  const pipeline = String(call.pipeline_stage || '').toLowerCase();

  const text = [
    transcriptToText(call.transcript),
    call.transcript_summary || '',
    call.summary || '',
  ]
    .join('\n')
    .toLowerCase();

  const scores = { marketing_sales: 0, patient_consultation: 0, customer_care: 0 };
  const matched = [];
  let keywordHits = 0;

  // 1) Stored booking/conversation type is the strongest hint when present.
  for (const [type, values] of Object.entries(BOOKING_TYPE_HINTS)) {
    if (values.includes(bookingType)) {
      scores[type] += 3;
      matched.push(`booking_type:${bookingType}`);
    }
  }

  // 2) Direction / provider priors.
  if (direction === 'inbound') {
    scores.customer_care += 2;
    matched.push('direction:inbound');
  } else if (bookingType === 'bulk_campaign') {
    scores.marketing_sales += 2;
    matched.push('source:bulk');
  } else if (provider === 'plivo') {
    scores.patient_consultation += 1.5;
    matched.push('provider:plivo');
  }

  // 3) Lead stage priors.
  if (/(active patient|^patient$|consultation|follow-up)/.test(pipeline)) {
    scores.patient_consultation += 2;
    matched.push(`lead_stage:${pipeline}`);
  } else if (/(^lead$|new)/.test(pipeline)) {
    scores.marketing_sales += 1;
    matched.push(`lead_stage:${pipeline}`);
  }

  // 4) Transcript evidence.
  if (text.trim()) {
    for (const [type, signals] of Object.entries(KEYWORD_SIGNALS)) {
      for (const [phrase, weight] of signals) {
        const hits = countOccurrences(text, phrase);
        if (hits > 0) {
          scores[type] += weight * Math.min(hits, 2);
          keywordHits += hits;
          matched.push(`${type}:${phrase}`);
        }
      }
    }
  }

  // Pick the winner.
  let winner = 'customer_care';
  for (const type of CONVERSATION_TYPES) {
    if (scores[type] > scores[winner]) winner = type;
  }

  // If nothing scored at all, fall back to metadata.
  const total = CONVERSATION_TYPES.reduce((sum, t) => sum + scores[t], 0);
  let source;
  if (keywordHits > 0) {
    source = 'transcript';
  } else if (total > 0) {
    source = 'metadata';
  } else {
    source = 'default';
    winner = direction === 'inbound'
      ? 'customer_care'
      : bookingType === 'bulk_campaign'
        ? 'marketing_sales'
        : 'patient_consultation';
  }

  let confidence = total > 0 ? Math.round((scores[winner] / total) * 100) / 100 : 0;
  // Metadata-only guesses should never look as certain as transcript evidence.
  if (source === 'metadata') confidence = Math.min(confidence, 0.6);

  return {
    type: winner,
    label: CONVERSATION_TYPE_LABELS[winner],
    confidence,
    score: scores[winner],
    source,
    matched: matched.slice(0, 8),
  };
}

/** Derive the page-level source bucket for a call row. */
function deriveCallSource(row = {}) {
  const direction = String(row.direction || 'outbound').toLowerCase();
  const bookingType = String(row.booking_type || '').toLowerCase();
  const provider = String(row.provider || '').toLowerCase();

  if (direction === 'inbound') return 'inbound';
  if (bookingType === 'bulk_campaign') return 'bulk';
  if (
    ['patient_consultation', 'follow_up', 'treatment_query', 'appointment_booking', 'payment_reminder', 'general'].includes(bookingType)
  ) {
    return 'dialer';
  }
  if (provider === 'plivo') return 'dialer';
  return 'single';
}

module.exports = {
  CONVERSATION_TYPES,
  CONVERSATION_TYPE_LABELS,
  normalizeConversationType,
  conversationTypeLabel,
  purposeLabel,
  transcriptToText,
  classifyConversation,
  deriveCallSource,
};
