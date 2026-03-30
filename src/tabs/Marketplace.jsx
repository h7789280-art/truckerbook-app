import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchAdCategories, fetchAds, fetchAdById, trackAdClick } from '../lib/api'
import { useLanguage } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'

const DEFAULT_CENTERS = {
  RU: [55.7558, 37.6173],
  US: [39.8283, -98.5795],
  UA: [50.4501, 30.5234],
  BY: [53.9006, 27.5590],
  KZ: [51.1694, 71.4491],
}

export default function Marketplace() {
  const { theme } = useTheme()
  const { t, lang } = useLanguage()
  const [categories, setCategories] = useState([])
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedAd, setSelectedAd] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])

  const country = localStorage.getItem('truckerbook_country') || 'RU'

  const loadCategories = useCallback(async () => {
    try {
      const data = await fetchAdCategories()
      setCategories(data)
    } catch (err) {
      console.error('Failed to load ad categories:', err)
    }
  }, [])

  const loadAds = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchAds(country, selectedCategory === 'all' ? null : selectedCategory)
      setAds(data)
    } catch (err) {
      console.error('Failed to load ads:', err)
    } finally {
      setLoading(false)
    }
  }, [country, selectedCategory])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  useEffect(() => {
    loadAds()
  }, [loadAds])

  const getUserId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id || null
    } catch {
      return null
    }
  }

  const openDetail = async (ad) => {
    setDetailLoading(true)
    try {
      const full = await fetchAdById(ad.id)
      setSelectedAd(full || ad)
      const userId = await getUserId()
      await trackAdClick(ad.id, userId, 'view')
    } catch (err) {
      console.error('Failed to load ad detail:', err)
      setSelectedAd(ad)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCall = async (ad) => {
    const userId = await getUserId()
    await trackAdClick(ad.id, userId, 'call').catch(() => {})
    window.location.href = 'tel:' + ad.contact_phone
  }

  const handleWebsite = async (ad) => {
    const userId = await getUserId()
    await trackAdClick(ad.id, userId, 'website').catch(() => {})
    window.open(ad.contact_url, '_blank', 'noopener')
  }

  const getCategoryDisplay = (key) => {
    const cat = categories.find(c => c.key === key)
    if (!cat) return key
    const name = (lang === 'en' || lang === 'us') ? (cat.name_en || cat.name_ru) : (cat.name_ru || cat.name_en)
    return (cat.icon ? cat.icon + ' ' : '') + name
  }

  const getCategoryName = (cat) => {
    return (lang === 'en' || lang === 'us') ? (cat.name_en || cat.name_ru) : (cat.name_ru || cat.name_en)
  }

  const getCategoryIcon = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId)
    return cat?.icon || '\uD83D\uDCCD'
  }

  // Map initialization
  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current) return
    let cancelled = false

    const initMap = async () => {
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !mapContainerRef.current) return

      // Cleanup previous map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      const countryCenter = DEFAULT_CENTERS[country] || DEFAULT_CENTERS.RU
      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView(countryCenter, 5)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '\u00a9 OpenStreetMap',
      }).addTo(map)
      L.control.zoom({ position: 'topright' }).addTo(map)
      mapInstanceRef.current = map

      // Try geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled && mapInstanceRef.current) {
              mapInstanceRef.current.setView([pos.coords.latitude, pos.coords.longitude], 10)
            }
          },
          () => {},
          { timeout: 5000 }
        )
      }

      // Add markers
      const geoAds = ads.filter(a => a.latitude && a.longitude)
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []

      geoAds.forEach(ad => {
        const icon = getCategoryIcon(ad.category_id)
        const markerIcon = L.divIcon({
          className: '',
          html: '<div style="width:36px;height:36px;border-radius:50%;background:' + theme.card + ';display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #f59e0b;">' + icon + '</div>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        })

        const catDisplay = getCategoryDisplay(categories.find(c => c.id === ad.category_id)?.key)
        const popupHtml = '<div style="min-width:180px;font-family:-apple-system,sans-serif;">' +
          '<b style="font-size:14px;">' + (ad.title || '').replace(/</g, '&lt;') + '</b><br/>' +
          '<span style="font-size:12px;color:#888;">' + (catDisplay || '').replace(/</g, '&lt;') + '</span><br/>' +
          (ad.location ? '<span style="font-size:12px;">\uD83D\uDCCD ' + ad.location.replace(/</g, '&lt;') + '</span><br/>' : '') +
          '<button onclick="window.__marketplaceOpenAd__(\'' + ad.id + '\')" style="margin-top:6px;padding:6px 14px;border:none;border-radius:8px;background:#f59e0b;color:#000;font-weight:600;font-size:13px;cursor:pointer;">' + t('marketplace.details') + '</button>' +
          '</div>'

        const marker = L.marker([ad.latitude, ad.longitude], { icon: markerIcon }).addTo(map)
        marker.bindPopup(popupHtml)
        markersRef.current.push(marker)
      })

      // Fit bounds if markers exist
      if (geoAds.length > 0) {
        const bounds = L.latLngBounds(geoAds.map(a => [a.latitude, a.longitude]))
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [viewMode, ads, categories, country, theme.card])

  // Global handler for popup "Details" button
  useEffect(() => {
    window.__marketplaceOpenAd__ = (adId) => {
      const ad = ads.find(a => a.id === adId)
      if (ad) openDetail(ad)
    }
    return () => { delete window.__marketplaceOpenAd__ }
  }, [ads])

  // Detail view
  if (selectedAd) {
    return (
      <div style={{ padding: '16px 16px 100px' }}>
        <button
          onClick={() => setSelectedAd(null)}
          style={{
            background: 'none', border: 'none', color: '#f59e0b',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            padding: '4px 0', marginBottom: 16, display: 'flex',
            alignItems: 'center', gap: 6,
          }}
        >
          {'\u2190'} {t('common.back')}
        </button>

        {selectedAd.image_url && (
          <div style={{
            width: '100%', height: 220, borderRadius: 14, overflow: 'hidden',
            marginBottom: 16,
          }}>
            <img
              src={selectedAd.image_url}
              alt={selectedAd.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}

        {selectedAd.is_premium && (
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 700,
            padding: '3px 10px', borderRadius: 10,
            background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b',
            marginBottom: 12,
          }}>
            {'\u2B50'} {t('marketplace.premium')}
          </span>
        )}

        <h2 style={{
          fontSize: 20, fontWeight: 700, color: theme.text,
          margin: '0 0 8px', lineHeight: 1.3,
        }}>
          {selectedAd.title}
        </h2>

        <div style={{
          fontSize: 13, color: '#f59e0b', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {getCategoryDisplay(selectedAd.category_id ? categories.find(c => c.id === selectedAd.category_id)?.key : null)}
        </div>

        {selectedAd.location && (
          <div style={{
            fontSize: 14, color: theme.dim, marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {'\uD83D\uDCCD'} {selectedAd.location}
          </div>
        )}

        <p style={{
          fontSize: 15, color: theme.text, lineHeight: 1.6,
          margin: '0 0 20px', whiteSpace: 'pre-wrap',
        }}>
          {selectedAd.description}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selectedAd.contact_phone && (
            <button
              onClick={() => handleCall(selectedAd)}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                background: '#22c55e', border: 'none', color: '#fff',
                fontSize: 16, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {'\uD83D\uDCDE'} {t('marketplace.call')}
            </button>
          )}

          {selectedAd.contact_url && (
            <button
              onClick={() => handleWebsite(selectedAd)}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                background: '#3b82f6', border: 'none', color: '#fff',
                fontSize: 16, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {'\uD83C\uDF10'} {t('marketplace.website')}
            </button>
          )}
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  // Main view
  return (
    <div style={{ padding: '16px 16px 100px' }}>
      {/* View mode toggle */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 12, borderRadius: 10,
        overflow: 'hidden', border: '1px solid ' + theme.border,
      }}>
        {['list', 'map'].map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              flex: 1, padding: '10px 0', border: 'none',
              background: viewMode === mode ? '#f59e0b' : theme.card,
              color: viewMode === mode ? '#000' : theme.text,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {mode === 'list' ? '\uD83D\uDCC4 ' + t('marketplace.viewList') : '\uD83D\uDDFA\uFE0F ' + t('marketplace.viewMap')}
          </button>
        ))}
      </div>

      {/* Category filters */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12,
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        <button
          onClick={() => setSelectedCategory('all')}
          style={{
            flexShrink: 0, padding: '8px 16px', borderRadius: 20,
            border: selectedCategory === 'all' ? 'none' : '1px solid ' + theme.border,
            background: selectedCategory === 'all' ? '#f59e0b' : theme.card,
            color: selectedCategory === 'all' ? '#000' : theme.text,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {t('marketplace.catAll')}
        </button>
        {categories.map(cat => {
          const isActive = selectedCategory === cat.key
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.key)}
              style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 20,
                border: isActive ? 'none' : '1px solid ' + theme.border,
                background: isActive ? '#f59e0b' : theme.card,
                color: isActive ? '#000' : theme.text,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {cat.icon} {getCategoryName(cat)}
            </button>
          )
        })}
      </div>

      {/* Map view */}
      {viewMode === 'map' && (
        <>
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: theme.dim }}>
              <div style={{
                width: 32, height: 32, border: '3px solid ' + theme.border,
                borderTopColor: '#f59e0b', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
              }} />
              {t('marketplace.loading')}
            </div>
          )}
          {!loading && ads.filter(a => a.latitude && a.longitude).length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
            }}>
              <span style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDDFA\uFE0F'}</span>
              <p style={{ fontSize: 18, fontWeight: 600, color: theme.text }}>
                {t('marketplace.noAdsOnMap')}
              </p>
              <p style={{ fontSize: 14, color: theme.dim, marginTop: 8 }}>
                {t('marketplace.noAdsOnMapSub')}
              </p>
            </div>
          )}
          {!loading && (
            <div
              ref={mapContainerRef}
              style={{
                width: '100%', height: 'calc(100vh - 240px)', minHeight: 300,
                borderRadius: 14, overflow: 'hidden',
                border: '1px solid ' + theme.border,
              }}
            />
          )}
        </>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <>
          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: theme.dim }}>
              <div style={{
                width: 32, height: 32, border: '3px solid ' + theme.border,
                borderTopColor: '#f59e0b', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
              }} />
              {t('marketplace.loading')}
            </div>
          )}

          {/* Empty state */}
          {!loading && ads.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
            }}>
              <span style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCE2'}</span>
              <p style={{ fontSize: 18, fontWeight: 600, color: theme.text }}>
                {t('marketplace.noAds')}
              </p>
              <p style={{ fontSize: 14, color: theme.dim, marginTop: 8 }}>
                {t('marketplace.noAdsSub')}
              </p>
            </div>
          )}

          {/* Ads list */}
          {!loading && ads.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ads.map(ad => {
                const catObj = categories.find(c => c.id === ad.category_id)
                return (
                  <div
                    key={ad.id}
                    onClick={() => openDetail(ad)}
                    style={{
                      background: theme.card,
                      borderRadius: 14,
                      border: ad.is_premium
                        ? '2px solid #f59e0b'
                        : '1px solid ' + theme.border,
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                  >
                    {ad.image_url && (
                      <div style={{
                        width: '100%', height: 160,
                        backgroundImage: 'url(' + ad.image_url + ')',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }} />
                    )}

                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {ad.is_premium && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px',
                            borderRadius: 10, background: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b', whiteSpace: 'nowrap',
                          }}>
                            {'\u2B50'} {t('marketplace.premium')}
                          </span>
                        )}
                        {catObj && (
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: theme.dim,
                            whiteSpace: 'nowrap',
                          }}>
                            {catObj.icon} {getCategoryName(catObj)}
                          </span>
                        )}
                      </div>

                      <p style={{
                        fontSize: 16, fontWeight: 700, color: theme.text,
                        margin: '0 0 4px', lineHeight: 1.3,
                      }}>
                        {ad.title}
                      </p>

                      {ad.description && (
                        <p style={{
                          fontSize: 13, color: theme.dim, margin: '0 0 6px',
                          lineHeight: 1.4, display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {ad.description}
                        </p>
                      )}

                      {ad.location && (
                        <div style={{
                          fontSize: 12, color: theme.dim,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          {'\uD83D\uDCCD'} {ad.location}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
