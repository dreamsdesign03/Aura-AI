// Approved Meta WhatsApp templates available for "Send Template" in Leads.
// To add another template: append an entry here (variables are NAMED variables in Meta).
// `body` is used for the UI preview + the logged text only — keep it identical to the
// body approved in Meta WhatsApp Manager.
const WHATSAPP_TEMPLATES = [
  {
    id: 'auraai_lead_send_template',
    name: 'auraai_lead_send_template',
    language: 'en', // exact language code shown in Meta ("en" vs "en_US")
    variables: ['first_name', 'company'],
    // TODO: paste the exact approved body text from Meta WhatsApp Manager.
    body: 'Hi {{first_name}}, this is Aura Laser & Cosmetic Clinic. We have something special for {{company}}.',
  },
];

module.exports = { WHATSAPP_TEMPLATES };
