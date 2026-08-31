import CharacterPortrait from './CharacterPortrait.jsx'

export default function TeamCard({ team, rank }) {
  return (
    <article className="team-card">
      <div className="team-card__topline">
        <span className="team-card__rank">#{rank}</span>
        <div className="rate-block">
          <strong>{team.defendRate.toFixed(1)}%</strong>
          <span>Defend rate</span>
        </div>
      </div>
      <div className="team-card__portraits" aria-label={team.characters.map((character) => character.name).join(', ')}>
        {team.characters.map((character) => <CharacterPortrait key={character.id} character={character} />)}
      </div>
      <dl className="team-card__stats">
        <div>
          <dt>Defensive wins</dt>
          <dd>{team.defensiveWins.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Total battles</dt>
          <dd>{team.totalBattles.toLocaleString()}</dd>
        </div>
      </dl>
    </article>
  )
}
