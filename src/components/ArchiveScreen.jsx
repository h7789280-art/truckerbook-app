import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '12px',
}

// Map filter chip key → predicate on doc_type
const FILTER_PREDS = {
  all: () => true,
  fuel: (t) => t === 'receipt_fuel',
  def: (t) => t === 'receipt_def',
  hotel: (t) => t === 'receipt_hotel',
  food: (t) => t === 'receipt_food',
  repair: (t) => t === 'receipt_other' || t === 'part_invoice',
  trips: (t) => t === 'trip_rateconf' || t === 'trip_bol',
  other: (t) => t === 'other',
}

const DOC_TYPE_ICON = {
  receipt_fuel: '\u26FD',
  receipt_def: '\uD83E\uDDEA',
  receipt_hotel: '\uD83C\uDFE8',
  receipt_food: '\uD83C\uDF54',
  receipt_other: '\uD83D\uDD27',
  part_invoice: '\uD83D\uDD27',
  trip_rateconf: '\uD83D\uDE9A',
  trip_bol: '\uD83D\uDCCB',
  other: '\uD83D\uDCC4',
}

function formatMoney(amount, currency) {
  if (amount == null) return ''
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  const cur = currency || 'USD'
  const symbol = cur === 'USD' ? '$' : cur === 'EUR' ? '\u20AC' : cur === 'RUB' ? '\u20BD' : cur + ' '
  return symbol === '$' || symbol === '\u20AC' ? symbol + n.toFixed(2) : n.toFixed(2) + ' ' + cur
}

function formatShortDate(iso, locale) {
  if (!iso) return ''
  try {
    const d = new Date(iso + 'T00:00:00')
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString(locale || 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

function monthKey(iso) {
  if (iso && /^\d{4}-\d{2}/.test(iso)) return iso.slice(0, 7)
  return '0000-00'
}

function monthLabel(key, t, locale) {
  if (!key || key === '0000-00') return t('archive.noDate') || 'No date'
  const [y, m] = key.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  try {
    const fmt = date.toLocaleDateString(locale || 'en-US', { month: 'long', year: 'numeric' })
    return fmt.charAt(0).toUpperCase() + fmt.slice(1)
  } catch {
    return key
  }
}

function yearsOrMonthsUntil(isoDate, t) {
  if (!isoDate) return ''
  try {
    const target = new Date(isoDate + 'T00:00:00')
    const now = new Date()
    const diffMs = target.getTime() - now.getTime()
    if (diffMs <= 0) return t('archive.expired') || 'expired'
    const days = Math.floor(diffMs / (24 * 3600 * 1000))
    if (days < 60) return (t('archive.daysLeft') || 'd left').replace('{n}', String(days))
    const months = Math.floor(days / 30)
    if (months < 18) return (t('archive.monthsLeft') || 'mo left').replace('{n}', String(months))
    const years = Math.floor(days / 365)
    return (t('archive.yearsLeft') || 'yr left').replace('{n}', String(years))
  } catch {
    return ''
  }
}

function getLocaleFromLang(lang) {
  const map = { ru: 'ru-RU', en: 'en-US', uk: 'uk-UA', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', tr: 'tr-TR', pl: 'pl-PL' }
  return map[lang] || 'en-US'
}

export default function ArchiveScreen({ userId, onBack, onNavigate }) {
  const { t, lang } = useLanguage()
  const locale = getLocaleFromLang(lang)

  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedDoc, setSelectedDoc] = useState(null)

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('documents_archive')
        .select('*')
        .eq('user_id', userId)
        .order('document_date', { ascending: false, nullsFirst: false })
        .order('scanned_at', { ascending: false })
      if (error) {
        console.error('[archive] load error:', error)
        setDocs([])
      } else {
        setDocs(data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  const filteredDocs = useMemo(() => {
    const pred = FILTER_PREDS[filter] || FILTER_PREDS.all
    return docs.filter(d => pred(d.doc_type))
  }, [docs, filter])

  // Group filtered docs by month
  const groups = useMemo(() => {
    const map = new Map()
    filteredDocs.forEach(d => {
      const k = monthKey(d.document_date || d.scanned_at?.slice(0, 10))
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(d)
    })
    const arr = Array.from(map.entries()).map(([key, items]) => {
      const total = items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0)
      return { key, items, total, currency: items[0]?.currency || 'USD' }
    })
    arr.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    return arr
  }, [filteredDocs])

  const CHIPS = [
    { key: 'all', label: t('archive.chipAll') || 'All' },
    { key: 'fuel', label: '\u26FD ' + (t('archive.chipFuel') || 'Fuel') },
    { key: 'def', label: '\uD83E\uDDEA ' + (t('archive.chipDef') || 'DEF') },
    { key: 'hotel', label: '\uD83C\uDFE8 ' + (t('archive.chipHotel') || 'Hotels') },
    { key: 'food', label: '\uD83C\uDF54 ' + (t('archive.chipFood') || 'Food') },
    { key: 'repair', label: '\uD83D\uDD27 ' + (t('archive.chipRepair') || 'Repair') },
    { key: 'trips', label: '\uD83D\uDE9A ' + (t('archive.chipTrips') || 'Trips') },
    { key: 'other', label: '\uD83D\uDCC4 ' + (t('archive.chipOther') || 'Other') },
  ]

  const totalCount = docs.length

  return (
    <>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: 'var(--text)',
          fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          padding: '0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        {'\u2190 ' + (t('common.back') || 'Back')}
      </button>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
          {'\uD83D\uDCC1 ' + (t('archive.title') || 'Document archive')}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--dim)' }}>
          {(t('archive.totalDocs') || 'total {n} documents').replace('{n}', String(totalCount))}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '8px',
        marginBottom: '16px',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {CHIPS.map(chip => {
          const active = filter === chip.key
          return (
            <button
              key={chip.key}
              onClick={() => setFilter(chip.key)}
              style={{
                padding: '8px 14px',
                borderRadius: '20px',
                border: active ? 'none' : '1px solid var(--border)',
                background: active ? '#f59e0b' : 'var(--card2)',
                color: active ? '#fff' : 'var(--text)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
          {t('common.loading') || 'Loading...'}
        </div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--dim)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>{'\uD83D\uDCC1'}</div>
          <div style={{ fontSize: '14px', lineHeight: '1.5', maxWidth: '320px', margin: '0 auto' }}>
            {t('archive.empty') || 'No documents yet. Start scanning receipts and invoices with the AI Scanner — they will be saved here automatically.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {groups.map(group => (
            <div key={group.key}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '10px',
              }}>
                {monthLabel(group.key, t, locale) + ' (' +
                  group.items.length + ' \u00B7 ' + formatMoney(group.total, group.currency) + ')'}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '10px',
              }}>
                {group.items.map(doc => (
                  <DocCard key={doc.id} doc={doc} onClick={() => setSelectedDoc(doc)} locale={locale} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDoc && (
        <DocumentDetailModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onDeleted={(id) => {
            setDocs(prev => prev.filter(d => d.id !== id))
            setSelectedDoc(null)
          }}
          onNavigate={onNavigate}
          locale={locale}
        />
      )}
    </>
  )
}

function DocCard({ doc, onClick, locale }) {
  const icon = DOC_TYPE_ICON[doc.doc_type] || '\uD83D\uDCC4'
  const vendor = doc.vendor_name || ''
  return (
    <div
      onClick={onClick}
      style={{
        ...cardStyle,
        cursor: 'pointer',
        padding: '0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        background: 'var(--card2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {doc.photo_url ? (
          <img
            src={doc.photo_url}
            alt={vendor || 'doc'}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ fontSize: '40px' }}>{icon}</div>
        )}
        <div style={{
          position: 'absolute',
          top: 6, right: 6,
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          borderRadius: '6px',
          padding: '2px 6px',
          fontSize: '14px',
        }}>{icon}</div>
      </div>
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {vendor || '\u2014'}
        </div>
        {doc.amount != null && (
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b', marginTop: '2px' }}>
            {formatMoney(doc.amount, doc.currency)}
          </div>
        )}
        <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
          {formatShortDate(doc.document_date, locale)}
        </div>
      </div>
    </div>
  )
}

const LINK_TARGETS = {
  vehicle_expenses: { navTab: 'vehicle_expenses', labelKey: 'archive.openVehicleExpense' },
  byt_expenses: { navTab: 'personal_expenses', labelKey: 'archive.openPersonalExpense' },
  fuel_entries: { navTab: 'fuel_analytics', labelKey: 'archive.openFuel' },
  trips: { navTab: 'trips', labelKey: 'archive.openTrip' },
  part_resources: { navTab: 'service_resources', labelKey: 'archive.openPartResource' },
  service_records: { navTab: 'service', labelKey: 'archive.openServiceRecord' },
}

function DocumentDetailModal({ doc, onClose, onDeleted, onNavigate, locale }) {
  const { t } = useLanguage()
  const [deleting, setDeleting] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const handleDelete = async () => {
    if (!confirm(t('archive.confirmDelete') || 'Delete this document from archive?')) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('documents_archive')
        .delete()
        .eq('id', doc.id)
      if (error) {
        console.error('[archive] delete error:', error)
        alert(t('common.error') || 'Error')
        setDeleting(false)
        return
      }
      onDeleted?.(doc.id)
    } catch (err) {
      console.error('[archive] delete unexpected:', err)
      setDeleting(false)
    }
  }

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: doc.vendor_name || 'Document',
          text: doc.vendor_name || '',
          url: doc.photo_url,
        })
      } else if (doc.photo_url) {
        await navigator.clipboard?.writeText(doc.photo_url)
        alert(t('archive.linkCopied') || 'Link copied')
      }
    } catch (e) {
      // user cancelled or unsupported
    }
  }

  const handleOpenLinked = () => {
    if (!onNavigate || !doc.linked_table) return
    const target = LINK_TARGETS[doc.linked_table]
    if (!target) return
    onNavigate(target.navTab, { highlightId: doc.linked_id })
    onClose?.()
  }

  const linkTarget = doc.linked_table ? LINK_TARGETS[doc.linked_table] : null

  const DOC_TYPE_LABELS = {
    receipt_fuel: t('archive.typeFuel') || 'Fuel receipt',
    receipt_def: t('archive.typeDef') || 'DEF receipt',
    receipt_hotel: t('archive.typeHotel') || 'Hotel receipt',
    receipt_food: t('archive.typeFood') || 'Food receipt',
    receipt_other: t('archive.typeOtherReceipt') || 'Other receipt',
    part_invoice: t('archive.typePartInvoice') || 'Part invoice',
    trip_rateconf: t('archive.typeRateconf') || 'Rate confirmation',
    trip_bol: t('archive.typeBol') || 'BOL',
    other: t('archive.typeOther') || 'Other',
  }

  const retentionStr = doc.retention_until
    ? formatShortDate(doc.retention_until, locale) + ' (' + yearsOrMonthsUntil(doc.retention_until, t) + ')'
    : '\u2014'

  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '13px', color: 'var(--dim)', flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value || '\u2014'}</div>
    </div>
  )

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--card)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            maxHeight: '92vh',
            overflow: 'auto',
            padding: '16px',
          }}
        >
          {/* Photo */}
          {doc.photo_url && (
            <div
              onClick={() => setFullscreen(true)}
              style={{
                width: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                marginBottom: '16px',
                background: 'var(--card2)',
                cursor: 'zoom-in',
              }}
            >
              <img
                src={doc.photo_url}
                alt={doc.vendor_name || 'doc'}
                style={{ width: '100%', display: 'block', maxHeight: '50vh', objectFit: 'contain' }}
              />
            </div>
          )}

          {/* Fields */}
          <div style={{ marginBottom: '16px' }}>
            {row('\uD83C\uDFEA ' + (t('archive.vendor') || 'Vendor'), doc.vendor_name)}
            {row('\uD83D\uDCC5 ' + (t('archive.date') || 'Date'), formatShortDate(doc.document_date, locale))}
            {row('\uD83D\uDCB2 ' + (t('archive.amount') || 'Amount'), doc.amount != null ? formatMoney(doc.amount, doc.currency) : null)}
            {row('\uD83D\uDCC4 ' + (t('archive.docNumber') || 'Number'), doc.document_number)}
            {row('\uD83C\uDFF7 ' + (t('archive.docType') || 'Type'), DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type)}
            {row('\u23F3 ' + (t('archive.retention') || 'Keep until'), retentionStr)}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {linkTarget && doc.linked_id && onNavigate && (
              <button
                onClick={handleOpenLinked}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {(t(linkTarget.labelKey) || 'Open linked record') + ' \u2192'}
              </button>
            )}
            <button
              onClick={handleShare}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {'\uD83D\uDCE4 ' + (t('archive.share') || 'Share')}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #ef444440',
                background: '#ef444415',
                color: '#ef4444',
                fontSize: '14px',
                fontWeight: 600,
                cursor: deleting ? 'wait' : 'pointer',
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {'\uD83D\uDDD1 ' + (deleting ? (t('common.loading') || 'Loading...') : (t('archive.delete') || 'Delete'))}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--dim)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('common.cancel') || 'Close'}
            </button>
          </div>
        </div>
      </div>

      {fullscreen && doc.photo_url && (
        <div
          onClick={() => setFullscreen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            zIndex: 1002,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={doc.photo_url}
            alt={doc.vendor_name || 'doc'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      )}
    </>
  )
}
