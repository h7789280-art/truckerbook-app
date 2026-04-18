import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { checkDuplicateTrip } from '../lib/api'

export default function TripConfirm({ data, onSave, onBack, onClose }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [dupFound, setDupFound] = useState(null)
  const [checking, setChecking] = useState(false)

  const [originCity, setOriginCity] = useState(data.origin_city || '')
  const [originState, setOriginState] = useState(data.origin_state || '')
  const [destCity, setDestCity] = useState(data.destination_city || '')
  const [destState, setDestState] = useState(data.destination_state || '')
  const [miles, setMiles] = useState(data.miles || '')
  const [deadheadMiles, setDeadheadMiles] = useState(data.deadhead_miles || 0)
  const [rate, setRate] = useState(data.rate || '')
  const [pickupDate, setPickupDate] = useState(data.pickup_date || '')
  const [deliveryDate, setDeliveryDate] = useState(data.delivery_date || '')
  const [broker, setBroker] = useState(data.broker || '')
  const [loadNumber, setLoadNumber] = useState(data.load_number || '')
  const [weight, setWeight] = useState(data.weight || '')
  const [commodity, setCommodity] = useState(data.commodity || '')

  const ratePerMile = miles && rate ? (parseFloat(rate) / parseFloat(miles)).toFixed(2) : ''

  const doSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        origin_city: originCity,
        origin_state: originState,
        destination_city: destCity,
        destination_state: destState,
        miles: parseFloat(miles) || 0,
        deadhead_miles: parseFloat(deadheadMiles) || 0,
        rate: parseFloat(rate) || 0,
      })
    } catch (err) {
      setError(err.message || t('tripParse.saveError'))
      setSaving(false)
    }
  }

  const handleSave = async () => {
    setChecking(true)
    setError(null)
    try {
      const origin = [originCity, originState].filter(Boolean).join(', ')
      const destination = [destCity, destState].filter(Boolean).join(', ')
      const dups = await checkDuplicateTrip({
        origin,
        destination,
        distance: parseFloat(miles) || 0,
        rate: parseFloat(rate) || 0,
      })
      if (dups.length > 0) {
        setDupFound({ duplicates: dups, proceed: () => { setDupFound(null); doSave() } })
      } else {
        doSave()
      }
    } catch (e) {
      console.error('Trip duplicate check error:', e)
      doSave()
    } finally {
      setChecking(false)
    }
  }

  const overlay = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }

  const modal = {
    background: theme.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90vh',
    overflow: 'auto',
    padding: 20,
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid ' + theme.border,
    background: theme.card2,
    color: theme.text,
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    color: theme.dim,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
    display: 'block',
  }

  const rowStyle = { marginBottom: 10 }

  const twoCol = {
    display: 'grid',
    gridTemplateColumns: '1fr 80px',
    gap: 8,
  }

  const saveBtn = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 20px',
    borderRadius: 12,
    background: saving ? theme.card2 : 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: '#fff',
    border: 'none',
    fontSize: 15,
    fontWeight: 700,
    cursor: saving ? 'wait' : 'pointer',
    width: '100%',
    marginTop: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    opacity: saving ? 0.7 : 1,
  }

  const backBtn = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 20px',
    borderRadius: 12,
    border: '1px solid ' + theme.border,
    background: theme.card2,
    color: theme.text,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: 18, fontWeight: 700 }}>
            {t('tripParse.confirmTitle')}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.dim, fontSize: 22, cursor: 'pointer', padding: 4 }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Route summary */}
        <div style={{
          padding: 12, borderRadius: 12, marginBottom: 14,
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
          textAlign: 'center',
        }}>
          <span style={{ color: '#3b82f6', fontSize: 16, fontWeight: 700 }}>
            {originCity || '?'}{originState ? `, ${originState}` : ''} {'\u2192'} {destCity || '?'}{destState ? `, ${destState}` : ''}
          </span>
        </div>

        {/* Origin */}
        <div style={rowStyle}>
          <label style={labelStyle}>{t('tripParse.origin')}</label>
          <div style={twoCol}>
            <input style={inputStyle} value={originCity} onChange={(e) => setOriginCity(e.target.value)} placeholder={t('tripParse.city')} />
            <input style={inputStyle} value={originState} onChange={(e) => setOriginState(e.target.value)} placeholder={t('tripParse.state')} />
          </div>
        </div>

        {/* Destination */}
        <div style={rowStyle}>
          <label style={labelStyle}>{t('tripParse.destination')}</label>
          <div style={twoCol}>
            <input style={inputStyle} value={destCity} onChange={(e) => setDestCity(e.target.value)} placeholder={t('tripParse.city')} />
            <input style={inputStyle} value={destState} onChange={(e) => setDestState(e.target.value)} placeholder={t('tripParse.state')} />
          </div>
        </div>

        {/* Miles + Deadhead */}
        <div style={{ ...rowStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>{t('tripParse.miles')}</label>
            <input style={inputStyle} type="number" value={miles} onChange={(e) => setMiles(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t('tripParse.deadhead')}</label>
            <input style={inputStyle} type="number" value={deadheadMiles} onChange={(e) => setDeadheadMiles(e.target.value)} />
          </div>
        </div>

        {/* Rate + RPM */}
        <div style={{ ...rowStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>{t('tripParse.rate')} ($)</label>
            <input style={inputStyle} type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t('tripParse.perMile')}</label>
            <input
              style={{ ...inputStyle, background: theme.bg, color: theme.dim }}
              value={ratePerMile ? `$${ratePerMile}` : ''}
              readOnly
            />
          </div>
        </div>

        {/* Dates */}
        <div style={{ ...rowStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>{t('tripParse.pickupDate')}</label>
            <input style={inputStyle} type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t('tripParse.deliveryDate')}</label>
            <input style={inputStyle} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
        </div>

        {/* Broker + Load # */}
        <div style={{ ...rowStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>{t('tripParse.broker')}</label>
            <input style={inputStyle} value={broker} onChange={(e) => setBroker(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t('tripParse.loadNumber')}</label>
            <input style={inputStyle} value={loadNumber} onChange={(e) => setLoadNumber(e.target.value)} />
          </div>
        </div>

        {/* Weight + Commodity (read-only info) */}
        {(weight || commodity) && (
          <div style={{ ...rowStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {weight ? (
              <div>
                <label style={labelStyle}>{t('tripParse.weight')}</label>
                <input style={inputStyle} type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            ) : <div />}
            {commodity ? (
              <div>
                <label style={labelStyle}>{t('tripParse.commodity')}</label>
                <input style={inputStyle} value={commodity} onChange={(e) => setCommodity(e.target.value)} />
              </div>
            ) : <div />}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 8, padding: 12, borderRadius: 10,
            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
            fontSize: 14, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Save */}
        <button style={saveBtn} onClick={handleSave} disabled={saving || checking}>
          {checking ? ('\u23F3 ' + t('scan.checkingDuplicates')) : (saving ? '\u23F3' : '\uD83D\uDCBE') + ' ' + t('tripParse.saveTrip')}
        </button>

        {/* Back */}
        <button style={backBtn} onClick={onBack}>
          {t('common.back')}
        </button>
      </div>

      {/* Duplicate warning modal */}
      {dupFound && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 1002,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: theme.card, borderRadius: 16, width: '100%', maxWidth: 380,
            maxHeight: '80vh', overflow: 'auto', padding: 20,
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', color: '#eab308', fontSize: 17, fontWeight: 700 }}>
              {'\u26A0\uFE0F'} {t('scan.dupTitle')}
            </h3>
            <p style={{ color: theme.dim, fontSize: 13, margin: '0 0 12px' }}>
              {t('scan.dupMessage')}
            </p>

            {dupFound.duplicates.map((dup, i) => (
              <div key={dup.id || i} style={{
                padding: 10, borderRadius: 10, background: theme.card2,
                border: '1px solid ' + theme.border, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: theme.dim, fontSize: 12 }}>{'\uD83D\uDCC5'} {dup.date}</span>
                  <span style={{ color: '#ef4444', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
                    ${parseFloat(dup.amount || 0).toFixed(2)}
                  </span>
                </div>
                <div style={{ color: theme.text, fontSize: 13 }}>
                  {dup.description || `${dup.origin || ''} \u2192 ${dup.destination || ''}`}
                </div>
                {dup.distance_km != null && (
                  <div style={{ color: theme.dim, fontSize: 11, marginTop: 2 }}>
                    {parseFloat(dup.distance_km).toFixed(0)} {t('tripParse.miles')}
                  </div>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setDupFound(null)}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12,
                  border: '1px solid ' + theme.border, background: theme.card2,
                  color: theme.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={dupFound.proceed}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12,
                  border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {t('scan.dupSaveAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
