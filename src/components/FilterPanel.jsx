import { useMemo } from 'react'
import CriteriaPicker from './CriteriaPicker.jsx'

const METADATA_FIELDS = ['traits', 'invisibleTraits', 'eventTraits']

function searchableMetadata(character) {
  return [...new Map(METADATA_FIELDS.flatMap((field) => character[field] || []).map((trait) => [trait.id, trait])).values()]
}

function metadataTypeLabel(types) {
  if (types.length > 1) return 'Multiple metadata types'
  if (types[0] === 'event') return 'Event metadata'
  if (types[0] === 'hidden') return 'Hidden metadata'
  return 'Roster trait'
}

export default function FilterPanel({ characters, tags, filters, onChange, onReset }) {
  const set = (partial) => onChange({ ...filters, ...partial })
  const options = useMemo(() => [
    ...characters.map((character) => ({
      key: `character:${character.id}`,
      kind: 'character',
      id: character.id,
      name: character.name,
      detail: searchableMetadata(character).map((trait) => trait.name).join(' · '),
    })),
    ...tags.map((tag) => ({
      key: `tag:${tag.id}`,
      kind: 'metadata',
      id: tag.id,
      name: tag.name,
      detail: `${tag.characterCount.toLocaleString()} character${tag.characterCount === 1 ? '' : 's'} · ${metadataTypeLabel(tag.types)}`,
    })),
  ], [characters, tags])

  const keysFor = (characterIds, tagIds) => [
    ...characterIds.map((id) => `character:${id}`),
    ...tagIds.map((id) => `tag:${id}`),
  ]

  function setCriteria(prefix, keys) {
    const characterIds = keys.filter((key) => key.startsWith('character:')).map((key) => key.slice('character:'.length))
    const tagIds = keys.filter((key) => key.startsWith('tag:')).map((key) => key.slice('tag:'.length))
    set(prefix === 'include'
      ? { includeIds: characterIds, includeTagIds: tagIds }
      : { excludeIds: characterIds, excludeTagIds: tagIds })
  }

  const includeKeys = keysFor(filters.includeIds, filters.includeTagIds)
  const excludeKeys = keysFor(filters.excludeIds, filters.excludeTagIds)

  return (
    <section className="filter-panel" aria-labelledby="filter-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Build a matchup</p>
          <h2 id="filter-heading">Find the defense you need</h2>
        </div>
        <button type="button" className="button button--ghost" onClick={onReset}>Reset filters</button>
      </div>

      <p className="filter-panel__hint">
        Search character names or any official metadata—alignment, location, origin, role, faction, event tag, and more. ALL requires every included item somewhere on the squad; ANY accepts at least one. Exclusions remove a squad when any selected item matches.
      </p>

      <div className="picker-grid">
        <CriteriaPicker
          label="Include characters or metadata"
          options={options}
          selectedKeys={includeKeys}
          unavailableKeys={excludeKeys}
          onChange={(keys) => setCriteria('include', keys)}
          tone="include"
        />
        <CriteriaPicker
          label="Exclude characters or metadata"
          options={options}
          selectedKeys={excludeKeys}
          unavailableKeys={includeKeys}
          onChange={(keys) => setCriteria('exclude', keys)}
          tone="exclude"
        />
      </div>

      <div className="filter-controls">
        <fieldset className="mode-control">
          <legend>Include match across characters + metadata</legend>
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
