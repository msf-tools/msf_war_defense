import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSnapshot,
  calculateDefendRate,
  normalizeCharacters,
  normalizeWarResponse,
  validateExistingSnapshot,
} from '../scripts/lib/data.js'

function makeWar(count = 50) {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      squad: [`Character${index}`, `Character${index + 1}`],
      total: 200 + index,
      wins: 50 + index,
    })),
  }
}

function makeCharacters(count = 110, portraits = true) {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      id: `Character${index}`,
      name: `Character ${index}`,
      portrait: portraits ? `https://assets.example/character-${index}.png` : null,
    })),
  }
}

test('calculates a finite one-decimal defend rate, including zero battles', () => {
  assert.equal(calculateDefendRate(1, 3), 33.3)
  assert.equal(calculateDefendRate(0, 0), 0)
})

test('normalizes squads with one through five members', () => {
  const { records } = normalizeWarResponse([
    { squad: ['Solo'], total: 10, wins: 2 },
    { squad: ['A', 'B', 'C', 'D', 'E'], total: 20, wins: 4 },
  ])
  assert.equal(records.length, 2)
  assert.deepEqual(records.map((record) => record.squad.length).sort(), [1, 5])
})

test('rejects malformed records and impossible win totals', () => {
  assert.throws(() => normalizeWarResponse({ data: 'not-an-array' }), /must contain an array/)
  assert.throws(() => normalizeWarResponse([{ squad: [], total: 1, wins: 0 }]), /one and five/)
  assert.throws(() => normalizeWarResponse([{ squad: ['A'], total: 1, wins: 2 }]), /cannot exceed/)
  assert.throws(() => normalizeWarResponse([{ squad: ['A'], total: 1.5, wins: 1 }]), /non-negative integer/)
})

test('deduplicates reordered squads deterministically by strongest sample', () => {
  const { records, duplicateCount } = normalizeWarResponse([
    { squad: ['A', 'B'], total: 100, wins: 80 },
    { squad: ['B', 'A'], total: 120, wins: 30 },
    { squad: ['A', 'B'], total: 120, wins: 40 },
  ])
  assert.equal(duplicateCount, 2)
  assert.equal(records.length, 1)
  assert.equal(records[0].totalBattles, 120)
  assert.equal(records[0].defensiveWins, 40)
})

test('normalizes character portraits and ignores unusable character rows', () => {
  assert.deepEqual(normalizeCharacters({ data: [
    { id: 'AlphaWolf', name: '', portrait: 'http://unsafe.example/a.png' },
    { id: '', name: 'Nobody' },
    { id: 'Beta', name: 'Beta', portrait: 'https://assets.example/b.png' },
  ] }), [
    { id: 'AlphaWolf', name: 'Alpha Wolf', portrait: null },
    { id: 'Beta', name: 'Beta', portrait: 'https://assets.example/b.png' },
  ])
})

test('joins characters and explicitly falls back for missing metadata', () => {
  const war = makeWar()
  war.data[0].squad = ['Character0', 'BrandNewHero']
  const { snapshot } = buildSnapshot({
    warResponse: war,
    charactersResponse: makeCharacters(),
    now: new Date('2026-08-30T12:00:00Z'),
    sourceDataAsOf: new Date('2026-08-29T12:00:00Z'),
  })
  const missing = snapshot.teams.flatMap((team) => team.characters).find((character) => character.id === 'BrandNewHero')
  assert.deepEqual(missing, { id: 'BrandNewHero', name: 'Brand New Hero', portrait: null, isMapped: false })
  assert.equal(snapshot.meta.unmappedCharacterCount, 1)
  assert.equal(snapshot.meta.sourceDataAsOf, '2026-08-29T12:00:00.000Z')
  assert.match(snapshot.meta.contentHash, /^[a-f0-9]{64}$/)
  assert.doesNotThrow(() => validateExistingSnapshot(snapshot))
})

test('rejects suspicious record and portrait coverage drops', () => {
  const { snapshot: previous } = buildSnapshot({ warResponse: makeWar(100), charactersResponse: makeCharacters(150) })
  assert.throws(
    () => buildSnapshot({ warResponse: makeWar(50), charactersResponse: makeCharacters(150), previousSnapshot: previous }),
    /record-count drop/,
  )
  assert.throws(
    () => buildSnapshot({ warResponse: makeWar(100), charactersResponse: makeCharacters(150, false), previousSnapshot: previous }),
    /portrait-coverage drop/,
  )
})

test('does not create timestamp-only changes for identical content', () => {
  const first = buildSnapshot({
    warResponse: makeWar(),
    charactersResponse: makeCharacters(),
    now: new Date('2026-08-30T12:00:00Z'),
  })
  const second = buildSnapshot({
    warResponse: makeWar(),
    charactersResponse: makeCharacters(),
    previousSnapshot: first.snapshot,
    now: new Date('2026-08-31T12:00:00Z'),
  })
  assert.equal(second.changed, false)
  assert.equal(second.snapshot.meta.generatedAt, first.snapshot.meta.generatedAt)
})
