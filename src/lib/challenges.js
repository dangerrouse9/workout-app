/* challenges.js — creating and joining buddy challenges.
 *
 * A challenge is always its own program, never an existing one. Both sides end
 * up with a private copy of the same structure: nothing is jointly writable,
 * and a buddy's numbers are read-only. The two copies are tied together by a
 * `slot` — the creator's movement id, recorded for every participant — so a
 * rename or a typo on either side can never break the pairing.
 */
import * as db from './db'
import { todayISO } from './helpers'

/** Short, unambiguous invite codes: no O/0, I/1, or similar look-alikes. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makeCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

/**
 * Write a program + days + exercises for the current user, registering each
 * movement against its challenge slot.
 * @returns {string} the new program's id
 */
async function materialise(challengeId, name, weeks, days, position, startsOn) {
  const program = await db.insert('programs', {
    name,
    description: 'Buddy challenge',
    weeks,
    position,
    // Anchors the ordinal slots to real dates, which is what lets a challenge
    // say "Day 7 · Tue 23 Sep" and know which day is today. Joiners inherit the
    // creator's date, so Day 1 means the same calendar day for everyone.
    starts_on: startsOn || todayISO(),
  })

  for (const [di, day] of days.entries()) {
    const dayRow = await db.insert('days', {
      program_id: program.id,
      name: day.name,
      focus: day.focus || '',
      position: di,
    })

    for (const [ei, ex] of (day.exercises || []).entries()) {
      const movement = await db.ensureMovement(ex.name)

      // The creator's own movement id is the slot; joiners inherit it.
      const slot = ex.slot ?? movement.id
      await db.upsert(
        'challenge_movements',
        { challenge_id: challengeId, slot, movement_id: movement.id },
        'challenge_id,user_id,slot',
      )

      await db.insert('exercises', {
        day_id: dayRow.id,
        movement_id: movement.id,
        name: movement.name,
        target_sets: String(ex.target_sets ?? ex.sets ?? ''),
        target_reps: ex.target_reps ?? ex.reps ?? '',
        rest_seconds: ex.rest_seconds ?? ex.rest ?? 90,
        notes: ex.notes || '',
        is_superset: !!(ex.is_superset ?? ex.ss),
        position: ei,
      })
    }
  }
  return program.id
}

/**
 * Create a challenge and the creator's copy of its program.
 * @param {{name: string, weeks: number, days: Array}} draft
 * @returns {{challenge, programId, code}}
 */
export async function createChallenge(draft, existingProgramCount = 0, displayName = '') {
  const code = makeCode()
  const startsOn = draft.startsOn || todayISO()
  const challenge = await db.insert(
    'challenges',
    { name: draft.name.trim(), weeks: draft.weeks, invite_code: code, starts_on: startsOn },
    'owner_id',
  )

  const programId = await materialise(
    challenge.id,
    draft.name.trim(),
    draft.weeks,
    draft.days,
    existingProgramCount,
    startsOn,
  )
  await db.joinChallenge(code, programId)
  await db.setChallengeDisplayName(challenge.id, displayName)

  return { challenge, programId, code }
}

/**
 * Join by code: fetch the creator's structure, build your own copy, enrol it.
 * @returns {{challengeId, programId, name}}
 */
export async function joinChallenge(code, existingProgramCount = 0, displayName = '') {
  const template = await db.challengeTemplate(code)
  if (!template) throw new Error('No challenge with that code.')

  const programId = await materialise(
    template.challenge_id,
    template.name,
    template.weeks,
    template.days || [],
    existingProgramCount,
    template.starts_on,
  )
  await db.joinChallenge(code, programId)
  await db.setChallengeDisplayName(template.challenge_id, displayName)

  return { challengeId: template.challenge_id, programId, name: template.name }
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
    db.from('challenge_members').select('user_id,program_id,display_name,joined_at').eq('challenge_id', challengeId),
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

  const theirProgramIds = others.map((m) => m.program_id)
  const daysRes = await db
    .from('days')
    .select('id,program_id,position')
    .in('program_id', theirProgramIds)
  const dayPosition = new Map((daysRes.data || []).map((d) => [d.id, d.position]))

  const theirDayIds = [...dayPosition.keys()]
  if (!theirDayIds.length) return { ...empty, participants: others }

  const exRes = await db
    .from('exercises')
    .select('id,movement_id,day_id')
    .in('day_id', theirDayIds)
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
