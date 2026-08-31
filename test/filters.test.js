import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_FILTERS, filterTeams, readFilters, sortTeams, writeFilters } from '../src/utils/filters.js'

const teams = [
  {
    characters: [{ id: 'Alpha', name: 'Alpha' }, { id: 'Beta', name: 'Beta' }],
    totalBattles: 500,
    defensiveWins: 250,
    defendRate: 50,
  },
  {
    characters: [{ id: 'Alpha', name: 'Alpha' }, { id: 'Gamma', name: 'Gamma' }],
    totalBattles: 300,
    defensiveWins: 180,
    defendRate: 60,
  },
  {
    characters: [{ id: 'Solo', name: 'Solo' }],
    totalBattles: 100,
    defensiveWins: 70,
    defendRate: 70,
  },
]

test('ALL and ANY includes use exact character IDs', () => {
  const all = filterTeams(teams, { ...DEFAULT_FILTERS, minBattles: 0, includeIds: ['Alpha', 'Beta'] })
  const any = filterTeams(teams, { ...DEFAULT_FILTERS, minBattles: 0, includeIds: ['Beta', 'Gamma'], matchMode: 'any' })
  assert.deepEqual(all, [teams[0]])
  assert.deepEqual(any, [teams[0], teams[1]])
})

test('exclusions and both thresholds combine', () => {
  const result = filterTeams(teams, {
    ...DEFAULT_FILTERS,
    minBattles: 250,
    minRate: 55,
    excludeIds: ['Beta'],
  })
  assert.deepEqual(result, [teams[1]])
})

test('one-member squads are filterable and character-name sort is stable', () => {
  const solo = filterTeams(teams, { ...DEFAULT_FILTERS, minBattles: 0, includeIds: ['Solo'] })
  assert.deepEqual(solo, [teams[2]])
  assert.deepEqual(sortTeams(teams, 'names-asc'), [teams[0], teams[1], teams[2]])
  assert.deepEqual(sortTeams(teams, 'rate-desc'), [teams[2], teams[1], teams[0]])
  assert.deepEqual(sortTeams(teams, 'wins-desc'), [teams[0], teams[1], teams[2]])
  assert.deepEqual(sortTeams(teams, 'battles-desc'), [teams[0], teams[1], teams[2]])
})

test('filter state round-trips through shareable URL parameters', () => {
  const filters = {
    includeIds: ['Alpha', 'Beta'],
    excludeIds: ['Gamma'],
    matchMode: 'any',
    minBattles: 350,
    minRate: 42.5,
    sort: 'wins-desc',
  }
  assert.deepEqual(readFilters(`?${writeFilters(filters)}`), filters)
})

test('URL parsing rejects unknown characters and invalid values', () => {
  const result = readFilters('?include=Alpha,Unknown&rate=900&battles=-4&sort=nope', new Set(['Alpha']))
  assert.deepEqual(result, { ...DEFAULT_FILTERS, includeIds: ['Alpha'], minRate: 100 })
})

test('an empty URL uses the documented defaults', () => {
  assert.deepEqual(readFilters(''), DEFAULT_FILTERS)
})
