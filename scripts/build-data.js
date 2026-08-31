#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildSnapshot } from './lib/data.js'
import { fetchAllCharacters, fetchWarMeta } from './lib/fetch.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(root, 'public/data/war-defense.json')

try {
  loadEnvFile(resolve(root, '.env'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

function responseRows(payload, label) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  throw new Error(`${label} JSON must contain an array`)
}

function mergeCharacterResponses(basePayload, overridePayload) {
  const byId = new Map()
  for (const row of responseRows(basePayload, 'Character')) {
    if (row && typeof row.id === 'string' && row.id.trim()) byId.set(row.id.trim(), row)
  }
  for (const row of responseRows(overridePayload, 'Character override')) {
    if (row && typeof row.id === 'string' && row.id.trim()) {
      const id = row.id.trim()
      const existing = byId.get(id)
      byId.set(id, {
        ...existing,
        ...row,
        traits: row.traits ?? existing?.traits,
      })
    }
  }
  return { data: [...byId.values()] }
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'))
  } catch (error) {
    throw new Error(`Unable to read ${label} JSON at ${path}: ${error.message}`)
  }
}

async function readPreviousSnapshot() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error(`Unable to read the last-known-good snapshot: ${error.message}`)
  }
}

async function main() {
  const warFile = option('--war-file')
  const charactersFile = option('--characters-file')
  const warOnly = process.argv.includes('--war-only')
  const characterOverridesFile = option('--character-overrides-file')
  const sourceAsOfOption = option('--source-as-of')
  const warSourceAsOfOption = option('--war-source-as-of') || sourceAsOfOption
  const characterSourceAsOfOption = option('--character-source-as-of') || sourceAsOfOption
  if (warOnly && (warFile || charactersFile)) {
    throw new Error('--war-only cannot be combined with operator-provided files')
  }
  if ((warFile && !charactersFile) || (!warFile && charactersFile)) {
    throw new Error('Use --war-file and --characters-file together, or omit both to fetch live data')
  }
  if (characterOverridesFile && !warFile && !warOnly) {
    throw new Error('--character-overrides-file is only valid with operator-provided files or --war-only')
  }
  if ((sourceAsOfOption || warSourceAsOfOption || characterSourceAsOfOption) && !warFile) {
    throw new Error('Source timestamp options are only valid with operator-provided files')
  }
  const previousSnapshot = await readPreviousSnapshot()
  if (warOnly && !previousSnapshot) throw new Error('--war-only requires a last-known-good snapshot')

  const now = new Date()
  const warDataAsOf = warSourceAsOfOption ? new Date(warSourceAsOfOption) : now
  const characterDataAsOf = characterSourceAsOfOption
    ? new Date(characterSourceAsOfOption)
    : warOnly
      ? new Date(previousSnapshot.meta.characterDataAsOf || previousSnapshot.meta.sourceDataAsOf)
      : now
  if (Number.isNaN(warDataAsOf.getTime())) throw new Error(`Invalid War source timestamp: ${warSourceAsOfOption}`)
  if (Number.isNaN(characterDataAsOf.getTime())) throw new Error(`Invalid character source timestamp: ${characterSourceAsOfOption}`)

  let warResponse
  let charactersResponse
  let characterOverrideCount = warOnly ? previousSnapshot.meta.characterOverrideCount || 0 : 0
  let characterOverrideDataAsOf = warOnly && previousSnapshot.meta.characterOverrideDataAsOf
    ? new Date(previousSnapshot.meta.characterOverrideDataAsOf)
    : null
  if (warFile) {
    console.log('Building from operator-provided JSON files…')
    ;[warResponse, charactersResponse] = await Promise.all([
      readJson(warFile, 'War'),
      readJson(charactersFile, 'character'),
    ])
  } else if (warOnly) {
    console.log('Fetching current aggregate War data and reusing the last validated character catalog…')
    warResponse = await fetchWarMeta()
    charactersResponse = previousSnapshot.characters || previousSnapshot.teams.flatMap((team) => team.characters)
  } else {
    console.log('Fetching current aggregate War and character data…')
    ;[warResponse, charactersResponse] = await Promise.all([fetchWarMeta(), fetchAllCharacters()])
  }
  if (characterOverridesFile) {
    const overridesResponse = await readJson(characterOverridesFile, 'character override')
    const overrideRows = responseRows(overridesResponse, 'Character override')
    const observedAt = overridesResponse?.meta?.observedAt
    characterOverrideDataAsOf = new Date(observedAt)
    if (!observedAt || Number.isNaN(characterOverrideDataAsOf.getTime())) {
      throw new Error('Character override JSON must include a valid meta.observedAt timestamp')
    }
    characterOverrideCount = new Set(
      overrideRows.filter((row) => row && typeof row.id === 'string' && row.id.trim()).map((row) => row.id.trim()),
    ).size
    charactersResponse = mergeCharacterResponses(charactersResponse, overridesResponse)
  }
  const { snapshot, changed } = buildSnapshot({
    warResponse,
    charactersResponse,
    previousSnapshot,
    now,
    warDataAsOf,
    characterDataAsOf,
    characterOverrideCount,
    characterOverrideDataAsOf,
  })

  if (!changed) {
    console.log(`Validated ${snapshot.meta.squadCount} squads; content is unchanged, so no file was written.`)
    return
  }

  await mkdir(dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 })
  await rename(temporaryPath, outputPath)
  console.log(
    `Wrote ${snapshot.meta.squadCount} squads with ${(snapshot.meta.portraitCoverage * 100).toFixed(1)}% portrait coverage; ` +
    `${snapshot.meta.unmappedCharacterCount} character IDs were unmapped.`,
  )
}

main().catch((error) => {
  console.error(`Data refresh failed; the last-known-good snapshot was preserved. ${error.message}`)
  process.exitCode = 1
})
