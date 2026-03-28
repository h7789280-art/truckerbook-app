import { useState } from 'react'

const SUB_TABS = [
  { key: 'service', label: '\uD83D\uDD27 \u0421\u0435\u0440\u0432\u0438\u0441' },
  { key: 'checklist', label: '\u2705 \u0427\u0435\u043A-\u043B\u0438\u0441\u0442' },
  { key: 'map', label: '\uD83D\uDDFA \u041A\u0430\u0440\u0442\u0430' },
  { key: 'docs', label: '\uD83D\uDCC4 \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B' },
]

const REPAIRS = [
  { name: '\u0417\u0430\u043C\u0435\u043D\u0430 \u043C\u0430\u0441\u043B\u0430 + \u0444\u0438\u043B\u044C\u0442\u0440', cost: 12500, date: '2026-03-10', km: 441000, place: '\u0421\u0422\u041E \u0414\u0430\u043B\u044C\u043D\u043E\u0431\u043E\u0439', icon: '\uD83D\uDEE2' },
  { name: '\u0422\u043E\u0440\u043C\u043E\u0437\u043D\u044B\u0435 \u043A\u043E\u043B\u043E\u0434\u043A\u0438', cost: 28000, date: '2026-02-18', km: 435200, place: '\u0421\u0422\u041E \u041C\u0430\u0433\u0438\u0441\u0442\u0440\u0430\u043B\u044C', icon: '\uD83D\uDEA8' },
  { name: '4 \u0448\u0438\u043D\u044B Michelin', cost: 64000, date: '2026-01-25', km: 428000, place: 'TyreMax', icon: '\u26AA' },
  { name: '\u0413\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440', cost: 35000, date: '2025-12-14', km: 419500, place: '\u0410\u0432\u0442\u043E\u044D\u043B\u0435\u043A\u0442\u0440\u0438\u043A', icon: '\u26A1' },
]

const INSURANCE = [
  { type: '\u041E\u0421\u0410\u0413\u041E', company: '\u0420\u0415\u0421\u041E-\u0413\u0430\u0440\u0430\u043D\u0442\u0438\u044F', cost: 18500, from: '2026-01-15', to: '2027-01-14', daysLeft: 294, color: '#22c55e' },
  { type: '\u041A\u0410\u0421\u041A\u041E', company: '\u0418\u043D\u0433\u043E\u0441\u0441\u0442\u0440\u0430\u0445', cost: 95000, from: '2026-02-01', to: '2027-01-31', daysLeft: 311, color: '#3b82f6' },
]

const CHECKLIST_SECTIONS = [
  {
    key: 'pdd',
    title: '\uD83D\uDEA8 \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u041F\u0414\u0414',
    color: '#ef4444',
    items: [
      '\u041E\u0433\u043D\u0435\u0442\u0443\u0448\u0438\u0442\u0435\u043B\u044C', '\u0410\u043F\u0442\u0435\u0447\u043A\u0430',
      '\u0417\u043D\u0430\u043A \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438', '\u0423\u043F\u043E\u0440\u044B',
      '\u0416\u0438\u043B\u0435\u0442', '\u0422\u0430\u0445\u043E\u0433\u0440\u0430\u0444',
      '\u041A\u0430\u0440\u0442\u0430 \u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F', '\u041F\u0443\u0442\u0435\u0432\u043E\u0439 \u043B\u0438\u0441\u0442',
      '\u0414\u041E\u041F\u041E\u0413',
    ],
  },
  {
    key: 'recommended',
    title: '\u26A1\uFE0F \u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F',
    color: '#f59e0b',
    items: [
      '\u0422\u0440\u043E\u0441', '\u041F\u0440\u043E\u0432\u043E\u0434\u0430',
      '\u041B\u0430\u043C\u043F\u043E\u0447\u043A\u0438', '\u041F\u0440\u0435\u0434\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435\u043B\u0438',
      '\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B', '\u0414\u043E\u043C\u043A\u0440\u0430\u0442',
      '\u0426\u0435\u043F\u0438', '\u041A\u0430\u043D\u0438\u0441\u0442\u0440\u0430',
      '\u0424\u043E\u043D\u0430\u0440\u044C',
    ],
  },
  {
    key: 'comfort',
    title: '\uD83C\uDFE0 \u041A\u043E\u043C\u0444\u043E\u0440\u0442',
    color: '#3b82f6',
    items: [
      '\u041D\u0435\u0437\u0430\u043C\u0435\u0440\u0437\u0430\u0439\u043A\u0430', '\u0422\u0440\u044F\u043F\u043A\u0438',
      '\u041F\u0435\u0440\u0447\u0430\u0442\u043A\u0438', '\u0421\u043A\u043E\u0442\u0447',
      '\u0421\u0442\u044F\u0436\u043A\u0438', 'WD-40',
      '\u0410\u043F\u0442\u0435\u0447\u043A\u0430 \u043B\u0438\u0447\u043D\u0430\u044F', 'Powerbank',
      '\u0422\u0435\u0440\u043C\u043E\u0441', '\u0421\u043F\u0430\u043B\u044C\u043D\u0438\u043A',
    ],
  },
]

const MAP_FILTERS = [
  { key: 'all', label: '\u0412\u0441\u0435' },
  { key: 'fuel', label: '\u26FD\uFE0F' },
  { key: 'sto', label: '\uD83D\uDD27' },
  { key: 'parking', label: '\uD83C\uDD7F\uFE0F' },
  { key: 'food', label: '\uD83C\uDF7D' },
]

const MAP_NOTES = [
  { type: 'fuel', icon: '\u26FD\uFE0F', name: '\u041B\u0443\u043A\u043E\u0439\u043B \u041C7 \u043A\u043C 342', desc: '\u0414\u0438\u0437\u0435\u043B\u044C 56.20 \u20BD/\u043B, \u0435\u0441\u0442\u044C AdBlue', rating: 4 },
  { type: 'sto', icon: '\uD83D\uDD27', name: '\u0421\u0422\u041E \u0414\u0430\u043B\u044C\u043D\u043E\u0431\u043E\u0439', desc: '\u0411\u044B\u0441\u0442\u0440\u044B\u0439 \u0440\u0435\u043C\u043E\u043D\u0442, \u0430\u0434\u0435\u043A\u0432\u0430\u0442\u043D\u044B\u0435 \u0446\u0435\u043D\u044B', rating: 5 },
  { type: 'parking', icon: '\uD83C\uDD7F\uFE0F', name: '\u0421\u0442\u043E\u044F\u043D\u043A\u0430 \u0422\u0440\u0430\u043D\u0437\u0438\u0442', desc: '\u041E\u0445\u0440\u0430\u043D\u044F\u0435\u043C\u0430\u044F, 200 \u20BD/\u043D\u043E\u0447\u044C, \u0434\u0443\u0448', rating: 4 },
  { type: 'food', icon: '\uD83C\uDF7D', name: '\u041A\u0430\u0444\u0435 \u0423 \u041F\u0435\u0442\u0440\u043E\u0432\u0438\u0447\u0430', desc: '\u0414\u043E\u043C\u0430\u0448\u043D\u044F\u044F \u0435\u0434\u0430, \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0441 350 \u20BD', rating: 5 },
  { type: 'fuel', icon: '\u26FD\uFE0F', name: 'BP \u0422\u0440\u0430\u0441\u0441\u0430 \u0414\u043E\u043D', desc: '\u041A\u0430\u0447\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 \u0442\u043E\u043F\u043B\u0438\u0432\u043E, \u0434\u043E\u0440\u043E\u0433\u043E', rating: 3 },
]

const DOCUMENTS = [
  { key: 'license', icon: '\uD83D\uDCB3', label: '\u041F\u0440\u0430\u0432\u0430' },
  { key: 'sts', icon: '\uD83D\uDE9A', label: '\u0421\u0422\u0421' },
  { key: 'osago', icon: '\uD83D\uDEE1', label: '\u041E\u0421\u0410\u0413\u041E' },
  { key: 'kasko', icon: '\uD83D\uDD12', label: '\u041A\u0410\u0421\u041A\u041E' },
  { key: 'contract', icon: '\uD83D\uDCC3', label: '\u0414\u043E\u0433\u043E\u0432\u043E\u0440' },
  { key: 'pts', icon: '\uD83D\uDCD8', label: '\u041F\u0422\u0421' },
]

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '16px',
}

export default function Service() {
  const [activeTab, setActiveTab] = useState('service')
  const [checkedItems, setCheckedItems] = useState({})
  const [mapFilter, setMapFilter] = useState('all')

  const toggleCheck = (sectionKey, idx) => {
    const key = `${sectionKey}_${idx}`
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const getCheckedCount = (sectionKey, total) => {
    let count = 0
    for (let i = 0; i < total; i++) {
      if (checkedItems[`${sectionKey}_${i}`]) count++
    }
    return count
  }

  const filteredNotes = mapFilter === 'all'
    ? MAP_NOTES
    : MAP_NOTES.filter(n => n.type === mapFilter)

  return (
    <div style={{ padding: '16px', minHeight: '100vh', backgroundColor: 'var(--bg)', paddingBottom: '80px' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              background: activeTab === t.key
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : 'var(--card)',
              color: activeTab === t.key ? '#000' : 'var(--dim)',
              border: activeTab === t.key ? 'none' : '1px solid var(--border)',
              borderRadius: '20px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'service' && <ServiceTab />}
      {activeTab === 'checklist' && (
        <ChecklistTab
          checkedItems={checkedItems}
          toggleCheck={toggleCheck}
          getCheckedCount={getCheckedCount}
        />
      )}
      {activeTab === 'map' && (
        <MapTab
          mapFilter={mapFilter}
          setMapFilter={setMapFilter}
          filteredNotes={filteredNotes}
        />
      )}
      {activeTab === 'docs' && <DocsTab />}
    </div>
  )
}

/* ===== SERVICE TAB ===== */
function ServiceTab() {
  const totalRepair = REPAIRS.reduce((s, r) => s + r.cost, 0)

  return (
    <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>{'\u0420\u0435\u043C\u043E\u043D\u0442'}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444' }}>
            {totalRepair.toLocaleString('ru-RU')} {'\u20BD'}
          </div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>{'\u041E\u0434\u043E\u043C\u0435\u0442\u0440'}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
            452 300 {'\u043A\u043C'}
          </div>
        </div>
      </div>

      {/* Oil banner */}
      <div style={{
        ...cardStyle,
        background: '#f59e0b15',
        border: '1px solid #f59e0b40',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <span style={{ fontSize: '24px' }}>{'\uD83D\uDEE2'}</span>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#f59e0b' }}>
            {'\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u043C\u0430\u0441\u043B\u043E \u0447\u0435\u0440\u0435\u0437 3 700 \u043A\u043C'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
            {'\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0437\u0430\u043C\u0435\u043D\u0430: 441 000 \u043A\u043C \u00B7 \u0418\u043D\u0442\u0435\u0440\u0432\u0430\u043B 15 000 \u043A\u043C'}
          </div>
        </div>
      </div>

      {/* Repair history */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {'\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u0432'}
      </div>
      <div style={{ ...cardStyle, padding: 0, marginBottom: '16px' }}>
        {REPAIRS.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{
              width: '40px', height: '40px', backgroundColor: 'var(--card2)',
              borderRadius: '10px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '20px', flexShrink: 0,
            }}>
              {r.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                {r.date} &middot; {r.km.toLocaleString('ru-RU')} {'\u043A\u043C'} &middot; {r.place}
              </div>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444', flexShrink: 0 }}>
              {r.cost.toLocaleString('ru-RU')} {'\u20BD'}
            </div>
          </div>
        ))}
      </div>

      {/* Insurance */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {'\u0421\u0442\u0440\u0430\u0445\u043E\u0432\u043A\u0438'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {INSURANCE.map((ins, i) => (
          <div key={i} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '36px', height: '36px', backgroundColor: `${ins.color}20`,
                  borderRadius: '10px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '16px', flexShrink: 0,
                }}>
                  {ins.type === '\u041E\u0421\u0410\u0413\u041E' ? '\uD83D\uDEE1' : '\uD83D\uDD12'}
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{ins.type}</div>
                  <div style={{ fontSize: '12px', color: 'var(--dim)' }}>{ins.company}</div>
                </div>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
                {ins.cost.toLocaleString('ru-RU')} {'\u20BD'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--dim)' }}>
                {ins.from} &mdash; {ins.to}
              </div>
              <div style={{
                fontSize: '12px', fontWeight: 600, color: ins.color,
                background: `${ins.color}15`, padding: '2px 8px', borderRadius: '8px',
              }}>
                {ins.daysLeft} {'\u0434\u043D'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ===== CHECKLIST TAB ===== */
function ChecklistTab({ checkedItems, toggleCheck, getCheckedCount }) {
  const pddChecked = getCheckedCount('pdd', CHECKLIST_SECTIONS[0].items.length)
  const pddTotal = CHECKLIST_SECTIONS[0].items.length
  const pddComplete = pddChecked === pddTotal

  return (
    <>
      {CHECKLIST_SECTIONS.map(section => {
        const checked = getCheckedCount(section.key, section.items.length)
        const total = section.items.length
        const pct = Math.round((checked / total) * 100)

        return (
          <div key={section.key} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{section.title}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: section.color }}>
                {checked}/{total}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: 'var(--border)', borderRadius: '4px', height: '4px', marginBottom: '10px' }}>
              <div style={{
                height: '4px', borderRadius: '4px', background: section.color,
                width: `${pct}%`, transition: 'width 0.3s ease',
              }} />
            </div>

            <div style={{ ...cardStyle, padding: 0 }}>
              {section.items.map((item, idx) => {
                const isChecked = !!checkedItems[`${section.key}_${idx}`]
                return (
                  <div
                    key={idx}
                    onClick={() => toggleCheck(section.key, idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 16px', cursor: 'pointer',
                      borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                      border: isChecked ? 'none' : '2px solid var(--border)',
                      background: isChecked ? section.color : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}>
                      {isChecked && (
                        <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>{'\u2713'}</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: '14px', color: isChecked ? 'var(--dim)' : 'var(--text)',
                      textDecoration: isChecked ? 'line-through' : 'none',
                      transition: 'color 0.15s',
                    }}>
                      {item}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* PDD status banner */}
      <div style={{
        ...cardStyle,
        background: pddComplete ? '#22c55e15' : '#ef444415',
        border: `1px solid ${pddComplete ? '#22c55e40' : '#ef444440'}`,
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '22px' }}>{pddComplete ? '\u2705' : '\uD83D\uDEA8'}</span>
        <div style={{
          fontSize: '14px', fontWeight: 600,
          color: pddComplete ? '#22c55e' : '#ef4444',
        }}>
          {pddComplete
            ? '\u041F\u0414\u0414: \u0412\u0441\u0451 \u043D\u0430 \u043C\u0435\u0441\u0442\u0435'
            : `\u041F\u0414\u0414: ${pddChecked}/${pddTotal} \u0415\u0441\u0442\u044C \u043D\u0435\u0445\u0432\u0430\u0442\u043A\u0430!`
          }
        </div>
      </div>
    </>
  )
}

/* ===== MAP TAB ===== */
function MapTab({ mapFilter, setMapFilter, filteredNotes }) {
  return (
    <>
      {/* Map placeholder */}
      <div style={{
        ...cardStyle, height: '200px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--card), var(--card2))',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.08,
          background: 'repeating-linear-gradient(0deg, var(--border), var(--border) 1px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, var(--border), var(--border) 1px, transparent 1px, transparent 20px)',
        }} />
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>{'\uD83D\uDDFA'}</div>
          <div style={{ fontSize: '14px', color: 'var(--dim)' }}>{'\u041A\u0430\u0440\u0442\u0430 \u0437\u0430\u043C\u0435\u0442\u043E\u043A'}</div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '4px' }}>Leaflet &middot; {'\u0441\u043A\u043E\u0440\u043E'}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {MAP_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setMapFilter(f.key)}
            style={{
              background: mapFilter === f.key
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : 'var(--card)',
              color: mapFilter === f.key ? '#000' : 'var(--dim)',
              border: mapFilter === f.key ? 'none' : '1px solid var(--border)',
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notes list */}
      <div style={{ ...cardStyle, padding: 0, marginBottom: '16px' }}>
        {filteredNotes.map((note, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '14px 16px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{
              width: '40px', height: '40px', backgroundColor: 'var(--card2)',
              borderRadius: '10px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '20px', flexShrink: 0,
            }}>
              {note.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {note.name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px' }}>
                {note.desc}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <span key={s} style={{ fontSize: '12px', color: s <= note.rating ? '#f59e0b' : 'var(--border)' }}>
                  {'\u2605'}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Stats banner */}
      <div style={{
        ...cardStyle,
        background: 'linear-gradient(135deg, #f59e0b10, #d9770610)',
        border: '1px solid #f59e0b30',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', color: '#f59e0b' }}>4 827</div>
        <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px' }}>
          {'\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0445 \u0442\u043E\u0447\u0435\u043A \u043E\u0442 \u0432\u043E\u0434\u0438\u0442\u0435\u043B\u0435\u0439'}
        </div>
      </div>
    </>
  )
}

/* ===== DOCS TAB ===== */
function DocsTab() {
  return (
    <>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
        {'\u0424\u043E\u0442\u043E-\u0430\u0440\u0445\u0438\u0432 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        {DOCUMENTS.map(doc => (
          <div
            key={doc.key}
            style={{
              ...cardStyle,
              textAlign: 'center',
              padding: '20px 12px',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>{doc.icon}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{doc.label}</div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '4px' }}>
              {'\u041D\u0435\u0442 \u0444\u043E\u0442\u043E'}
            </div>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div style={{
        ...cardStyle, marginTop: '16px',
        background: '#3b82f615', border: '1px solid #3b82f630',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '20px' }}>{'\uD83D\uDCF7'}</span>
        <div style={{ fontSize: '13px', color: 'var(--dim)' }}>
          {'\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E, \u0447\u0442\u043E\u0431\u044B \u0441\u0444\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442'}
        </div>
      </div>
    </>
  )
}
