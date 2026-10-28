import assert from 'node:assert/strict';
import {
  normalizePhone,
  isValidPhone,
  isValidEmail,
  normalizeLoginId,
  validateLoginInput,
  validateFullName,
  resolveAccountContacts,
} from '../lib/userAuth';

/* ---------------- phone normalisation ---------------- */
assert.equal(normalizePhone('09123456789'), '09123456789');
assert.equal(normalizePhone('+989123456789'), '09123456789');
assert.equal(normalizePhone('00989123456789'), '09123456789');
assert.equal(normalizePhone('989123456789'), '09123456789');
assert.equal(normalizePhone('9123456789'), '09123456789');
assert.equal(normalizePhone('0912 345-6789'), '09123456789');
assert.equal(normalizePhone('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789', 'Persian digits must be accepted');
assert.equal(normalizePhone('02122334455'), '', 'landlines are not mobile numbers');
assert.equal(normalizePhone('0812345678'), '', 'not an Iranian mobile');
assert.equal(normalizePhone(''), '');
assert.equal(isValidPhone('+98 912 345 6789'), true);
assert.equal(isValidPhone('123'), false);
console.log('✓ phone normalisation accepts every common Iranian mobile format');

/* ---------------- email + login id ---------------- */
assert.equal(isValidEmail('Name@Example.com'), true);
assert.equal(isValidEmail('not-an-email'), false);
assert.deepEqual(normalizeLoginId('Name@Example.com'), { id: 'name@example.com', type: 'email' });
assert.deepEqual(normalizeLoginId('+989123456789'), { id: '09123456789', type: 'phone' });
assert.deepEqual(normalizeLoginId('9123456789'), { id: '09123456789', type: 'phone' });
console.log('✓ login ids normalise to one canonical form');

/* ---------------- strict validation ---------------- */
assert.equal(validateLoginInput('09123456789').ok, true);
assert.equal(validateLoginInput('someone@example.com').ok, true);
assert.equal(validateLoginInput('garbage!!').ok, false);
assert.ok(validateLoginInput('garbage!!').error.length > 0);
assert.equal(validateLoginInput('').ok, false);
assert.equal(validateFullName('علی رضایی').ok, true);
assert.equal(validateFullName('ع').ok, false, 'too short');
assert.equal(validateFullName('   ').ok, false);
assert.equal(validateFullName('X'.repeat(81)).ok, false, 'too long');
console.log('✓ strict validation rejects garbage with Persian errors');

/* ---------------- registration contacts (the dropped-phone regression) --- */
const both = resolveAccountContacts('Ali@Example.com', '+989123456789');
assert.equal(both.ok, true);
assert.equal(both.email, 'ali@example.com', 'email normalised');
assert.equal(both.phone, '09123456789', 'phone is NEVER dropped when an email is also given');
assert.equal(both.loginType, 'phone', 'phone is the preferred login identifier');

const emailOnly = resolveAccountContacts('ali@example.com', '');
assert.equal(emailOnly.ok, true);
assert.equal(emailOnly.loginId, 'ali@example.com');
assert.equal(emailOnly.loginType, 'email');

const phoneOnly = resolveAccountContacts('', '09123456789');
assert.equal(phoneOnly.ok, true);
assert.equal(phoneOnly.loginId, '09123456789');
assert.equal(phoneOnly.loginType, 'phone');

const combined = resolveAccountContacts('', '', '09123456789');
assert.equal(combined.ok, true);
assert.equal(combined.loginId, '09123456789');

const combinedEmail = resolveAccountContacts('', '', 'ali@example.com');
assert.equal(combinedEmail.ok, true);
assert.equal(combinedEmail.loginId, 'ali@example.com');

assert.equal(resolveAccountContacts('', '').ok, false, 'at least one contact is required');
assert.equal(resolveAccountContacts('bad-email', '09123456789').ok, false, 'invalid email is rejected even with a valid phone');
assert.equal(resolveAccountContacts('ali@example.com', '123').ok, false, 'invalid phone is rejected even with a valid email');
console.log('✓ registration keeps BOTH email and phone and rejects invalid contacts');

console.log('✅ همه‌ی بررسی‌های احراز هویت کاربران پاس شد.');
