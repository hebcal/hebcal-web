import {ulid} from 'ulid';

/**
 * Resolve an OAuth login to a Hebcal user account, creating the account and/or
 * the provider link as needed. Returns the user id.
 *
 * Matching order:
 *   1. Existing `user_identity` for (provider, sub) -> that user (a returning
 *      login with the same provider).
 *   2. Otherwise, if the provider asserts a *verified* email that already
 *      belongs to a user, link this new identity to that user (so signing in
 *      with Google and later Apple, or vice versa, lands on one account).
 *   3. Otherwise create a brand-new user and identity.
 *
 * Email is only used to merge accounts when the provider says it is verified;
 * an unverified email must never be trusted to take over an existing account.
 *
 * @param {import('koa').Context} ctx
 * @param {string} provider e.g. 'google'
 * @param {{sub: string, email: string, emailVerified: boolean, name: string|undefined}} profile
 * @return {Promise<string>} the user id
 */
export async function findOrCreateUser(ctx, provider, profile) {
  const db = ctx.mysql;
  const {sub, email, emailVerified, name} = profile;

  const existing = await db.query(
      'SELECT user_id FROM user_identity WHERE provider = ? AND provider_sub = ?',
      [provider, sub]);
  if (existing?.[0]) {
    const userId = existing[0].user_id;
    // Keep the identity's cached email fresh, but never rewrite the canonical
    // user row from here (the user may have chosen a different display name).
    await db.query(
        'UPDATE user_identity SET email = ? WHERE provider = ? AND provider_sub = ?',
        [email || null, provider, sub]);
    return userId;
  }

  let userId = null;
  if (emailVerified && email) {
    const byEmail = await db.query('SELECT id FROM user WHERE email = ?', [email]);
    if (byEmail?.[0]) {
      userId = byEmail[0].id;
    }
  }

  if (userId === null) {
    userId = ulid().toLowerCase();
    // Only claim the email on the canonical user row if the provider verified
    // it; otherwise leave it NULL so it cannot collide with a real account.
    const verifiedEmail = emailVerified && email ? email : null;
    await db.query(
        `INSERT INTO user (id, email, email_verified, display_name, created)
         VALUES (?, ?, ?, ?, NOW())`,
        [userId, verifiedEmail, emailVerified ? 1 : 0, name || null]);
  }

  await db.query(
      `INSERT INTO user_identity (provider, provider_sub, user_id, email, created)
       VALUES (?, ?, ?, ?, NOW())`,
      [provider, sub, userId, email || null]);
  return userId;
}
