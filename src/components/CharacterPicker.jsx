import { useId, useState } from 'react'

export default function CharacterPicker({ label, characters, selectedIds, unavailableIds, onChange, tone }) {
  const [query, setQuery] = useState('')
  const inputId = useId()
  const listId = useId()
  const selected = selectedIds.map((id) => characters.find((character) => character.id === id)).filter(Boolean)

  function addCharacter() {
    const normalized = query.trim().toLowerCase()
    const character = characters.find((candidate) =>
      candidate.id.toLowerCase() === normalized || candidate.name.toLowerCase() === normalized,
    )
    if (character && !selectedIds.includes(character.id) && !unavailableIds.includes(character.id)) {
      onChange([...selectedIds, character.id])
      setQuery('')
    }
  }

  return (
    <div className={`picker picker--${tone}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className="picker__input-row">
        <input
          id={inputId}
          list={listId}
          value={query}
          placeholder="Search a character"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addCharacter()
            }
          }}
        />
        <datalist id={listId}>
          {characters
            .filter((character) => !selectedIds.includes(character.id) && !unavailableIds.includes(character.id))
            .map((character) => <option key={character.id} value={character.name} />)}
        </datalist>
        <button type="button" className="button button--small" onClick={addCharacter} disabled={!query.trim()}>Add</button>
      </div>
      <div className="chip-list" aria-live="polite">
        {selected.map((character) => (
          <button
            type="button"
            className={`chip chip--${tone}`}
            key={character.id}
            onClick={() => onChange(selectedIds.filter((id) => id !== character.id))}
            aria-label={`Remove ${character.name} from ${label.toLowerCase()}`}
          >
            {character.name}<span aria-hidden="true">×</span>
          </button>
        ))}
        {!selected.length && <span className="picker__empty">None selected</span>}
      </div>
    </div>
  )
}
