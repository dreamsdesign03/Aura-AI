const WHATSAPP_TEMPLATES = [
  {
    id: 'auraai_lead_send_template',
    name: 'auraai_lead_send_template',
    label: 'auraai_lead_send_template · English (en)',
    language: 'en',
    variables: ['first_name', 'company'],
    body: `Hi {{first_name}},

This is Dr. Aditya Shah, founder of Skinnonest and Aura Laser & Cosmetic Clinic.

We're onboarding dealers and retail partners for our skincare range, and we have festive gift hampers (₹599 to ₹1999) ready for the season. Brochure attached

Open to stocking Skinnonest at {{company}}? Book a 30 min call: https://cal.com/aura-laser-cosmetic-clinic/30min`,
  },
];

module.exports = { WHATSAPP_TEMPLATES };
