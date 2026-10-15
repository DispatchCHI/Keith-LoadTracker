/**
 * Sync contract version. Plain constants (no imports) so vite.config.ts can
 * read them when it writes dist/version.json.
 *
 * SYNC_VERSION: what this build speaks. MIN_SYNC_VERSION: the oldest client
 * the deployed site still trusts to write. Bump BOTH (to the same number) only
 * when cloud sync / delete semantics change in a way an older client would
 * break (e.g. replaying deletes the new rules reject). A running client whose
 * SYNC_VERSION is below the deployed MIN_SYNC_VERSION pauses every cloud write.
 */
export const SYNC_VERSION = 3;
export const MIN_SYNC_VERSION = 2;
