export const DEFAULT_FILTERS = Object.freeze({
  includeIds: [],
  excludeIds: [],
  matchMode: 'all',
  minBattles: 150,
  minRate: 0,
  sort: 'rate-desc',
})

const SORT_VALUES = new Set(['rate-desc', 'wins-desc', 'battles-desc', 'names-asc'])

export function filterTeams(teams, filters) {
  const include = new Set(filters.includeIds)
  const exclude = new Set(filters.excludeIds)

  return teams.filter((team) => {
    const ids = new Set(team.characters.map((character) => character.id))
    if (include.size) {
      const matches = [...include].map((id) => ids.has(id))
      if (filters.matchMode === 'any' ? !matches.some(Boolean) : !matches.every(Boolean)) return false
    }
    if ([...exclude].some((id) => ids.has(id))) return false
    if (team.totalBattles < filters.minBattles) return false
    if (team.defendRate < filters.minRate) return false
    return true
  })
}

export function sortTeams(teams, sort) {
  return [...teams].sort((a, b) => {
    const names = (team) => team.characters.map((character) => character.name).join('|')
    if (sort === 'wins-desc') {
      return b.defensiveWins - a.defensiveWins || b.defendRate - a.defendRate || names(a).localeCompare(names(b))
    }
    if (sort === 'battles-desc') {
      return b.totalBattles - a.totalBattles || b.defendRate - a.defendRate || names(a).localeCompare(names(b))
    }
    if (sort === 'names-asc') return names(a).localeCompare(names(b)) || b.defendRate - a.defendRate
    return b.defendRate - a.defendRate || b.totalBattles - a.totalBattles || names(a).localeCompare(names(b))
  })
}

export function readFilters(search, validIds = null) {
  const params = new URLSearchParams(search)
  const ids = (name) => (params.get(name) || '')
    .split(',')
    .filter(Boolean)
    .filter((id) => !validIds || validIds.has(id))
  const number = (name, fallback, max = Number.POSITIVE_INFINITY) => {
    const raw = params.get(name)
    if (raw === null || raw === '') return fallback
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback
  }
  const mode = params.get('match')
  const sort = params.get('sort')
  return {
    includeIds: ids('include'),
    excludeIds: ids('exclude'),
    matchMode: mode === 'any' ? 'any' : 'all',
    minBattles: number('battles', DEFAULT_FILTERS.minBattles),
    minRate: number('rate', DEFAULT_FILTERS.minRate, 100),
    sort: SORT_VALUES.has(sort) ? sort : DEFAULT_FILTERS.sort,
  }
}

export function writeFilters(filters) {
  const params = new URLSearchParams()
  if (filters.includeIds.length) params.set('include', filters.includeIds.join(','))
  if (filters.excludeIds.length) params.set('exclude', filters.excludeIds.join(','))
  if (filters.matchMode !== DEFAULT_FILTERS.matchMode) params.set('match', filters.matchMode)
  if (filters.minBattles !== DEFAULT_FILTERS.minBattles) params.set('battles', String(filters.minBattles))
  if (filters.minRate !== DEFAULT_FILTERS.minRate) params.set('rate', String(filters.minRate))
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort)
  return params.toString()
}

export function countActiveFilters(filters) {
  return filters.includeIds.length + filters.excludeIds.length +
    Number(filters.matchMode !== DEFAULT_FILTERS.matchMode) +
    Number(filters.minBattles !== DEFAULT_FILTERS.minBattles) +
    Number(filters.minRate !== DEFAULT_FILTERS.minRate)
}
