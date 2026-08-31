import { createHash } from 'node:crypto'

export const SCHEMA_VERSION = 5
export const CHARACTER_SOURCE = 'https://api.marvelstrikeforce.com/game/v1/characters'
export const WAR_SOURCE = 'https://api-prod.marvelstrikeforce.com/services/getWarMeta?type=defense'
export const CHARACTER_BOOTSTRAP_SOURCE = 'https://marvelstrikeforce.com/en/characters'

const MIN_SQUAD_COUNT = 50
const MIN_CHARACTER_COUNT = 100
const MAX_RECORD_DROP_RATIO = 0.4
const MAX_PORTRAIT_DROP_RATIO = 0.3

function asArray(payload, label) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  if (payload && Array.isArray(payload.squads)) return payload.squads
  throw new Error(`${label} response must contain an array`)
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

export function calculateDefendRate(defensiveWins, totalBattles) {
  if (totalBattles === 0) return 0
  return Math.round((defensiveWins / totalBattles) * 1000) / 10
}

export function normalizeWarResponse(payload) {
  const rows = asArray(payload, 'War')
  const bySquad = new Map()
  let duplicateCount = 0

  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`War record ${index + 1} must be an object`)
    if (!Array.isArray(row.squad) || row.squad.length < 1 || row.squad.length > 5) {
      throw new Error(`War record ${index + 1} must contain between one and five character IDs`)
    }

    const squad = row.squad.map((id) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error(`War record ${index + 1} contains an empty character ID`)
      }
      return id.trim()
    })
    const totalBattles = row.total
    const defensiveWins = row.wins
    assertNonNegativeInteger(totalBattles, `War record ${index + 1} total`)
    assertNonNegativeInteger(defensiveWins, `War record ${index + 1} wins`)
    if (defensiveWins > totalBattles) {
      throw new Error(`War record ${index + 1} wins cannot exceed total`)
    }

    const normalized = {
      squad,
      totalBattles,
      defensiveWins,
      defendRate: calculateDefendRate(defensiveWins, totalBattles),
    }
    const key = [...squad].sort().join('|')
    const existing = bySquad.get(key)
    if (existing) {
      duplicateCount += 1
      if (
        normalized.totalBattles > existing.totalBattles ||
        (normalized.totalBattles === existing.totalBattles && normalized.defensiveWins > existing.defensiveWins)
      ) {
        bySquad.set(key, normalized)
      }
    } else {
      bySquad.set(key, normalized)
    }
  })

  const records = [...bySquad.values()].sort((a, b) =>
    b.totalBattles - a.totalBattles ||
    b.defensiveWins - a.defensiveWins ||
    a.squad.join('|').localeCompare(b.squad.join('|')),
  )
  return { records, duplicateCount }
}

function normalizeTraits(traits) {
  return Array.isArray(traits)
    ? [...new Map(traits.map((trait) => {
        if (typeof trait === 'string' && trait.trim()) {
          const traitId = trait.trim()
          return [traitId, { id: traitId, name: prettifyCharacterId(traitId) }]
        }
        if (!trait || typeof trait.id !== 'string' || !trait.id.trim()) return null
        const traitId = trait.id.trim()
        const name = typeof trait.name === 'string' && trait.name.trim()
          ? trait.name.trim()
          : prettifyCharacterId(traitId)
        return [traitId, { id: traitId, name }]
      }).filter(Boolean)).values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    : []
}

export function normalizeCharacters(payload) {
  const rows = asArray(payload, 'Character')
  const byId = new Map()

  rows.forEach((row) => {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) return
    const id = row.id.trim()
    const normalized = {
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : prettifyCharacterId(id),
      portrait: typeof row.portrait === 'string' && /^https:\/\//.test(row.portrait) ? row.portrait : null,
      traits: normalizeTraits(row.traits),
      invisibleTraits: normalizeTraits(row.invisibleTraits),
      eventTraits: normalizeTraits(row.eventTraits),
    }
    const existing = byId.get(id)
    if (!existing || (!existing.portrait && normalized.portrait)) byId.set(id, normalized)
  })

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function prettifyCharacterId(id) {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function snapshotContent(teams, characters) {
  return JSON.stringify({ teams, characters })
}

function contentHash(teams, characters) {
  return createHash('sha256').update(snapshotContent(teams, characters)).digest('hex')
}

function previousPortraitCoverage(previousSnapshot) {
  const characters = previousSnapshot?.teams?.flatMap((team) => team.characters) ?? []
  if (!characters.length) return null
  return characters.filter((character) => character.portrait).length / characters.length
}

export function validateSnapshot(snapshot, previousSnapshot = null) {
  const { teams, characters, meta } = snapshot
  if (!Array.isArray(teams) || teams.length < MIN_SQUAD_COUNT) {
    throw new Error(`Suspicious squad count: expected at least ${MIN_SQUAD_COUNT}, received ${teams?.length ?? 0}`)
  }
  if (!Number.isInteger(meta.characterCount) || meta.characterCount < MIN_CHARACTER_COUNT) {
    throw new Error(`Suspicious character count: expected at least ${MIN_CHARACTER_COUNT}, received ${meta.characterCount}`)
  }
  if (!Array.isArray(characters) || characters.length !== meta.characterCount) {
    throw new Error('Snapshot character catalog does not match its character count')
  }
  characters.forEach((character, index) => {
    ;['traits', 'invisibleTraits', 'eventTraits'].forEach((field) => {
      if (!Array.isArray(character[field])) {
        throw new Error(`Snapshot character ${index + 1} must contain a ${field} array`)
      }
      character[field].forEach((trait) => {
        if (!trait || typeof trait.id !== 'string' || !trait.id || typeof trait.name !== 'string' || !trait.name) {
          throw new Error(`Snapshot character ${index + 1} contains invalid ${field} metadata`)
        }
      })
    })
  })
  assertNonNegativeInteger(meta.characterOverrideCount ?? 0, 'Character override count')
  if ((meta.characterOverrideCount ?? 0) > characters.length) {
    throw new Error('Character override count cannot exceed the character catalog size')
  }
  if (
    (meta.characterOverrideCount ?? 0) > 0 &&
    (!meta.characterOverrideDataAsOf || Number.isNaN(new Date(meta.characterOverrideDataAsOf).getTime()))
  ) {
    throw new Error('Character overrides require a valid source timestamp')
  }

  if (previousSnapshot?.teams?.length) {
    const minimum = Math.floor(previousSnapshot.teams.length * (1 - MAX_RECORD_DROP_RATIO))
    if (teams.length < minimum) {
      throw new Error(`Suspicious record-count drop: ${previousSnapshot.teams.length} to ${teams.length}`)
    }
  }

  const priorCoverage = previousPortraitCoverage(previousSnapshot)
  if (priorCoverage !== null && meta.portraitCoverage < priorCoverage * (1 - MAX_PORTRAIT_DROP_RATIO)) {
    throw new Error(
      `Suspicious portrait-coverage drop: ${(priorCoverage * 100).toFixed(1)}% to ${(meta.portraitCoverage * 100).toFixed(1)}%`,
    )
  }

  teams.forEach((team, index) => {
    if (!Array.isArray(team.characters) || team.characters.length < 1 || team.characters.length > 5) {
      throw new Error(`Snapshot team ${index + 1} must contain one to five characters`)
    }
    assertNonNegativeInteger(team.totalBattles, `Snapshot team ${index + 1} totalBattles`)
    assertNonNegativeInteger(team.defensiveWins, `Snapshot team ${index + 1} defensiveWins`)
    if (team.defensiveWins > team.totalBattles) throw new Error(`Snapshot team ${index + 1} wins exceed battles`)
    if (!Number.isFinite(team.defendRate) || team.defendRate < 0 || team.defendRate > 100) {
      throw new Error(`Snapshot team ${index + 1} has an invalid defend rate`)
    }
  })
  return snapshot
}

export function buildSnapshot({
  warResponse,
  charactersResponse,
  previousSnapshot = null,
  now = new Date(),
  sourceDataAsOf = now,
  warDataAsOf = sourceDataAsOf,
  characterDataAsOf = sourceDataAsOf,
  characterOverrideCount = 0,
  characterOverrideDataAsOf = null,
}) {
  const { records, duplicateCount } = normalizeWarResponse(warResponse)
  const characters = normalizeCharacters(charactersResponse)
  const characterById = new Map(characters.map((character) => [character.id, character]))
  const unmappedIds = new Set()

  const teams = records.map((record) => ({
    characters: record.squad.map((id) => {
      const mapped = characterById.get(id)
      if (mapped) {
        return {
          id: mapped.id,
          name: mapped.name,
          portrait: mapped.portrait,
          isMapped: true,
        }
      }
      unmappedIds.add(id)
      return { id, name: prettifyCharacterId(id), portrait: null, isMapped: false }
    }),
    totalBattles: record.totalBattles,
    defensiveWins: record.defensiveWins,
    defendRate: record.defendRate,
  }))
  const portraitSlots = teams.flatMap((team) => team.characters)
  const hash = contentHash(teams, characters)
  const previousHash = previousSnapshot?.meta?.contentHash
  const contentChanged = hash !== previousHash
  const normalizedOverrideDataAsOf = characterOverrideDataAsOf ? characterOverrideDataAsOf.toISOString() : null
  const provenanceChanged = (previousSnapshot?.meta?.characterOverrideCount ?? 0) !== characterOverrideCount ||
    (previousSnapshot?.meta?.characterOverrideDataAsOf ?? null) !== normalizedOverrideDataAsOf
  const contractChanged = previousSnapshot?.meta?.schemaVersion !== SCHEMA_VERSION ||
    !previousSnapshot?.meta?.warDataAsOf ||
    !previousSnapshot?.meta?.characterDataAsOf ||
    previousSnapshot?.meta?.characterOverrideCount === undefined
  const materialChanged = contentChanged || provenanceChanged || contractChanged
  const generatedAt = !materialChanged && previousSnapshot?.meta?.generatedAt
    ? previousSnapshot.meta.generatedAt
    : now.toISOString()
  const resolvedWarDataAsOf = !materialChanged && previousSnapshot?.meta?.warDataAsOf
    ? previousSnapshot.meta.warDataAsOf
    : warDataAsOf.toISOString()
  const resolvedCharacterDataAsOf = !materialChanged && previousSnapshot?.meta?.characterDataAsOf
    ? previousSnapshot.meta.characterDataAsOf
    : characterDataAsOf.toISOString()
  const oldestSourceTimestamp = new Date(Math.min(
    new Date(resolvedWarDataAsOf).getTime(),
    new Date(resolvedCharacterDataAsOf).getTime(),
  )).toISOString()

  const snapshot = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      dataChangedAt: generatedAt,
      sourceDataAsOf: oldestSourceTimestamp,
      warDataAsOf: resolvedWarDataAsOf,
      characterDataAsOf: resolvedCharacterDataAsOf,
      characterOverrideCount,
      characterOverrideDataAsOf: normalizedOverrideDataAsOf,
      squadCount: teams.length,
      characterCount: characters.length,
      unmappedCharacterCount: unmappedIds.size,
      duplicateRecordCount: duplicateCount,
      portraitCoverage: portraitSlots.length
        ? Math.round((portraitSlots.filter((character) => character.portrait).length / portraitSlots.length) * 10000) / 10000
        : 0,
      contentHash: hash,
      sources: {
        characters: { id: 'official-msf-character-api', url: CHARACTER_SOURCE, documented: true },
        war: { id: 'official-site-war-defense-service', url: WAR_SOURCE, documented: false },
        ...(characterOverrideCount > 0 ? {
          characterBootstrap: {
            id: 'official-msf-character-directory',
            url: CHARACTER_BOOTSTRAP_SOURCE,
            documented: false,
            recordCount: characterOverrideCount,
          },
        } : {}),
      },
    },
    characters,
    teams,
  }

  return {
    snapshot: validateSnapshot(snapshot, previousSnapshot),
    changed: materialChanged,
  }
}

export function validateExistingSnapshot(snapshot) {
  if (snapshot?.meta?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported data schema version: ${snapshot?.meta?.schemaVersion ?? 'missing'}`)
  }
  if (snapshot.meta.contentHash !== contentHash(snapshot.teams, snapshot.characters)) {
    throw new Error('Snapshot content hash does not match its team data')
  }
  return validateSnapshot(snapshot)
}
