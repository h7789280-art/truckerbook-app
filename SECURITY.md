# SECURITY.md — TruckerBook

Чек-лист безопасности приложения. Обновляется при закрытии каждого пункта.

**Последнее обновление:** 2026-04-21
**Владелец:** Elena
**Стек:** Vite + React + Supabase + n8n + Gemini + Vercel

---

## Классификация данных

TruckerBook хранит чувствительные финансовые данные:

- Доходы и расходы пользователей (trips, fuel_entries, personal_expenses)
- Налоговые данные (Schedule C, SE tax, quarterly payments)
- Персональные идентификаторы (state_of_residence, filing_status)
- Потенциально: SSN, EIN, банковские реквизиты (при расширении)
- Маршруты и геолокация (IFTA)

**Уровень защиты:** как финансовое приложение (не medical/HIPAA, но близко).

---

## 🔴 УРОВЕНЬ 1 — Критично (до публичного запуска)

### 1.1. Ротация всех серверных ключей
- [ ] `GEMINI_API_KEY` — ротировать в Google AI Studio
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — reset в Supabase dashboard
- [ ] `N8N_API_KEY` — ротировать в n8n
- [ ] `GOOGLE_API_KEY` — ротировать в Google Cloud Console
- [ ] Все новые ключи пометить в Vercel как **Sensitive**
- [ ] Redeploy проекта после обновления

**Триггер:** Vercel security incident апрель 2026 + новая фича Sensitive env vars.

### 1.2. Закрыть дыру в незащищённых API-эндпоинтах
- [ ] `api/scan-receipt.js` — добавить JWT + rate-limit по шаблону `api/gemini.js`
- [ ] `api/smart-scan.js` — то же
- [ ] `api/parse-trip.js` — то же

**Причина:** сейчас любой анонимный клиент может дёргать эти эндпоинты и жечь квоту Gemini за счёт проекта.

### 1.3. Удалить VITE_GEMINI_API_KEY
- [x] Миграция `runDeductionAudit`
- [x] Миграция `AIForecast`
- [x] Миграция `geminiVision`
- [x] Миграция `scanPartInvoice` (2026-04-20, коммит 73ccbd6)
- [ ] Миграция `voiceInput`
- [ ] Миграция `tachographParser`
- [ ] Удалить `VITE_GEMINI_API_KEY` из Vercel env
- [ ] Передеплой + проверить что в бандле ключа нет (DevTools → Sources → Search)

### 1.4. Supabase Row Level Security (RLS)
- [ ] Проверить что RLS включен на всех таблицах: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`
- [ ] Проверить политики на каждой таблице (SELECT/INSERT/UPDATE/DELETE)
- [ ] Основное правило: `auth.uid() = user_id` в каждой политике
- [ ] Тест: попытаться прочитать чужие trips через curl с чужим user_id → должен вернуться пустой массив
- [ ] Особое внимание: profiles, trips, fuel_entries, personal_expenses, quarterly_tax_payments, shifts

### 1.5. Проверка git-истории на утечки
- [ ] `git log --all -p | grep -iE "api.key|secret|password|AIzaSy|eyJ"` — не должно быть хитов
- [ ] Если есть старые утёкшие ключи — ротировать их и зачистить историю через `git filter-repo`
- [ ] Добавить в `.gitignore`: `.env`, `.env.local`, `.env.*.local`

---

## 🟠 УРОВЕНЬ 2 — Важно (в течение 2 недель после запуска)

### 2.1. Реальный распределённый rate limit
- [ ] Подключить Upstash Redis (бесплатный тариф: 10k команд/день)
- [ ] Заменить in-memory Map в `api/gemini.js` на Redis INCR с TTL
- [ ] Альтернатива: таблица `rate_limit_counters` в Supabase

**Причина:** на Vercel каждая serverless invocation может подняться на новом инстансе — in-memory лимит размазывается.

### 2.2. Логирование подозрительной активности
- [ ] Логировать в Vercel при 401/429/413: `{ user_id, ip, timestamp, endpoint, status, user_agent }`
- [ ] Ревью логов раз в неделю
- [ ] Паттерны для тревоги: один user_id с 1000+ запросов/день, один IP с десятков user_id, всплески 429

### 2.3. Content Security Policy (CSP)
- [ ] Добавить в `vercel.json` → `headers`:
  - `Content-Security-Policy`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (выключить камеру/микрофон для origin где не нужно)

### 2.4. Cookie и Auth настройки
- [ ] Проверить Supabase Auth: `secure: true`, `httpOnly: true`, `sameSite: 'strict'`
- [ ] Session refresh: не больше 1 часа
- [ ] Email confirmation ON для новых регистраций

### 2.5. 2FA на все админские аккаунты
- [ ] GitHub (где код)
- [ ] Vercel (где прод)
- [ ] Supabase (где данные пользователей)
- [ ] Google Cloud (где Gemini ключ)
- [ ] Email-провайдер (корень всего — если взломают email, восстановят всё остальное)
- [ ] Domain registrar (если есть кастомный домен)

### 2.6. Резервные коды 2FA
- [ ] Скачать backup codes для каждого сервиса
- [ ] Распечатать, положить в безопасное место (сейф / банковская ячейка)
- [ ] НЕ хранить в облаке (Google Drive / iCloud) в открытом виде

### 2.7. Password hygiene
- [ ] Уникальный пароль для каждого сервиса (использовать менеджер паролей: 1Password/Bitwarden)
- [ ] Мастер-пароль длиной 20+ символов
- [ ] Проверить все пароли через https://haveibeenpwned.com/Passwords

---

## 🟡 УРОВЕНЬ 3 — Рекомендуется (в течение 2 месяцев)

### 3.1. Supabase Vault для секретов в БД
- [ ] Если появятся OAuth-токены пользователей или API-ключи для интеграций — хранить через Supabase Vault (шифрование at-rest)

### 3.2. Регулярные бэкапы БД
- [ ] Supabase Pro автоматические бэкапы — проверить что включены
- [ ] Ручной экспорт критичных таблиц раз в месяц: profiles, trips, fuel_entries, personal_expenses, quarterly_tax_payments, shifts
- [ ] Тест восстановления: раз в квартал восстановить бэкап в staging и проверить целостность

### 3.3. Audit trail критичных действий
- [ ] Таблица `audit_log`: `{ user_id, action, table_name, record_id, old_value, new_value, timestamp, ip }`
- [ ] Триггеры на UPDATE/DELETE для: profiles, quarterly_tax_payments, tax_withhold_pct
- [ ] Логирование экспортов (Year-end Tax Package) — для защиты от споров

### 3.4. Мониторинг квот и алерты
- [ ] Google Cloud Console → Gemini API → alerts на 80% квоты
- [ ] Supabase → alerts на необычную нагрузку
- [ ] Vercel → bandwidth alerts
- [ ] Настроить уведомления на email + Telegram/SMS

### 3.5. Dependabot и npm audit
- [ ] GitHub → Settings → Security → Dependabot alerts ON
- [ ] GitHub → Dependabot security updates ON
- [ ] Раз в неделю просматривать алерты
- [ ] `npm audit fix` в CI перед деплоем

### 3.6. Разделение ролей Supabase
- [ ] Создать отдельную read-only роль для аналитики/отчётов
- [ ] `service_role` использовать ТОЛЬКО там, где нужен обход RLS (миграции, админка)
- [ ] Никогда не использовать `service_role` из клиентского кода

### 3.7. Incident Response Plan
- [ ] Документ: что делать, если ключ утёк
- [ ] Документ: что делать, если БД скомпрометирована
- [ ] Документ: что делать, если аккаунт взломан
- [ ] Контакты: support Supabase, Vercel, Google Cloud, юрист
- [ ] Шаблон уведомления пользователей об утечке (по GDPR — 72 часа)

---

## 🟢 УРОВЕНЬ 4 — Для зрелого продукта (100+ платящих пользователей)

### 4.1. Внешний security audit
- [ ] Нанять penetration tester на 1 неделю ($2-5k)
- [ ] OWASP Top 10 проверка
- [ ] Отчёт → закрыть найденное → повторный аудит через полгода

### 4.2. Шифрование чувствительных полей на уровне приложения
- [ ] SSN, EIN, банковские реквизиты — шифровать ПЕРЕД отправкой в Supabase
- [ ] Ключ шифрования — Supabase Vault или внешний KMS (AWS KMS / Google Cloud KMS)
- [ ] Даже при утечке БД эти поля остаются бесполезными

### 4.3. Compliance (если пойдёт B2B)
- [ ] SOC 2 Type I (первый год, ~$20k)
- [ ] SOC 2 Type II (второй год, ~$30k)
- [ ] Открывает корпоративные продажи

### 4.4. Bug bounty программа
- [ ] Публичная страница "нашёл уязвимость → напиши сюда, заплатим $50-500"
- [ ] Альтернатива: платформа HackerOne / Bugcrowd
- [ ] Отсеивает часть "серых" хакеров

### 4.5. Legal compliance
- [ ] **GDPR** (европейские пользователи): право на удаление, экспорт, cookie consent
- [ ] **CCPA** (Калифорния): аналогично GDPR
- [ ] **IRS Publication 4557** (если позиционируешь как tax prep software): отдельный список требований
- [ ] **PCI DSS** (если будут прямые платежи картой) — лучше через Stripe, они берут compliance на себя
- [ ] Privacy Policy и Terms of Service — составить с юристом, не копировать с шаблонов

---

## Что уже сделано правильно ✅

- ✅ Supabase с RLS политиками на основных таблицах
- ✅ JWT-авторизация через `supabase.auth.getSession()`
- ✅ Переход на серверный прокси `/api/gemini` для AI (миграция 4/6 на 2026-04-20)
- ✅ Rate limit в прокси (in-memory, 20 req / 60 сек per user_id)
- ✅ CORS-ограничения
- ✅ Валидация payload (4MB для image, 10MB для audio/octet-stream)
- ✅ Retry с таймаутом через AbortController
- ✅ Ключи не в git-истории (проверено grep'ом)
- ✅ HTTPS на всём проде (Vercel из коробки)
- ✅ Разделение: публичные VITE_SUPABASE_* ключи vs серверные SUPABASE_SERVICE_ROLE_KEY

---

## История инцидентов и реакции

### 2026-04-19 — Vercel security incident (Context.ai OAuth compromise)
- **Статус для TruckerBook:** не затронуто (ключи добавлены в Vercel после окна инцидента)
- **Реакция:** плановая ротация всех серверных ключей (см. 1.1)
- **Ссылка:** https://vercel.com/kb/bulletin/vercel-april-2026-security-incident

---

## Правила для следующих сессий Claude Code

Всегда при работе с кодом, связанным с безопасностью:

1. Не коммитить ключи, даже в тестах
2. Все новые API-эндпоинты должны иметь JWT + rate-limit по шаблону `api/gemini.js`
3. Все новые Supabase-таблицы должны иметь RLS-политики с `auth.uid() = user_id`
4. Никогда не использовать `SUPABASE_SERVICE_ROLE_KEY` в клиентском коде
5. Валидировать все user input на сервере (не полагаться на клиентскую валидацию)
6. Любая новая AI-функция — через `/api/gemini` прокси, никогда напрямую из браузера

---

## Контакты на случай инцидента

- Supabase support: https://supabase.com/dashboard/support/new
- Vercel support: https://vercel.com/help
- Google Cloud security: https://cloud.google.com/support
- GitHub security: https://github.com/contact/security

---

**Следующий review этого файла:** через 1 месяц или после крупного инцидента.
