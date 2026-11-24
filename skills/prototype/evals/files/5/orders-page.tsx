// web/src/pages/orders-page.tsx (currently on main)
//
// PROTOTYPE: three layouts for the support orders page, switched with
// ?variant=A, ?variant=B or ?variant=C.
// Question: which layout lets a support agent find a late order fastest?
// Throwaway code: hardcoded rows, inline styles, no loading or error state.

import { useSearchParams } from 'react-router-dom';

const ROWS = [
  { id: 'SO-1041', customer: 'Harbour Cafe', due: '2026-11-14', late: true },
  { id: 'SO-1042', customer: 'Tall Pine Books', due: '2026-11-21', late: false },
  { id: 'SO-1043', customer: 'Kite and Co', due: '2026-11-22', late: false },
];

function VariantA() {
  // the dense table we have today
  return (
    <table>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.id}><td>{r.id}</td><td>{r.customer}</td><td>{r.due}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function VariantB() {
  // late orders pinned in a red band on top, everything else below
  const late = ROWS.filter((r) => r.late);
  const rest = ROWS.filter((r) => !r.late);
  return (
    <div>
      <div style={{ background: '#fdd', padding: 8 }}>
        {late.map((r) => <p key={r.id}>LATE {r.id} {r.customer} (due {r.due})</p>)}
      </div>
      {rest.map((r) => <p key={r.id}>{r.id} {r.customer} (due {r.due})</p>)}
    </div>
  );
}

function VariantC() {
  // one card per order, side by side
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {ROWS.map((r) => (
        <div key={r.id} style={{ border: '1px solid #999', padding: 8 }}>
          <b>{r.customer}</b><br />{r.id}{r.late ? ' (late)' : ''}
        </div>
      ))}
    </div>
  );
}

function PrototypeSwitcher({ current }: { current: string }) {
  return (
    <nav>
      {['A', 'B', 'C'].map((v) => (
        <a key={v} href={`?variant=${v}`}>{v === current ? `[${v}]` : v} </a>
      ))}
    </nav>
  );
}

export function OrdersPage() {
  const [params] = useSearchParams();
  const variant = params.get('variant') ?? 'A';
  return (
    <main>
      {variant === 'A' && <VariantA />}
      {variant === 'B' && <VariantB />}
      {variant === 'C' && <VariantC />}
      <PrototypeSwitcher current={variant} />
    </main>
  );
}
