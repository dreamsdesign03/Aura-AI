const WHATSAPP_TEMPLATES = [
  {
    id: 'auraai_lead_send_template',
    name: 'auraai_lead_send_template',
    label: 'auraai_lead_send_template · English (en)',
    language: 'en',
    headerVariables: ['first_name'],
    bodyVariables: ['company'],
    variables: ['first_name', 'company'],
    header: 'Hi {{first_name}},',
    body: `This is Dr. Aditya Shah, founder of Skinnonest and Aura Laser & Cosmetic Clinic.

We're onboarding dealers and retail partners for our skincare range, and we have festive gift hampers (₹599 to ₹1999) ready for the season. Brochure attached

Open to stocking Skinnonest at {{company}}? Book a 30 min call: https://cal.com/aura-laser-cosmetic-clinic/30min`,
  },
  {
    id: 'auraai_leads',
    name: 'auraai_leads',
    label: 'auraai_leads · English (en)',
    language: 'en',
    headerVariables: [],
    bodyVariables: ['company'],
    variables: ['company'],
    header: '',
    body: `Hello team at {{company}}, this is Dr. Aditya Shah, founder of Skinnonest and Aura Laser & Cosmetic Clinic.

We're onboarding retail partners for our festive gift hampers (₹599 to ₹1999). Would you like to stock them in your store this season?`,
  },
];

module.exports = { WHATSAPP_TEMPLATES };
