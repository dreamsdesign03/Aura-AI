/**
 * Test script for contact name helper
 * Run with: node test-contact-name.js
 */

const { 
  normalizeName, 
  toEnglishName, 
  shouldOverwrite, 
  phoneLast10,
  updateContactName,
  toTitleCase
} = require('./server/contact-name');

async function runTests() {
  console.log('=== Contact Name Helper Tests ===\n');
  
  let passed = 0;
  let failed = 0;
  
  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${testName}`);
      failed++;
    }
  }
  
  // Test normalizeName
  console.log('--- normalizeName Tests ---');
  assert(normalizeName('  માનસી  ') === 'માનસી', 'Trims Gujarati name');
  assert(normalizeName('my name is Mansi') === 'Mansi', 'Removes "my name is"');
  assert(normalizeName('mera naam Priya hai') === 'Priya hai', 'Removes "mera naam"');
  assert(normalizeName('this is Rajesh') === 'Rajesh', 'Removes "this is"');
  assert(normalizeName('Mr. Sharma') === 'Sharma', 'Removes "Mr."');
  assert(normalizeName('Mrs. Patel') === 'Patel', 'Removes "Mrs."');
  assert(normalizeName('Dr. Gupta') === 'Gupta', 'Removes "Dr."');
  assert(normalizeName('+91 9876543210') === null, 'Rejects phone number');
  assert(normalizeName('9876543210') === null, 'Rejects phone number without prefix');
  assert(normalizeName('Name Not Available') === null, 'Rejects "Name Not Available"');
  assert(normalizeName('Not Available') === null, 'Rejects "Not Available"');
  assert(normalizeName('Unknown') === null, 'Rejects "Unknown"');
  assert(normalizeName('Lead') === null, 'Rejects "Lead"');
  assert(normalizeName('Test Patient') === null, 'Rejects "Test Patient"');
  assert(normalizeName('Patient') === null, 'Rejects "Patient"');
  assert(normalizeName('N/A') === null, 'Rejects "N/A"');
  assert(normalizeName('NA') === null, 'Rejects "NA"');
  assert(normalizeName('') === null, 'Rejects empty string');
  assert(normalizeName(null) === null, 'Rejects null');
  assert(normalizeName('  ') === null, 'Rejects whitespace only');
  assert(normalizeName('Mansi Shah') === 'Mansi Shah', 'Keeps valid English name');
  assert(normalizeName('માનસી શાહ') === 'માનસી શાહ', 'Keeps valid Gujarati name');
  assert(normalizeName('प्रिया शर्मा') === 'प्रिया शर्मा', 'Keeps valid Hindi name');
  
  // Test toTitleCase
  console.log('\n--- toTitleCase Tests ---');
  assert(toTitleCase('mansi shah') === 'Mansi Shah', 'Lowercase to Title Case');
  assert(toTitleCase('MANSI SHAH') === 'Mansi Shah', 'Uppercase to Title Case');
  assert(toTitleCase('MaNsI ShAh') === 'Mansi Shah', 'Mixed case to Title Case');
  assert(toTitleCase('mansi') === 'Mansi', 'Single word to Title Case');
  assert(toTitleCase('') === '', 'Empty string returns empty');
  
  // Test shouldOverwrite
  console.log('\n--- shouldOverwrite Tests ---');
  assert(shouldOverwrite(null, 'call', false) === true, 'Overwrites null');
  assert(shouldOverwrite('', 'call', false) === true, 'Overwrites empty');
  assert(shouldOverwrite('Name Not Available', 'call', false) === true, 'Overwrites placeholder');
  assert(shouldOverwrite('Not Available', 'call', false) === true, 'Overwrites placeholder');
  assert(shouldOverwrite('Unknown', 'call', false) === true, 'Overwrites placeholder');
  assert(shouldOverwrite('Lead', 'call', false) === true, 'Overwrites placeholder');
  assert(shouldOverwrite('Test Patient', 'call', false) === true, 'Overwrites placeholder');
  assert(shouldOverwrite('Patient', 'call', false) === true, 'Overwrites placeholder');
  assert(shouldOverwrite('9876543210', 'call', false) === true, 'Overwrites phone-like');
  assert(shouldOverwrite('+919876543210', 'call', false) === true, 'Overwrites phone with prefix');
  assert(shouldOverwrite('1234567890', 'call', false) === true, 'Overwrites digits only');
  assert(shouldOverwrite('Mansi Shah', 'manual', false) === false, 'Does not overwrite manual');
  assert(shouldOverwrite('Mansi Shah', 'call', true) === false, 'Does not overwrite locked');
  assert(shouldOverwrite('Mansi Shah', 'call', false) === false, 'Does not overwrite valid name');
  assert(shouldOverwrite('Mansi Shah', 'import', false) === false, 'Does not overwrite valid import');
  
  // Test phoneLast10
  console.log('\n--- phoneLast10 Tests ---');
  assert(phoneLast10('919876543210') === '9876543210', 'Extracts last 10 from 91 prefix');
  assert(phoneLast10('+919876543210') === '9876543210', 'Extracts last 10 from +91 prefix');
  assert(phoneLast10('9876543210') === '9876543210', 'Keeps 10-digit as is');
  assert(phoneLast10('09876543210') === '9876543210', 'Strips leading 0');
  assert(phoneLast10('98765') === '98765', 'Keeps short number as is');
  assert(phoneLast10('') === '', 'Empty returns empty');
  
  // Test toEnglishName (without LLM - rule-based)
  console.log('\n--- toEnglishName Tests (rule-based) ---');
  // Note: These tests run without LLM, so non-Latin names will return null
  assert(await toEnglishName('Mansi Shah') === 'Mansi Shah', 'English name stays same');
  assert(await toEnglishName('mansi shah') === 'Mansi Shah', 'Lowercase English to Title Case');
  assert(await toEnglishName('MANSI SHAH') === 'Mansi Shah', 'Uppercase English to Title Case');
  // Gujarati/Hindi names will return null without LLM
  // assert(await toEnglishName('માનસી') === 'Mansi', 'Gujarati to English');
  // assert(await toEnglishName('प्रिया') === 'Priya', 'Hindi to English');
  
  // Test updateContactName (integration test - requires DB)
  console.log('\n--- Integration Tests (require DB) ---');
  console.log('Skipping DB tests - run with actual database connection');
  
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});