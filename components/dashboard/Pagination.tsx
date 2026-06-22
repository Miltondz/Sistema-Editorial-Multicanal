const BTN = {
  base: 'px-2.5 py-1 rounded-lg text-xs font-medium transition-all min-w-[2rem] text-center',
  active: { background: '#6366f1', color: '#fff' },
  inactive: { background: '#fff', border: '1px solid #e2e8f0', color: '#64748b' },
  disabled: { background: '#f8fafc', color: '#cbd5e1', cursor: 'not-allowed' },
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

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
  const to = Math.min(page * pageSize, total)

  const pageNums: number[] = []
  const lo = Math.max(1, page - 2)
  const hi = Math.min(totalPages, page + 2)
  for (let i = lo; i <= hi; i++) pageNums.push(i)

  return (
    <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
      <span className="text-xs text-slate-400">
        {total === 0 ? '0 resultados' : `${from}–${to} de ${total}`}
      </span>

      <div className="flex items-center gap-1">
        {lo > 1 && (
          <>
            <button className={BTN.base} style={BTN.inactive} onClick={() => onPage(1)}>1</button>
            {lo > 2 && <span className="text-xs text-slate-400 px-1">…</span>}
          </>
        )}
        {pageNums.map(p => (
          <button key={p} className={BTN.base}
            style={p === page ? BTN.active : BTN.inactive}
            onClick={() => onPage(p)}
          >{p}</button>
        ))}
        {hi < totalPages && (
          <>
            {hi < totalPages - 1 && <span className="text-xs text-slate-400 px-1">…</span>}
            <button className={BTN.base} style={BTN.inactive} onClick={() => onPage(totalPages)}>{totalPages}</button>
          </>
        )}

        <div className="w-px h-4 mx-1" style={{ background: '#e2e8f0' }} />

        <button className={BTN.base}
          style={page <= 1 ? BTN.disabled : BTN.inactive}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >←</button>
        <button className={BTN.base}
          style={page >= totalPages ? BTN.disabled : BTN.inactive}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >→</button>
      </div>

      <select
        value={pageSize}
        onChange={e => onPageSize(Number(e.target.value))}
        className="px-2 py-1 rounded-lg text-xs outline-none"
        style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b' }}
      >
        {PAGE_SIZE_OPTIONS.map(n => (
          <option key={n} value={n}>{n} / pág</option>
        ))}
      </select>
    </div>
  )
}
