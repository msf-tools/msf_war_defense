import { useId, useMemo, useRef, useState } from 'react'

const MAX_SUGGESTIONS = 8

function normalized(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreOption(option, query) {
  const name = normalized(option.name)
  const id = normalized(option.id)
  if (name === query || id === query) return 0
  if (name.startsWith(query)) return 1
  if (id.startsWith(query)) return 2
  if (name.includes(query)) return 3
  if (id.includes(query)) return 4
  return 5
}

export default function CriteriaPicker({ label, options, selectedKeys, unavailableKeys, onChange, tone }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const inputId = useId()
  const listId = useId()
  const unavailable = useMemo(() => new Set([...selectedKeys, ...unavailableKeys]), [selectedKeys, unavailableKeys])
  const optionByKey = useMemo(() => new Map(options.map((option) => [option.key, option])), [options])
  const selected = selectedKeys.map((key) => optionByKey.get(key)).filter(Boolean)
  const normalizedQuery = normalized(query)
  const suggestions = useMemo(() => {
    if (!normalizedQuery) return []
    return options
      .filter((option) => !unavailable.has(option.key) && normalized(`${option.name} ${option.id}`).includes(normalizedQuery))
      .sort((a, b) => scoreOption(a, normalizedQuery) - scoreOption(b, normalizedQuery) ||
        Number(b.kind === 'metadata') - Number(a.kind === 'metadata') || a.name.localeCompare(b.name))
      .slice(0, MAX_SUGGESTIONS)
  }, [normalizedQuery, options, unavailable])
  const activeOption = suggestions[Math.min(activeIndex, suggestions.length - 1)]

  function selectOption(option) {
    if (!option) return
    onChange([...selectedKeys, option.key])
    setQuery('')
    setActiveIndex(0)
    setOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function updateQuery(value) {
    setQuery(value)
    setActiveIndex(0)
    setOpen(Boolean(value.trim()))
  }

  return (
    <div className={`picker picker--${tone}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className="picker__input-row">
        <div className="picker__combobox">
          <input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && Boolean(normalizedQuery)}
            aria-controls={listId}
            aria-activedescendant={open && activeOption ? `${listId}-${activeOption.key}` : undefined}
            autoComplete="off"
            value={query}
            placeholder="Type a name or metadata"
            onChange={(event) => updateQuery(event.target.value)}
            onFocus={() => setOpen(Boolean(normalizedQuery))}
            onBlur={() => window.setTimeout(() => setOpen(false), 100)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && suggestions.length) {
                event.preventDefault()
                setOpen(true)
                setActiveIndex((index) => (index + 1) % suggestions.length)
              } else if (event.key === 'ArrowUp' && suggestions.length) {
                event.preventDefault()
                setOpen(true)
                setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
              } else if (event.key === 'Enter' && activeOption) {
                event.preventDefault()
                selectOption(activeOption)
              } else if (event.key === 'Escape') {
                setOpen(false)
              }
            }}
          />
        </div>
        <button
          type="button"
          className="button button--small"
          onClick={() => selectOption(activeOption)}
          disabled={!activeOption}
        >
          Add
        </button>
        {open && normalizedQuery && (
          <ul className="suggestion-list" id={listId} role="listbox">
            {suggestions.map((option, index) => (
              <li
                id={`${listId}-${option.key}`}
                key={option.key}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  tabIndex="-1"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  <span className="suggestion__copy">
                    <strong>{option.name}</strong>
                    {option.detail && <small>{option.detail}</small>}
                  </span>
                  <span className={`type-badge type-badge--${option.kind}`}>{option.kind}</span>
                </button>
              </li>
            ))}
            {!suggestions.length && <li className="suggestion-list__empty">No matching characters or metadata</li>}
          </ul>
        )}
      </div>
      <div className="chip-list" aria-live="polite">
        {selected.map((option) => (
          <button
            type="button"
            className={`chip chip--${tone}`}
            key={option.key}
            onClick={() => onChange(selectedKeys.filter((key) => key !== option.key))}
            aria-label={`Remove ${option.kind} ${option.name} from ${label.toLowerCase()}`}
          >
            <span className="chip__type">{option.kind === 'character' ? 'CHAR' : 'META'}</span>
            <span className="chip__label">{option.name}</span><span className="chip__remove" aria-hidden="true">×</span>
          </button>
        ))}
        {!selected.length && <span className="picker__empty">None selected</span>}
      </div>
    </div>
  )
}
