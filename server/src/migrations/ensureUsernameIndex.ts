import Admin from '../models/Admin.js';
import { deriveUsernameFromEmail, normalizeUsername, validateUsername } from '../utils/username.js';

/**
 * Safe, idempotent migration:
 * - Backfill missing/invalid usernames without deleting users or touching passwords
 * - Resolve duplicates deterministically
 * - Ensure sparse unique index on username
 */
export async function ensureUsernameIndex(): Promise<void> {
  const users = await Admin.find({}).select('_id email username').lean();

  const used = new Set<string>();

  for (const user of users) {
    const current = normalizeUsername(user.username || '');
    const validation = current ? validateUsername(current) : { ok: false as const, message: 'empty' };

    let nextUsername = validation.ok ? validation.username : '';

    if (!nextUsername || used.has(nextUsername)) {
      let base = deriveUsernameFromEmail(user.email || `user${String(user._id).slice(-6)}`);
      let attempt = 0;
      nextUsername = base;
      while (used.has(nextUsername)) {
        attempt += 1;
        nextUsername = deriveUsernameFromEmail(user.email || 'user', String(attempt).padStart(2, '0'));
        if (attempt > 9999) {
          nextUsername = `user_${String(user._id).slice(-8)}`;
          break;
        }
      }
    }

    used.add(nextUsername);

    if (normalizeUsername(user.username || '') !== nextUsername) {
      await Admin.updateOne(
        { _id: user._id },
        { $set: { username: nextUsername } },
        { runValidators: false }
      );
    }
  }

  // Drop legacy non-unique username indexes if present, then ensure sparse unique
  try {
    const collection = Admin.collection;
    const indexes = await collection.indexes();
    let hasValidUsernameIndex = false;

    for (const idx of indexes) {
      if (idx.name && idx.name !== '_id_' && idx.key && (idx.key as any).username === 1) {
        if (idx.unique && idx.sparse) {
          hasValidUsernameIndex = true;
        } else {
          await collection.dropIndex(idx.name);
        }
      }
    }

    if (hasValidUsernameIndex) {
      return;
    }
  } catch {
    // Index may not exist yet — continue
  }

  await Admin.collection.createIndex(
    { username: 1 },
    { unique: true, sparse: true, name: 'username_1_unique_sparse' }
  );
}
