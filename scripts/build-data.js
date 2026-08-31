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
  const sourceAsOfOption = option('--source-as-of')
  if ((warFile && !charactersFile) || (!warFile && charactersFile)) {
    throw new Error('Use --war-file and --characters-file together, or omit both to fetch live data')
  }
  if (sourceAsOfOption && !warFile) throw new Error('--source-as-of is only valid with operator-provided files')
  const sourceDataAsOf = sourceAsOfOption ? new Date(sourceAsOfOption) : new Date()
  if (Number.isNaN(sourceDataAsOf.getTime())) throw new Error(`Invalid --source-as-of timestamp: ${sourceAsOfOption}`)

  console.log(warFile ? 'Building from operator-provided JSON files…' : 'Fetching current aggregate War and character data…')
  const [warResponse, charactersResponse] = warFile
    ? await Promise.all([readJson(warFile, 'War'), readJson(charactersFile, 'character')])
    : await Promise.all([fetchWarMeta(), fetchAllCharacters()])
  const previousSnapshot = await readPreviousSnapshot()
  const { snapshot, changed } = buildSnapshot({ warResponse, charactersResponse, previousSnapshot, sourceDataAsOf })

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
