import { useNavigate } from 'react-router-dom'

const H2 = { fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '28px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }
const P  = { fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.65, margin: '0 0 10px' }
const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)', marginBottom: 14 }
const CHIP = { display: 'inline-block', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 700, fontSize: 12, padding: '2px 10px', borderRadius: 12, marginRight: 6 }

const MODULES = [
  { icon: '📷', name: 'Сканер',   what: 'Загрузите фото или PDF документа (можно несколько сразу) — AI распознает реквизиты: контрагента, ИНН, сумму, НДС. Вы проверяете и подтверждаете. Из PDF со строками товаров автоматически извлекаются позиции.' },
  { icon: '🗂', name: 'Архив',    what: 'Все подтверждённые документы с поиском и фильтрами. Отсюда — выгрузка документов в 1С (Excel) и справочника контрагентов.' },
  { icon: '📋', name: 'Журнал',   what: 'Проводки по документам и банку (правила + AI, спорные — «На проверке»). Вкладка ОСВ — оборотно-сальдовая ведомость с выгрузкой в Excel. Закрытие периодов.' },
  { icon: '⚡', name: 'ЭСФ',      what: 'Реестр входящих и исходящих счетов-фактур, книги покупок и продаж с выгрузкой в Excel. ЭСФ из Сканера попадают сюда автоматически.' },
  { icon: '📦', name: 'Товары',   what: 'Единый справочник номенклатуры. Один и тот же товар у разных поставщиков называется по-разному — здесь строки привязываются к одной канонической позиции. Система запоминает ваши решения и дальше привязывает сама.' },
  { icon: '🏦', name: 'Банк',     what: 'Импорт выписок (Оптима XLSX, Демир PDF), автосверка платежей с документами, курсы НБКР. Кнопка «Экспорт в 1С» выгружает выписку в формате клиент-банка — 1С загружает её штатно.' },
  { icon: '💼', name: 'Зарплата', what: 'Расчёт по ставкам КР (ПН 10%, ПФР 8%, ГНПФР 2%, СФ 17.5%), авансы, отпуска, расчётная ведомость в Excel. Для компаний, где зарплата не ведётся в 1С.' },
  { icon: '📅', name: 'Сроки',    what: 'Налоговый календарь по режиму компании: соцфонд до 15-го, НДС до 25-го, остальное до 20-го. Напоминания за 5 дней. Сводный календарь по всем компаниям — на главной.' },
  { icon: '💬', name: 'Чат',      what: 'AI-помощник по данным компании: «сколько мы должны Яросу?», «какие платежи были в мае?» — отвечает по журналу, банку, ЭСФ. Плюс готовые письма клиенту.' },
]

const STEPS = [
  ['1', 'Клиент прислал документы', 'Сканер: загрузите фото/PDF пачкой. AI распознает, вы проверите реквизиты и подтвердите. Товарные позиции из PDF извлекутся сами.'],
  ['2', 'Пришла банковская выписка', 'Банк: импортируйте файл — операции загрузятся без дублей и автоматически сверятся с документами и ЭСФ.'],
  ['3', 'Разобрать новые товары', 'Товары → Проверка: новые позиции привяжите к справочнику или создайте. Одно решение — на все одинаковые строки. Дальше система привязывает сама.'],
  ['4', 'Перенести в 1С', 'Банк → «Экспорт в 1С» (файл выписки) и Архив → «Экспорт в 1С» (документы построчно). Выгружается только новое — задвоение исключено. В 1С: «Обмен с банком» и «Загрузка из табличного документа».'],
  ['5', 'Контроль', 'Главная: сроки по всем компаниям, что просрочено, что не разнесено. Журнал → ОСВ: сводная картина по счетам.'],
]

const TEST_CHECKLIST = [
  'Сканер: загрузите 2–3 PDF пачкой — проверьте, что реквизиты распознаны верно, исправьте и подтвердите',
  'Товары: после первого документа новые позиции окажутся в «Проверке» — создайте канонические позиции. Загрузите второй документ того же поставщика — строки должны привязаться автоматически',
  'Банк: импортируйте выписку — проверьте «🔗 автоматически сверено», затем «Экспорт в 1С» и загрузите файл в вашу 1С через «Обмен с банком». Это главная проверка!',
  'Архив: «Экспорт в 1С», затем нажмите ещё раз — система скажет, что всё уже выгружено (защита от задвоения)',
  'Контуры: создайте счёт-кассу с типом «Внутренний», добавьте операцию — она видна в ОСВ (фильтр «Внутренне»), но НЕ попадает в экспорты для 1С',
  'Сроки: нажмите «Сгенерировать» — соцфонд должен встать на 15-е, НДС на 25-е. Отметьте что-нибудь сданным прямо с главной страницы',
  'Зарплата: проведите расчёт, затем удалите его — проводки должны исчезнуть из журнала и ОСВ',
]

export default function Help() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'Manrope, sans-serif' }}>

      {/* Шапка */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>❓ Справка</div>
        <button onClick={() => navigate('/')}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text2)' }}>
          ← На главную
        </button>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* Что это */}
        <div style={{ ...CARD, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            Бух<span style={{ color: 'var(--accent)' }}>Агент</span> — помощник бухгалтера до 1С
          </div>
          <p style={P}>
            Это <b>не замена 1С</b>, а подготовительный слой перед ней. Приложение берёт на себя самую
            трудоёмкую рутину — <b>ввод первички, разбор банковских выписок и наведение порядка
            в номенклатуре</b> — и отдаёт результат в 1С готовыми файлами, которые загружаются штатными средствами.
          </p>
          <p style={{ ...P, margin: 0 }}>
            <span style={CHIP}>Для кого</span> Бухгалтер на аутсорсе, ведущий несколько компаний удалённо.
            Каждая компания — отдельное пространство со своими документами, банком, справочниками и календарём.
          </p>
        </div>

        {/* Что оптимизирует */}
        <h2 style={H2}>⚡ Что автоматизируется</h2>
        <div style={CARD}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.9 }}>
            <li><b>Ручной ввод первички</b> — фото/PDF распознаёт AI, вы только проверяете</li>
            <li><b>Перебивание выписки в 1С</b> — выписка импортируется сюда, сверяется с документами и уходит в 1С файлом клиент-банка</li>
            <li><b>Хаос в номенклатуре</b> — «тридцать написаний одного товара» сводятся к единому справочнику, который запоминает решения</li>
            <li><b>Контроль сроков по всем клиентам</b> — один календарь вместо памяти и стикеров</li>
            <li><b>Ответы клиентам</b> — AI-чат отвечает по данным компании за секунды</li>
          </ul>
        </div>

        {/* Рабочий цикл */}
        <h2 style={H2}>🔄 Рабочий цикл — неделя бухгалтера</h2>
        {STEPS.map(([n, title, text]) => (
          <div key={n} style={{ ...CARD, display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 18px' }}>
            <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{n}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{text}</div>
            </div>
          </div>
        ))}

        {/* Модули */}
        <h2 style={H2}>🧩 Модули</h2>
        <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          {MODULES.map((m, i) => (
            <div key={m.name} style={{ display: 'flex', gap: 12, padding: '13px 18px', borderBottom: i < MODULES.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{m.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', marginBottom: 2 }}>{m.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55 }}>{m.what}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Ключевые понятия */}
        <h2 style={H2}>🔑 Два понятия, которые важно знать</h2>
        <div style={CARD}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>🔒 Контуры учёта: официальный и внутренний</div>
          <p style={P}>
            Каждый документ, счёт и операция принадлежит контуру. <b>Официальный</b> — то, что идёт в 1С
            и налоговую. <b>Внутренний</b> — то, что учитывается только здесь (например, отдельная касса).
            Внутреннее <b>физически не попадает</b> в выгрузки для 1С, но видно в ОСВ — так собирается
            полная картина для работодателя. Пометить можно счёт целиком, отдельную операцию или документ.
          </p>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', margin: '14px 0 4px' }}>→1С Отметка выгрузки</div>
          <p style={{ ...P, margin: 0 }}>
            Всё выгруженное в 1С помечается. Повторный экспорт возьмёт <b>только новое</b> — задвоение
            данных в 1С исключено. Выгружайте хоть каждый день.
          </p>
        </div>

        {/* Чек-лист тестирования */}
        <h2 style={H2}>🧪 Сценарий проверки (для тестирования)</h2>
        <div style={CARD}>
          <p style={P}>Пройдите по шагам на реальных документах одной компании:</p>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text2)', lineHeight: 1.9 }}>
            {TEST_CHECKLIST.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
          <p style={{ ...P, marginTop: 12, marginBottom: 0, fontSize: 12.5, color: 'var(--text3)' }}>
            Если что-то распозналось неверно, сроки не совпадают с вашей практикой или не хватает
            функции — записывайте, это и есть цель тестирования.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={() => navigate('/')}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow)' }}>
            Начать работу →
          </button>
        </div>
      </div>
    </div>
  )
}
