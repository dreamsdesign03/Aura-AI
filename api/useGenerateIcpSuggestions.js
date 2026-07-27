const { Client } = require('pg');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { website, description } = req.body?.data || {};

  // Generate ICP suggestions based on the website/description
  // These are AI-suggested profiles based on common business patterns
  const suggestions = [
    {
      name: `${description || 'Healthcare'} SMBs`,
      markets: ['United States', 'UAE'],
      industries: [description || 'Healthcare', 'Medical', 'Wellness'],
      roles: ['CMO', 'Marketing Director', 'Practice Manager'],
      companySize: '11-200 employees',
      filters: { hasWebsite: true, hasGMB: true, minBantScore: 50 },
    },
    {
      name: `${description || 'Healthcare'} Enterprises`,
      markets: ['United Kingdom', 'Canada', 'Australia'],
      industries: [description || 'Healthcare', 'Pharmaceutical', 'Diagnostics'],
      roles: ['VP Marketing', 'Head of Growth', 'CEO'],
      companySize: '201-1000 employees',
      filters: { hasWebsite: true, hasLinkedIn: true, minBantScore: 70 },
    },
    {
      name: `Wellness & Beauty Clinics`,
      markets: ['UAE', 'Saudi Arabia', 'Qatar'],
      industries: ['Wellness', 'Beauty', 'Aesthetics', 'Cosmetics'],
      roles: ['Clinic Manager', 'Marketing Head', 'Founder'],
      companySize: '1-50 employees',
      filters: { hasGMB: true, hasWebsite: true },
    },
    {
      name: `Dental & Orthodontic Practices`,
      markets: ['United States', 'UK', 'Australia'],
      industries: ['Dental', 'Orthodontics', 'Oral Health'],
      roles: ['Practice Owner', 'Marketing Director', 'Operations Manager'],
      companySize: '1-20 employees',
      filters: { hasWebsite: true, hasGMB: true, minBantScore: 60 },
    },
    {
      name: `Fitness & Gym Chains`,
      markets: ['United States', 'UAE', 'India'],
      industries: ['Fitness', 'Gym', 'Health Club', 'Wellness'],
      roles: ['Marketing Manager', 'Growth Lead', 'CEO'],
      companySize: '50-500 employees',
      filters: { hasWebsite: true, hasLinkedIn: true },
    },
    {
      name: `Skin Care & Dermatology`,
      markets: ['United States', 'UAE', 'South Korea'],
      industries: ['Dermatology', 'Skin Care', 'Cosmetic Surgery'],
      roles: ['Clinical Director', 'Marketing Head', 'Practice Manager'],
      companySize: '5-100 employees',
      filters: { hasWebsite: true, hasGMB: true, minBantScore: 55 },
    },
    {
      name: `Mental Health & Therapy Clinics`,
      markets: ['United States', 'Canada', 'UK'],
      industries: ['Mental Health', 'Psychology', 'Therapy', 'Counseling'],
      roles: ['Practice Owner', 'Clinical Director', 'Operations Lead'],
      companySize: '1-30 employees',
      filters: { hasWebsite: true, minBantScore: 50 },
    },
    {
      name: `Veterinary Clinics`,
      markets: ['United States', 'UK', 'Australia'],
      industries: ['Veterinary', 'Pet Care', 'Animal Health'],
      roles: ['Clinic Owner', 'Practice Manager', 'Marketing Lead'],
      companySize: '5-50 employees',
      filters: { hasWebsite: true, hasGMB: true },
    },
    {
      name: `Ayurveda & Alternative Medicine`,
      markets: ['India', 'UAE', 'Sri Lanka'],
      industries: ['Ayurveda', 'Alternative Medicine', 'Wellness', 'Holistic Health'],
      roles: ['Founder', 'Clinic Manager', 'Marketing Head'],
      companySize: '1-25 employees',
      filters: { hasWebsite: true },
    },
    {
      name: `MedSpa & Cosmetic Surgery Centers`,
      markets: ['United States', 'UAE', 'Brazil'],
      industries: ['MedSpa', 'Cosmetic Surgery', 'Aesthetics', 'Plastic Surgery'],
      roles: ['Medical Director', 'Practice Manager', 'Marketing Director'],
      companySize: '10-100 employees',
      filters: { hasWebsite: true, hasGMB: true, hasLinkedIn: true, minBantScore: 65 },
    },
  ];

  return res.status(200).json(suggestions);
};
