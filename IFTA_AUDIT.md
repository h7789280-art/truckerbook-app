# IFTA Module — Audit Report

**Date:** 2026-04-10
**Author:** Claude Code (automated audit)
**Scope:** Readiness check for full IFTA (International Fuel Tax Agreement) module

---

## 1. Таблица `trips` (Supabase)

**Source:** `src/lib/api.js:124-134` (insert row)

| Column | Type | IFTA-relevant? | Notes |
|--------|------|----------------|-------|
| id | uuid (PK) | — | Auto-generated |
| user_id | uuid (FK → profiles) | — | |
| vehicle_id | uuid (FK → vehicles) | Yes | |
| origin | text | **Partial** | Free-text city name, no state code |
| destination | text | **Partial** | Free-text city name, no state code |
| distance_km | numeric | Yes | Total loaded distance |
| deadhead_km | numeric | Yes | Empty miles |
| income | numeric | — | Revenue |
| receipt_url | text | — | |
| driver_pay | numeric | — | |
| is_tracking | boolean | Yes | GPS tracking flag |
| created_at | timestamptz | Yes | |

### Verdict: ЧАСТИЧНО

**ЕСТЬ:** origin, destination (text), distance_km, deadhead_km, is_tracking.
**НЕТ:**
- `start_date` / `end_date` — только `created_at`, нет даты начала/окончания рейса
- `origin_state` / `destination_state` — штат не выделен отдельным полем
- `total_miles` — есть `distance_km`, конвертируется в мили на фронте
- Нет связи маршрута со штатами, через которые проехал рейс

---

## 2. Таблица `trip_waypoints` (Supabase)

**Source:** `src/lib/gpsTracker.js:96-105`, `src/lib/api.js:1723-1744`

| Column | Type | IFTA-relevant? | Notes |
|--------|------|----------------|-------|
| id | uuid (PK) | — | Auto-generated |
| trip_id | uuid (FK → trips) | Yes | |
| user_id | uuid (FK → profiles) | — | |
| latitude | numeric | **Yes** | GPS coordinate |
| longitude | numeric | **Yes** | GPS coordinate |
| speed | numeric | — | m/s, nullable |
| heading | numeric | — | degrees, nullable |
| accuracy | numeric | — | meters, nullable |
| altitude | numeric | — | nullable |
| recorded_at | timestamptz | Yes | Timestamp of GPS reading |

### Verdict: ЧАСТИЧНО

**ЕСТЬ:** lat/lng координаты, trip_id привязка, timestamp.
**НЕТ:**
- `state` / `state_code` — штат НЕ определяется из координат при записи
- `address` — нет reverse geocoding при сохранении
- `order` / `sequence` — нет явного порядкового номера (сортируется по `recorded_at`)

**Потенциал:** Координаты есть — можно пост-обработкой определить штат для каждой точки и рассчитать мили по штатам. GPS-трек обновляется каждые 60 сек или 500м.

---

## 3. Таблица `fuel_entries` (Supabase)

**Source:** `src/lib/api.js:49-61`

| Column | Type | IFTA-relevant? | Notes |
|--------|------|----------------|-------|
| id | uuid (PK) | — | Auto-generated |
| user_id | uuid (FK → profiles) | — | |
| vehicle_id | uuid (FK → vehicles) | Yes | |
| station | text | Yes | Name of gas station |
| date | date | Yes | Date of fueling |
| liters | numeric | **Yes** | Volume — stored in LITERS |
| cost | numeric | Yes | Total cost |
| odometer | integer | Yes | Mileage reading |
| latitude | decimal | Yes | GPS location, nullable |
| longitude | decimal | Yes | GPS location, nullable |
| state | text | **Yes** | State code — auto-detected via Nominatim |
| receipt_url | text | — | Photo of receipt |
| created_at | timestamptz | — | |

### Verdict: ЕСТЬ (почти полностью)

**ЕСТЬ:**
- `liters` — объём в литрах (конвертируется в галлоны: `liters / 3.78541`)
- `state` — штат, автоопределяется через Nominatim reverse geocoding при добавлении
- `cost` — общая стоимость заправки
- `latitude` / `longitude` — координаты АЗС
- `odometer` — показания одометра

**НЕТ:**
- `price_per_unit` — цена за литр/галлон (можно рассчитать: cost / liters)
- `gallons` — нет отдельного поля, конвертация на фронте
- `state_code` — поле `state` хранит полное название штата (через Nominatim `address.state`), а не двухбуквенный код

---

## 4. Модуль Рейсы (Frontend)

**Component:** `src/components/AddModal.jsx:267-292` → `TripFields()`

### Поля при создании рейса:

| Поле | Тип input | Model field | IFTA-related |
|------|-----------|-------------|--------------|
| From (Откуда) | text | form.from | Partial — free text |
| To (Куда) | text | form.to | Partial — free text |
| Date | date | form.date | Yes |
| Distance (km/mi) | number | form.distance | Yes |
| Deadhead (km/mi) | number | form.deadhead | Yes |
| Income | number | form.rate | No |

### Verdict: ЧАСТИЧНО

**НЕТ в форме рейса:**
- Выбор штата отправления / назначения
- Список промежуточных штатов (для расчёта миль по штатам)
- Дата начала и окончания рейса (только одна дата)
- Autocomplete адресов (Google Places / HERE)

---

## 5. Модуль Заправки (Frontend)

**Component:** `src/components/AddModal.jsx:231-264` → `FuelFields()`

### Поля при добавлении заправки:

| Поле | Тип input | Model field | IFTA-related |
|------|-----------|-------------|--------------|
| Station | text | form.station | Yes |
| State | read-only display | auto via GPS | **Yes** — auto-detected |
| Date | date | form.date | Yes |
| Volume (L/gal) | number | form.liters | Yes |
| Amount (cost) | number | form.amount | Yes |
| Odometer | number | form.odometer | Yes |

**Geolocation flow** (`AddModal.jsx:435`):
1. При открытии формы — запрос GPS координат
2. Reverse geocoding через Nominatim: `https://nominatim.openstreetmap.org/reverse?lat=...&lon=...`
3. Из ответа берётся `data.address.state`
4. Показывается как read-only badge (📍 State Name)
5. Сохраняется в `fuel_entries.state`

### Verdict: ЕСТЬ

Штат определяется автоматически при заправке. Единственная проблема: хранится полное название штата ("Texas"), а не двухбуквенный код ("TX").

---

## 6. Интеграция с Google Maps / Routing API

### Verdict: НЕТ

| Ключевое слово | Результат |
|----------------|-----------|
| googlemaps / google-maps | Не найдено |
| DirectionsService | Не найдено |
| @googlemaps/js-api-loader | Не найдено |
| pcmiler | Не найдено |
| mapbox | Не найдено |
| HERE API | Не найдено |
| routing API | Не найдено |

**Что используется вместо:**
- **Leaflet + OpenStreetMap** — для отображения карты (`src/components/TripMap.jsx`)
- **Nominatim** — для reverse geocoding штата при заправке
- **HTML5 Geolocation** — для GPS-трекинга в реальном времени

**Env переменная:** `GOOGLE_API_KEY` определена в `.env.example` но **НЕ используется** в коде. `VITE_GEMINI_API_KEY` используется для Gemini Vision AI, не для Maps.

---

## 7. Environment Variables

### `.env` (текущий):

| Variable | Value | Used for |
|----------|-------|----------|
| VITE_SUPABASE_URL | `https://zswsyxckaxidozvskgea.supabase.co` | Supabase client |
| VITE_SUPABASE_ANON_KEY | `eyJ...` | Supabase auth |
| VITE_GEMINI_API_KEY | `AIzaSyB...` | Gemini Vision AI |

### `.env.example`:

| Variable | Description |
|----------|-------------|
| VITE_SUPABASE_URL | Supabase URL |
| VITE_SUPABASE_ANON_KEY | Supabase anon key |
| GOOGLE_API_KEY | **Defined but NOT used** in code |
| N8N_API_URL | n8n cloud URL |
| N8N_API_KEY | n8n API key |

### `.env.local`: НЕ СУЩЕСТВУЕТ

---

## 8. Существующая IFTA-реализация

### Verdict: ЕСТЬ (базовая версия)

**File:** `src/tabs/Trips.jsx:1312-1719` → `IFTATab` component

**Текущие возможности:**
- Выбор года и квартала (Q1-Q4)
- Загрузка fuel_entries за выбранный квартал
- Фильтрация по наличию поля `state`
- Конвертация литров → галлоны (`liters / 3.78541`)
- Группировка галлонов по штатам
- **Ручной ввод миль по штатам** (localStorage, не в Supabase)
- Ручной ввод tax rate по штатам (default: $0.55)
- Добавление штатов вручную (двухбуквенный код)
- Расчёт: overall MPG, tax per state
- Экспорт в Excel

**Ключевые ограничения текущей реализации:**
1. Мили по штатам вводятся ВРУЧНУЮ — не рассчитываются из GPS-трека
2. Данные миль хранятся в localStorage — не в Supabase (не синхронизируются между устройствами)
3. Tax rates захардкожены (default $0.55) — нет актуальной базы ставок по штатам
4. Штат в fuel_entries хранится как полное название, а в IFTA-табе ожидается 2-буквенный код
5. Нет автоматического определения штатов по GPS waypoints рейса

---

## Сводная таблица

| Пункт проверки | Статус | Детали |
|----------------|--------|--------|
| trips — структура | ЧАСТИЧНО | Есть origin/destination (text), distance_km. Нет state codes, start/end dates |
| trip_waypoints — структура | ЧАСТИЧНО | Есть lat/lng/recorded_at. Нет state/state_code/address |
| fuel_entries — структура | ЕСТЬ | Есть liters, state, cost, odometer, lat/lng. Нет price_per_unit |
| Форма создания рейса | ЧАСТИЧНО | 6 полей (from, to, date, distance, deadhead, income). Нет штатов |
| Форма добавления заправки | ЕСТЬ | 6 полей + auto state detection через Nominatim |
| Google Maps / Routing API | НЕТ | Используется Leaflet + OSM. GOOGLE_API_KEY в .env.example не задействован |
| IFTA tab (базовый) | ЕСТЬ | Ручной ввод миль по штатам, расчёт MPG, экспорт Excel |

---

## Рекомендация для IFTA-модуля

### Что доработать минимально (на основе существующего):

1. **Нормализовать `state` в fuel_entries** — при сохранении конвертировать полное название штата из Nominatim в двухбуквенный код (mapping "Texas" → "TX"). Или добавить отдельное поле `state_code`.

2. **Автоматический расчёт миль по штатам из GPS waypoints** — при наличии GPS-трека рейса:
   - Для каждой пары последовательных waypoints определить штат (reverse geocoding по координатам, можно batch или через polygon matching)
   - Рассчитать расстояние между точками (Haversine formula)
   - Суммировать мили по штатам автоматически
   - Сохранять результат в Supabase (новая таблица `ifta_state_miles` или в `trip_waypoints.state`)

3. **Перенести IFTA-данные из localStorage в Supabase** — создать таблицу `ifta_reports` или `ifta_state_entries` для хранения миль по штатам, чтобы данные синхронизировались между устройствами.

4. **Добавить актуальные tax rates по штатам** — захардкодить или загружать из справочника (все 48 штатов + DC + провинции Канады, если нужно).

### Что добавить с нуля:

5. **State detection для waypoints** — добавить поле `state` в `trip_waypoints` и определять штат при записи GPS-точки (reverse geocoding или offline polygon matching по координатам).

6. **Start/end dates для trips** — добавить `start_date` и `end_date` в таблицу `trips` (сейчас только `created_at`).

7. **Routing API интеграция (опционально)** — Google Directions API или OSRM (бесплатный) для:
   - Автоматического расчёта маршрута между origin и destination
   - Определения штатов на маршруте без GPS-трека
   - Более точного расчёта миль (по дорогам, а не по прямой)

8. **PDF-отчёт IFTA** — стандартный формат для подачи в налоговые органы (Schedule 1: Tax Computation, Schedule 2: Summary).

9. **Поддержка нескольких машин** — текущий IFTA tab не фильтрует по vehicle_id, а IFTA-отчёт подаётся на каждое ТС отдельно.

### Приоритет реализации:

| # | Задача | Сложность | Влияние |
|---|--------|-----------|---------|
| 1 | Нормализация state → state_code в fuel_entries | Низкая | Высокое |
| 2 | Таблица ifta_state_miles в Supabase | Низкая | Высокое |
| 3 | Фильтрация IFTA по vehicle_id | Низкая | Высокое |
| 4 | Авторасчёт миль по штатам из GPS waypoints | Средняя | Очень высокое |
| 5 | Справочник tax rates по штатам (2026) | Низкая | Среднее |
| 6 | start_date/end_date для trips | Низкая | Среднее |
| 7 | State field в trip_waypoints | Средняя | Высокое |
| 8 | PDF IFTA report (Schedule 1 + 2) | Средняя | Высокое |
| 9 | Routing API (OSRM / Google) | Высокая | Среднее (есть GPS альтернатива) |
