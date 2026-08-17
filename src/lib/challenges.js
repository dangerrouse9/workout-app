/* challenges.js — buddy challenges.
 *
 * A challenge is always its own program, never an existing one. Both sides end
 * up with a private copy of the same structure: nothing is jointly writable,
 * and a buddy's numbers are read-only. The two copies are tied together by a
 * `slot` — the creator's movement id, recorded for every participant — so a
 * rename or a typo on either side can never break the pairing.
 *
 * Creating and joining are single database calls. They used to be a sequence of
 * writes from here, which meant a failure halfway left a challenge with no
 * program, or a program missing half its days.
 */
import * as db from './db'
import { todayISO } from './helpers'

/**
 * @param {{name: string, weeks: number, days: Array, startsOn?: string}} draft
 * @returns {{challenge_id, program_id, invite_code}}
 */
export async function createChallenge(draft, existingProgramCount = 0, displayName = '') {
  return db.createChallenge({
    p_name: draft.name,
    p_weeks: draft.weeks,
    p_starts_on: draft.startsOn || todayISO(),
    p_display_name: displayName,
    p_days: draft.days,
    p_position: existingProgramCount,
  })
}

/** @returns {{challenge_id, program_id, name, already_joined}} */
export async function joinChallenge(code, existingProgramCount = 0, displayName = '') {
  return db.joinChallenge({
    p_code: code,
    p_display_name: displayName,
    p_position: existingProgramCount,
  })
}

/**
 * Build the lookup the Log screen needs: for each of my exercises in a
 * challenge program, every other participant's log for the same slot and week.
 *
 * Returns { participants, bySlot, slotByMovement } — bySlot keyed
 * `${slot}_d${dayPosition}_w${week}`.
 */
export async function buddyLogsFor(challengeId, myUserId) {
  const [membersRes, mapRes] = await Promise.all([
    db
      .from('challenge_members')
      .select('user_id,program_id,display_name,joined_at')
      .eq('challenge_id', challengeId),
    db.from('challenge_movements').select('user_id,slot,movement_id').eq('challenge_id', challengeId),
  ])
  if (membersRes.error) throw membersRes.error
  if (mapRes.error) throw mapRes.error

  const slotByMovement = new Map((mapRes.data || []).map((r) => [r.movement_id, r.slot]))
  const empty = { participants: [], bySlot: new Map(), slotByMovement }

  const others = (membersRes.data || [])
    .filter((m) => m.user_id !== myUserId)
    // stable ordering so panes don't reshuffle between renders
    .sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))
  if (!others.length) return empty

  const daysRes = await db
    .from('days')
    .select('id,program_id,position')
    .in('program_id', others.map((m) => m.program_id))
  const dayPosition = new Map((daysRes.data || []).map((d) => [d.id, d.position]))
  if (!dayPosition.size) return { ...empty, participants: others }

  const exRes = await db
    .from('exercises')
    .select('id,movement_id,day_id')
    .in('day_id', [...dayPosition.keys()])
  const theirExercises = (exRes.data || []).filter((e) => e.movement_id)
  if (!theirExercises.length) return { ...empty, participants: others }

  const logsRes = await db
    .from('logs')
    .select('exercise_id,week,sets,reps,weight,variation,note,logged_on,user_id')
    .in('exercise_id', theirExercises.map((e) => e.id))

  // Key on slot + day position + week. Dropping the day position is what let a
  // daily challenge show Tuesday's numbers under Monday.
  const coords = new Map(
    theirExercises.map((e) => [
      e.id,
      { slot: slotByMovement.get(e.movement_id), dayPos: dayPosition.get(e.day_id) },
    ]),
  )

  return {
    participants: others,
    slotByMovement,
    bySlot: (logsRes.data || []).reduce((map, log) => {
      const c = coords.get(log.exercise_id)
      if (!c?.slot || c.dayPos == null) return map
      const k = `${c.slot}_d${c.dayPos}_w${log.week}`
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(log)
      return map
    }, new Map()),
  }
}
