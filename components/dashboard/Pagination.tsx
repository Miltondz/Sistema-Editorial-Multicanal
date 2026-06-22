const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

const btnBase: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 8, fontSize: 12,
  fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
  minWidth: 32, textAlign: 'center',
}
const btnActive: React.CSSProperties = { ...btnBase, background: '#6366f1', color: '#fff', border: '1px solid #6366f1' }
const btnInactive: React.CSSProperties = { ...btnBase, background: '#fff', color: '#475569', border: '1px solid #e2e8f0' }
const btnDisabled: React.CSSProperties = { ...btnBase, background: '#f8fafc', color: '#cbd5e1', border: '1px solid #e2e8f0', cursor: 'not-allowed' }

export default function Pagination({
  total, page, pageSize, onPage, onPageSize,
}: {
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (s: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  const lo = Math.max(1, page - 2)
  const hi = Math.min(totalPages, page + 2)
  const pageNums: number[] = []
  for (let i = lo; i <= hi; i++) pageNums.push(i)

  if (total === 0) return null

  return (
    <div className="flex items-center flex-wrap gap-3 mt-6 pt-4"
      style={{ borderTop: '1px solid #e2e8f0' }}>

      {/* Page size selector — left, prominent */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 whitespace-nowrap">Por página:</span>
        <div className="flex gap-1">
          {PAGE_SIZE_OPTIONS.map(n => (
            <button key={n}
              style={n === pageSize ? btnActive : btnInactive}
              onClick={() => onPageSize(n)}
            >{n}</button>
          ))}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Count */}
      <span className="text-xs text-slate-400 whitespace-nowrap">
        {from}–{to} de {total.toLocaleString()}
      </span>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          style={page <= 1 ? btnDisabled : btnInactive}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >←</button>

        {lo > 1 && (
          <>
            <button style={btnInactive} onClick={() => onPage(1)}>1</button>
            {lo > 2 && <span style={{ fontSize: 12, color: '#94a3b8', padding: '0 2px' }}>…</span>}
          </>
        )}

        {pageNums.map(p => (
          <button key={p}
            style={p === page ? btnActive : btnInactive}
            onClick={() => onPage(p)}
          >{p}</button>
        ))}

        {hi < totalPages && (
          <>
            {hi < totalPages - 1 && <span style={{ fontSize: 12, color: '#94a3b8', padding: '0 2px' }}>…</span>}
            <button style={btnInactive} onClick={() => onPage(totalPages)}>{totalPages}</button>
          </>
        )}

        <button
          style={page >= totalPages ? btnDisabled : btnInactive}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >→</button>
      </div>
    </div>
  )
}
