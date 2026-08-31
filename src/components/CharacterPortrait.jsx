import { useState } from 'react'

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export default function CharacterPortrait({ character }) {
  const [failed, setFailed] = useState(false)
  const showImage = character.portrait && !failed

  return (
    <div className="character" title={character.name}>
      <div className={`portrait ${showImage ? '' : 'portrait--fallback'}`}>
        {showImage ? (
          <img src={character.portrait} alt="" loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <span aria-hidden="true">{initials(character.name)}</span>
        )}
      </div>
      <span className="character__name">{character.name}</span>
    </div>
  )
}
