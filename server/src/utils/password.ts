import crypto from 'crypto';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!PASSWORD_REGEX.test(password)) {
    return 'Password must include uppercase, lowercase, number, and special character';
  }
  return null;
}

/**
 * Generate a cryptographically secure temporary password that satisfies policy.
 * Never uses predictable fallbacks.
 */
export function generateSecureTemporaryPassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*-_=+';
  const all = upper + lower + digits + special;

  const pick = (charset: string) => charset[crypto.randomInt(0, charset.length)];

  // Guarantee at least one of each required class
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];

  const remaining: string[] = [];
  for (let i = required.length; i < length; i++) {
    remaining.push(pick(all));
  }

  // Fisher–Yates shuffle with crypto randomness
  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  const password = chars.join('');
  const validationError = validatePasswordStrength(password);
  if (validationError) {
    // Extremely unlikely; regenerate once more rather than ship an invalid password
    return generateSecureTemporaryPassword(length + 2);
  }
  return password;
}
