# BOOKKEEPING MODULE ROADMAP — TruckerBook

**Версия:** 1.0  
**Дата:** 10 апреля 2026  
**Автор архитектуры:** Elena Kychman  
**Целевые роли:** owner_operator, company  
**Скрыто для:** driver, job_seeker

---

## 1. ПОЛОЖЕНИЕ В АРХИТЕКТУРЕ

Модуль "Бухгалтерия" размещается **внутри вкладки Документы** как одна из карточек, рядом с:

```
ДОКУМЕНТЫ (bottom nav)
├── 📄 Документы
├── 💼 Бухгалтерия         ← НОВЫЙ МОДУЛЬ
├── 📋 BOL
├── 📷 Приёмка машины
├── 🚚 Приёмка трейлера
└── ⚠️ Штрафы, инспекции, аварии
```

**Условный рендер карточки "Бухгалтерия":**
- `role IN ('owner_operator', 'company')` → показать
- `role IN ('driver', 'job_seeker')` → НЕ показывать карточку
- Дополнительно: `hos_mode = 'usa' OR units = 'imperial'` (как уже сделано для IFTA)

При тапе по карточке "Бухгалтерия" открывается экран с под-вкладками первого уровня.

---

## 2. ЮРИДИЧЕСКИЕ ГРАНИЦЫ

### Что МОЖНО без лицензии (это building blocks модуля)

TruckerBook позиционируется как **software / informational tool**, не как tax preparation service. Это та же модель что у QuickBooks, Wave, FreshBooks, Mint, YNAB. Они не имеют PTIN — они продают software, пользователь принимает решения сам.

Разрешено:
- Калькуляторы налогов и amortization
- Трекеры (Per Diem, mileage, expenses)
- Draft / preview документов с водяным знаком "DRAFT — not for filing"
- Reminders и календари дедлайнов
- Категоризация транзакций
- Export данных в Excel/PDF/CSV для передачи лицензированному CPA
- Educational content (как заполнять, что такое Schedule C, что такое 1040-ES)

### Что НЕЛЬЗЯ без PTIN / EA / CPA лицензии

- E-filing tax returns от имени пользователя (1040, 1120, 2290, 1099)
- Подписание форм как preparer
- Индивидуальные tax advice ("в твоей ситуации делай X")
- Маркетинг как "tax preparation service" или "we file your taxes"
- Хранение данных для последующей подачи декларации

### Обязательный дисклеймер

В Settings → Legal и в footer каждой страницы модуля Бухгалтерия:

> **Disclaimer:** TruckerBook provides calculators, organizers, and informational tools for tax planning purposes only. This is NOT tax advice and does NOT replace consultation with a licensed CPA, Enrolled Agent, or tax preparer. Before filing any tax return, consult a qualified tax professional. TruckerBook is not affiliated with the IRS, IFTA, Inc., or any government agency.

Перевести на все 8 языков. Ключ: `legal.taxDisclaimer`.

---

## 3. ФИЧИ ПО ПРИОРИТЕТАМ

### TIER 1 — MVP (для всех owner_operator + company)

#### 1.1. IFTA Quarterly ✅ (в разработке)
**Статус:** базовая инфраструктура готова (data layer, calculator, UI компонент). Осталось: интеграция в новый Документы → Бухгалтерия, Save Draft / Save Filing, PDF export.  
**Юридический статус:** OK — это organizer, пользователь сам подаёт через base jurisdiction.  
**Под-вкладка:** "IFTA Quarterly"

#### 1.2. Per Diem Tracker
**Что делает:** автоматически считает дни в дороге (на основе trips.start_date / end_date), умножает на стандартную IRS day rate ($69/день для transportation workers в 2026), показывает потенциальный налоговый вычет за квартал и год.  
**Источник данных:** уже существующая таблица `trips`.  
**Юридический статус:** OK — informational calculator. Пользователь использует это для своей Schedule C.  
**Дополнительно:** возможность отметить "partial day" (день начала/окончания рейса = 75% от full day rate).  
**Что нужно от Claude Code:** новый компонент `PerDiemTracker.jsx`, добавить в БД таблицу `per_diem_settings` (user_id, daily_rate, partial_day_percent) для override стандартной ставки.  
**Под-вкладка:** "Per Diem"

#### 1.3. Quarterly Estimated Tax Calculator (1040-ES)
**Что делает:** берёт net income (доход − расходы) из существующих таблиц `trips` и расходы из `vehicle_expenses` + `byt_expenses`, рассчитывает:
- Self-Employment Tax (15.3% от 92.35% net income)
- Estimated Federal Income Tax (по federal brackets с учётом standard deduction)
- Quarterly payment = (annual estimate − already paid) / remaining quarters
- Дедлайны: 15 апреля, 15 июня, 15 сентября, 15 января

**Юридический статус:** OK — это калькулятор, не filing. Пользователь сам платит через IRS Direct Pay или EFTPS.  
**Дисклеймер обязателен:** "This is an estimate based on your data. Actual tax liability depends on factors not tracked in this app (other income, deductions, credits, filing status). Consult a CPA before making payments."  
**Что нужно от Claude Code:** компонент `QuarterlyTaxCalculator.jsx`, утилита `src/utils/federalTaxCalculator.js` с актуальными 2026 brackets.  
**Под-вкладка:** "Quarterly Taxes"

#### 1.4. Tax Summary Export (Annual)
**Что делает:** генерирует годовой отчёт в PDF и Excel с данными для CPA:
- Total revenue (gross)
- Все расходы по IRS Schedule C категориям (Car & truck expenses, Insurance, Repairs, Supplies, Travel, Meals, Office expense, Legal & professional, Depreciation, Other)
- Total miles (business / personal split)
- Per diem days
- IFTA paid by quarter
- Form 2290 paid

**Юридический статус:** OK — это data export, не filing.  
**Watermark:** "PREPARED BY TRUCKERBOOK — REVIEW WITH YOUR CPA BEFORE FILING"  
**Под-вкладка:** "Annual Tax Summary"

#### 1.5. Filing Reminders Calendar
**Что делает:** показывает все federal и state дедлайны с countdown:
- Q1 1040-ES — April 15
- Q2 1040-ES — June 15
- Q3 1040-ES — September 15
- Q4 1040-ES — January 15
- IFTA Q1 — April 30
- IFTA Q2 — July 31
- IFTA Q3 — October 31
- IFTA Q4 — January 31
- Form 2290 (HVUT) — August 31
- Florida LLC Annual Report — May 1
- MCS-150 — каждые 2 года в месяц регистрации
- BOC-3 — однократно
- 1099-NEC выпуск (для company) — January 31

**Push notifications:** за 30 дней, за 7 дней, за 1 день до каждого дедлайна.  
**Юридический статус:** OK — это календарь.  
**Под-вкладка:** "Deadlines"

---

### TIER 2 — Company-only фичи

#### 2.1. Driver Settlements
**Что делает:** еженедельный расчёт оплаты водителям. Берёт `profiles.pay_type` ('per_mile' | 'percent' | 'flat') и `profiles.pay_rate` (уже в схеме), miles из trips за неделю, gross revenue из trips, считает:
- per_mile: miles × rate
- percent: gross_revenue × (rate / 100)
- flat: rate (фиксированная зарплата)

Минус deductions (advances из таблицы driver_advances, fuel advances, repairs charged to driver).  
Генерирует Settlement Statement PDF для подписи водителя.

**Юридический статус:** OK — это payroll calculator, не tax filing. Federal/state withholding для employees потребует партнёрства с payroll provider (Gusto API в будущем).  
**Под-вкладка:** "Driver Settlements"  
**Условие показа:** только для `role = 'company'`

#### 2.2. 1099-NEC Data Organizer
**Что делает:** для каждого independent contractor драйвера в company собирает суммы выплаченные за календарный год, проверяет порог $600 (обязательность 1099-NEC), генерирует:
- Список драйверов которым нужно выпустить 1099
- W-9 collection reminder
- Data export в CSV формате для импорта в Track1099 / Tax1099 / QuickBooks
- Preview формы 1099-NEC с водяным знаком "DRAFT"

**Юридический статус:** OK — это data preparation, не filing. Filing делает Track1099 ($2.99/форма) или CPA.  
**Под-вкладка:** "1099-NEC Prep"  
**Условие показа:** только для `role = 'company'`

#### 2.3. Fleet P&L by Vehicle
**Что делает:** рентабельность каждой машины в флоте — revenue, expenses, profit margin, cost per mile. Помогает решать какие машины оставить, какие продать.  
**Юридический статус:** OK — internal management reporting.  
**Под-вкладка:** "Fleet P&L"  
**Условие показа:** только для `role = 'company'`

---

### TIER 3 — Premium / Future

#### 3.1. Section 179 / MACRS Depreciation Calculator
Амортизация трака для tax purposes. Section 179 позволяет списать до $1.16M в год (2026 limit). MACRS = 5-year depreciation для траков. Калькулятор показывает обе опции, пользователь выбирает оптимальную.

#### 3.2. Form 2290 (HVUT) Preview & Reminder
Heavy Vehicle Use Tax — $550/год за каждую машину >55,000 lbs. Дедлайн 31 августа за следующий tax year (Jul 1 – Jun 30). Калькулятор + reminder + draft Form 2290 (НЕ filing — пользователь подаёт через ExpressTruckTax или CPA).

#### 3.3. Schedule C Builder (Preview)
Собирает все расходы по IRS категориям, показывает preview Schedule C как он будет выглядеть в декларации. Watermark "DRAFT — not for filing". Используется как input для CPA или для самостоятельного ввода в TurboTax.

#### 3.4. Mileage Log (IRS-Compliant)
Экспорт всех GPS-треков в формате IRS Publication 463. Уже есть данные в `trip_waypoints`, нужен только форматтер.

#### 3.5. Multi-state Filing Reminders
Annual reports для всех штатов где зарегистрированы LLC, sales tax permits, business licenses.

#### 3.6. Bank Reconciliation Helper
Импорт CSV выписок (Mercury, Chase, Wells Fargo, Bluevine), автоматическая категоризация транзакций через AI, сверка с расходами введёнными в TruckerBook.

---

## 4. РОАДМАП РАЗРАБОТКИ

### Спринт 1 (текущая неделя)
- [x] IFTA data layer (calculator, geocoding, state miles)
- [x] IFTA UI компонент с i18n
- [ ] Создать карточку "Бухгалтерия" в Документах с условным рендером по ролям
- [ ] Создать экран `BookkeepingHome.jsx` со списком под-вкладок (пока только IFTA)
- [ ] Перенести IftaTab внутрь BookkeepingHome
- [ ] Save Draft / Save Filing для IFTA

### Спринт 2 (следующая неделя)
- [ ] Per Diem Tracker (Tier 1.2)
- [ ] PDF export для IFTA отчёта

### Спринт 3
- [ ] Quarterly Estimated Tax Calculator (Tier 1.3)
- [ ] Filing Reminders Calendar (Tier 1.5)

### Спринт 4
- [ ] Annual Tax Summary Export (Tier 1.4)

### Спринт 5+
- [ ] Driver Settlements (Tier 2.1) — для company
- [ ] 1099-NEC Organizer (Tier 2.2) — для company
- [ ] Fleet P&L (Tier 2.3) — для company

### Backlog (Tier 3)
- Section 179 calculator
- Form 2290 helper
- Schedule C Builder
- IRS Mileage Log export
- Multi-state filing reminders
- Bank reconciliation

---

## 5. ИЗМЕНЕНИЯ В БД

### Новые таблицы
```sql
-- Per Diem настройки
CREATE TABLE per_diem_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  daily_rate numeric NOT NULL DEFAULT 69.00,
  partial_day_percent numeric NOT NULL DEFAULT 0.75,
  effective_year integer NOT NULL DEFAULT 2026,
  updated_at timestamptz DEFAULT now()
);

-- Сохранённые квартальные tax estimates
CREATE TABLE quarterly_tax_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  quarter integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year integer NOT NULL,
  estimated_se_tax numeric,
  estimated_income_tax numeric,
  total_payment numeric,
  status text DEFAULT 'draft',  -- draft | paid | skipped
  paid_amount numeric,
  paid_date date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, quarter, year)
);

-- Annual tax summaries
CREATE TABLE annual_tax_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  summary_data jsonb,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year)
);

-- Filing deadlines (statique reference + user overrides)
CREATE TABLE filing_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  deadline_type text NOT NULL,  -- '1040-ES-Q1', 'IFTA-Q1', 'Form-2290', etc.
  due_date date NOT NULL,
  status text DEFAULT 'pending',  -- pending | done | snoozed
  notes text,
  created_at timestamptz DEFAULT now()
);

-- RLS для всех новых таблиц: 
-- Owner видит свои + company-владелец видит данные водителей через company_id
```

### Изменения в существующих таблицах
Не требуются — `vehicle_expenses`, `byt_expenses`, `trips`, `fuel_entries`, `profiles` уже содержат всё нужное.

---

## 6. EB-2 NIW POSITIONING

Этот модуль — **главный visa-аргумент** TruckerBook. Формулировка для immigration attorney:

> I developed an AI-powered self-service compliance platform that reduces the cost of tax and regulatory compliance for the 350,000 owner-operators and small fleet owners in the United States trucking industry. The platform automates IFTA quarterly fuel tax calculations, federal estimated tax projections, per diem tracking, mileage logs, annual tax summaries, and 1099-NEC preparation for fleet operators. By replacing $3,000–5,000/year in third-party services (TruckLogics, ATBS, Trucker CFO) and reducing the bookkeeping burden for non-English-speaking immigrant drivers, the platform lowers the barrier to entry for small business ownership in a critical infrastructure sector. Trucking moves 72% of all freight in the United States; the long-term shortage of owner-operators directly affects supply chain resilience and inflation. By making compliance accessible and affordable, this work serves substantial merit and national importance under the Matter of Dhanasar framework.

Каждая фича Tier 1/2 = отдельный бюллетень в evidence portfolio:
- IFTA module → "automated multi-jurisdictional fuel tax compliance"
- Per Diem → "automated IRS deduction tracking saving avg $15,000/yr per driver"
- Quarterly Tax → "preventing IRS penalties for self-employed truckers"
- 1099-NEC → "facilitating contractor compliance for small fleet operators"
- Filing Reminders → "preventing administrative penalties through timely notifications"

Каждая фича = отдельный LinkedIn post, Instagram reel, контент-кейс.

---

## 7. ПРИНЦИП РАБОТЫ С CLAUDE CODE

Каждая новая фича добавляется отдельным промптом по правилу из CLAUDE.md:
1. Discovery промпт (что есть, что добавить, ничего не менять)
2. SQL миграция в Supabase SQL Editor (вручную)
3. Implementation промпт (одна фича — один промпт)
4. i18n промпт (переводы для 8 языков, если в implementation забыли)
5. Integration промпт (подключение к Документы → Бухгалтерия)

Финальная команда каждого промпта остаётся:  
`Не трогать: существующие вкладки экспорта, финансы, профиль. npm run build && git add -A && git commit -m '[message]' && git push`

---

**END OF ROADMAP**
