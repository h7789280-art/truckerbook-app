import React from 'react'

const FUEL_DATA = [
  {
    station: '\u041b\u0443\u043a\u043e\u0439\u043b \u041c7',
    date: '25.03.2026',
    liters: 320,
    odometer: 452300,
    total: 18848,
    perLiter: 58.9,
  },
  {
    station: '\u0413\u0430\u0437\u043f\u0440\u043e\u043c \u041a\u0430\u0437\u0430\u043d\u044c',
    date: '21.03.2026',
    liters: 290,
    odometer: 449100,
    total: 16675,
    perLiter: 57.5,
  },
  {
    station: 'Shell \u041d.\u041d\u043e\u0432\u0433\u043e\u0440\u043e\u0434',
    date: '17.03.2026',
    liters: 310,
    odometer: 445800,
    total: 18352,
    perLiter: 59.2,
  },
  {
    station: '\u0420\u043e\u0441\u043d\u0435\u0444\u0442\u044c \u041c5',
    date: '12.03.2026',
    liters: 305,
    odometer: 442200,
    total: 17629,
    perLiter: 57.8,
  },
]

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export default function Fuel() {
  const totalMonth = 71504
  const totalLiters = 1225

  return (
    <div style={{ padding: '16px', minHeight: '100vh', backgroundColor: '#0a0e1a' }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <div
          style={{
            flex: 1,
            backgroundColor: '#111827',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #1e2a3f',
          }}
        >
          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>
            {'\u0422\u041e\u041f\u041b\u0418\u0412\u041e/\u041c\u0415\u0421'}
          </div>
          <div style={{ color: '#e2e8f0', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            {formatNumber(totalMonth)} {'\u20bd'}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: '#111827',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #1e2a3f',
          }}
        >
          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>
            {'\u041b\u0418\u0422\u0420\u041e\u0412'}
          </div>
          <div style={{ color: '#e2e8f0', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            {formatNumber(totalLiters)}
          </div>
        </div>
      </div>

      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px' }}>
          {'\u0417\u0410\u041f\u0420\u0410\u0412\u041a\u0418'}
        </div>
        <button
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + {'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c'}
        </button>
      </div>

      {/* Fuel entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {FUEL_DATA.map((item, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#111827',
              borderRadius: '12px',
              padding: '14px',
              border: '1px solid #1e2a3f',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: '42px',
                height: '42px',
                backgroundColor: '#1a2235',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                flexShrink: 0,
              }}
            >
              {'\u26fd\ufe0f'}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: 600 }}>
                {item.station}
              </div>
              <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                {item.date} · {item.liters} {'\u043b'} · {formatNumber(item.odometer)} {'\u043a\u043c'}
              </div>
            </div>

            {/* Price */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ color: '#f59e0b', fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>
                {formatNumber(item.total)} {'\u20bd'}
              </div>
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                {item.perLiter} {'\u20bd/\u043b'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
