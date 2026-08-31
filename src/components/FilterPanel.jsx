import CharacterPicker from './CharacterPicker.jsx'

export default function FilterPanel({ characters, filters, onChange, onReset }) {
  const set = (partial) => onChange({ ...filters, ...partial })

  return (
    <section className="filter-panel" aria-labelledby="filter-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Build a matchup</p>
          <h2 id="filter-heading">Find the defense you need</h2>
        </div>
        <button type="button" className="button button--ghost" onClick={onReset}>Reset filters</button>
      </div>

      <div className="picker-grid">
        <CharacterPicker
          label="Include characters"
          characters={characters}
          selectedIds={filters.includeIds}
          unavailableIds={filters.excludeIds}
          onChange={(includeIds) => set({ includeIds })}
          tone="include"
        />
        <CharacterPicker
          label="Exclude characters"
          characters={characters}
          selectedIds={filters.excludeIds}
          unavailableIds={filters.includeIds}
          onChange={(excludeIds) => set({ excludeIds })}
          tone="exclude"
        />
      </div>

      <div className="filter-controls">
        <fieldset className="mode-control">
          <legend>Include match</legend>
          <div className="segmented">
            <button type="button" aria-pressed={filters.matchMode === 'all'} onClick={() => set({ matchMode: 'all' })}>ALL</button>
            <button type="button" aria-pressed={filters.matchMode === 'any'} onClick={() => set({ matchMode: 'any' })}>ANY</button>
          </div>
        </fieldset>
        <label>
          Minimum battles
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={filters.minBattles}
            onChange={(event) => set({ minBattles: Math.max(0, Number(event.target.value) || 0) })}
          />
        </label>
        <label>
          Minimum defend rate
          <span className="input-suffix">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputMode="decimal"
              value={filters.minRate}
              onChange={(event) => set({ minRate: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })}
            />
            <span>%</span>
          </span>
        </label>
      </div>
    </section>
  )
}
