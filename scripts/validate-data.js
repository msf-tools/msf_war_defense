#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateExistingSnapshot } from './lib/data.js'

try {
  const path = resolve('public/data/war-defense.json')
  const snapshot = JSON.parse(await readFile(path, 'utf8'))
  validateExistingSnapshot(snapshot)
  console.log(
    `Valid snapshot: ${snapshot.meta.squadCount} squads, ${snapshot.meta.characterCount} characters, ` +
    `${(snapshot.meta.portraitCoverage * 100).toFixed(1)}% portrait coverage.`,
  )
} catch (error) {
  console.error(`Snapshot validation failed: ${error.message}`)
  process.exitCode = 1
}
