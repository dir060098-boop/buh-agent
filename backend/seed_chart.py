"""
План счетов бухгалтерского учёта КР
Приложение №1 к Постановлению Государственной комиссии
при Правительстве КР по стандартам финансовой отчётности
от 18.11.2002 №28

Полностью синхронизирован с официальным документом.
"""

CHART_OF_ACCOUNTS = [
    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 1: КРАТКОСРОЧНЫЕ АКТИВЫ (1000-1900)
    # ══════════════════════════════════════════════════════
    {"code":"1000","name":"Краткосрочные активы","section":"1000","account_type":"active","level":1,"parent_code":None},

    # 1100 — Денежные средства в кассе
    {"code":"1100","name":"Денежные средства в кассе","section":"1000","account_type":"active","level":2,"parent_code":"1000"},
    {"code":"1110","name":"Денежные средства в национальной валюте (касса)","section":"1000","account_type":"active","level":3,"parent_code":"1100"},
    {"code":"1120","name":"Денежные средства в иностранной валюте (касса)","section":"1000","account_type":"active","level":3,"parent_code":"1100"},
    {"code":"1130","name":"Денежные документы","section":"1000","account_type":"active","level":3,"parent_code":"1100"},
    {"code":"1140","name":"Денежные эквиваленты","section":"1000","account_type":"active","level":3,"parent_code":"1100"},

    # 1200 — Денежные средства в банке
    {"code":"1200","name":"Денежные средства в банке","section":"1000","account_type":"active","level":2,"parent_code":"1000"},
    {"code":"1210","name":"Счета в национальной валюте (банк)","section":"1000","account_type":"active","level":3,"parent_code":"1200"},
    {"code":"1220","name":"Счета в иностранной валюте в местных банках","section":"1000","account_type":"active","level":3,"parent_code":"1200"},
    {"code":"1230","name":"Счета в зарубежных банках","section":"1000","account_type":"active","level":3,"parent_code":"1200"},
    {"code":"1240","name":"Денежные средства в банках, ограниченные к использованию","section":"1000","account_type":"active","level":3,"parent_code":"1200"},
    {"code":"1250","name":"Денежные средства в пути","section":"1000","account_type":"active","level":3,"parent_code":"1200"},

    # 1300 — Краткосрочные инвестиции
    {"code":"1300","name":"Краткосрочные инвестиции","section":"1000","account_type":"active","level":2,"parent_code":"1000"},
    {"code":"1310","name":"Долговые ценные бумаги (краткосрочные)","section":"1000","account_type":"active","level":3,"parent_code":"1300"},
    {"code":"1320","name":"Долевые ценные бумаги (краткосрочные)","section":"1000","account_type":"active","level":3,"parent_code":"1300"},
    {"code":"1330","name":"Кредиты и займы выданные (краткосрочные)","section":"1000","account_type":"active","level":3,"parent_code":"1300"},
    {"code":"1340","name":"Депозитные вклады (краткосрочные)","section":"1000","account_type":"active","level":3,"parent_code":"1300"},
    {"code":"1350","name":"Текущая часть долгосрочных инвестиций","section":"1000","account_type":"active","level":3,"parent_code":"1300"},
    {"code":"1390","name":"Прочие краткосрочные инвестиции","section":"1000","account_type":"active","level":3,"parent_code":"1300"},

    # 1400 — Счета к получению
    {"code":"1400","name":"Счета к получению","section":"1000","account_type":"active","level":2,"parent_code":"1000"},
    {"code":"1410","name":"Счета к получению за товары и услуги","section":"1000","account_type":"active","level":3,"parent_code":"1400"},
    {"code":"1491","name":"Резерв на безнадёжные долги по счетам к получению","section":"1000","account_type":"active","level":3,"parent_code":"1400"},

    # 1500 — Дебиторская задолженность по прочим операциям
    {"code":"1500","name":"Дебиторская задолженность по прочим операциям","section":"1000","account_type":"active","level":2,"parent_code":"1000"},
    {"code":"1510","name":"Векселя к получению","section":"1000","account_type":"active","level":3,"parent_code":"1500"},
    {"code":"1520","name":"Дебиторская задолженность сотрудников и директоров","section":"1000","account_type":"active","level":3,"parent_code":"1500"},
    {"code":"1530","name":"Налоги, оплаченные авансом","section":"1000","account_type":"active","level":3,"parent_code":"1500"},
    {"code":"1540","name":"Налоги, подлежащие возмещению (НДС к возмещению)","section":"1000","account_type":"active","level":3,"parent_code":"1500"},
    {"code":"1550","name":"Проценты к получению","section":"1000","account_type":"active","level":3,"parent_code":"1500"},
    {"code":"1560","name":"Дивиденды к получению","section":"1000","account_type":"active","level":3,"parent_code":"1500"},
    {"code":"1570","name":"Задолженность заказчиков по договору на строительство","section":"1000","account_type":"active","level":3,"parent_code":"1500"},
    {"code":"1580","name":"Текущая часть долгосрочной дебиторской задолженности","section":"1000","account_type":"active","level":3,"parent_code":"1500"},
    {"code":"1590","name":"Прочая краткосрочная дебиторская задолженность","section":"1000","account_type":"active","level":3,"parent_code":"1500"},

    # 1600 — Товарно-материальные запасы
    {"code":"1600","name":"Товарно-материальные запасы (ТМЗ)","section":"1000","account_type":"active","level":2,"parent_code":"1000"},
    {"code":"1610","name":"Товары (для торговых организаций)","section":"1000","account_type":"active","level":3,"parent_code":"1600"},
    {"code":"1691","name":"Нереализованная торговая наценка","section":"1000","account_type":"active","level":3,"parent_code":"1600"},
    {"code":"1620","name":"Запасы сырья и основных материалов","section":"1000","account_type":"active","level":3,"parent_code":"1600"},
    {"code":"1630","name":"Незавершённое производство","section":"1000","account_type":"active","level":3,"parent_code":"1600"},
    {"code":"1640","name":"Готовая продукция","section":"1000","account_type":"active","level":3,"parent_code":"1600"},
    {"code":"1650","name":"Сельхозпродукция с биологических активов","section":"1000","account_type":"active","level":3,"parent_code":"1600"},

    # 1700 — Запасы вспомогательных материалов
    {"code":"1700","name":"Запасы вспомогательных материалов","section":"1000","account_type":"active","level":2,"parent_code":"1000"},
    {"code":"1710","name":"Топливо","section":"1000","account_type":"active","level":3,"parent_code":"1700"},
    {"code":"1720","name":"Запасные части","section":"1000","account_type":"active","level":3,"parent_code":"1700"},
    {"code":"1730","name":"Строительные материалы","section":"1000","account_type":"active","level":3,"parent_code":"1700"},
    {"code":"1740","name":"Прочие материалы","section":"1000","account_type":"active","level":3,"parent_code":"1700"},
    {"code":"1750","name":"Малоценные и быстроизнашивающиеся предметы","section":"1000","account_type":"active","level":3,"parent_code":"1700"},
    {"code":"1795","name":"Малоценные и быстроизнашивающиеся предметы в эксплуатации","section":"1000","account_type":"active","level":3,"parent_code":"1700"},

    # 1800 — Авансы выданные
    {"code":"1800","name":"Авансы выданные","section":"1000","account_type":"active","level":2,"parent_code":"1000"},
    {"code":"1810","name":"Запасы, оплаченные авансом","section":"1000","account_type":"active","level":3,"parent_code":"1800"},
    {"code":"1820","name":"Услуги, оплаченные авансом","section":"1000","account_type":"active","level":3,"parent_code":"1800"},
    {"code":"1830","name":"Аренда, оплаченная авансом","section":"1000","account_type":"active","level":3,"parent_code":"1800"},
    {"code":"1890","name":"Прочие виды авансированных платежей","section":"1000","account_type":"active","level":3,"parent_code":"1800"},

    # 1900 — Задолженность учредителей по вкладам в уставный капитал
    {"code":"1900","name":"Задолженность учредителей по вкладам в уставный капитал","section":"1000","account_type":"active","level":2,"parent_code":"1000"},

    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 2: ДОЛГОСРОЧНЫЕ АКТИВЫ (2000-2990)
    # ══════════════════════════════════════════════════════
    {"code":"2000","name":"Долгосрочные активы","section":"2000","account_type":"active","level":1,"parent_code":None},

    # 2100 — Основные средства
    {"code":"2100","name":"Основные средства","section":"2000","account_type":"active","level":2,"parent_code":"2000"},
    {"code":"2110","name":"Земля","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2120","name":"Незавершённое строительство","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2130","name":"Здания, сооружения","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2193","name":"Накопленная амортизация — здания, сооружения","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2140","name":"Оборудование","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2194","name":"Накопленная амортизация — оборудование","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2150","name":"Компьютерное оборудование","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2195","name":"Накопленная амортизация — компьютерное оборудование","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2160","name":"Мебель и принадлежности","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2196","name":"Накопленная амортизация — мебель и принадлежности","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2170","name":"Транспортные средства","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2197","name":"Накопленная амортизация — транспортные средства","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2180","name":"Благоустройство арендованной собственности","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2198","name":"Накопленная амортизация — благоустройство арендованной собственности","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2190","name":"Благоустройство земельных участков","section":"2000","account_type":"active","level":3,"parent_code":"2100"},
    {"code":"2199","name":"Накопленная амортизация — благоустройство земельных участков","section":"2000","account_type":"active","level":3,"parent_code":"2100"},

    # 2200 — Биологические активы
    {"code":"2200","name":"Биологические активы","section":"2000","account_type":"active","level":2,"parent_code":"2000"},
    {"code":"2210","name":"Животные (потребляемые биологические активы)","section":"2000","account_type":"active","level":3,"parent_code":"2200"},
    {"code":"2220","name":"Животные (плодоносящие биологические активы)","section":"2000","account_type":"active","level":3,"parent_code":"2200"},
    {"code":"2230","name":"Растения (потребляемые биологические активы)","section":"2000","account_type":"active","level":3,"parent_code":"2200"},
    {"code":"2240","name":"Плодоносящие растения","section":"2000","account_type":"active","level":3,"parent_code":"2200"},
    {"code":"2250","name":"Биологические активы, учитываемые по фактическим затратам","section":"2000","account_type":"active","level":3,"parent_code":"2200"},
    {"code":"2290","name":"Другие биологические активы","section":"2000","account_type":"active","level":3,"parent_code":"2200"},

    # 2300 — Инвестиции в недвижимость
    {"code":"2300","name":"Инвестиции в недвижимость","section":"2000","account_type":"active","level":2,"parent_code":"2000"},
    {"code":"2310","name":"Земля (инвестиции)","section":"2000","account_type":"active","level":3,"parent_code":"2300"},
    {"code":"2320","name":"Здания и сооружения (инвестиции)","section":"2000","account_type":"active","level":3,"parent_code":"2300"},
    {"code":"2330","name":"Реконструкция объектов инвестиций в недвижимость","section":"2000","account_type":"active","level":3,"parent_code":"2300"},

    # 2400 — Отсроченные налоговые требования
    {"code":"2400","name":"Отсроченные налоговые требования","section":"2000","account_type":"active","level":2,"parent_code":"2000"},

    # 2500 — Денежные средства, ограниченные к использованию
    {"code":"2500","name":"Денежные средства, ограниченные к использованию (долгосрочные)","section":"2000","account_type":"active","level":2,"parent_code":"2000"},

    # 2700 — Долгосрочная дебиторская задолженность
    {"code":"2700","name":"Долгосрочная дебиторская задолженность","section":"2000","account_type":"active","level":2,"parent_code":"2000"},
    {"code":"2710","name":"Векселя полученные (долгосрочные)","section":"2000","account_type":"active","level":3,"parent_code":"2700"},
    {"code":"2720","name":"Долгосрочная дебиторская задолженность покупателей и заказчиков","section":"2000","account_type":"active","level":3,"parent_code":"2700"},
    {"code":"2780","name":"Долгосрочные отсроченные расходы","section":"2000","account_type":"active","level":3,"parent_code":"2700"},
    {"code":"2790","name":"Прочая долгосрочная дебиторская задолженность","section":"2000","account_type":"active","level":3,"parent_code":"2700"},

    # 2800 — Долгосрочные инвестиции
    {"code":"2800","name":"Долгосрочные инвестиции","section":"2000","account_type":"active","level":2,"parent_code":"2000"},
    {"code":"2810","name":"Долговые ценные бумаги (долгосрочные)","section":"2000","account_type":"active","level":3,"parent_code":"2800"},
    {"code":"2820","name":"Кредиты и займы выданные (долгосрочные)","section":"2000","account_type":"active","level":3,"parent_code":"2800"},
    {"code":"2830","name":"Инвестиции в дочерние компании","section":"2000","account_type":"active","level":3,"parent_code":"2800"},
    {"code":"2840","name":"Инвестиции в совместную деятельность","section":"2000","account_type":"active","level":3,"parent_code":"2800"},
    {"code":"2850","name":"Инвестиции в ассоциированные компании","section":"2000","account_type":"active","level":3,"parent_code":"2800"},
    {"code":"2890","name":"Прочие долгосрочные инвестиции","section":"2000","account_type":"active","level":3,"parent_code":"2800"},

    # 2900 — Нематериальные активы
    {"code":"2900","name":"Нематериальные активы","section":"2000","account_type":"active","level":2,"parent_code":"2000"},
    {"code":"2910","name":"Франшиза","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2991","name":"Накопленная амортизация — франшиза","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2920","name":"Гудвил","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2992","name":"Накопленная амортизация — гудвил","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2930","name":"Патенты","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2993","name":"Накопленная амортизация — патенты","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2940","name":"Торговые марки","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2994","name":"Накопленная амортизация — торговые марки","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2950","name":"Авторские права","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2995","name":"Накопленная амортизация — авторские права","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2960","name":"Программное обеспечение","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2996","name":"Накопленная амортизация — программное обеспечение","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2970","name":"Лицензионное соглашение","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2997","name":"Накопленная амортизация — лицензионное соглашение","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2980","name":"Прочие активы","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2998","name":"Накопленная амортизация — прочие активы","section":"2000","account_type":"active","level":3,"parent_code":"2900"},
    {"code":"2990","name":"Незавершённые разработки","section":"2000","account_type":"active","level":3,"parent_code":"2900"},

    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 3: КРАТКОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА (3000-3700)
    # ══════════════════════════════════════════════════════
    {"code":"3000","name":"Краткосрочные обязательства","section":"3000","account_type":"passive","level":1,"parent_code":None},

    # 3100 — Счета к оплате (торговая кредиторская задолженность)
    {"code":"3100","name":"Счета к оплате (торговая кредиторская задолженность)","section":"3000","account_type":"passive","level":2,"parent_code":"3000"},
    {"code":"3110","name":"Счета к оплате за товары и услуги","section":"3000","account_type":"passive","level":3,"parent_code":"3100"},
    {"code":"3190","name":"Прочие счета к оплате","section":"3000","account_type":"passive","level":3,"parent_code":"3100"},

    # 3200 — Авансы полученные
    {"code":"3200","name":"Авансы полученные","section":"3000","account_type":"passive","level":2,"parent_code":"3000"},
    {"code":"3210","name":"Авансы покупателей и заказчиков","section":"3000","account_type":"passive","level":3,"parent_code":"3200"},
    {"code":"3220","name":"Задолженность заказчикам по договорам на строительство","section":"3000","account_type":"passive","level":3,"parent_code":"3200"},

    # 3300 — Краткосрочные долговые обязательства
    {"code":"3300","name":"Краткосрочные долговые обязательства","section":"3000","account_type":"passive","level":2,"parent_code":"3000"},
    {"code":"3310","name":"Банковские кредиты, займы (краткосрочные)","section":"3000","account_type":"passive","level":3,"parent_code":"3300"},
    {"code":"3320","name":"Прочие кредиты, займы (краткосрочные)","section":"3000","account_type":"passive","level":3,"parent_code":"3300"},
    {"code":"3330","name":"Текущая часть долгосрочных долговых обязательств","section":"3000","account_type":"passive","level":3,"parent_code":"3300"},
    {"code":"3390","name":"Прочие краткосрочные долговые обязательства","section":"3000","account_type":"passive","level":3,"parent_code":"3300"},

    # 3400 — Налоги к оплате
    {"code":"3400","name":"Налоги к оплате","section":"3000","account_type":"passive","level":2,"parent_code":"3000"},
    {"code":"3410","name":"Налог на прибыль к оплате","section":"3000","account_type":"passive","level":3,"parent_code":"3400"},
    {"code":"3420","name":"Подоходный налог на доходы физических лиц (НДФЛ)","section":"3000","account_type":"passive","level":3,"parent_code":"3400"},
    {"code":"3430","name":"НДС к оплате","section":"3000","account_type":"passive","level":3,"parent_code":"3400"},
    {"code":"3440","name":"Акцизы к оплате","section":"3000","account_type":"passive","level":3,"parent_code":"3400"},
    {"code":"3490","name":"Прочие налоги к оплате","section":"3000","account_type":"passive","level":3,"parent_code":"3400"},

    # 3500 — Краткосрочные начисленные обязательства
    {"code":"3500","name":"Краткосрочные начисленные обязательства","section":"3000","account_type":"passive","level":2,"parent_code":"3000"},
    {"code":"3510","name":"Начисленные обязательства по оплате товаров и услуг","section":"3000","account_type":"passive","level":3,"parent_code":"3500"},
    {"code":"3520","name":"Начисленная заработная плата","section":"3000","account_type":"passive","level":3,"parent_code":"3500"},
    {"code":"3530","name":"Начисленные взносы на социальное страхование (Соцфонд)","section":"3000","account_type":"passive","level":3,"parent_code":"3500"},
    {"code":"3540","name":"Дивиденды к выплате","section":"3000","account_type":"passive","level":3,"parent_code":"3500"},
    {"code":"3550","name":"Начисленные проценты по долговым обязательствам","section":"3000","account_type":"passive","level":3,"parent_code":"3500"},
    {"code":"3590","name":"Прочие начисленные расходы","section":"3000","account_type":"passive","level":3,"parent_code":"3500"},

    # 3600 — Прочие краткосрочные обязательства
    {"code":"3600","name":"Прочие краткосрочные обязательства","section":"3000","account_type":"passive","level":2,"parent_code":"3000"},

    # 3700 — Резервы (краткосрочные)
    {"code":"3700","name":"Резервы (краткосрочные)","section":"3000","account_type":"passive","level":2,"parent_code":"3000"},

    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 4: ДОЛГОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА (4000-4500)
    # ══════════════════════════════════════════════════════
    {"code":"4000","name":"Долгосрочные обязательства","section":"4000","account_type":"passive","level":1,"parent_code":None},

    # 4100 — Долгосрочные обязательства
    {"code":"4100","name":"Долгосрочные финансовые обязательства","section":"4000","account_type":"passive","level":2,"parent_code":"4000"},
    {"code":"4110","name":"Облигации к оплате","section":"4000","account_type":"passive","level":3,"parent_code":"4100"},
    {"code":"4120","name":"Банковские кредиты, займы (долгосрочные)","section":"4000","account_type":"passive","level":3,"parent_code":"4100"},
    {"code":"4130","name":"Прочие кредиты, займы (долгосрочные)","section":"4000","account_type":"passive","level":3,"parent_code":"4100"},
    {"code":"4140","name":"Векселя к оплате (долгосрочные)","section":"4000","account_type":"passive","level":3,"parent_code":"4100"},
    {"code":"4150","name":"Обязательства по финансовой аренде","section":"4000","account_type":"passive","level":3,"parent_code":"4100"},
    {"code":"4190","name":"Прочие долгосрочные обязательства","section":"4000","account_type":"passive","level":3,"parent_code":"4100"},

    # 4200 — Отсроченные доходы
    {"code":"4200","name":"Отсроченные доходы (долгосрочные)","section":"4000","account_type":"passive","level":2,"parent_code":"4000"},

    # 4300 — Отсроченные налоговые обязательства
    {"code":"4300","name":"Отсроченные налоговые обязательства","section":"4000","account_type":"passive","level":2,"parent_code":"4000"},

    # 4500 — Долгосрочные резервы
    {"code":"4500","name":"Долгосрочные резервы","section":"4000","account_type":"passive","level":2,"parent_code":"4000"},

    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 5: СОБСТВЕННЫЙ КАПИТАЛ (5000-5999)
    # ══════════════════════════════════════════════════════
    {"code":"5000","name":"Собственный капитал","section":"5000","account_type":"passive","level":1,"parent_code":None},

    # 5100 — Уставный капитал
    {"code":"5100","name":"Уставный капитал","section":"5000","account_type":"passive","level":2,"parent_code":"5000"},
    {"code":"5110","name":"Простые акции","section":"5000","account_type":"passive","level":3,"parent_code":"5100"},
    {"code":"5120","name":"Привилегированные акции","section":"5000","account_type":"passive","level":3,"parent_code":"5100"},
    {"code":"5191","name":"Выкупленные собственные акции","section":"5000","account_type":"passive","level":3,"parent_code":"5100"},
    {"code":"5130","name":"Прочий уставный капитал","section":"5000","account_type":"passive","level":3,"parent_code":"5100"},

    # 5200 — Прочий капитал
    {"code":"5200","name":"Прочий капитал","section":"5000","account_type":"passive","level":2,"parent_code":"5000"},
    {"code":"5210","name":"Дополнительно оплаченный капитал","section":"5000","account_type":"passive","level":3,"parent_code":"5200"},
    {"code":"5220","name":"Корректировки по переоценке активов","section":"5000","account_type":"passive","level":3,"parent_code":"5200"},
    {"code":"5230","name":"Курсовые разницы по операциям в иностранной валюте по зарубежным компаниям","section":"5000","account_type":"passive","level":3,"parent_code":"5200"},
    {"code":"5240","name":"Капитал, авансированный собственником(ами)","section":"5000","account_type":"passive","level":3,"parent_code":"5200"},

    # 5300 — Нераспределённая прибыль
    {"code":"5300","name":"Нераспределённая прибыль","section":"5000","account_type":"passive","level":2,"parent_code":"5000"},

    # 5400 — Резервный капитал
    {"code":"5400","name":"Резервный капитал","section":"5000","account_type":"passive","level":2,"parent_code":"5000"},

    # 5999 — Свод доходов и расходов
    {"code":"5999","name":"Свод доходов и расходов","section":"5000","account_type":"passive","level":2,"parent_code":"5000"},

    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 6: ДОХОДЫ (6000-6300)
    # ══════════════════════════════════════════════════════
    {"code":"6000","name":"Доходы от операционной деятельности","section":"6000","account_type":"passive","level":1,"parent_code":None},

    # 6100 — Выручка
    {"code":"6100","name":"Выручка","section":"6000","account_type":"passive","level":2,"parent_code":"6000"},
    {"code":"6110","name":"Выручка от реализации товаров и услуг","section":"6000","account_type":"passive","level":3,"parent_code":"6100"},
    {"code":"6120","name":"Возврат проданных товаров и скидки","section":"6000","account_type":"passive","level":3,"parent_code":"6100"},
    {"code":"6130","name":"Выручка от обмена товаров и услуг","section":"6000","account_type":"passive","level":3,"parent_code":"6100"},
    {"code":"6140","name":"Выручка по договорам на строительство","section":"6000","account_type":"passive","level":3,"parent_code":"6100"},
    {"code":"6150","name":"Выручка от использования другими организациями активов субъекта","section":"6000","account_type":"passive","level":3,"parent_code":"6100"},
    {"code":"6160","name":"Выручка по договорам страхования","section":"6000","account_type":"passive","level":3,"parent_code":"6100"},

    # 6200 — Прочие доходы от операционной деятельности
    {"code":"6200","name":"Прочие доходы от операционной деятельности","section":"6000","account_type":"passive","level":2,"parent_code":"6000"},

    # 6300 — Прибыль (убыток) от биологических активов
    {"code":"6300","name":"Прибыль (убыток) от биологических активов","section":"6000","account_type":"passive","level":2,"parent_code":"6000"},
    {"code":"6310","name":"Прибыль (убыток) от первоначального признания биологических активов","section":"6000","account_type":"passive","level":3,"parent_code":"6300"},
    {"code":"6320","name":"Доход от сбора сельхозпродукции","section":"6000","account_type":"passive","level":3,"parent_code":"6300"},
    {"code":"6330","name":"Прибыль (убыток) от изменения справедливой стоимости биологических активов","section":"6000","account_type":"passive","level":3,"parent_code":"6300"},

    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 7: СЕБЕСТОИМОСТЬ И ОПЕРАЦИОННЫЕ РАСХОДЫ (7000-7600)
    # ══════════════════════════════════════════════════════
    {"code":"7000","name":"Себестоимость реализованной продукции и услуг","section":"7000","account_type":"active","level":1,"parent_code":None},

    # 7100 — Себестоимость (непрерывный метод учёта запасов)
    {"code":"7100","name":"Себестоимость реализованной продукции (непрерывный метод)","section":"7000","account_type":"active","level":2,"parent_code":"7000"},
    {"code":"7110","name":"Затраты по приобретению сырья, материалов с учётом возврата","section":"7000","account_type":"active","level":3,"parent_code":"7100"},
    {"code":"7120","name":"Затраты по оплате труда (производство)","section":"7000","account_type":"active","level":3,"parent_code":"7100"},
    {"code":"7130","name":"Затраты по отчислениям в социальный фонд (производство)","section":"7000","account_type":"active","level":3,"parent_code":"7100"},
    {"code":"7140","name":"Затраты на коммунальные услуги (производство)","section":"7000","account_type":"active","level":3,"parent_code":"7100"},
    {"code":"7150","name":"Затраты на амортизацию основных производственных средств","section":"7000","account_type":"active","level":3,"parent_code":"7100"},
    {"code":"7160","name":"Затраты на ремонт и обслуживание основных средств","section":"7000","account_type":"active","level":3,"parent_code":"7100"},
    {"code":"7170","name":"Прочие производственные затраты","section":"7000","account_type":"active","level":3,"parent_code":"7100"},
    {"code":"7190","name":"Корректировки стоимости запасов","section":"7000","account_type":"active","level":3,"parent_code":"7100"},

    # 7200 — Себестоимость реализованных товаров (периодический метод — торговля)
    {"code":"7200","name":"Себестоимость реализованных товаров (торговля, периодический метод)","section":"7000","account_type":"active","level":2,"parent_code":"7000"},
    {"code":"7210","name":"Приобретение товаров","section":"7000","account_type":"active","level":3,"parent_code":"7200"},
    {"code":"7220","name":"Возврат приобретённого товара","section":"7000","account_type":"active","level":3,"parent_code":"7200"},
    {"code":"7230","name":"Использование товаров для собственных нужд","section":"7000","account_type":"active","level":3,"parent_code":"7200"},
    {"code":"7290","name":"Корректировки стоимости запасов (торговля)","section":"7000","account_type":"active","level":3,"parent_code":"7200"},

    # 7300 — Расходы по производству биологических активов
    {"code":"7300","name":"Расходы по производству биологических активов","section":"7000","account_type":"active","level":2,"parent_code":"7000"},

    # 7400 — Затраты по договорам на строительство
    {"code":"7400","name":"Затраты по договорам на строительство","section":"7000","account_type":"active","level":2,"parent_code":"7000"},

    # 7500 — Расходы, связанные с реализацией
    {"code":"7500","name":"Расходы, связанные с реализацией","section":"7000","account_type":"active","level":2,"parent_code":"7000"},
    {"code":"7510","name":"Расходы на рекламу и содействие продаже","section":"7000","account_type":"active","level":3,"parent_code":"7500"},
    {"code":"7520","name":"Расходы по выплате заработной платы (сбыт)","section":"7000","account_type":"active","level":3,"parent_code":"7500"},
    {"code":"7530","name":"Расходы по отчислениям в социальный фонд (сбыт)","section":"7000","account_type":"active","level":3,"parent_code":"7500"},
    {"code":"7540","name":"Расходы по хранению и транспортным расходам","section":"7000","account_type":"active","level":3,"parent_code":"7500"},
    {"code":"7550","name":"Расходы по безнадёжным долгам, относящимся к реализации","section":"7000","account_type":"active","level":3,"parent_code":"7500"},
    {"code":"7560","name":"Расходы по гарантийному обслуживанию","section":"7000","account_type":"active","level":3,"parent_code":"7500"},
    {"code":"7570","name":"Прочие торговые издержки","section":"7000","account_type":"active","level":3,"parent_code":"7500"},
    {"code":"7580","name":"Расходы по амортизации основных средств (сбыт)","section":"7000","account_type":"active","level":3,"parent_code":"7500"},
    {"code":"7590","name":"Расходы на премиальные продажи","section":"7000","account_type":"active","level":3,"parent_code":"7500"},

    # 7600 — Прочие производственные расходы
    {"code":"7600","name":"Прочие производственные расходы","section":"7000","account_type":"active","level":2,"parent_code":"7000"},

    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 8: ОБЩИЕ И АДМИНИСТРАТИВНЫЕ РАСХОДЫ (8000-8490)
    # ══════════════════════════════════════════════════════
    {"code":"8000","name":"Общие и административные расходы","section":"8000","account_type":"active","level":1,"parent_code":None},
    {"code":"8010","name":"Расходы по оплате труда (административные)","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8020","name":"Расходы по отчислениям в социальный фонд (административные)","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8030","name":"Расходы по оплате аренды","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8040","name":"Расходы по оплате услуг","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8050","name":"Налог на имущество","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8060","name":"Расходы на канцелярские принадлежности","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8070","name":"Расходы на коммуникации","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8080","name":"Расходы по оплате страховок","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8090","name":"Расходы по приобретению лицензий и прочих соглашений","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8100","name":"Расходы по НДС, не принимаемому к зачёту","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8110","name":"Ремонт и техническое обслуживание основных средств (адм.)","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8120","name":"Расходы по компьютерному обеспечению — программное обеспечение","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8130","name":"Представительские расходы","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8140","name":"Вознаграждения аудиторам","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8150","name":"Вознаграждения юристам","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8160","name":"Расходы по обучению","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8170","name":"Расходы по консультациям","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8180","name":"Расходы по связям с общественностью","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8190","name":"Расходы по прочим налогам","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8200","name":"Командировочные расходы (местные)","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8210","name":"Командировочные расходы (международные)","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8220","name":"Расходы по коммунальным услугам (административные)","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8230","name":"Расходы по членству","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8240","name":"Штрафы, пени, неустойки в бюджет","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8300","name":"Расходы на исследования и научные разработки","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8470","name":"Расходы по амортизации основных средств (административные)","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8480","name":"Расходы по амортизации нематериальных активов","section":"8000","account_type":"active","level":2,"parent_code":"8000"},
    {"code":"8490","name":"Прочие общие и административные расходы","section":"8000","account_type":"active","level":2,"parent_code":"8000"},

    # ══════════════════════════════════════════════════════
    # РАЗДЕЛ 9: НЕОПЕРАЦИОННЫЕ ДОХОДЫ И РАСХОДЫ (9000-9900)
    # ══════════════════════════════════════════════════════
    {"code":"9000","name":"Доходы и расходы от неоперационной деятельности","section":"9000","account_type":"active","level":1,"parent_code":None},

    # 9100 — Доходы от неоперационной деятельности
    {"code":"9100","name":"Доходы от неоперационной деятельности","section":"9000","account_type":"passive","level":2,"parent_code":"9000"},
    {"code":"9110","name":"Доход в виде процентов","section":"9000","account_type":"passive","level":3,"parent_code":"9100"},
    {"code":"9120","name":"Доход от ассоциированных, дочерних компаний","section":"9000","account_type":"passive","level":3,"parent_code":"9100"},
    {"code":"9130","name":"Доход от дивидендов","section":"9000","account_type":"passive","level":3,"parent_code":"9100"},
    {"code":"9140","name":"Доход от курсовых разниц по операциям в иностранной валюте","section":"9000","account_type":"passive","level":3,"parent_code":"9100"},
    {"code":"9190","name":"Прочие неоперационные доходы","section":"9000","account_type":"passive","level":3,"parent_code":"9100"},

    # 9500 — Расходы от неоперационной деятельности
    {"code":"9500","name":"Расходы от неоперационной деятельности","section":"9000","account_type":"active","level":2,"parent_code":"9000"},
    {"code":"9510","name":"Расходы в виде процентов","section":"9000","account_type":"active","level":3,"parent_code":"9500"},
    {"code":"9520","name":"Убытки от курсовых разниц по операциям в иностранной валюте","section":"9000","account_type":"active","level":3,"parent_code":"9500"},
    {"code":"9530","name":"Расходы по безнадёжным долгам (неоперационные)","section":"9000","account_type":"active","level":3,"parent_code":"9500"},
    {"code":"9590","name":"Прочие неоперационные расходы","section":"9000","account_type":"active","level":3,"parent_code":"9500"},

    # 9800 — Чрезвычайные статьи
    {"code":"9800","name":"Чрезвычайные статьи","section":"9000","account_type":"active","level":2,"parent_code":"9000"},
    {"code":"9810","name":"Чрезвычайная прибыль","section":"9000","account_type":"passive","level":3,"parent_code":"9800"},
    {"code":"9820","name":"Чрезвычайный убыток","section":"9000","account_type":"active","level":3,"parent_code":"9800"},

    # 9900 — Налоги на прибыль
    {"code":"9900","name":"Налоги на прибыль","section":"9000","account_type":"active","level":2,"parent_code":"9000"},
    {"code":"9910","name":"Расходы (доходы) по налогу на прибыль","section":"9000","account_type":"active","level":3,"parent_code":"9900"},
]


POSTING_RULES = [
    # ── ТОРГОВЛЯ ─────────────────────────────────────────
    {"rule_name":"Покупка товаров у поставщика","document_type":"invoice","operation_keywords":["товар","накладная","поставка","ТТН","спецификация","брюки","одежда","текстиль","импорт","партия"],"debit_account":"1610","credit_account":"3110","description":"Поступление товаров: Дт 1610 Товары / Кт 3110 Счета к оплате","priority":90},
    {"rule_name":"Покупка сырья и материалов","document_type":"invoice","operation_keywords":["сырьё","материалы","запасы","комплектующие","расходные материалы"],"debit_account":"1620","credit_account":"3110","description":"Поступление материалов: Дт 1620 / Кт 3110","priority":80},
    # ── ТРАНСПОРТ И ЛОГИСТИКА ────────────────────────────
    {"rule_name":"Транспортные услуги","document_type":"act","operation_keywords":["транспорт","перевозка","доставка","логистика","фрахт","экспедиция","грузоперевозка","CMR","ТТН","Силк Вэй"],"debit_account":"7540","credit_account":"3110","description":"Транспортные расходы: Дт 7540 / Кт 3110","priority":90},
    # ── ТАМОЖНЯ ──────────────────────────────────────────
    {"rule_name":"Таможенные сборы и пошлины","document_type":"receipt","operation_keywords":["таможня","таможенный сбор","пошлина","таможенное оформление","Манас","ГТД"],"debit_account":"1610","credit_account":"1110","description":"Таможня включается в стоимость товара: Дт 1610 / Кт 1110 Касса","priority":95},
    # ── АРЕНДА ───────────────────────────────────────────
    {"rule_name":"Аренда офиса / склада","document_type":"invoice","operation_keywords":["аренда","арендная плата","субаренда","найм помещения","рабочее место"],"debit_account":"8030","credit_account":"3110","description":"Аренда: Дт 8030 / Кт 3110","priority":85},
    # ── КОММУНАЛЬНЫЕ ─────────────────────────────────────
    {"rule_name":"Коммунальные услуги (административные)","document_type":"esf","operation_keywords":["электроэнергия","водоснабжение","коммунальные","теплоснабжение","газ","ТБО","мусор","Тазалык","ОшТЭЦ","вывоз"],"debit_account":"8220","credit_account":"3110","description":"Коммунальные расходы: Дт 8220 / Кт 3110","priority":90},
    # ── СВЯЗЬ ────────────────────────────────────────────
    {"rule_name":"Услуги связи и интернет","document_type":"invoice","operation_keywords":["связь","интернет","телефон","мобильная связь","IT","телекоммуникации"],"debit_account":"8070","credit_account":"3110","description":"Связь: Дт 8070 / Кт 3110","priority":85},
    # ── БАНК ─────────────────────────────────────────────
    {"rule_name":"Банковские комиссии","document_type":"bank_statement","operation_keywords":["комиссия банка","банковское обслуживание","РКО","инкассация"],"debit_account":"8040","credit_account":"1210","description":"Банк: Дт 8040 / Кт 1210","priority":85},
    # ── СТРАХОВАНИЕ ──────────────────────────────────────
    {"rule_name":"Страховые взносы","document_type":"invoice","operation_keywords":["страхование","страховая премия","страховой полис","АТН Полис","страховщик"],"debit_account":"8080","credit_account":"3110","description":"Страхование: Дт 8080 / Кт 3110","priority":80},
    # ── ПЛАТЕЖИ ──────────────────────────────────────────
    {"rule_name":"Оплата поставщику с расчётного счёта","document_type":"payment_order","operation_keywords":["оплата","перечисление","платёжное поручение","платёж поставщику"],"debit_account":"3110","credit_account":"1210","description":"Оплата поставщику: Дт 3110 / Кт 1210 Банк","priority":90},
    {"rule_name":"Оплата поставщику наличными из кассы","document_type":"receipt","operation_keywords":["оплата наличными","выдача из кассы","РКО"],"debit_account":"3110","credit_account":"1110","description":"Оплата наличными: Дт 3110 / Кт 1110 Касса","priority":85},
    {"rule_name":"Поступление оплаты от покупателя","document_type":"bank_statement","operation_keywords":["оплата от покупателя","поступление выручки","продажа","выручка"],"debit_account":"1210","credit_account":"6110","description":"Выручка: Дт 1210 Банк / Кт 6110","priority":90},
    # ── АВАНС ────────────────────────────────────────────
    {"rule_name":"Аванс поставщику (банк)","document_type":"payment_order","operation_keywords":["аванс","предоплата","100% предоплата"],"debit_account":"1820","credit_account":"1210","description":"Аванс поставщику: Дт 1820 / Кт 1210 Банк","priority":85},
    # ── ЗАРПЛАТА ─────────────────────────────────────────
    {"rule_name":"Начисление заработной платы","document_type":"payroll","operation_keywords":["зарплата","заработная плата","оклад","начисление зарплаты"],"debit_account":"8010","credit_account":"3520","description":"Зарплата: Дт 8010 / Кт 3520","priority":90},
    {"rule_name":"Отчисления в Социальный Фонд","document_type":"payroll","operation_keywords":["социальный фонд","соцфонд","страховые взносы","СФ КР"],"debit_account":"8020","credit_account":"3530","description":"Соцфонд: Дт 8020 / Кт 3530","priority":90},
    # ── ЭСФ ──────────────────────────────────────────────
    {"rule_name":"ЭСФ входящий — покупка товаров","document_type":"esf","operation_keywords":["ЭСФ","счёт-фактура","товар","НДС входящий"],"debit_account":"1610","credit_account":"3110","description":"ЭСФ товары: Дт 1610 / Кт 3110","priority":95},
    {"rule_name":"ЭСФ входящий — услуги","document_type":"esf","operation_keywords":["ЭСФ","счёт-фактура","услуги","работы","обслуживание"],"debit_account":"8490","credit_account":"3110","description":"ЭСФ услуги: Дт 8490 / Кт 3110","priority":80},
    # ── ПРОЧЕЕ ───────────────────────────────────────────
    {"rule_name":"Прочие административные расходы","document_type":"other","operation_keywords":["расходы","затраты","услуги","работы"],"debit_account":"8490","credit_account":"3110","description":"Прочие расходы: Дт 8490 / Кт 3110","priority":10},
]
