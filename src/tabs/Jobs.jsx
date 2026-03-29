import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchJobs, applyToJob, checkApplication, toggleBookmark, getBookmarks, getMyResume, createResume, updateResume } from '../lib/api'
import { useLanguage, getCurrencySymbol } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { useAuth } from '../hooks/useAuth'

const CDL_OPTIONS = ['B', 'C', 'CE', 'D', 'CDL-A', 'CDL-B']
const JOB_TYPE_OPTIONS = ['otr', 'regional', 'local', 'dedicated']
const TRUCK_TYPE_KEYS = ['tent', 'reefer', 'flatbed', 'tanker', 'container']

const COUNTRY_FLAGS = {
  RU: '\uD83C\uDDF7\uD83C\uDDFA',
  US: '\uD83C\uDDFA\uD83C\uDDF8',
  UA: '\uD83C\uDDFA\uD83C\uDDE6',
  BY: '\uD83C\uDDE7\uD83C\uDDFE',
  KZ: '\uD83C\uDDF0\uD83C\uDDFF',
  UZ: '\uD83C\uDDFA\uD83C\uDDFF',
  DE: '\uD83C\uDDE9\uD83C\uDDEA',
  FR: '\uD83C\uDDEB\uD83C\uDDF7',
  ES: '\uD83C\uDDEA\uD83C\uDDF8',
  TR: '\uD83C\uDDF9\uD83C\uDDF7',
  PL: '\uD83C\uDDF5\uD83C\uDDF1',
}

const SALARY_PERIOD_KEYS = {
  month: 'perMonth',
  week: 'perWeek',
  mile: 'perMile',
  trip: 'perTrip',
}

const HOME_TIME_KEYS = {
  daily: 'homeDaily',
  weekly: 'homeWeekly',
  biweekly: 'homeBiweekly',
  monthly: 'homeMonthly',
}

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export default function Jobs({ refreshKey }) {
  const { t } = useLanguage()
  const { theme } = useTheme()
  const { session } = useAuth()
  const cs = getCurrencySymbol()
  const userId = session?.user?.id

  const JOB_TYPES = useMemo(() => [
    { key: 'all', label: t('jobs.all') },
    { key: 'otr', label: t('jobs.otr') },
    { key: 'regional', label: t('jobs.regional') },
    { key: 'local', label: t('jobs.local') },
    { key: 'dedicated', label: t('jobs.dedicated') },
  ], [t])

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedJob, setSelectedJob] = useState(null)
  const [hasApplied, setHasApplied] = useState(false)
  const [applying, setApplying] = useState(false)
  const [bookmarkedIds, setBookmarkedIds] = useState([])

  // Resume state
  const [showResume, setShowResume] = useState(false)
  const [resume, setResume] = useState(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeEditing, setResumeEditing] = useState(false)
  const [resumeSaving, setResumeSaving] = useState(false)
  const [resumeSavedMsg, setResumeSavedMsg] = useState(false)
  const [resumeForm, setResumeForm] = useState({
    title: '', about: '', cdl_category: '', experience_years: '',
    preferred_type: '', preferred_salary: '', city: '',
    has_own_truck: false, truck_types: '', hazmat: false, is_public: true,
  })

  const country = useMemo(() => {
    try { return localStorage.getItem('truckerbook_country') || null } catch { return null }
  }, [])

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchJobs(country, filter)
      setJobs(data)
    } catch (err) {
      console.error('Failed to load jobs:', err)
    } finally {
      setLoading(false)
    }
  }, [country, filter])

  useEffect(() => {
    loadJobs()
  }, [loadJobs, refreshKey])

  useEffect(() => {
    if (userId) {
      getBookmarks(userId).then(setBookmarkedIds).catch(() => {})
    }
  }, [userId])

  const openDetail = useCallback(async (job) => {
    setSelectedJob(job)
    setHasApplied(false)
    if (userId) {
      try {
        const applied = await checkApplication(job.id, userId)
        setHasApplied(applied)
      } catch { /* ignore */ }
    }
  }, [userId])

  const handleApply = useCallback(async () => {
    if (!userId || !selectedJob || hasApplied || applying) return
    try {
      setApplying(true)
      await applyToJob(selectedJob.id, userId)
      setHasApplied(true)
    } catch (err) {
      console.error('Apply error:', err)
    } finally {
      setApplying(false)
    }
  }, [userId, selectedJob, hasApplied, applying])

  const handleToggleBookmark = useCallback(async (jobId) => {
    if (!userId) return
    try {
      const isNowBookmarked = await toggleBookmark(userId, jobId)
      setBookmarkedIds(prev =>
        isNowBookmarked
          ? [...prev, jobId]
          : prev.filter(id => id !== jobId)
      )
    } catch (err) {
      console.error('Bookmark error:', err)
    }
  }, [userId])

  // --- Resume handlers ---
  const openResume = useCallback(async () => {
    setShowResume(true)
    setResumeLoading(true)
    setResumeEditing(false)
    setResumeSavedMsg(false)
    try {
      const data = await getMyResume(userId)
      setResume(data)
      if (data) {
        setResumeForm({
          title: data.title || '',
          about: data.about || '',
          cdl_category: data.cdl_category || '',
          experience_years: data.experience_years || '',
          preferred_type: data.preferred_type || '',
          preferred_salary: data.preferred_salary || '',
          city: data.city || '',
          has_own_truck: data.has_own_truck || false,
          truck_types: data.truck_types || '',
          hazmat: data.hazmat || false,
          is_public: data.is_public !== false,
        })
      } else {
        setResumeEditing(true)
        setResumeForm({
          title: '', about: '', cdl_category: '', experience_years: '',
          preferred_type: '', preferred_salary: '', city: '',
          has_own_truck: false, truck_types: '', hazmat: false, is_public: true,
        })
      }
    } catch (err) {
      console.error('Resume load error:', err)
    } finally {
      setResumeLoading(false)
    }
  }, [userId])

  const handleSaveResume = useCallback(async () => {
    if (resumeSaving) return
    setResumeSaving(true)
    setResumeSavedMsg(false)
    try {
      const truckTypesStr = Array.isArray(resumeForm.truck_types)
        ? resumeForm.truck_types.join(',')
        : resumeForm.truck_types
      const payload = { ...resumeForm, truck_types: truckTypesStr }
      if (resume) {
        const updated = await updateResume(resume.id, payload)
        setResume(updated)
      } else {
        const created = await createResume(payload)
        setResume(created)
      }
      setResumeEditing(false)
      setResumeSavedMsg(true)
      setTimeout(() => setResumeSavedMsg(false), 3000)
    } catch (err) {
      console.error('Resume save error:', err)
    } finally {
      setResumeSaving(false)
    }
  }, [resume, resumeForm, resumeSaving])

  const toggleTruckType = useCallback((key) => {
    setResumeForm(prev => {
      const current = typeof prev.truck_types === 'string'
        ? prev.truck_types.split(',').filter(Boolean)
        : (prev.truck_types || [])
      const next = current.includes(key)
        ? current.filter(k => k !== key)
        : [...current, key]
      return { ...prev, truck_types: next }
    })
  }, [])

  const truckTypeLabels = useMemo(() => ({
    tent: t('jobs.typeTent'),
    reefer: t('jobs.typeReefer'),
    flatbed: t('jobs.typeFlatbed'),
    tanker: t('jobs.typeTanker'),
    container: t('jobs.typeContainer'),
  }), [t])

  const jobTypeLabelsMap = useMemo(() => ({
    otr: t('jobs.otr'),
    regional: t('jobs.regional'),
    local: t('jobs.local'),
    dedicated: t('jobs.dedicated'),
  }), [t])

  const salaryText = (job) => {
    const periodKey = SALARY_PERIOD_KEYS[job.salary_period] || 'perMonth'
    const period = t('jobs.' + periodKey)
    if (job.salary_min && job.salary_max) {
      return t('jobs.salaryFrom') + ' ' + formatNumber(job.salary_min) + ' ' + t('jobs.salaryTo') + ' ' + formatNumber(job.salary_max) + ' ' + cs + period
    }
    if (job.salary_min) {
      return t('jobs.salaryFrom') + ' ' + formatNumber(job.salary_min) + ' ' + cs + period
    }
    if (job.salary_max) {
      return t('jobs.salaryTo') + ' ' + formatNumber(job.salary_max) + ' ' + cs + period
    }
    return null
  }

  // --- Resume view ---
  if (showResume) {
    const currentTruckTypes = typeof resumeForm.truck_types === 'string'
      ? resumeForm.truck_types.split(',').filter(Boolean)
      : (resumeForm.truck_types || [])

    const inputStyle = {
      width: '100%', padding: '12px 14px', borderRadius: 10,
      border: '1px solid ' + theme.border, background: theme.card,
      color: theme.text, fontSize: 15, boxSizing: 'border-box',
    }
    const labelStyle = {
      fontSize: 13, color: theme.dim, fontWeight: 600, marginBottom: 4, display: 'block',
    }

    return (
      <div style={{ padding: '16px 16px 100px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <button
            onClick={() => { setShowResume(false); setResumeEditing(false); setResumeSavedMsg(false) }}
            style={{
              background: 'none', border: 'none', color: '#f59e0b',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {'\u2190'} {t('jobs.back')}
          </button>
          {resume && !resumeEditing && (
            <button
              onClick={() => setResumeEditing(true)}
              style={{
                background: 'none', border: '1px solid #f59e0b', color: '#f59e0b',
                borderRadius: 8, padding: '6px 14px', fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('jobs.editResume')}
            </button>
          )}
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 16px', color: theme.text }}>
          {t('jobs.resumeTitle')}
        </h2>

        {/* Saved message */}
        {resumeSavedMsg && (
          <div style={{
            background: '#22c55e22', border: '1px solid #22c55e', borderRadius: 10,
            padding: '10px 14px', marginBottom: 16, color: '#22c55e',
            fontSize: 14, fontWeight: 600, textAlign: 'center',
          }}>
            {t('jobs.resumeSaved')}
          </div>
        )}

        {resumeLoading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: theme.dim, fontSize: 15 }}>
            {t('jobs.loading')}
          </div>
        )}

        {/* View mode (resume exists, not editing) */}
        {!resumeLoading && resume && !resumeEditing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              background: theme.card, borderRadius: 14, border: '1px solid ' + theme.border,
              padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: theme.text, margin: 0 }}>
                {resume.title}
              </h3>
              {resume.about && (
                <p style={{ fontSize: 14, color: theme.dim, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {resume.about}
                </p>
              )}
              {resume.cdl_category && <InfoRow label={t('jobs.cdlField')} theme={theme}>{resume.cdl_category}</InfoRow>}
              {resume.experience_years > 0 && <InfoRow label={t('jobs.experienceField')} theme={theme}>{resume.experience_years} {t('jobs.yearsShort')}</InfoRow>}
              {resume.preferred_type && <InfoRow label={t('jobs.preferredType')} theme={theme}>{jobTypeLabelsMap[resume.preferred_type] || resume.preferred_type}</InfoRow>}
              {resume.preferred_salary > 0 && <InfoRow label={t('jobs.preferredSalary')} theme={theme}>{formatNumber(resume.preferred_salary)} {cs}</InfoRow>}
              {resume.city && <InfoRow label={t('jobs.cityField')} theme={theme}>{resume.city}</InfoRow>}
              <InfoRow label={t('jobs.hasOwnTruck')} theme={theme}>{resume.has_own_truck ? t('jobs.truckYes') : t('jobs.truckNo')}</InfoRow>
              {resume.truck_types && (
                <InfoRow label={t('jobs.truckTypesField')} theme={theme}>
                  {resume.truck_types.split(',').filter(Boolean).map(k => truckTypeLabels[k] || k).join(', ')}
                </InfoRow>
              )}
              <InfoRow label={t('jobs.hazmatField')} theme={theme}>{resume.hazmat ? t('jobs.truckYes') : t('jobs.truckNo')}</InfoRow>
              <InfoRow label={t('jobs.visibilityField')} theme={theme}>{resume.is_public ? t('jobs.truckYes') : t('jobs.truckNo')}</InfoRow>
            </div>
          </div>
        )}

        {/* Edit / Create form */}
        {!resumeLoading && (resumeEditing || !resume) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Title */}
            <div>
              <label style={labelStyle}>{t('jobs.resumeTitleField')}</label>
              <input
                type="text"
                value={resumeForm.title}
                onChange={e => setResumeForm(p => ({ ...p, title: e.target.value }))}
                placeholder={t('jobs.resumeTitlePlaceholder')}
                style={inputStyle}
              />
            </div>

            {/* About */}
            <div>
              <label style={labelStyle}>{t('jobs.aboutField')}</label>
              <textarea
                value={resumeForm.about}
                onChange={e => setResumeForm(p => ({ ...p, about: e.target.value }))}
                placeholder={t('jobs.aboutPlaceholder')}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {/* CDL category */}
            <div>
              <label style={labelStyle}>{t('jobs.cdlField')}</label>
              <select
                value={resumeForm.cdl_category}
                onChange={e => setResumeForm(p => ({ ...p, cdl_category: e.target.value }))}
                style={inputStyle}
              >
                <option value="">{t('jobs.selectCdl')}</option>
                {CDL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Experience */}
            <div>
              <label style={labelStyle}>{t('jobs.experienceField')}</label>
              <input
                type="number"
                min="0"
                value={resumeForm.experience_years}
                onChange={e => setResumeForm(p => ({ ...p, experience_years: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {/* Preferred type */}
            <div>
              <label style={labelStyle}>{t('jobs.preferredType')}</label>
              <select
                value={resumeForm.preferred_type}
                onChange={e => setResumeForm(p => ({ ...p, preferred_type: e.target.value }))}
                style={inputStyle}
              >
                <option value="">{t('jobs.selectType')}</option>
                {JOB_TYPE_OPTIONS.map(jt => (
                  <option key={jt} value={jt}>{jobTypeLabelsMap[jt]}</option>
                ))}
              </select>
            </div>

            {/* Preferred salary */}
            <div>
              <label style={labelStyle}>{t('jobs.preferredSalary')}</label>
              <input
                type="number"
                min="0"
                value={resumeForm.preferred_salary}
                onChange={e => setResumeForm(p => ({ ...p, preferred_salary: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {/* City */}
            <div>
              <label style={labelStyle}>{t('jobs.cityField')}</label>
              <input
                type="text"
                value={resumeForm.city}
                onChange={e => setResumeForm(p => ({ ...p, city: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {/* Has own truck */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              fontSize: 15, color: theme.text,
            }}>
              <input
                type="checkbox"
                checked={resumeForm.has_own_truck}
                onChange={e => setResumeForm(p => ({ ...p, has_own_truck: e.target.checked }))}
                style={{ width: 20, height: 20, accentColor: '#f59e0b' }}
              />
              {t('jobs.hasOwnTruck')}
            </label>

            {/* Truck types (multi-checkbox) */}
            <div>
              <label style={labelStyle}>{t('jobs.truckTypesField')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {TRUCK_TYPE_KEYS.map(key => {
                  const isActive = currentTruckTypes.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleTruckType(key)}
                      style={{
                        padding: '7px 14px', borderRadius: 18,
                        border: isActive ? '2px solid #f59e0b' : '1px solid ' + theme.border,
                        background: isActive ? '#f59e0b22' : theme.card2,
                        color: isActive ? '#f59e0b' : theme.dim,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {truckTypeLabels[key]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* HAZMAT */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              fontSize: 15, color: theme.text,
            }}>
              <input
                type="checkbox"
                checked={resumeForm.hazmat}
                onChange={e => setResumeForm(p => ({ ...p, hazmat: e.target.checked }))}
                style={{ width: 20, height: 20, accentColor: '#f59e0b' }}
              />
              {t('jobs.hazmatField')}
            </label>

            {/* Visibility toggle */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              fontSize: 15, color: theme.text,
            }}>
              <input
                type="checkbox"
                checked={resumeForm.is_public}
                onChange={e => setResumeForm(p => ({ ...p, is_public: e.target.checked }))}
                style={{ width: 20, height: 20, accentColor: '#f59e0b' }}
              />
              {t('jobs.visibilityField')}
            </label>

            {/* Save button */}
            <button
              onClick={handleSaveResume}
              disabled={resumeSaving}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                fontSize: 16, fontWeight: 700, cursor: resumeSaving ? 'default' : 'pointer',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff', opacity: resumeSaving ? 0.7 : 1, marginTop: 4,
              }}
            >
              {resumeSaving ? t('jobs.loading') : t('jobs.saveResume')}
            </button>
          </div>
        )}
      </div>
    )
  }

  // --- Detail view ---
  if (selectedJob) {
    const job = selectedJob
    const flag = COUNTRY_FLAGS[job.country] || ''
    const salary = salaryText(job)
    const isBookmarked = bookmarkedIds.includes(job.id)
    const homeTimeKey = HOME_TIME_KEYS[job.home_time]
    const homeTimeText = homeTimeKey ? t('jobs.' + homeTimeKey) : job.home_time || null
    const jobTypeLabel = JOB_TYPES.find(jt => jt.key === job.job_type)?.label || job.job_type || ''

    return (
      <div style={{ padding: '16px 16px 100px', position: 'relative' }}>
        {/* Header: back + bookmark */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <button
            onClick={() => setSelectedJob(null)}
            style={{
              background: 'none', border: 'none', color: '#f59e0b',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {'\u2190'} {t('jobs.back')}
          </button>
          <button
            onClick={() => handleToggleBookmark(job.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 24, padding: '4px 8px',
            }}
          >
            {isBookmarked ? '\uD83D\uDD16' : '\uD83D\uDD17'}
          </button>
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: 22, fontWeight: 700, margin: '0 0 8px',
          color: theme.text, lineHeight: 1.3,
        }}>
          {job.is_premium && <span style={{ marginRight: 6 }}>{'\u2B50'}</span>}
          {job.title}
        </h2>

        {/* Company */}
        {job.company_name && (
          <p style={{ fontSize: 16, color: theme.dim, margin: '0 0 4px', fontWeight: 500 }}>
            {job.company_name}
          </p>
        )}

        {/* Location + country */}
        {(job.location || flag) && (
          <p style={{ fontSize: 14, color: theme.dim, margin: '0 0 16px' }}>
            {flag && <span style={{ marginRight: 4 }}>{flag}</span>}
            {job.location}
          </p>
        )}

        {/* Info rows */}
        <div style={{
          background: theme.card, borderRadius: 14,
          border: '1px solid ' + theme.border, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
          marginBottom: 16,
        }}>
          {/* Salary */}
          {salary && (
            <InfoRow label={t('jobs.salary')} theme={theme}>
              <span style={{ color: '#22c55e', fontWeight: 700, fontFamily: 'monospace' }}>
                {salary}
              </span>
            </InfoRow>
          )}

          {/* Job type */}
          {jobTypeLabel && (
            <InfoRow label={t('jobs.jobType')} theme={theme}>
              {jobTypeLabel}
            </InfoRow>
          )}

          {/* CDL required */}
          {job.cdl_required && (
            <InfoRow label={t('jobs.cdlRequired')} theme={theme}>
              {job.cdl_required}
            </InfoRow>
          )}

          {/* Min experience */}
          {job.experience_min != null && (
            <InfoRow label={t('jobs.experienceMin')} theme={theme}>
              {job.experience_min} {t('jobs.yearsShort')}
            </InfoRow>
          )}

          {/* Truck provided */}
          <InfoRow label={t('jobs.truckProvided')} theme={theme}>
            {job.truck_provided ? t('jobs.truckYes') : t('jobs.truckNo')}
            {job.truck_provided && <span style={{ marginLeft: 4 }}>{'\uD83D\uDE9B'}</span>}
          </InfoRow>

          {/* Home time */}
          {homeTimeText && (
            <InfoRow label={t('jobs.homeTime')} theme={theme}>
              {homeTimeText}
            </InfoRow>
          )}
        </div>

        {/* Benefits */}
        {job.benefits && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 6px' }}>
              {t('jobs.benefits')}
            </h3>
            <p style={{ fontSize: 14, color: theme.dim, margin: 0, lineHeight: 1.5 }}>
              {job.benefits}
            </p>
          </div>
        )}

        {/* Description */}
        {job.description && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 6px' }}>
              {t('jobs.description')}
            </h3>
            <p style={{
              fontSize: 14, color: theme.dim, margin: 0, lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {job.description}
            </p>
          </div>
        )}

        {/* Contact phone */}
        {job.contact_phone && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 6px' }}>
              {t('jobs.contact')}
            </h3>
            <a
              href={'tel:' + job.contact_phone}
              style={{
                fontSize: 15, color: '#3b82f6', textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {job.contact_phone}
            </a>
          </div>
        )}

        {/* Apply button — fixed at bottom */}
        <div style={{
          position: 'fixed', bottom: 70, left: 0, right: 0,
          padding: '12px 16px',
          background: theme.bg,
          borderTop: '1px solid ' + theme.border,
          zIndex: 10,
        }}>
          <button
            onClick={handleApply}
            disabled={hasApplied || applying}
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 12,
              border: 'none',
              fontSize: 16,
              fontWeight: 700,
              cursor: hasApplied ? 'default' : 'pointer',
              background: hasApplied
                ? theme.card2
                : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: hasApplied ? theme.dim : '#fff',
              opacity: applying ? 0.7 : 1,
            }}
          >
            {hasApplied ? t('jobs.applied') : applying ? t('jobs.loading') : t('jobs.apply')}
          </button>
        </div>
      </div>
    )
  }

  // --- List view ---
  return (
    <div style={{ padding: '16px 16px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: theme.text }}>
          {t('jobs.title')}
        </h2>
        <button
          onClick={openResume}
          style={{
            background: 'none', border: '1px solid ' + theme.border,
            borderRadius: 10, padding: '6px 12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            color: theme.text, fontSize: 13, fontWeight: 600,
          }}
        >
          {'\uD83D\uDCC4'} {t('jobs.myResume')}
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8,
        marginBottom: 16, WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {JOB_TYPES.map((jt) => (
          <button
            key={jt.key}
            onClick={() => setFilter(jt.key)}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              background: filter === jt.key ? '#f59e0b' : theme.card2,
              color: filter === jt.key ? '#fff' : theme.dim,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {jt.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          textAlign: 'center', padding: '60px 0', color: theme.dim, fontSize: 15,
        }}>
          {t('jobs.loading')}
        </div>
      )}

      {/* Empty state */}
      {!loading && jobs.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
        }}>
          <span style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCBC'}</span>
          <p style={{ fontSize: 16, color: theme.dim, margin: 0, lineHeight: 1.5 }}>
            {t('jobs.noJobs')}
          </p>
        </div>
      )}

      {/* Job cards */}
      {!loading && jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs.map((job) => {
            const isPremium = job.is_premium
            const salary = salaryText(job)
            const flag = COUNTRY_FLAGS[job.country] || ''

            return (
              <div
                key={job.id}
                onClick={() => openDetail(job)}
                style={{
                  background: theme.card,
                  borderRadius: 14,
                  padding: '16px',
                  border: isPremium
                    ? '2px solid #f59e0b'
                    : '1px solid ' + theme.border,
                  cursor: 'pointer',
                }}
              >
                {/* Header: title + premium badge */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'space-between', gap: 8, marginBottom: 6,
                }}>
                  <h3 style={{
                    fontSize: 16, fontWeight: 700, margin: 0,
                    color: theme.text, lineHeight: 1.3, flex: 1,
                  }}>
                    {job.title}
                  </h3>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {job.truck_provided && (
                      <span title={t('jobs.truckProvided')} style={{ fontSize: 16 }}>{'\uD83D\uDE9B'}</span>
                    )}
                    {isPremium && (
                      <span title={t('jobs.premium')} style={{ fontSize: 16 }}>{'\u2B50'}</span>
                    )}
                  </div>
                </div>

                {/* Company */}
                {job.company_name && (
                  <p style={{
                    fontSize: 14, color: theme.dim, margin: '0 0 6px',
                    fontWeight: 500,
                  }}>
                    {job.company_name}
                  </p>
                )}

                {/* Location + flag */}
                {job.location && (
                  <p style={{
                    fontSize: 13, color: theme.dim, margin: '0 0 8px',
                  }}>
                    {flag && <span style={{ marginRight: 4 }}>{flag}</span>}
                    {job.location}
                  </p>
                )}

                {/* Salary */}
                {salary && (
                  <p style={{
                    fontSize: 15, fontWeight: 700, margin: 0,
                    color: '#22c55e', fontFamily: 'monospace',
                  }}>
                    {salary}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, children, theme }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 14, color: theme.dim }}>{label}</span>
      <span style={{ fontSize: 14, color: theme.text, fontWeight: 500 }}>{children}</span>
    </div>
  )
}
