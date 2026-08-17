/* db.js — the only module that writes to Supabase.
 *
 * Row-Level Security accepts a row only when user_id = auth.uid(). Rather than
 * remembering that at each call site, every insert/upsert goes through the
 * helpers here, which stamp user_id from the live session. Nothing else in the
 * app should call supabase.from(...).insert/upsert/update directly.
 */
import { supabase } from './supabase'

async function uid() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const id = data?.session?.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

/** Throw on error so callers never silently swallow a policy violation. */
function unwrap({ data, error }) {
  if (error) throw error
  return data
}

const stamp = (userId) => (row) => ({ ...row, user_id: userId })

// ── writes ────────────────────────────────────────────────

/**
 * @param {string} [ownerColumn] which column holds the owner — `challenges`
 *   calls it `owner_id`, everything else `user_id`.
 */
export async function insert(table, rows, ownerColumn = 'user_id') {
  const userId = await uid()
  const payload = (Array.isArray(rows) ? rows : [rows]).map((row) => ({
    ...row,
    [ownerColumn]: userId,
  }))
  const data = unwrap(await supabase.from(table).insert(payload).select())
  return Array.isArray(rows) ? data : data[0]
}

/**
 * Upsert against a unique constraint — `logs` on (exercise_id, week),
 * `session_status` on (day_id, week).
 */
export async function upsert(table, rows, onConflict) {
  const userId = await uid()
  const payload = (Array.isArray(rows) ? rows : [rows]).map(stamp(userId))
  const data = unwrap(
    await supabase.from(table).upsert(payload, { onConflict }).select(),
  )
  return Array.isArray(rows) ? data : data[0]
}

/** Update by id. user_id is never sent — RLS already scopes the row to its owner. */
export async function update(table, id, patch) {
  const { user_id: _ignored, ...rest } = patch
  return unwrap(
    await supabase.from(table).update(rest).eq('id', id).select(),
  )[0]
}

export async function remove(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

// ── reads ─────────────────────────────────────────────────

export function from(table) {
  return supabase.from(table)
}

/** Every logged session for a movement, across all programs. */
export async function historyForMovement(movementId) {
  return unwrap(await supabase.rpc('history_for_movement', { p_movement_id: movementId })) || []
}

/** Withdraw from a challenge. RLS restricts the delete to your own row. */
export async function leaveChallenge(challengeId) {
  const userId = await uid()
  const { error } = await supabase
    .from('challenge_members')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
  if (error) throw error
}

/** Create a challenge and everything under it in one transaction. */
export async function createChallenge(args) {
  return unwrap(await supabase.rpc('create_challenge', args))
}

/** Join by code: the clone happens server-side, in one transaction. */
export async function joinChallenge(args) {
  return unwrap(await supabase.rpc('join_challenge_atomic', args))
}

/**
 * Resolve a typed exercise name to a movement, creating it if new.
 *
 * Matching is case-insensitive to line up with the unique index on
 * (user_id, lower(name)). The insert can still lose a race against another
 * tab, so a duplicate-key error falls back to re-reading rather than failing —
 * whichever row won is the one we want either way.
 */
export async function ensureMovement(name) {
  const trimmed = name.trim()

  const find = async () => {
    const { data, error } = await supabase
      .from('movements')
      .select('id,name')
      .ilike('name', trimmed)
      .limit(1)
    if (error) throw error
    return data?.[0] || null
  }

  const existing = await find()
  if (existing) return existing

  const userId = await uid()
  const { data, error } = await supabase
    .from('movements')
    .insert({ name: trimmed, user_id: userId })
    .select()
  if (error) {
    if (error.code === '23505') {
      const raced = await find()
      if (raced) return raced
    }
    throw error
  }
  return data[0]
}
