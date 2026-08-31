import { useEffect, useMemo, useState } from 'react'
import FilterPanel from './components/FilterPanel.jsx'
import ResultsToolbar from './components/ResultsToolbar.jsx'
import TeamCard from './components/TeamCard.jsx'
import { useWarData } from './hooks/useWarData.js'
import { countActiveFilters, DEFAULT_FILTERS, filterTeams, readFilters, sortTeams, writeFilters } from './utils/filters.js'

const PAGE_SIZE = 60

function formatFreshness(timestamp) {
  if (!timestamp) return 'Unknown refresh date'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(timestamp))
}

export default function App() {
  const { data, error, loading } = useWarData()
  const [filters, setFilters] = useState(() => readFilters(window.location.search))
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const characters = useMemo(() => {
    if (!data) return []
    const byId = new Map()
    data.teams.flatMap((team) => team.characters).forEach((character) => {
      if (!byId.has(character.id) || (!byId.get(character.id).portrait && character.portrait)) byId.set(character.id, character)
    })
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const results = useMemo(() => {
    if (!data) return []
    return sortTeams(filterTeams(data.teams, filters), filters.sort)
  }, [data, filters])

  useEffect(() => {
    const query = writeFilters(filters)
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', url)
  }, [filters])

  function updateFilters(nextFilters) {
    setFilters(nextFilters)
    setVisibleCount(PAGE_SIZE)
  }

  function resetFilters() {
    updateFilters({ ...DEFAULT_FILTERS })
  }

  if (loading) {
    return <main className="status-page"><div className="loader" /><h1>Loading War defenses…</h1><p>Opening the latest validated snapshot.</p></main>
  }

  if (error) {
    return (
      <main className="status-page status-page--error">
        <p className="eyebrow">Data unavailable</p>
        <h1>The defense snapshot could not be opened.</h1>
        <p>{error.message}. Try refreshing the page, or ask the site operator to validate the checked-in data.</p>
      </main>
    )
  }

  const shownResults = results.slice(0, visibleCount)

  return (
    <>
      <header className="hero">
        <div className="hero__glow" />
        <div className="shell hero__content">
          <nav aria-label="Site identity">
            <a className="brand" href={import.meta.env.BASE_URL}>
              <span className="brand__mark" aria-hidden="true">W</span>
              <span>MSF <strong>War Defense</strong></span>
            </a>
            <a className="source-link" href={data.meta.sources.war.url}>Aggregate War source <span aria-hidden="true">↗</span></a>
          </nav>
          <div className="hero__copy">
            <p className="eyebrow">Alliance War intelligence</p>
            <h1>Know what holds.<br /><span>Plan what wins.</span></h1>
            <p>Explore aggregate defensive squads with current character names, portraits, battle volume, and defend rates.</p>
          </div>
          <div className="snapshot-strip">
            <div><span className="pulse" /><span><strong>Validated snapshot</strong><small>Source data as of {formatFreshness(data.meta.sourceDataAsOf || data.meta.generatedAt)}</small></span></div>
            <div><strong>{data.meta.squadCount.toLocaleString()}</strong><small>Squads tracked</small></div>
            <div><strong>{data.meta.characterCount.toLocaleString()}</strong><small>Characters mapped</small></div>
          </div>
        </div>
      </header>

      <main className="shell main-content">
        <FilterPanel characters={characters} filters={filters} onChange={updateFilters} onReset={resetFilters} />
        <section className="results" aria-labelledby="results-heading">
          <ResultsToolbar
            shown={shownResults.length}
            total={results.length}
            filters={filters}
            activeCount={countActiveFilters(filters)}
            onSort={(sort) => updateFilters({ ...filters, sort })}
          />
          {results.length ? (
            <>
              <div className="team-grid">
                {shownResults.map((team, index) => (
                  <TeamCard key={team.characters.map((character) => character.id).join('|')} team={team} rank={index + 1} />
                ))}
              </div>
              {shownResults.length < results.length && (
                <div className="load-more">
                  <button type="button" className="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                    Show more teams
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span aria-hidden="true">◇</span>
              <h3>No defenses match that combination</h3>
              <p>Try switching ALL to ANY, removing an exclusion, or lowering a threshold.</p>
              <button type="button" className="button" onClick={resetFilters}>Reset filters</button>
            </div>
          )}
        </section>
      </main>

      <footer>
        <div className="shell">
          <p>Community analysis tool. Not affiliated with or endorsed by Scopely.</p>
          <p>The aggregate War service is provisional; the last validated snapshot remains available if refreshes fail. <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy policy</a></p>
        </div>
      </footer>
    </>
  )
}
