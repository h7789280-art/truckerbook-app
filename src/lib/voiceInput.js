/**
 * Voice input: record audio via MediaRecorder, send to Gemini for expense parsing
 * via the /api/gemini serverless proxy so the Gemini API key never ships in the
 * client bundle. See api/gemini.js.
 */

import { supabase } from './supabase'

export function recordAudio() {
  let mediaRecorder = null
  let chunks = []
  let stream = null

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks = []
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      mediaRecorder.start()
    },
    stop() {
      return new Promise((resolve, reject) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          reject(new Error('Not recording'))
          return
        }
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          if (stream) {
            stream.getTracks().forEach((t) => t.stop())
          }
          resolve(blob)
        }
        mediaRecorder.onerror = (e) => reject(e)
        mediaRecorder.stop()
      })
    },
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function parseExpenseFromVoice(audioBlob, language) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) {
    console.warn('parseExpenseFromVoice: no session')
    return null
  }

  const base64 = await blobToBase64(audioBlob)

  const langHint = language === 'ru' ? 'Russian' : language === 'uk' ? 'Ukrainian' : 'English'

  const prompt = `This is a voice recording of a truck driver logging an expense. The driver is likely speaking in ${langHint}. Extract: 1) amount (number) 2) currency (RUB/USD/EUR/UAH/BYN/KZT) 3) category (fuel/food/shower/laundry/personal/repair/parts/tires/toll/hotel/def/other) 4) description (short text). Respond ONLY in JSON format: {"amount":123,"currency":"RUB","category":"fuel","description":"\u0417\u0430\u043f\u0440\u0430\u0432\u043a\u0430 \u041b\u0443\u043a\u043e\u0439\u043b"}. If you cannot understand, respond: {"error":"not_recognized"}`

  let res
  try {
    res = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
      body: JSON.stringify({
        action: 'generate',
        prompt,
        media: {
          mimeType: audioBlob.type || 'audio/webm',
          data: base64,
        },
      }),
    })
  } catch (e) {
    console.error('parseExpenseFromVoice: network error', e)
    return null
  }

  if (!res.ok) {
    if (res.status === 401) {
      console.warn('parseExpenseFromVoice: unauthorized')
    } else if (res.status === 429) {
      console.warn('parseExpenseFromVoice: rate limited')
    } else if (res.status === 413) {
      console.error('parseExpenseFromVoice: audio too large')
    } else if (res.status === 503) {
      console.warn('parseExpenseFromVoice: service unavailable')
    } else {
      console.error('parseExpenseFromVoice: Gemini proxy error', res.status)
    }
    return null
  }

  const data = await res.json()

  try {
    const text = data.candidates[0].content.parts[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.error) return null
    return parsed
  } catch (e) {
    console.error('Failed to parse Gemini response:', e)
    return null
  }
}
