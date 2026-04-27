// Сжимает изображение перед отправкой в AI-сканеры (/api/smart-scan,
// /api/gemini, и подобные эндпоинты где payload ограничен 4 MB base64).
//
// Логика: resize до maxDim по большей стороне, JPEG-encode, итеративное
// снижение quality (шаг 0.1, нижняя граница 0.3) пока blob.size > maxBytes.
// Возвращает { base64, mimeType } или null если файл не image/* или
// canvas/encode не удался.

/**
 * @param {File|Blob} file - исходное изображение
 * @param {Object} opts
 * @param {number} [opts.maxDim=1600] - максимальная сторона в пикселях
 * @param {number} [opts.quality=0.7] - стартовый JPEG quality 0..1
 * @param {number} [opts.maxBytes=1048576] - целевой размер blob в байтах (1 MB)
 * @returns {Promise<{base64: string, mimeType: string} | null>}
 */
export function compressImage(file, opts = {}) {
  const { maxDim = 1600, quality = 0.7, maxBytes = 1024 * 1024 } = opts
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      resolve(null)
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.width
      let h = img.height
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const tryQ = (q) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(null); return }
            if (blob.size > maxBytes && q > 0.3) {
              tryQ(q - 0.1)
              return
            }
            const reader = new FileReader()
            reader.onload = () => resolve({
              base64: reader.result.split(',')[1],
              mimeType: 'image/jpeg',
            })
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          },
          'image/jpeg',
          q,
        )
      }
      tryQ(quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
