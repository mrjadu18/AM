const USERNAME_REGEX = /^[a-z0-9._-]+$/;
export function normalizeUsername(raw) {
    return String(raw ?? '').trim().toLowerCase();
}
export function validateUsername(raw) {
    const username = normalizeUsername(raw);
    if (!username) {
        return { ok: false, message: 'Username is required' };
    }
    if (username.length < 2) {
        return { ok: false, message: 'Username must be at least 2 characters' };
    }
    if (!USERNAME_REGEX.test(username)) {
        return {
            ok: false,
            message: 'Username can only contain letters, numbers, dots, underscores and hyphens',
        };
    }
    return { ok: true, username };
}
/**
 * Deterministic fallback username derived from email local-part + short suffix.
 * Used only during migration for accounts missing a username.
 */
export function deriveUsernameFromEmail(email, suffix = '') {
    const local = normalizeUsername(email.split('@')[0] || 'user')
        .replace(/[^a-z0-9._-]/g, '_')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 24) || 'user';
    const candidate = suffix ? `${local}${suffix}` : local;
    return candidate.length >= 2 ? candidate : `user${suffix || '01'}`;
}
