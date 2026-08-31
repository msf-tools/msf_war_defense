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
      traits: [
        { id: index % 2 ? 'Tech' : 'Bio', name: index % 2 ? 'TECH' : 'BIO' },
        { id: 'Global', name: 'GLOBAL' },
      ],
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

test('normalizes character portraits and searchable traits while ignoring unusable rows', () => {
  assert.deepEqual(normalizeCharacters({ data: [
    { id: 'AlphaWolf', name: '', portrait: 'http://unsafe.example/a.png', traits: ['Tech', { id: 'ShadowConclave', name: 'SHADOW CONCLAVE' }, { id: 'Tech', name: 'TECH' }] },
    { id: '', name: 'Nobody' },
    { id: 'Beta', name: 'Beta', portrait: 'https://assets.example/b.png', traits: [{ id: 'Bio', name: 'BIO' }] },
  ] }), [
    {
      id: 'AlphaWolf',
      name: 'Alpha Wolf',
      portrait: null,
      traits: [
        { id: 'ShadowConclave', name: 'SHADOW CONCLAVE' },
        { id: 'Tech', name: 'TECH' },
      ],
    },
    { id: 'Beta', name: 'Beta', portrait: 'https://assets.example/b.png', traits: [{ id: 'Bio', name: 'BIO' }] },
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
  assert.equal(snapshot.meta.warDataAsOf, '2026-08-29T12:00:00.000Z')
  assert.equal(snapshot.meta.characterDataAsOf, '2026-08-29T12:00:00.000Z')
  assert.equal(snapshot.characters.length, 110)
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

test('tracks War and character freshness independently', () => {
  const { snapshot } = buildSnapshot({
    warResponse: makeWar(),
    charactersResponse: makeCharacters(),
    now: new Date('2026-08-31T12:00:00Z'),
    warDataAsOf: new Date('2026-08-31T11:45:00Z'),
    characterDataAsOf: new Date('2026-05-17T08:24:58.352Z'),
    characterOverrideCount: 10,
    characterOverrideDataAsOf: new Date('2026-08-31T11:30:00Z'),
  })
  assert.equal(snapshot.meta.warDataAsOf, '2026-08-31T11:45:00.000Z')
  assert.equal(snapshot.meta.characterDataAsOf, '2026-05-17T08:24:58.352Z')
  assert.equal(snapshot.meta.sourceDataAsOf, '2026-05-17T08:24:58.352Z')
  assert.equal(snapshot.meta.characterOverrideCount, 10)
  assert.equal(snapshot.meta.characterOverrideDataAsOf, '2026-08-31T11:30:00.000Z')
  assert.equal(snapshot.meta.sources.characterBootstrap.recordCount, 10)
})

test('rejects character override metadata without a valid observation time', () => {
  assert.throws(
    () => buildSnapshot({
      warResponse: makeWar(),
      charactersResponse: makeCharacters(),
      characterOverrideCount: 1,
    }),
    /valid source timestamp/,
  )
})

test('clears bootstrap provenance after an identical authenticated catalog refresh', () => {
  const first = buildSnapshot({
    warResponse: makeWar(),
    charactersResponse: makeCharacters(),
    now: new Date('2026-08-30T12:00:00Z'),
    characterDataAsOf: new Date('2026-05-17T08:24:58.352Z'),
    characterOverrideCount: 10,
    characterOverrideDataAsOf: new Date('2026-08-30T11:30:00Z'),
  })
  const authenticated = buildSnapshot({
    warResponse: makeWar(),
    charactersResponse: makeCharacters(),
    previousSnapshot: first.snapshot,
    now: new Date('2026-08-31T12:00:00Z'),
    characterDataAsOf: new Date('2026-08-31T11:45:00Z'),
  })
  assert.equal(authenticated.changed, true)
  assert.equal(authenticated.snapshot.meta.characterOverrideCount, 0)
  assert.equal(authenticated.snapshot.meta.characterOverrideDataAsOf, null)
  assert.equal(authenticated.snapshot.meta.characterDataAsOf, '2026-08-31T11:45:00.000Z')
  assert.equal(authenticated.snapshot.meta.sources.characterBootstrap, undefined)
})
