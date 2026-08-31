export default function ResultsToolbar({ shown, total, filters, activeCount, onSort }) {
  return (
    <div className="results-toolbar">
      <div>
        <p className="eyebrow">Defensive teams</p>
        <h2><span>{total.toLocaleString()}</span> matching squads</h2>
        <p className="results-toolbar__detail">
          {activeCount ? `${activeCount} active filter${activeCount === 1 ? '' : 's'}` : 'Showing the full snapshot'}
          {shown < total ? ` · ${shown.toLocaleString()} loaded` : ''}
        </p>
      </div>
      <label className="sort-control">
        Sort by
        <select value={filters.sort} onChange={(event) => onSort(event.target.value)}>
          <option value="rate-desc">Defend rate</option>
          <option value="wins-desc">Defensive wins</option>
          <option value="battles-desc">Total battles</option>
          <option value="names-asc">Character names</option>
        </select>
      </label>
    </div>
  )
}
