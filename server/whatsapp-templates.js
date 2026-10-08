const WHATSAPP_TEMPLATES = [
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
