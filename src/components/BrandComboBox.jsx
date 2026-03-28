import { useState, useRef, useEffect } from 'react'

// Top-30 truck brands covering 90% of the market
const TRUCK_BRANDS = [
  // Europe
  'Volvo', 'Scania', 'MAN', 'DAF', 'Mercedes-Benz', 'Iveco', 'Renault',
  // Russia/CIS
  '\u041a\u0430\u043c\u0410\u0417', '\u041c\u0410\u0417', '\u0413\u0410\u0417', '\u0423\u0440\u0430\u043b', '\u041a\u0420\u0410\u0417',
  // USA
  'Freightliner', 'Kenworth', 'Peterbilt', 'International', 'Mack', 'Western Star',
  // Japan/Korea
  'Hino', 'Isuzu', 'Mitsubishi Fuso', 'Hyundai',
  // China
  'Dongfeng', 'Shacman', 'FAW', 'Foton', 'Sinotruk (HOWO)', 'JAC', 'CAMC',
]

export { TRUCK_BRANDS }

export default function BrandComboBox({ value, onChange, inputStyle, dropdownBg, dropdownBorder, textColor, dimColor, hoverBg }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const displayValue = open ? search : (value || '')

  const filtered = TRUCK_BRANDS.filter((b) => {
    const q = (open ? search : '').toLowerCase()
    if (!q) return true
    return b.toLowerCase().includes(q)
  })

  const handleInputChange = (e) => {
    const v = e.target.value
    setSearch(v)
    onChange(v)
    if (!open) setOpen(true)
  }

  const handleFocus = () => {
    setSearch(value || '')
    setOpen(true)
  }

  const handleSelect = (brand) => {
    onChange(brand)
    setSearch(brand)
    setOpen(false)
  }

  const bgColor = dropdownBg || '#1a2235'
  const brdColor = dropdownBorder || '#1e2a3f'
  const txtColor = textColor || '#e2e8f0'
  const dmColor = dimColor || '#64748b'
  const hvBg = hoverBg || '#111827'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder={'\u041f\u043e\u0438\u0441\u043a \u0438\u043b\u0438 \u0432\u0432\u043e\u0434 \u043c\u0430\u0440\u043a\u0438...'}
        style={inputStyle}
      />
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: bgColor,
          border: '1px solid ' + brdColor,
          borderRadius: 12,
          maxHeight: 220,
          overflowY: 'auto',
          zIndex: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {filtered.length > 0 ? filtered.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => handleSelect(b)}
              style={{
                width: '100%',
                padding: '11px 14px',
                background: b === value ? hvBg : 'transparent',
                border: 'none',
                color: txtColor,
                fontSize: 15,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {b}
            </button>
          )) : (
            <div style={{ padding: '12px 14px', color: dmColor, fontSize: 14, textAlign: 'center' }}>
              {'\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f: "' + search + '"'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
