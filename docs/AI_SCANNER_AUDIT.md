# Аудит AI-сканера TruckerBook

Дата: 2026-04-27
Режим: только чтение, без правок и коммитов
Скоуп: универсальный AI Scanner (Overview), все локальные сканеры, карта UI add/scan, дублирование, ограничения распознавания.

> **Что в коде уже есть, но в UI не доступно.** Два компонента — `ScanReceipt.jsx` и `TripFromText.jsx` — реализованы полностью (UI + парсинг + confirm), но **нигде не импортируются** (grep по `import.*ScanReceipt` и `import.*TripFromText` пуст). Это мёртвый код, оставшийся после консолидации в SmartScan.

---

## Раздел 1. Универсальный AI Scanner (с Overview)

### 1.1. Где кнопка
- **Файл:** [src/tabs/Overview.jsx:2232-2257](../src/tabs/Overview.jsx#L2232-L2257)
- **Текст:** "🤖 Smart Scan" (i18n ключ `smartScan.title`)
- **Соседняя кнопка:** "✏️ Add Manually" (i18n ключ `scan.addManually`) → открывает `AddModal.jsx`
- **Видимость:** только для `userRole === 'driver'` или `'owner_operator'`. Для `job_seeker` / `company` обе кнопки скрыты.
- **Проп от App.jsx:** `onOpenSmartScan` устанавливает `showSmartScan = true` ([src/App.jsx:301](../src/App.jsx#L301), [src/App.jsx:556](../src/App.jsx#L556))

### 1.2. Что открывается
Компонент **`<SmartScan />`** ([src/components/SmartScan.jsx](../src/components/SmartScan.jsx)), рендерится из [src/App.jsx:848-870](../src/App.jsx#L848-L870).

Flow: `SmartScan` (выбор источника) → `POST /api/smart-scan` → возвращается `doc_type` → один из трёх confirm-экранов:
- `doc_type === 'receipt'` → **`<ScanConfirm />`** ([src/components/ScanConfirm.jsx](../src/components/ScanConfirm.jsx))
- `doc_type === 'trip'` → **`<TripConfirm />`** ([src/components/TripConfirm.jsx](../src/components/TripConfirm.jsx))
- `doc_type === 'repair'` → **`<RepairConfirm />`** ([src/components/RepairConfirm.jsx](../src/components/RepairConfirm.jsx))
- `doc_type === 'unknown'` → ошибка, форма очищается

Источники входа в SmartScan ([src/components/SmartScan.jsx:330-345](../src/components/SmartScan.jsx#L330-L345)):
- 📸 **Camera** (`<input capture="environment">`)
- 🖼 **Gallery** (`<input type="file">`)
- 📝 **Text paste** (`<textarea>`) — вставить текст диспетчерского сообщения / rate confirmation

### 1.3. Какие типы документов распознаёт

Универсальный сканер за один вызов API классифицирует документ по `doc_type` и сразу извлекает поля. Перечень из промпта ([api/smart-scan.js:30-90](../api/smart-scan.js#L30-L90)):

| `doc_type` | Что распознаёт | Примеры |
|---|---|---|
| **`receipt`** | Чек магазина / АЗС / любой "store receipt" с итемами и ценами | Чек Pilot/Flying J с дизелем, чек продуктов, чек запчастей AutoZone, чек одежды, табака, лекарств. **Извлекает каждый item с категорией**: `fuel / def / food / tobacco / tools / parts / supplies / parking / scale / wash / tolls / phone / clothes / medical / other`. Для fuel-итемов — отдельно `fuel_details`: gallons, price_per_gallon. |
| **`trip`** | Dispatcher message, **Rate Confirmation, Load Sheet, Delivery Order**, BOL — текст или фото | Любое сообщение/документ с origin/destination/miles/rate. Извлекает: origin_city/state, destination_city/state, miles, deadhead_miles, rate, rate_per_mile, pickup_date, delivery_date, broker, load_number, weight, commodity, notes. |
| **`repair`** | **Repair invoice / service bill / mechanic invoice** | Накладная от СТО с разбивкой labor/parts/diagnostics/towing. Извлекает: shop_name, date, total, vehicle_info, mileage, items[] с категориями `labor / parts / diagnostics / towing / other`, notes. |
| **`unknown`** | Невозможно классифицировать | Возвращает `{doc_type:'unknown', error:...}` — UI показывает ошибку. |

**Что НЕ распознаёт универсальный сканер (по промпту):**
- Накладная на конкретную **запчасть для service_resources** (oil change, tire change, brake pads — уровень детализации `part_category`/`install_date`/`odometer_miles`). Это отдельный сканер `scanPartInvoice` (см. раздел 2).
- **Одометр** на дашборде — отдельный сканер `readOdometerFromPhoto`.
- **Тахограф** (.ddd файл) — отдельный парсер `parseTachographFile`.
- **Голосовой ввод** — отдельная функция `parseExpenseFromVoice` (Whisper-style transcription внутри AddModal).
- **DVIR / Trailer inspection** — там просто фото-аплоад, без AI.

### 1.4. Как определяется тип документа
**Автоматически Gemini-моделью** в один проход. Пользователь не выбирает тип. Промпт устроен так:
- STEP 1: модель определяет один из четырёх `doc_type`.
- STEP 2: в зависимости от типа — соответствующая JSON-схема.

Это значит: **если фото неоднозначно (например, fuel-receipt от АЗС, которая сама пишет "Service Center" в шапке), модель может ошибиться в классификации**, и пользователь попадёт в неправильный confirm-экран. UI на это не реагирует — нет кнопки "это не чек, это рейс". Единственный путь — закрыть и сканировать заново.

### 1.5. Промпты (выжимки)

#### `/api/smart-scan` — универсальный ([api/smart-scan.js:30-106](../api/smart-scan.js#L30-L106))
```
STEP 1: Determine document type:
- "receipt" — store receipt, gas station receipt, purchase receipt with items and prices
- "trip" — dispatcher message, rate confirmation, load sheet, delivery order with origin/destination/miles/rate
- "repair" — repair invoice, service bill, mechanic invoice with labor/parts for vehicle repair
- "unknown" — cannot determine

STEP 2: Based on type, extract data:
[схемы для receipt / trip / repair]

IMPORTANT RULES:
- Cigarette brands → "tobacco"
- Cleaning supplies for truck → "supplies"
- AutoZone/O'Reilly/NAPA → "parts"
- Truck stops (Pilot, Flying J, Love's, TA, Petro) → check each item individually
- "DH" or "deadhead" = deadhead miles
- All amounts in USD unless clearly stated otherwise
- For repair invoices: separate labor from parts
```
**Особенность:** в этом промпте **отсутствуют** валидационные правила (currency, date в будущем, sanity-check суммы), которые есть в специализированном `scan-receipt` (см. раздел 5). Поэтому Smart Scan может вернуть чек с датой "1970-01-01" или с RUB — фронт не проверяет.

#### `/api/scan-receipt` — специализированный (мёртвый UI) ([api/scan-receipt.js:59-114](../api/scan-receipt.js#L59-L114))
Усиленный промпт под чек: те же категории, плюс жёсткие правила про USD-only и валидную дату; на выход требует `{error:"non_usd_currency",detected_currency:"..."}` или `{error:"date_in_future",...}`. **Ответ дополнительно валидируется на сервере** через `validateReceiptResponse` ([api/scanReceiptValidation.js](../api/scanReceiptValidation.js)): дата ∈ [2017-01-01, today], total ∈ (0, 100000], валюта USD. На 422 фронт умеет частично сохранить чек, оставив пустую дату.

#### `/api/parse-trip` — специализированный (мёртвый UI) ([api/parse-trip.js:30-58](../api/parse-trip.js#L30-L58))
Узкий промпт только под рейс. Принимает `text` или `image`. Без валидации.

#### `/api/gemini` — общий прокси для остальных AI-вызовов
Используется тремя сторонними сканерами через `geminiPartInvoice.js`, `geminiVision.js`, `voiceInput.js`, `tachographParser.js`. Каждый из них шлёт собственный промпт в body.

### 1.6. Куда складываются распознанные данные

| `doc_type` | Confirm-компонент | Таблица Supabase | Колонки |
|---|---|---|---|
| receipt (vehicle item) | ScanConfirm | `vehicle_expenses` | vehicle_id, category (`fuel/reefer/def/oil/parts/equipment/supplies/hotel/toll/other`), description, amount, date, receipt_url |
| receipt (personal item) | ScanConfirm | `byt_expenses` | category (`food/shower/laundry/personal/other`), name, amount, date, receipt_url |
| trip | TripConfirm | `trips` (через `addTrip` в [src/lib/api.js](../src/lib/api.js)) | from, to, distance, deadhead, rate, vehicle_id |
| repair | RepairConfirm | `service_records` | vehicle_id, category=`'repair'` (фиксировано через REPAIR_CAT_TO_SERVICE), name (description+category+shop), sto, amount, odometer, date, receipt_url |

**Архивирование оригинального фото** (best-effort, через `saveToArchive` в [src/lib/documentsArchive.js](../src/lib/documentsArchive.js)):
- Receipt → docType определяется по AI-категории первого item (`receiptDocType`)
- Trip → docType `'trip_rateconf'`, linked_table `'trips'`
- Repair → docType `'receipt_other'`, linked_table `'service_records'`

**Дубликат-чек** есть во всех трёх confirm-компонентах (`checkDuplicateReceipt` / `checkDuplicateTrip`) — показывает модалку "Save anyway / Cancel", если в БД нашлась запись с такой же суммой + датой + (description / маршрут).

### 1.7. Через какие endpoint идут запросы

| Источник вызова | Endpoint | Auth | Rate-limit |
|---|---|---|---|
| `<SmartScan>` (с Overview) | `POST /api/smart-scan` | JWT Bearer | 20/60s per user_id |
| `<ScanReceipt>` (мёртвый код) | `POST /api/scan-receipt` | JWT Bearer | 20/60s per user_id |
| `<TripFromText>` (мёртвый код) | `POST /api/parse-trip` | JWT Bearer | 20/60s per user_id |
| `scanPartInvoice` (Service → Resources) | `POST /api/gemini` (action=`generate`) | JWT Bearer | 20/60s per user_id |
| `readOdometerFromPhoto` (Overview модалки) | `POST /api/gemini` | JWT Bearer | 20/60s per user_id |
| `parseExpenseFromVoice` (AddModal) | `POST /api/gemini` (audio) | JWT Bearer | 20/60s per user_id |
| `parseTachographFile` | `POST /api/gemini` (octet-stream) | JWT Bearer | 20/60s per user_id |

**Важно:** rate-limit Map **общий для всех scan-эндпоинтов и `/api/gemini`** (см. [api/_security.js:9-15](../api/_security.js#L9-L15)). 20 запросов в минуту — это общая квота на пользователя на любые AI-операции, не на каждый endpoint. Также: лимит in-memory, на serverless это означает, что разные cold instances имеют разные счётчики (см. backlog SECURITY.md → "Upstash Redis для распределённого rate-limit").

---

## Раздел 2. Локальные точки сканирования

### 2.1. `scanPartInvoice` — Service → Resources (Part Resources)
- **Файл/строка:** [src/lib/geminiPartInvoice.js:164](../src/lib/geminiPartInvoice.js#L164) (функция), вызов из [src/tabs/Service.jsx:3763](../src/tabs/Service.jsx#L3763) (handleScanInvoice), UI-кнопки в `PartFormModal` ([src/tabs/Service.jsx:3982-4031](../src/tabs/Service.jsx#L3982-L4031))
- **Что сканирует:** накладную от магазина запчастей / СТО, специфичную для конкретной "детали" в Part Resources. Возвращает: `part_category` (одна из ~16 категорий: `engine_oil / fuel_filter / air_filter / cabin_filter / def_filter / transmission_oil / differential_oil / brake_pads / brake_discs / clutch / belts / battery / steer_tires / drive_tires / trailer_tires / other`), `part_name`, `install_date`, `odometer_miles`, `cost_total`, `shop_name`, `invoice_number`.
- **Endpoint:** `/api/gemini` (общий прокси, не специализированный scan-*).
- **Дублирует ли SmartScan?** **Частично да.** SmartScan тоже распознаёт repair-invoice (категории `labor/parts/diagnostics/towing`), но не выделяет конкретную деталь и не привязывает её к жизненному циклу детали (срок до замены, пробег между заменами). `scanPartInvoice` заточен под форму PartFormModal, где такая привязка нужна. **Логика прицельная — оправданная.** Однако пользователь может скнуть ту же накладную через Smart Scan — попадёт в repair_records, а не в Part Resources, и потеряет связку с деталью.

### 2.2. `readOdometerFromPhoto` — Overview модалки (Start/End shift, Update odometer)
- **Файл/строка:** [src/lib/geminiVision.js:46](../src/lib/geminiVision.js#L46) (функция), вызов в Overview.jsx (по информации Explore-агента: [src/tabs/Overview.jsx:949 и 1059](../src/tabs/Overview.jsx#L949)).
- **Что сканирует:** фото дашборда грузовика. Возвращает целое число миль. Если на фото километры — конвертирует в мили. Если изображение — не дашборд → `error: 'no_odometer_detected'`.
- **Endpoint:** `/api/gemini`.
- **Уникальный — не дублирует SmartScan.** SmartScan не распознаёт одометры.

### 2.3. `parseExpenseFromVoice` — AddModal (голосовой ввод во всех формах)
- **Файл/строка:** [src/lib/voiceInput.js](../src/lib/voiceInput.js), вызов в [src/components/AddModal.jsx:123](../src/components/AddModal.jsx#L123) (через PhotoVoiceBar).
- **Что сканирует:** аудио-запись (webm) → текст → распознанный расход (amount, category, description). Используется только для personal/vehicle expense форм, **не для рейсов и не для repair**.
- **Endpoint:** `/api/gemini` (action `generate` с audio в media body).
- **Уникальный — голос вместо фото.** Параллельный канал ввода, не конкурирует со SmartScan.

### 2.4. `parseTachographFile` — Tachograph viewer
- **Файл:** [src/lib/tachographParser.js](../src/lib/tachographParser.js) (по упоминаниям в CLAUDE.md, не прочитан в этом аудите). Вызывается из `TachographViewer.jsx`.
- **Что:** парсит .ddd файл тахографа (бинарный формат) через Gemini octet-stream. К UI скан-кнопок Smart Scan / Resources не имеет отношения.

### 2.5. `<ScanReceipt />` — МЁРТВЫЙ КОД
- **Файл:** [src/components/ScanReceipt.jsx](../src/components/ScanReceipt.jsx) (377 строк) + endpoint [api/scan-receipt.js](../api/scan-receipt.js) (232 строки) + валидация [api/scanReceiptValidation.js](../api/scanReceiptValidation.js) (102 строки) + тесты `api/scanReceiptValidation.test.js`.
- **Подтверждение мёртвости:** grep `import.*ScanReceipt` и `<ScanReceipt` по `src/` — **0 совпадений**. Компонент полностью реализован (UI + flow + integration с ScanConfirm), но **нигде не рендерится**.
- **Что умеет (а Smart Scan нет):** жёсткая server-side валидация валюты (USD-only), даты (≥ 2017-01-01, не будущее), суммы (0..100k). Возвращает 422 с `userError` и эхом распознанного, чтобы пользователь мог исправить только сломанное поле.
- **Endpoint живой и защищён** — туда никто не ходит, но он работает и счётчик rate-limit ему доступен.

### 2.6. `<TripFromText />` — МЁРТВЫЙ КОД
- **Файл:** [src/components/TripFromText.jsx](../src/components/TripFromText.jsx) (372 строки) + endpoint [api/parse-trip.js](../api/parse-trip.js) (175 строк).
- **Подтверждение:** grep `import.*TripFromText` / `<TripFromText` по `src/` — **0 совпадений**. То же — endpoint `/api/parse-trip` живой, никто его не вызывает.
- **Что умеет:** только trip, два режима — text (paste) и image (screenshot). Логика подтверждения через тот же `TripConfirm`. Эта функциональность поглощена SmartScan, который умеет text+image и сам определяет тип.

### 2.7. Прочие upload-кнопки без AI
По данным Explore: следующие места имеют **только photo-upload, без AI-распознавания**:
- `<DVIRInspection />` — фото инспекции, raw upload в Storage.
- `<TrailerInspection />` — фото трейлера (overview/damage/number/seal), raw upload.
- `<IncidentsSection />` — fines/inspections/accidents, фото без OCR.
- `<DocsTab />` — типы документов (license, sts, osago, kasko, pts, contract, dopog, bol, other), raw upload.

---

## Раздел 3. Карта UI входа

| Раздел | "Add manually" | "Scan" / AI | Маршрут к универсальному SmartScan |
|---|---|---|---|
| **Overview** | ✅ "✏️ Add Manually" → AddModal ([Overview.jsx:2258](../src/tabs/Overview.jsx#L2258)) | ✅ "🤖 Smart Scan" → SmartScan ([Overview.jsx:2236](../src/tabs/Overview.jsx#L2236)) | **Это и есть entry point** |
| **Expenses → Vehicle** | ❌ нет локальной кнопки в табе | ❌ нет локальной | ❌ нет (только из Overview) |
| **Expenses → Personal** | ❌ нет локальной кнопки в табе | ❌ нет локальной | ❌ нет (только из Overview) |
| **My Trips** | ❌ нет "+ New trip" в табе. Есть кнопка "🚛 Подобрать прицеп" ([Trips.jsx:313](../src/tabs/Trips.jsx#L313)) — это другая функция (trailer matching) | ❌ нет | ❌ нет (только из Overview) |
| **Service → Service tab (repair)** | ✅ "+ Добавить ремонт" ([Service.jsx:617-627](../src/tabs/Service.jsx#L617-L627)) → AddServiceModal (текстовая форма) | ❌ нет | ❌ нет (только из Overview) |
| **Service → Tires** | ✅ "+ Добавить шину" ([Service.jsx:1222-1238](../src/tabs/Service.jsx#L1222-L1238)) → TireModal | ❌ нет | ❌ нет |
| **Service → Resources (Part Resources)** | ✅ "+ Добавить деталь" ([Service.jsx:3407-3416](../src/tabs/Service.jsx#L3407-L3416)) → PartFormModal | ✅ **внутри PartFormModal** есть "📷 Сканировать накладную" + "Из галереи" → `scanPartInvoice` ([Service.jsx:3982-4031](../src/tabs/Service.jsx#L3982-L4031)) | ❌ нет — отдельный сканер |
| **Service → Checklist (PDD)** | n/a (чекбоксы) | ❌ нет | ❌ нет |
| **Service → DVIR / Inspections** | ✅ "Новая инспекция" → DVIRInspection | ❌ только photo upload, без AI | ❌ нет |
| **Documents (DocsTab)** | ✅ загрузка по типам | ❌ только photo upload | ❌ нет |
| **Fuel** (если открыт как отдельный таб) | через FAB / AddModal | ✅ голос + фото в AddModal | ❌ нет |
| **Byt** | через FAB / AddModal | ✅ голос + фото в AddModal | ❌ нет |
| **Profile / Vehicle (Odometer)** | input | ✅ `readOdometerFromPhoto` (только Overview модалки Start/End shift) | ❌ нет |

**Проблема UX, на которую жалуется тестер, подтверждается данными:**
- В разделах Trips, Expenses, Service ремонт — **нет локальных кнопок ни Add, ни Scan** (кроме текстовой Add Repair и Add Tire). Чтобы создать рейс или расход, нужно вернуться на Overview.
- AI Scanner на Overview не имеет визуального признака, что это "сканер всего" — название Smart Scan не объясняет, что туда можно положить и BOL, и чек, и накладную ремонта.
- "Scan Invoice" в Add Part — единственный локальный AI-вход в табах, но он специфичен для Part Resources и не виден из основных разделов.

---

## Раздел 4. Дублирование и мёртвый код

### 4.1. Дубль логики "распознать чек / рейс / ремонт"
- **SmartScan + ScanReceipt** делают почти одно и то же для receipts. SmartScan универсальнее, но **слабее по валидации** (см. раздел 5).
- **SmartScan + TripFromText** — оба умеют text+image для trip. SmartScan накрывает функциональность.
- **SmartScan + scanPartInvoice** — пересекаются на repair-invoice, но `scanPartInvoice` извлекает ⨯3 поле больше (part_category, install_date, odometer) и привязывает к Part Resources. Не дубль, но конкуренция за пользовательский путь: один и тот же физический документ может быть отсканирован двумя разными кнопками с разным результатом.

### 4.2. Endpoint без UI
- `/api/scan-receipt` — живой, защищён, имеет валидацию, **никто из клиентского кода не зовёт**.
- `/api/parse-trip` — то же самое: живой, никто не зовёт.

### 4.3. Компоненты без точек рендера
- `ScanReceipt.jsx` (377 строк) — 0 импортов в `src/`.
- `TripFromText.jsx` (372 строки) — 0 импортов в `src/`.

### 4.4. Старые ветки кода
Не обнаружено (закомментированных импортов, `// removed` маркеров, дубликатов с суффиксами `Old`/`V1` нет).

### 4.5. Косвенно: внутри SmartScan, ScanReceipt, TripFromText, geminiPartInvoice — одна и та же функция `compressForScan` / `compressImage` скопирована 4 раза с минимальными отличиями (maxDim 1600, quality 0.7). Это копипаста, не дублирующая бизнес-логику, но мешающая поддержке.

---

## Раздел 5. Что распознаётся неверно или с ограничениями

### 5.1. Smart Scan vs Scan Receipt — разрыв валидации
**Главная находка:** прод использует только `/api/smart-scan`, у которого **нет** server-side валидации. Специализированный `/api/scan-receipt` с валидацией (`scanReceiptValidation.js`) — мёртв.

| Проверка | scan-receipt (мёртв) | smart-scan (живой) |
|---|---|---|
| USD-only | ✅ Gemini-prompt + server validate | ❌ только в промпте, без серверной проверки. AI может вернуть RUB/EUR-сумму как USD. |
| Дата ∈ [2017-01-01, today] | ✅ server validate | ❌ AI может вернуть `1970-01-01` или будущее — попадёт в БД. |
| Сумма (0, 100000] | ✅ server validate | ❌ нет sanity-check. |
| 422 с эхом распознанного | ✅ есть | ❌ нет |

**Эффект:** через Smart Scan можно сохранить чек с датой "1970-01-01" в `vehicle_expenses` или `byt_expenses`, что повредит YTD-агрегации, IFTA, Tax Summary. Документировано в `scanReceiptValidation.js:8-12` как риск, но эта защита не подключена к боевому пути.

### 5.2. Поля, которые часто null или ненадёжны
**Receipt items (через SmartScan):**
- `fuel_details.gallons` / `price_per_gallon` — модель часто видит только total и пропускает gallons (особенно на чеках Pilot/Flying J с двумя строками). Нет required-полей в JSON-схеме промпта.
- `category` — путает `tobacco` с `food` (в промпте есть исключение, но только для известных брендов; локальные марки не покрыты).
- `subcategory` для fuel — `diesel` vs `gas` модель определяет по тексту чека; отсутствует — fallback нет.

**Trip:**
- `deadhead_miles` — если в сообщении нет явного "DH" / "deadhead", модель ставит 0. Правило это закодировано в промпте, но браузерная вставка в сжатом формате может вообще не содержать deadhead.
- `pickup_date` / `delivery_date` — если в сообщении только "tomorrow" или "asap", даты будут null или галлюцинация.
- `rate_per_mile` — модель пытается посчитать `rate / miles`, но если miles=0 (текст без миль) — деление на 0 даст NaN или null.
- `commodity`, `weight` — часто отсутствуют в кратких диспетчерских сообщениях.

**Repair:**
- `mileage` — модель часто читает VIN или ZIP вместо одометра, если на накладной нет явной метки "Odometer".
- Разделение `labor / parts / diagnostics / towing` — если на накладной одна общая сумма "Total", модель кладёт всё в один item с category `other`.
- `category` фронтенд жёстко мапит на `'repair'` ([RepairConfirm.jsx:11-17](../src/components/RepairConfirm.jsx#L11-L17)) — `service_records.category` не различает labor / parts / diagnostics, теряется детализация.

### 5.3. Ошибки классификации `doc_type`
Не описано в коде явных правил, что если *классификация* неверна. Сценарии:
- **Чек от Pilot Flying J с авансом за future-trip-тoll** — модель может уйти в `repair`.
- **Rate confirmation из BOL-формы с большим количеством line-items** — может быть классифицирована как `receipt`.
- **Часть BOL без итемов, только origin/dest/rate** — может быть `unknown`.

UI на это не реагирует — пользователь видит итоговый confirm-экран и может не заметить, что rate confirmation попал в `service_records` как ремонт.

### 5.4. Дубль-чеки "почти одинаковые"
`checkDuplicateReceipt` ищет по точному совпадению `amount + date + description`. Если AI описание чуть-чуть отличается ("Diesel" vs "Diesel Fuel"), дубль не найдётся.

### 5.5. Old date warning vs validation
В ScanConfirm есть мягкое предупреждение "Дата старше 30 дней" ([ScanConfirm.jsx:93-111](../src/components/ScanConfirm.jsx#L93-L111)) — оно **информационное**, не блокирующее. Это нормально для backdate, но подтверждает: единственная защита от 1970-01-01 — это validateReceiptResponse, который не вызывается из Smart Scan.

### 5.6. Сжатие и потеря качества
Все сканеры compress-ят фото до maxDim 1600 + quality 0.7 + 1 MB cap. На размытых фото (одно из чеков Flying J) после сжатия мелкие итемы становятся нечитаемыми. Лимит на сервере — 4 MB base64 (= ~3 MB бинарника). Если фото слишком большое — `Image too large 400`. UX: пользователь не видит, что сжатие сломало читаемость, пока не получит ошибку парсинга.

---

## Раздел 6. Открытые вопросы для Елены

1. **Стратегия по SmartScan vs специализированные сканеры.** Оставляем универсальный SmartScan как единственный entry point и удаляем мёртвый `ScanReceipt` + `TripFromText` + endpoints `scan-receipt` / `parse-trip`? Или наоборот — вынесём SmartScan в "роутер" (он только классифицирует), а распознавание делегирует `/api/scan-receipt` (с его валидацией) / `/api/parse-trip`? Сейчас гибрид де-факто: универсальный SmartScan живой, защищённые специализированные — мёртвые.

2. **Локальные кнопки Add/Scan в табах Trips, Expenses, Service.** Добавлять "+ New Trip" / "+ Receipt" / "🤖 Scan" внутри каждого таба, или оставить единый entry point на Overview и научить пользователя, что Smart Scan универсален? Если добавлять — все они должны вести в SmartScan с предзаданным `doc_type`, или каждый — в свою специализированную форму?

3. **Префильтр по `doc_type` для контекстных входов.** Если "Scan" появится в табе Trips, должен ли SmartScan показывать только trip-flow, или всё равно классифицировать (пользователь сфоткал чек по ошибке — куда?)? Сейчас классификатор фиксированный.

4. **Две разные кнопки Scan на одной накладной (Service > Resources vs универсальный).** Какой scenario — разрешённый? Если водитель в табе Resources снимет накладную через Smart Scan (а не через "Scan Invoice"), он попадёт в service_records без привязки к Part. Что должно произойти: 
   (а) предупреждение "это похоже на накладную запчасти, отнесите в Resources"; 
   (б) автоматически создать запись в part_resources; 
   (в) оставить как есть (пользователь сам отвечает).

5. **Валидация в Smart Scan (USD / дата / сумма).** Включаем `validateReceiptResponse` для smart-scan-receipt-веток? Это блокирует "1970-01-01" и RUB-чеки в YTD, но усложнит обработку "у меня старый чек без даты — нужно пометить вручную".

6. **`doc_type=unknown` опыт.** Сейчас просто ошибка. Должна ли быть кнопка "это (рейс / чек / ремонт) — попробуй ещё раз" или "сохранить как просто фото в архив"?

7. **Голосовой ввод для рейсов и ремонта.** Сейчас `parseExpenseFromVoice` работает только в AddModal для расходов. Добавлять голос в TripConfirm / RepairConfirm (быстрая правка распознанного фото)?

8. **Предсуществующий мёртвый код.** Удаляем `ScanReceipt.jsx`, `TripFromText.jsx`, `api/scan-receipt.js`, `api/parse-trip.js`, `api/scanReceiptValidation.js` (оставив тесты), или сохраняем как backup на случай отката от SmartScan? Удаление освободит ~1100 строк фронта + 400 серверных.

9. **Категория `repair` в `service_records`.** Сейчас все repair-items от Smart Scan мапятся в `category='repair'`, теряя `labor/parts/diagnostics/towing`. Заводим новые service-категории, или это отчётность не нужна?

10. **Multi-document scan.** Тестер мог хотеть "сфоткал 5 чеков подряд" — сейчас SmartScan работает в режиме "1 фото = 1 doc_type". Добавляем batch-режим, или это вне MVP?

---

## Сводка для решения

- Архитектура **рабочая**, но рассинхронизирована: универсальный сканер активен, специализированные защищённые сканеры — на полке.
- Главная UX-проблема (отсутствие add/scan в Trips/Expenses) **подтверждена кодом**.
- Главная техническая проблема — **разрыв валидации** между Smart Scan и Scan Receipt: продакшн-путь не защищён от мусорных дат и не-USD сумм.
- Локальный сканер `scanPartInvoice` оправдан и не дублируется. Голос и одометр — отдельные неконфликтующие каналы.
- Мёртвый код — ~1100 строк, готовых к удалению, после решения по вопросу 1.
