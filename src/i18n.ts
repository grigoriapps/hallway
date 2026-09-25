// Переводы интерфейса. Все пять языков лежат рядом в одном массиве на ключ — в порядке
// ru, en, ro, de, es: так видно, что ни один перевод не забыт, а тип Translations этого не позволит.
// Файл без JSX и без импортов — его читают и главный процесс, и интерфейс, и тесты.
//
// Подстановки: {name} в шаблоне заменяется значением из params.
// Множественные формы — отдельно, в PLURALS: в русском и румынском их три, в остальных две.
//
// Обращение: русский и румынский — на «вы», немецкий — на «Sie» (офисная программа),
// испанский — на «tú», как сейчас принято в интерфейсах; испанский нейтральный, без испанизмов
// вроде «ordenador» и «fichero», чтобы был понятен и в Испании, и в Латинской Америке.

/** Порядок — как в списке выбора языка в настройках */
export const LOCALES = ['ru', 'en', 'de', 'es', 'ro'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  ro: 'Română'
}

/** Язык интерфейса по умолчанию: приложение выросло русским, поэтому русский и остаётся */
export const DEFAULT_LOCALE: Locale = 'ru'

/** Место перевода в массиве MESSAGES — не путать с порядком в LOCALES */
const INDEX: Record<Locale, 0 | 1 | 2 | 3 | 4> = { ru: 0, en: 1, ro: 2, de: 3, es: 4 }

type Translations = readonly [ru: string, en: string, ro: string, de: string, es: string]

// ─── надписи ────────────────────────────────────────────────────────────────────

const MESSAGES = {
  // общее
  'common.peer': ['Собеседник', 'Contact', 'Contact', 'Kontakt', 'Contacto'],
  'common.cancel': ['Отмена', 'Cancel', 'Anulează', 'Abbrechen', 'Cancelar'],
  'common.save': ['Сохранить', 'Save', 'Salvează', 'Speichern', 'Guardar'],
  'common.close': ['Закрыть', 'Close', 'Închide', 'Schließen', 'Cerrar'],
  'common.clear': ['Очистить', 'Clear', 'Șterge', 'Leeren', 'Borrar'],
  'common.delete': ['Удалить', 'Delete', 'Șterge', 'Löschen', 'Eliminar'],
  'common.change': ['Изменить…', 'Change…', 'Schimbă…', 'Ändern…', 'Cambiar…'],
  'common.add': ['Добавить', 'Add', 'Adaugă', 'Hinzufügen', 'Añadir'],
  'common.create': ['Создать', 'Create', 'Creează', 'Erstellen', 'Crear'],
  'common.send': ['Отправить', 'Send', 'Trimite', 'Senden', 'Enviar'],
  'common.retry': ['Повторить', 'Retry', 'Reîncearcă', 'Erneut versuchen', 'Reintentar'],
  'common.reply': ['Ответить', 'Reply', 'Răspunde', 'Antworten', 'Responder'],
  'common.search': ['Поиск', 'Search', 'Caută', 'Suchen', 'Buscar'],
  'common.more': ['Ещё', 'More', 'Mai multe', 'Mehr', 'Más'],
  'common.none': ['нет', 'none', 'niciuna', 'keine', 'ninguna'],
  'common.never': ['Никогда', 'Never', 'Niciodată', 'Nie', 'Nunca'],
  'common.dash': ['—', '—', '—', '—', '—'],
  'common.notInNetwork': ['не в сети', 'offline', 'deconectat', 'offline', 'desconectado'],
  'common.online': ['в сети', 'online', 'conectat', 'online', 'en línea'],
  'common.copy': ['Копировать', 'Copy', 'Copiază', 'Kopieren', 'Copiar'],
  'common.paste': ['Вставить', 'Paste', 'Lipește', 'Einfügen', 'Pegar'],
  'common.cut': ['Вырезать', 'Cut', 'Taie', 'Ausschneiden', 'Cortar'],
  'common.undo': ['Отменить', 'Undo', 'Anulează', 'Rückgängig', 'Deshacer'],
  'common.redo': ['Повторить', 'Redo', 'Repetă', 'Wiederholen', 'Rehacer'],
  'common.selectAll': ['Выделить всё', 'Select all', 'Selectează tot', 'Alles auswählen', 'Seleccionar todo'],
  'common.exit': ['Выйти', 'Leave', 'Ieși', 'Verlassen', 'Salir'],

  // статусы
  'status.online': ['В сети', 'Online', 'Conectat', 'Online', 'En línea'],
  'status.away': ['Отошёл', 'Away', 'Absent', 'Abwesend', 'Ausente'],
  'status.dnd': ['Не беспокоить', 'Do not disturb', 'Nu deranja', 'Nicht stören', 'No molestar'],
  'status.awayAuto': [
    'Отошёл (автоматически)',
    'Away (automatic)',
    'Absent (automat)',
    'Abwesend (automatisch)',
    'Ausente (automático)'
  ],
  'status.pick': ['Сменить статус', 'Change status', 'Schimbă statutul', 'Status ändern', 'Cambiar estado'],
  'status.hint': [
    'Статус видят коллеги. «Не беспокоить» выключает звуки и уведомления.',
    'Your status is visible to colleagues. “Do not disturb” mutes sounds and notifications.',
    'Statutul este vizibil colegilor. „Nu deranja” oprește sunetele și notificările.',
    'Ihr Status ist für Kollegen sichtbar. „Nicht stören“ schaltet Töne und Benachrichtigungen aus.',
    'Tus compañeros ven tu estado. «No molestar» silencia los sonidos y las notificaciones.'
  ],

  // платформы
  'platform.darwin': ['macOS', 'macOS', 'macOS', 'macOS', 'macOS'],
  'platform.win32': ['Windows', 'Windows', 'Windows', 'Windows', 'Windows'],
  'platform.linux': ['Linux', 'Linux', 'Linux', 'Linux', 'Linux'],
  'platform.unknown': ['неизвестно', 'unknown', 'necunoscut', 'unbekannt', 'desconocido'],

  // даты и размеры
  'date.today': ['Сегодня', 'Today', 'Astăzi', 'Heute', 'Hoy'],
  'date.yesterday': ['Вчера', 'Yesterday', 'Ieri', 'Gestern', 'Ayer'],
  'size.b': ['Б', 'B', 'B', 'B', 'B'],
  'size.kb': ['КБ', 'KB', 'KB', 'KB', 'KB'],
  'size.mb': ['МБ', 'MB', 'MB', 'MB', 'MB'],
  'size.gb': ['ГБ', 'GB', 'GB', 'GB', 'GB'],
  'size.tb': ['ТБ', 'TB', 'TB', 'TB', 'TB'],
  'size.perSecond': ['{value}/с', '{value}/s', '{value}/s', '{value}/s', '{value}/s'],

  // первый запуск
  'setup.title': ['Как вас зовут?', 'What is your name?', 'Cum vă numiți?', 'Wie heißen Sie?', '¿Cómo te llamas?'],
  'setup.hint': [
    'Имя увидят коллеги в своём списке. Его можно поменять в настройках.',
    'Colleagues will see this name in their list. You can change it in settings.',
    'Colegii vor vedea acest nume în listă. Îl puteți schimba în setări.',
    'Kollegen sehen diesen Namen in ihrer Liste. Sie können ihn in den Einstellungen ändern.',
    'Tus compañeros verán este nombre en su lista. Puedes cambiarlo en los ajustes.'
  ],
  'setup.placeholder': [
    'Например, Иван Петров',
    'For example, John Smith',
    'De exemplu, Ion Popescu',
    'Zum Beispiel Max Mustermann',
    'Por ejemplo, Juan Pérez'
  ],
  'setup.continue': ['Продолжить', 'Continue', 'Continuă', 'Weiter', 'Continuar'],
  'setup.nameEmpty': [
    'Имя не может быть пустым',
    'The name cannot be empty',
    'Numele nu poate fi gol',
    'Der Name darf nicht leer sein',
    'El nombre no puede estar vacío'
  ],

  // боковая панель
  'sidebar.searchPlaceholder': [
    'Поиск коллег и групп',
    'Search people and groups',
    'Caută colegi și grupuri',
    'Kollegen und Gruppen suchen',
    'Buscar compañeros y grupos'
  ],
  'sidebar.clearSearch': ['Очистить поиск', 'Clear search', 'Șterge căutarea', 'Suche leeren', 'Borrar búsqueda'],
  'sidebar.broadcast': ['Написать всем', 'Message everyone', 'Scrie tuturor', 'Nachricht an alle', 'Escribir a todos'],
  'sidebar.broadcastHint': [
    'Открыть общий чат: сообщение увидят все, у кого запущен Hallway',
    'Open the everyone chat: all Hallway users will see the message',
    'Deschide chatul comun: mesajul îl vor vedea toți cei cu Hallway',
    'Allgemeinen Chat öffnen: Alle, bei denen Hallway läuft, sehen die Nachricht',
    'Abrir el chat general: el mensaje lo verán todos los que tengan Hallway abierto'
  ],
  'sidebar.group': ['Группа', 'Group', 'Grup', 'Gruppe', 'Grupo'],
  'sidebar.groupHint': [
    'Создать группу из выбранных коллег',
    'Create a group from selected colleagues',
    'Creează un grup din colegii selectați',
    'Gruppe aus ausgewählten Kollegen erstellen',
    'Crear un grupo con los compañeros seleccionados'
  ],
  'sidebar.groups': ['Группы', 'Groups', 'Grupuri', 'Gruppen', 'Grupos'],
  'sidebar.createGroup': ['Создать группу', 'Create a group', 'Creează un grup', 'Gruppe erstellen', 'Crear un grupo'],
  'sidebar.peers': ['Собеседники', 'People', 'Colegi', 'Kontakte', 'Contactos'],
  'sidebar.onlineCount': ['в сети: {n}', 'online: {n}', 'conectați: {n}', 'online: {n}', 'en línea: {n}'],
  'sidebar.searching': ['поиск…', 'searching…', 'se caută…', 'Suche…', 'buscando…'],
  'sidebar.settings': ['Настройки', 'Settings', 'Setări', 'Einstellungen', 'Ajustes'],
  'sidebar.pinned': ['Закреплён', 'Pinned', 'Fixat', 'Angeheftet', 'Fijado'],
  'sidebar.typing': ['печатает…', 'typing…', 'scrie…', 'schreibt…', 'escribiendo…'],
  'sidebar.you': ['Вы: ', 'You: ', 'Tu: ', 'Sie: ', 'Tú: '],
  'sidebar.filePreview': ['файл «{name}»', 'file “{name}”', 'fișier „{name}”', 'Datei „{name}“', 'archivo «{name}»'],
  'sidebar.emptyTitle': [
    'Ищем собеседников…',
    'Looking for people…',
    'Căutăm colegi…',
    'Suche nach Kontakten…',
    'Buscando contactos…'
  ],
  'sidebar.emptyHint': [
    'Запустите Hallway на другом компьютере в этой же сети. Если никто не появляется за 10 секунд — проверьте брандмауэр или добавьте IP-адрес вручную в настройках.',
    'Start Hallway on another computer in the same network. If nobody shows up within 10 seconds, check the firewall or add an IP address manually in settings.',
    'Porniți Hallway pe alt computer din aceeași rețea. Dacă nimeni nu apare în 10 secunde, verificați firewall-ul sau adăugați manual o adresă IP în setări.',
    'Starten Sie Hallway auf einem anderen Computer im selben Netzwerk. Wenn innerhalb von 10 Sekunden niemand erscheint, prüfen Sie die Firewall oder fügen Sie in den Einstellungen manuell eine IP-Adresse hinzu.',
    'Abre Hallway en otro equipo de la misma red. Si nadie aparece en 10 segundos, revisa el firewall o añade una dirección IP manualmente en los ajustes.'
  ],
  'sidebar.notFound': [
    'Никого не нашлось',
    'Nobody found',
    'Nu s-a găsit nimeni',
    'Niemand gefunden',
    'No se encontró a nadie'
  ],
  'sidebar.noNetwork': [
    'Нет подключения к локальной сети',
    'No local network connection',
    'Fără conexiune la rețeaua locală',
    'Keine Verbindung zum lokalen Netzwerk',
    'Sin conexión a la red local'
  ],

  // статус: подсказки в меню
  'status.hint.online': [
    'Звуки и уведомления включены',
    'Sounds and notifications are on',
    'Sunetele și notificările sunt active',
    'Töne und Benachrichtigungen sind an',
    'Sonidos y notificaciones activados'
  ],
  'status.hint.away': [
    'Коллеги видят, что вас нет на месте',
    'Colleagues can see that you are away',
    'Colegii văd că sunteți absent',
    'Kollegen sehen, dass Sie nicht am Platz sind',
    'Tus compañeros ven que no estás'
  ],
  'status.hint.dnd': [
    'Без звуков и уведомлений, сообщения приходят',
    'No sounds or notifications; messages still arrive',
    'Fără sunete și notificări; mesajele sosesc totuși',
    'Ohne Töne und Benachrichtigungen, Nachrichten kommen trotzdem an',
    'Sin sonidos ni notificaciones; los mensajes siguen llegando'
  ],
  'status.menuLabel': ['Статус', 'Status', 'Statut', 'Status', 'Estado'],
  'status.auto': [' · авто', ' · auto', ' · auto', ' · auto', ' · auto'],
  'status.autoExplain': [
    '«Отошёл» выставлен автоматически — компьютером давно не пользовались.',
    '“Away” was set automatically — the computer has been idle for a while.',
    '„Absent” a fost setat automat — computerul nu a fost folosit de ceva timp.',
    '„Abwesend“ wurde automatisch gesetzt – der Computer wurde länger nicht benutzt.',
    '«Ausente» se activó automáticamente: el equipo lleva un rato sin usarse.'
  ],
  'status.autoAfter': [
    '«Отошёл» ставится сам через {n} мин бездействия.',
    '“Away” is set automatically after {n} min of inactivity.',
    '„Absent” se setează automat după {n} min de inactivitate.',
    '„Abwesend“ wird nach {n} Min. Inaktivität automatisch gesetzt.',
    '«Ausente» se activa solo tras {n} min de inactividad.'
  ],
  'status.autoOff': [
    'Автоматический «Отошёл» выключен.',
    'Automatic “Away” is off.',
    'Marcarea automată „Absent” este oprită.',
    'Automatisches „Abwesend“ ist aus.',
    '«Ausente» automático desactivado.'
  ],
  'status.yourAddress': [
    'Ваш адрес: {address}',
    'Your address: {address}',
    'Adresa dumneavoastră: {address}',
    'Ihre Adresse: {address}',
    'Tu dirección: {address}'
  ],

  // первый запуск (дополнение)
  'setup.question': [
    'Как вас будут видеть другие пользователи в локальной сети?',
    'How will other people in the local network see you?',
    'Cum vă vor vedea ceilalți din rețeaua locală?',
    'Wie sollen andere Nutzer im lokalen Netzwerk Sie sehen?',
    '¿Cómo te verán los demás usuarios de la red local?'
  ],
  'setup.yourName': ['Ваше имя', 'Your name', 'Numele dumneavoastră', 'Ihr Name', 'Tu nombre'],
  'setup.enterName': ['Введите имя', 'Enter a name', 'Introduceți un nume', 'Namen eingeben', 'Escribe un nombre'],
  'setup.changeLater': [
    'Имя можно поменять позже в настройках.',
    'You can change the name later in settings.',
    'Puteți schimba numele mai târziu în setări.',
    'Den Namen können Sie später in den Einstellungen ändern.',
    'Puedes cambiar el nombre más tarde en los ajustes.'
  ],

  // карточка файла
  'file.statusOffering': [
    'Отправка предложения…',
    'Sending the offer…',
    'Se trimite oferta…',
    'Angebot wird gesendet…',
    'Enviando la oferta…'
  ],
  'file.statusWaitingOut': [
    'Ждём, когда получатель примет файл',
    'Waiting for the receiver to accept',
    'Se așteaptă acceptarea de către destinatar',
    'Warten, bis der Empfänger die Datei annimmt',
    'Esperando a que el destinatario acepte el archivo'
  ],
  'file.statusWaitingIn': [
    'Хочет отправить вам файл',
    'Wants to send you a file',
    'Dorește să vă trimită un fișier',
    'Möchte Ihnen eine Datei senden',
    'Quiere enviarte un archivo'
  ],
  'file.statusConnecting': [
    'Соединение…',
    'Connecting…',
    'Se conectează…',
    'Verbindung wird hergestellt…',
    'Conectando…'
  ],
  'file.statusProgress': [
    '{done} из {total} · {speed}',
    '{done} of {total} · {speed}',
    '{done} din {total} · {speed}',
    '{done} von {total} · {speed}',
    '{done} de {total} · {speed}'
  ],
  'file.statusDoneOut': ['Доставлено', 'Delivered', 'Livrat', 'Zugestellt', 'Entregado'],
  'file.statusDoneIn': ['Сохранено', 'Saved', 'Salvat', 'Gespeichert', 'Guardado'],
  'file.statusDeclinedOut': [
    'Получатель отклонил файл',
    'The receiver declined the file',
    'Destinatarul a refuzat fișierul',
    'Der Empfänger hat die Datei abgelehnt',
    'El destinatario rechazó el archivo'
  ],
  'file.statusDeclinedIn': [
    'Вы отклонили файл',
    'You declined the file',
    'Ați refuzat fișierul',
    'Sie haben die Datei abgelehnt',
    'Rechazaste el archivo'
  ],
  'file.statusCanceled': [
    'Передача отменена',
    'The transfer was canceled',
    'Transferul a fost anulat',
    'Übertragung abgebrochen',
    'Transferencia cancelada'
  ],
  'file.statusFailed': [
    'Ошибка передачи',
    'Transfer error',
    'Eroare de transfer',
    'Übertragungsfehler',
    'Error de transferencia'
  ],
  'file.acceptToOpen': [
    'Примите файл, чтобы открыть',
    'Accept the file to open it',
    'Acceptați fișierul pentru a-l deschide',
    'Nehmen Sie die Datei an, um sie zu öffnen',
    'Acepta el archivo para abrirlo'
  ],
  'file.senderOffline': [
    'Отправитель не в сети',
    'The sender is offline',
    'Expeditorul este deconectat',
    'Der Absender ist offline',
    'El remitente está desconectado'
  ],

  // чат
  'chat.placeholderTitle': [
    'Выберите собеседника',
    'Choose a contact',
    'Alegeți un contact',
    'Kontakt auswählen',
    'Elige un contacto'
  ],
  'chat.placeholderHint': [
    'Слева — все, у кого Hallway запущен в вашей сети. Список обновляется сам.',
    'On the left are everyone running Hallway in your network. The list updates itself.',
    'În stânga sunt toți cei care au Hallway pornit în rețea. Lista se actualizează singură.',
    'Links sehen Sie alle, bei denen Hallway in Ihrem Netzwerk läuft. Die Liste aktualisiert sich selbst.',
    'A la izquierda están todos los que tienen Hallway abierto en tu red. La lista se actualiza sola.'
  ],
  'chat.emptyPeer': [
    'Напишите сообщение, вставьте скриншот или перетащите сюда файлы.',
    'Write a message, paste a screenshot or drag files here.',
    'Scrieți un mesaj, lipiți o captură sau trageți fișiere aici.',
    'Schreiben Sie eine Nachricht, fügen Sie einen Screenshot ein oder ziehen Sie Dateien hierher.',
    'Escribe un mensaje, pega una captura de pantalla o arrastra archivos aquí.'
  ],
  'chat.emptyGroup': [
    'Напишите первое сообщение — его получат все участники группы.',
    'Write the first message — every member of the group will get it.',
    'Scrieți primul mesaj — îl vor primi toți participanții grupului.',
    'Schreiben Sie die erste Nachricht – alle Gruppenmitglieder erhalten sie.',
    'Escribe el primer mensaje: lo recibirán todos los miembros del grupo.'
  ],
  'chat.searchInChat': [
    'Поиск по переписке',
    'Search in conversation',
    'Caută în conversație',
    'Im Verlauf suchen',
    'Buscar en la conversación'
  ],
  'chat.searchShortcut': [
    'Поиск по переписке ({mod}+F)',
    'Search in conversation ({mod}+F)',
    'Caută în conversație ({mod}+F)',
    'Im Verlauf suchen ({mod}+F)',
    'Buscar en la conversación ({mod}+F)'
  ],
  'chat.searchCount': [
    '{current} из {total}',
    '{current} of {total}',
    '{current} din {total}',
    '{current} von {total}',
    '{current} de {total}'
  ],
  'chat.searchNotFound': ['Не найдено', 'Not found', 'Nu s-a găsit', 'Nicht gefunden', 'Sin resultados'],
  'chat.searchPrev': [
    'Предыдущее совпадение',
    'Previous match',
    'Potrivirea anterioară',
    'Vorheriger Treffer',
    'Coincidencia anterior'
  ],
  'chat.searchNext': [
    'Следующее совпадение',
    'Next match',
    'Potrivirea următoare',
    'Nächster Treffer',
    'Coincidencia siguiente'
  ],
  'chat.searchEarlier': [
    'Раньше (Enter)',
    'Earlier (Enter)',
    'Mai vechi (Enter)',
    'Früher (Enter)',
    'Anterior (Enter)'
  ],
  'chat.searchLater': [
    'Позже (Shift+Enter)',
    'Later (Shift+Enter)',
    'Mai nou (Shift+Enter)',
    'Später (Shift+Enter)',
    'Posterior (Shift+Enter)'
  ],
  'chat.searchClose': ['Закрыть (Esc)', 'Close (Esc)', 'Închide (Esc)', 'Schließen (Esc)', 'Cerrar (Esc)'],
  'chat.closeSearch': ['Закрыть поиск', 'Close search', 'Închide căutarea', 'Suche schließen', 'Cerrar búsqueda'],
  'chat.menuPeer': ['Меню чата', 'Chat menu', 'Meniul conversației', 'Chat-Menü', 'Menú del chat'],
  'chat.menuGroup': ['Меню группы', 'Group menu', 'Meniul grupului', 'Gruppenmenü', 'Menú del grupo'],
  'chat.broadcastLabel': [
    'Всем в сети',
    'Everyone online',
    'Tuturor conectaților',
    'Alle im Netzwerk',
    'Todos en la red'
  ],
  'chat.you': ['Вы', 'You', 'Tu', 'Sie', 'Tú'],
  'chat.delivering': ['Отправляется', 'Sending', 'Se trimite', 'Wird gesendet', 'Enviando'],
  'chat.delivered': ['Доставлено', 'Delivered', 'Livrat', 'Zugestellt', 'Entregado'],
  'chat.read': ['Прочитано', 'Read', 'Citit', 'Gelesen', 'Leído'],
  'chat.notDelivered': ['Не доставлено', 'Not delivered', 'Nelivrat', 'Nicht zugestellt', 'No entregado'],
  'chat.notDeliveredWhy': [
    'Не доставлено: {error}',
    'Not delivered: {error}',
    'Nelivrat: {error}',
    'Nicht zugestellt: {error}',
    'No entregado: {error}'
  ],
  // очередь отправки
  'outbox.waitingFor': [
    'Дойдёт, когда {name} появится в сети',
    'Will be delivered when {name} comes online',
    'Va ajunge când {name} se conectează',
    'Wird zugestellt, sobald {name} online ist',
    'Se entregará cuando {name} esté en línea'
  ],
  'outbox.retrying': [
    'Не удаётся связаться — пробуем снова',
    'Cannot reach them right now — retrying',
    'Nu se poate contacta acum — reîncercăm',
    'Keine Verbindung – neuer Versuch läuft',
    'No se puede conectar; reintentando'
  ],
  'outbox.groupWaiting': [
    'Ещё не доставлено: {names} — дойдёт, когда появятся в сети',
    'Not delivered yet: {names} — will arrive when they come online',
    'Încă nelivrat: {names} — va ajunge când se conectează',
    'Noch nicht zugestellt: {names} – kommt an, sobald sie online sind',
    'Aún sin entregar: {names}; llegará cuando estén en línea'
  ],
  'outbox.cancel': ['Отменить отправку', 'Cancel sending', 'Anulează trimiterea', 'Senden abbrechen', 'Cancelar envío'],
  'outbox.canceled': [
    'Отправка отменена',
    'Sending canceled',
    'Trimitere anulată',
    'Senden abgebrochen',
    'Envío cancelado'
  ],
  'outbox.composerOffline': [
    '{name} сейчас не в сети — сообщение дойдёт, как только появится связь',
    '{name} is offline — the message will arrive once they are back',
    '{name} nu este conectat — mesajul va ajunge când revine',
    '{name} ist gerade offline – die Nachricht kommt an, sobald die Verbindung steht',
    '{name} está desconectado ahora: el mensaje llegará en cuanto vuelva la conexión'
  ],
  'outbox.composerGroupOffline': [
    'Сейчас никого из группы нет в сети — сообщение дойдёт, когда участники появятся',
    'Nobody from the group is online — the message will arrive when members come online',
    'Nimeni din grup nu este conectat — mesajul va ajunge când membrii se conectează',
    'Gerade ist niemand aus der Gruppe online – die Nachricht kommt an, sobald Mitglieder online sind',
    'Ahora no hay nadie del grupo en línea: el mensaje llegará cuando se conecten'
  ],
  'outbox.fileWaiting': [
    'Предложение дойдёт, когда {name} появится в сети',
    'The offer will arrive when {name} comes online',
    'Oferta va ajunge când {name} se conectează',
    'Das Angebot kommt an, sobald {name} online ist',
    'La oferta llegará cuando {name} esté en línea'
  ],
  'chat.showMessage': ['Показать сообщение', 'Show message', 'Arată mesajul', 'Nachricht anzeigen', 'Mostrar mensaje'],
  'chat.replyTo': [
    'Ответ: {name}',
    'Reply to {name}',
    'Răspuns pentru {name}',
    'Antwort an {name}',
    'Respuesta a {name}'
  ],
  'chat.cancelReply': [
    'Отменить ответ',
    'Cancel reply',
    'Anulează răspunsul',
    'Antwort abbrechen',
    'Cancelar respuesta'
  ],
  'chat.cancelEsc': ['Отменить (Esc)', 'Cancel (Esc)', 'Anulează (Esc)', 'Abbrechen (Esc)', 'Cancelar (Esc)'],
  'chat.composerEnter': [
    'Сообщение… (Shift+Enter — новая строка)',
    'Message… (Shift+Enter for a new line)',
    'Mesaj… (Shift+Enter pentru rând nou)',
    'Nachricht… (Shift+Enter: neue Zeile)',
    'Mensaje… (Shift+Enter: nueva línea)'
  ],
  'chat.composerModEnter': [
    'Сообщение… ({mod}+Enter — отправить)',
    'Message… ({mod}+Enter to send)',
    'Mesaj… ({mod}+Enter pentru trimitere)',
    'Nachricht… ({mod}+Enter: senden)',
    'Mensaje… ({mod}+Enter: enviar)'
  ],
  'chat.composerOffline': [
    'Пользователь не в сети',
    'This person is offline',
    'Persoana este deconectată',
    'Diese Person ist offline',
    'Esta persona está desconectada'
  ],
  'chat.composerGroupOffline': [
    'Никого из группы нет в сети',
    'Nobody from the group is online',
    'Niciun participant nu este conectat',
    'Niemand aus der Gruppe ist online',
    'No hay nadie del grupo en línea'
  ],
  'chat.sendEnter': ['Отправить (Enter)', 'Send (Enter)', 'Trimite (Enter)', 'Senden (Enter)', 'Enviar (Enter)'],
  'chat.sendModEnter': [
    'Отправить ({mod}+Enter)',
    'Send ({mod}+Enter)',
    'Trimite ({mod}+Enter)',
    'Senden ({mod}+Enter)',
    'Enviar ({mod}+Enter)'
  ],
  'chat.emoji': ['Смайлики', 'Emoji', 'Emoji', 'Emojis', 'Emojis'],
  'chat.sendFiles': ['Отправить файлы', 'Send files', 'Trimite fișiere', 'Dateien senden', 'Enviar archivos'],
  'chat.sendFilesGroup': [
    'Отправить файлы участникам ({n}) — каждому отдельно',
    'Send files to the members ({n}) — separately to each',
    'Trimite fișiere participanților ({n}) — separat fiecăruia',
    'Dateien an die Mitglieder senden ({n}) – an jeden einzeln',
    'Enviar archivos a los miembros ({n}), a cada uno por separado'
  ],
  'settings.colleagues': [
    'Коллеги и версии',
    'Colleagues and versions',
    'Colegi și versiuni',
    'Kollegen und Versionen',
    'Compañeros y versiones'
  ],
  'settings.colleaguesHint': [
    'Все, кого Hallway видел в сети. Версию сообщают клиенты начиная с 1.3 — у более старых написано «до 1.3». Красным — версии старее вашей.',
    'Everyone Hallway has seen on the network. Clients report their version starting with 1.3; older ones show “before 1.3”. Versions older than yours are shown in red.',
    'Toți cei pe care Hallway i-a văzut în rețea. Versiunea este raportată începând cu 1.3; clienții mai vechi apar ca „înainte de 1.3”. Cu roșu — versiunile mai vechi decât a dvs.',
    'Alle, die Hallway im Netzwerk gesehen hat. Ab Version 1.3 melden Clients ihre Version – bei älteren steht „vor 1.3“. Versionen, die älter als Ihre sind, werden rot angezeigt.',
    'Todos los que Hallway ha visto en la red. Los clientes informan de su versión a partir de la 1.3; en los más antiguos pone «anterior a 1.3». Las versiones más antiguas que la tuya aparecen en rojo.'
  ],
  'settings.colleaguesEmpty': [
    'Пока никого не видели',
    'Nobody seen yet',
    'Încă nu a fost văzut nimeni',
    'Noch niemand gesehen',
    'Aún no se ha visto a nadie'
  ],
  'settings.colleaguesOutdated': [
    'старее вашей: {n}',
    'older than yours: {n}',
    'mai vechi decât a dvs.: {n}',
    'älter als Ihre: {n}',
    'más antiguas que la tuya: {n}'
  ],
  'settings.versionBefore': ['до 1.3', 'before 1.3', 'înainte de 1.3', 'vor 1.3', 'anterior a 1.3'],
  'settings.versionOlder': [
    'Версия старее вашей — стоит обновить',
    'Older than your version — worth updating',
    'Mai veche decât a dvs. — merită actualizată',
    'Älter als Ihre Version – ein Update lohnt sich',
    'Más antigua que la tuya: conviene actualizar'
  ],
  'settings.versionNewer': [
    'Версия новее вашей',
    'Newer than your version',
    'Mai nouă decât a dvs.',
    'Neuer als Ihre Version',
    'Más reciente que la tuya'
  ],
  'settings.presenceEvents': [
    'Входы и выходы в переписке',
    'Coming and going in the chat',
    'Conectări în conversație',
    'Kommen und Gehen im Chat',
    'Conexiones y desconexiones en el chat'
  ],
  'settings.presenceEventsLabel': [
    'Показывать в чате, когда коллега зашёл и вышел',
    'Show in the chat when a colleague comes online and leaves',
    'Arată în conversație când un coleg se conectează și iese',
    'Im Chat anzeigen, wann ein Kollege online kommt und geht',
    'Mostrar en el chat cuándo un compañero se conecta y se desconecta'
  ],
  'settings.presenceEventsHint': [
    'Серые строки «в сети · 9:15» появляются только в переписках, которые уже начаты, и не чаще раза в 15 минут на человека. После пробуждения компьютера и смены сети их нет.',
    'Grey lines “online · 9:15” appear only in conversations you already have, at most once in 15 minutes per person. Nothing appears after the computer wakes up or the network changes.',
    'Liniile gri „conectat · 9:15” apar doar în conversațiile deja începute, cel mult o dată la 15 minute pentru fiecare. După trezirea computerului sau schimbarea rețelei nu apar.',
    'Graue Zeilen „online · 9:15“ erscheinen nur in bereits begonnenen Unterhaltungen und höchstens einmal in 15 Minuten pro Person. Nach dem Aufwachen des Computers oder einem Netzwerkwechsel erscheinen sie nicht.',
    'Las líneas grises «en línea · 9:15» aparecen solo en conversaciones ya empezadas y como mucho una vez cada 15 minutos por persona. No aparecen tras reactivar el equipo ni al cambiar de red.'
  ],
  'chat.dropFiles': [
    'Отправить файлы: {name}',
    'Send files to {name}',
    'Trimite fișiere către {name}',
    'Dateien senden an {name}',
    'Enviar archivos a {name}'
  ],
  'chat.dropOffline': [
    'Пользователь не в сети',
    'This person is offline',
    'Persoana este deconectată',
    'Diese Person ist offline',
    'Esta persona está desconectada'
  ],
  'chat.dropGroup': [
    'В группу файлы пока не отправляются',
    'Files cannot be sent to a group yet',
    'Fișierele nu se pot trimite încă în grup',
    'Dateien können noch nicht an Gruppen gesendet werden',
    'Todavía no se pueden enviar archivos a un grupo'
  ],
  'chat.pasteGroup': [
    'В группу файлы пока не отправляются — пришлите в личном чате',
    'Files cannot be sent to a group yet — send them in a direct chat',
    'Fișierele nu se pot trimite în grup — trimiteți-le în conversația privată',
    'Dateien können noch nicht an Gruppen gesendet werden – senden Sie sie im Einzelchat',
    'Todavía no se pueden enviar archivos a un grupo: envíalos en un chat privado'
  ],
  'chat.tooLong': [
    'Сообщение длиннее {n} символов',
    'The message is longer than {n} characters',
    'Mesajul depășește {n} de caractere',
    'Die Nachricht ist länger als {n} Zeichen',
    'El mensaje supera los {n} caracteres'
  ],

  'chat.screenshotPrefix': ['Снимок', 'Screenshot', 'Captură', 'Bildschirmfoto', 'Captura'],
  'chat.sendFileFailed': [
    'Не удалось отправить файл',
    'Could not send the file',
    'Fișierul nu a putut fi trimis',
    'Die Datei konnte nicht gesendet werden',
    'No se pudo enviar el archivo'
  ],

  // файлы
  'file.accept': ['Принять', 'Accept', 'Acceptă', 'Annehmen', 'Aceptar'],
  'file.decline': ['Отклонить', 'Decline', 'Refuză', 'Ablehnen', 'Rechazar'],
  'file.cancel': ['Отменить', 'Cancel', 'Anulează', 'Abbrechen', 'Cancelar'],
  'file.open': ['Открыть', 'Open', 'Deschide', 'Öffnen', 'Abrir'],
  'file.showInFolder': [
    'Показать в папке',
    'Show in folder',
    'Arată în folder',
    'Im Ordner anzeigen',
    'Mostrar en la carpeta'
  ],
  'file.showInFinder': [
    'Показать в Finder',
    'Show in Finder',
    'Arată în Finder',
    'Im Finder anzeigen',
    'Mostrar en Finder'
  ],
  'file.waiting': [
    'Ожидает вашего решения',
    'Waiting for your decision',
    'Așteaptă decizia dumneavoastră',
    'Wartet auf Ihre Entscheidung',
    'Esperando tu decisión'
  ],
  'file.offering': [
    'Ждём ответа собеседника',
    'Waiting for the other side',
    'Se așteaptă răspunsul',
    'Warten auf die Gegenseite',
    'Esperando respuesta del contacto'
  ],
  'file.connecting': ['Соединяемся…', 'Connecting…', 'Se conectează…', 'Verbindung wird hergestellt…', 'Conectando…'],
  'file.transferring': [
    '{done} из {total} · {speed}',
    '{done} of {total} · {speed}',
    '{done} din {total} · {speed}',
    '{done} von {total} · {speed}',
    '{done} de {total} · {speed}'
  ],
  'file.done': ['Передан', 'Transferred', 'Transferat', 'Übertragen', 'Transferido'],
  'file.declined': ['Отклонён', 'Declined', 'Refuzat', 'Abgelehnt', 'Rechazado'],
  'file.canceled': ['Отменён', 'Canceled', 'Anulat', 'Abgebrochen', 'Cancelado'],
  'file.failed': ['Ошибка', 'Failed', 'Eroare', 'Fehler', 'Error'],
  'file.thumbnail': ['Открыть картинку', 'Open the image', 'Deschide imaginea', 'Bild öffnen', 'Abrir la imagen'],
  'file.sendTo': [
    'Отправить файлы: {name}',
    'Send files to {name}',
    'Trimite fișiere către {name}',
    'Dateien senden an {name}',
    'Enviar archivos a {name}'
  ],
  'file.pasteTooBig': [
    'Файл из буфера больше 100 МБ — перетащите его в окно',
    'A clipboard file over 100 MB — drag it into the window instead',
    'Fișierul din clipboard depășește 100 MB — trageți-l în fereastră',
    'Die Datei aus der Zwischenablage ist größer als 100 MB – ziehen Sie sie stattdessen ins Fenster',
    'El archivo del portapapeles supera los 100 MB: arrástralo a la ventana'
  ],
  'file.badData': ['Некорректные данные', 'Invalid data', 'Date incorecte', 'Ungültige Daten', 'Datos no válidos'],
  'file.saveFailed': [
    'Не удалось сохранить файл: {error}',
    'Could not save the file: {error}',
    'Fișierul nu a putut fi salvat: {error}',
    'Die Datei konnte nicht gespeichert werden: {error}',
    'No se pudo guardar el archivo: {error}'
  ],

  // группы
  'group.newTitle': ['Новая группа', 'New group', 'Grup nou', 'Neue Gruppe', 'Nuevo grupo'],
  'group.namePlaceholder': [
    'Название группы — например, «Отдел продаж»',
    'Group name — for example, “Sales team”',
    'Numele grupului — de exemplu, „Vânzări”',
    'Gruppenname – zum Beispiel „Vertrieb“',
    'Nombre del grupo; por ejemplo, «Ventas»'
  ],
  'group.searchPeers': ['Поиск коллег', 'Search people', 'Caută colegi', 'Kollegen suchen', 'Buscar compañeros'],
  'group.noPeers': [
    'Пока никого нет в списке — группу можно создать, когда коллеги появятся.',
    'Nobody is in the list yet — you can create a group once colleagues show up.',
    'Încă nu este nimeni în listă — puteți crea un grup când apar colegii.',
    'Noch niemand in der Liste – eine Gruppe können Sie erstellen, sobald Kollegen erscheinen.',
    'Todavía no hay nadie en la lista: podrás crear un grupo cuando aparezcan compañeros.'
  ],
  'group.hint': [
    'Сообщения в группе уходят каждому участнику напрямую, как личные. Файлы пока отправляются только в личном чате.',
    'Group messages go to each member directly, like private ones. Files can still be sent only in a direct chat.',
    'Mesajele din grup ajung direct la fiecare participant, ca cele private. Fișierele se trimit deocamdată doar în conversații private.',
    'Gruppennachrichten gehen direkt an jedes Mitglied, wie Einzelnachrichten. Dateien können vorerst nur im Einzelchat gesendet werden.',
    'Los mensajes del grupo llegan directamente a cada miembro, como los privados. Por ahora, los archivos solo se envían en un chat privado.'
  ],
  'group.offlineHint': [
    ' Кто сейчас не в сети — увидит группу, когда запустит Hallway.',
    ' Those who are offline will see the group when they start Hallway.',
    ' Cei deconectați vor vedea grupul când pornesc Hallway.',
    ' Wer gerade offline ist, sieht die Gruppe, sobald er Hallway startet.',
    ' Quien esté desconectado verá el grupo al abrir Hallway.'
  ],
  'group.untitled': ['Группа', 'Group', 'Grup', 'Gruppe', 'Grupo'],
  'group.renameTitle': [
    'Переименовать группу',
    'Rename group',
    'Redenumește grupul',
    'Gruppe umbenennen',
    'Cambiar el nombre del grupo'
  ],
  'group.renameHint': [
    'Новое название увидят все участники, которые сейчас в сети.',
    'Every member who is online will see the new name.',
    'Toți participanții conectați vor vedea noul nume.',
    'Den neuen Namen sehen alle Mitglieder, die gerade online sind.',
    'El nuevo nombre lo verán todos los miembros que estén en línea.'
  ],
  'group.renameEmpty': [
    'Введите название',
    'Enter a name',
    'Introduceți un nume',
    'Namen eingeben',
    'Escribe un nombre'
  ],
  'group.renameFailed': [
    'Не удалось переименовать',
    'Could not rename',
    'Redenumirea a eșuat',
    'Umbenennen fehlgeschlagen',
    'No se pudo cambiar el nombre'
  ],
  'group.notFound': [
    'Группа не найдена',
    'Group not found',
    'Grupul nu a fost găsit',
    'Gruppe nicht gefunden',
    'Grupo no encontrado'
  ],
  'group.pickMembers': [
    'Выберите хотя бы одного участника',
    'Select at least one member',
    'Selectați cel puțin un participant',
    'Wählen Sie mindestens ein Mitglied aus',
    'Elige al menos un miembro'
  ],
  'group.tooMany': [
    'Больше {n} групп не поместится',
    'No more than {n} groups fit',
    'Nu încap mai mult de {n} grupuri',
    'Mehr als {n} Gruppen sind nicht möglich',
    'No caben más de {n} grupos'
  ],
  'group.createFailed': [
    'Не удалось создать группу',
    'Could not create the group',
    'Grupul nu a putut fi creat',
    'Die Gruppe konnte nicht erstellt werden',
    'No se pudo crear el grupo'
  ],
  'group.deleted': [
    'Группа удалена',
    'The group is gone',
    'Grupul a fost șters',
    'Die Gruppe wurde gelöscht',
    'El grupo se ha eliminado'
  ],
  'group.noMembers': [
    'В группе больше нет участников',
    'The group has no members left',
    'Grupul nu mai are participanți',
    'Die Gruppe hat keine Mitglieder mehr',
    'El grupo ya no tiene miembros'
  ],
  'group.subtitle': [
    'участников: {total} · в сети: {online} из {others}',
    'members: {total} · online: {online} of {others}',
    'participanți: {total} · conectați: {online} din {others}',
    'Mitglieder: {total} · online: {online} von {others}',
    'miembros: {total} · en línea: {online} de {others}'
  ],
  'group.memberCount': ['Участников: {n}', 'Members: {n}', 'Participanți: {n}', 'Mitglieder: {n}', 'Miembros: {n}'],
  'group.memberOffline': [
    '{name} — не в сети',
    '{name} — offline',
    '{name} — deconectat',
    '{name} – offline',
    '{name}: desconectado'
  ],
  'group.rename': [
    'Переименовать группу…',
    'Rename group…',
    'Redenumește grupul…',
    'Gruppe umbenennen…',
    'Cambiar el nombre del grupo…'
  ],
  'group.clearHistory': [
    'Очистить историю группы…',
    'Clear group history…',
    'Șterge istoricul grupului…',
    'Gruppenverlauf leeren…',
    'Borrar el historial del grupo…'
  ],
  'group.leave': ['Выйти из группы…', 'Leave group…', 'Ieși din grup…', 'Gruppe verlassen…', 'Salir del grupo…'],
  'group.leaveTitle': [
    'Выйти из группы «{name}»?',
    'Leave the group “{name}”?',
    'Ieșiți din grupul „{name}”?',
    'Gruppe „{name}“ verlassen?',
    '¿Salir del grupo «{name}»?'
  ],
  'group.leaveDetail': [
    'Группа и её переписка исчезнут только у вас, остальные участники продолжат переписываться. Они увидят, что вы вышли.',
    'The group and its history disappear only for you; the others keep chatting. They will see that you left.',
    'Grupul și istoricul dispar doar la dumneavoastră; ceilalți continuă discuția. Vor vedea că ați ieșit.',
    'Die Gruppe und ihr Verlauf verschwinden nur bei Ihnen, die anderen Mitglieder schreiben weiter. Sie sehen, dass Sie die Gruppe verlassen haben.',
    'El grupo y su historial desaparecerán solo para ti; los demás seguirán conversando. Verán que has salido.'
  ],
  'group.inviteTitle': [
    'Новая группа «{name}»',
    'New group “{name}”',
    'Grup nou „{name}”',
    'Neue Gruppe „{name}“',
    'Nuevo grupo «{name}»'
  ],
  'group.inviteBody': [
    'Вас добавил {name} · участников: {count}',
    '{name} added you · members: {count}',
    '{name} v-a adăugat · participanți: {count}',
    '{name} hat Sie hinzugefügt · Mitglieder: {count}',
    '{name} te ha añadido · miembros: {count}'
  ],

  // служебные строки в переписке
  'event.online': ['в сети · {time}', 'online · {time}', 'conectat · {time}', 'online · {time}', 'en línea · {time}'],
  'event.offline': [
    'вышел · {time}',
    'went offline · {time}',
    'deconectat · {time}',
    'offline · {time}',
    'desconectado · {time}'
  ],
  'event.groupCreated': [
    'Группа создана · {time}',
    'Group created · {time}',
    'Grup creat · {time}',
    'Gruppe erstellt · {time}',
    'Grupo creado · {time}'
  ],
  'event.groupJoined': [
    'Вас добавили в группу · {actor}',
    '{actor} added you to the group',
    '{actor} v-a adăugat în grup',
    '{actor} hat Sie zur Gruppe hinzugefügt',
    '{actor} te ha añadido al grupo'
  ],
  'event.groupRenamed': [
    'Группа переименована в «{target}» · {actor}',
    '{actor} renamed the group to “{target}”',
    '{actor} a redenumit grupul în „{target}”',
    '{actor} hat die Gruppe in „{target}“ umbenannt',
    '{actor} ha cambiado el nombre del grupo a «{target}»'
  ],
  'event.groupMemberAdded': [
    'Добавлен участник: {target} · {actor}',
    '{actor} added {target}',
    '{actor} l-a adăugat pe {target}',
    '{actor} hat {target} hinzugefügt',
    '{actor} ha añadido a {target}'
  ],
  'event.groupMemberRemoved': [
    'Участник удалён: {target} · {actor}',
    '{actor} removed {target} from the group',
    '{actor} l-a scos pe {target} din grup',
    '{actor} hat {target} aus der Gruppe entfernt',
    '{actor} ha quitado a {target} del grupo'
  ],
  'event.groupMemberLeft': [
    'Участник вышел из группы: {actor}',
    '{actor} left the group',
    '{actor} a ieșit din grup',
    '{actor} hat die Gruppe verlassen',
    '{actor} ha salido del grupo'
  ],
  'event.groupDeleted': [
    'Группа удалена · {actor}',
    '{actor} deleted the group',
    '{actor} a șters grupul',
    '{actor} hat die Gruppe gelöscht',
    '{actor} ha eliminado el grupo'
  ],
  'event.you': ['Вы', 'You', 'Tu', 'Sie', 'Tú'],
  'peer.lastSeen': [
    'был в сети в {time}',
    'last seen at {time}',
    'ultima dată la {time}',
    'zuletzt online um {time}',
    'en línea por última vez a las {time}'
  ],
  'peer.lastSeenDay': [
    'был в сети {date} в {time}',
    'last seen {date} at {time}',
    'ultima dată {date} la {time}',
    'zuletzt online am {date} um {time}',
    'en línea por última vez el {date} a las {time}'
  ],
  'peer.since': [
    '{status} с {time}',
    '{status} since {time}',
    '{status} de la {time}',
    '{status} seit {time}',
    '{status} desde las {time}'
  ],
  'peer.sinceDay': [
    '{status} с {date}, {time}',
    '{status} since {date}, {time}',
    '{status} de la {date}, {time}',
    '{status} seit {date}, {time}',
    '{status} desde el {date}, {time}'
  ],

  // архив
  'archive.section': ['Архив', 'Archive', 'Arhivă', 'Archiv', 'Archivo'],
  'archive.readOnly': [
    'Переписка в архиве — только для чтения',
    'An archived conversation is read-only',
    'Conversația arhivată este doar pentru citire',
    'Archivierte Unterhaltung – nur lesen',
    'Conversación archivada: solo lectura'
  ],
  'archive.restore': [
    'Вернуть в список',
    'Restore to the list',
    'Readu în listă',
    'Zurück in die Liste',
    'Devolver a la lista'
  ],
  'archive.delete': [
    'Удалить навсегда…',
    'Delete permanently…',
    'Șterge definitiv…',
    'Endgültig löschen…',
    'Eliminar para siempre…'
  ],
  'archive.deleteTitle': [
    'Удалить переписку «{name}» навсегда?',
    'Delete the conversation “{name}” permanently?',
    'Ștergeți definitiv conversația „{name}”?',
    'Unterhaltung „{name}“ endgültig löschen?',
    '¿Eliminar para siempre la conversación «{name}»?'
  ],
  'archive.deleteDetail': [
    'Сообщения исчезнут с этого компьютера без возможности вернуть. Полученные файлы на диске останутся.',
    'The messages disappear from this computer for good. Received files stay on disk.',
    'Mesajele dispar definitiv de pe acest computer. Fișierele primite rămân pe disc.',
    'Die Nachrichten werden unwiderruflich von diesem Computer gelöscht. Empfangene Dateien bleiben auf der Festplatte.',
    'Los mensajes se borrarán de este equipo sin posibilidad de recuperarlos. Los archivos recibidos se quedan en el disco.'
  ],
  'archive.hideChat': [
    'Убрать из списка (в архив)',
    'Move out of the list (to archive)',
    'Scoate din listă (în arhivă)',
    'Aus der Liste entfernen (ins Archiv)',
    'Quitar de la lista (al archivo)'
  ],
  'archive.reasonLeft': [
    'вы вышли из группы',
    'you left the group',
    'ați ieșit din grup',
    'Sie haben die Gruppe verlassen',
    'has salido del grupo'
  ],
  'archive.reasonDeleted': [
    'группа удалена',
    'the group is deleted',
    'grupul a fost șters',
    'Gruppe gelöscht',
    'grupo eliminado'
  ],
  'archive.reasonHidden': [
    'убрано из списка',
    'moved out of the list',
    'scos din listă',
    'aus der Liste entfernt',
    'quitado de la lista'
  ],

  // разделы списка
  'sidebar.online': ['В сети', 'Online', 'Conectați', 'Online', 'En línea'],
  'sidebar.offline': ['Не в сети', 'Offline', 'Deconectați', 'Offline', 'Desconectados'],
  'sidebar.collapse': [
    'Свернуть раздел',
    'Collapse the section',
    'Restrânge secțiunea',
    'Abschnitt einklappen',
    'Contraer la sección'
  ],
  'sidebar.expand': [
    'Раскрыть раздел',
    'Expand the section',
    'Extinde secțiunea',
    'Abschnitt ausklappen',
    'Expandir la sección'
  ],

  // группы: состав и удаление
  'group.delete': [
    'Удалить группу у всех…',
    'Delete the group for everyone…',
    'Șterge grupul pentru toți…',
    'Gruppe für alle löschen…',
    'Eliminar el grupo para todos…'
  ],
  'group.deleteTitle': [
    'Удалить группу «{name}» у всех участников?',
    'Delete the group “{name}” for every member?',
    'Ștergeți grupul „{name}” pentru toți participanții?',
    'Gruppe „{name}“ für alle Mitglieder löschen?',
    '¿Eliminar el grupo «{name}» para todos los miembros?'
  ],
  'group.deleteDetail': [
    'Группа исчезнет из списка у всех, кто сейчас в сети; остальные потеряют её при следующем запуске. Переписка у каждого останется в архиве.',
    'The group disappears from the list for everyone online; the rest lose it at their next start. Everyone keeps the conversation in the archive.',
    'Grupul dispare din listă la toți cei conectați; ceilalți îl pierd la următoarea pornire. Fiecare păstrează conversația în arhivă.',
    'Die Gruppe verschwindet bei allen, die gerade online sind, aus der Liste; die übrigen verlieren sie beim nächsten Start. Jeder behält die Unterhaltung im Archiv.',
    'El grupo desaparecerá de la lista de todos los que estén en línea; los demás lo perderán la próxima vez que abran la aplicación. Cada uno conserva la conversación en el archivo.'
  ],
  'group.deleteOwnerOnly': [
    'Удалить группу у всех может только тот, кто её создал',
    'Only the person who created the group can delete it for everyone',
    'Doar cel care a creat grupul îl poate șterge pentru toți',
    'Nur wer die Gruppe erstellt hat, kann sie für alle löschen',
    'Solo quien creó el grupo puede eliminarlo para todos'
  ],
  'group.members': ['Участники…', 'Members…', 'Participanți…', 'Mitglieder…', 'Miembros…'],
  'group.addMembers': [
    'Добавить участников…',
    'Add members…',
    'Adaugă participanți…',
    'Mitglieder hinzufügen…',
    'Añadir miembros…'
  ],
  'group.addTitle': [
    'Добавить в группу «{name}»',
    'Add to the group “{name}”',
    'Adaugă în grupul „{name}”',
    'Zur Gruppe „{name}“ hinzufügen',
    'Añadir al grupo «{name}»'
  ],
  'group.addHint': [
    'Новые участники увидят группу сразу, но прошлую переписку — нет: она есть только у тех, кто уже был в группе.',
    'New members see the group right away, but not the earlier conversation — it exists only for those who were already in the group.',
    'Participanții noi văd grupul imediat, dar nu conversația anterioară — ea există doar la cei care erau deja în grup.',
    'Neue Mitglieder sehen die Gruppe sofort, aber nicht den bisherigen Verlauf – den haben nur diejenigen, die schon in der Gruppe waren.',
    'Los nuevos miembros verán el grupo enseguida, pero no la conversación anterior: solo la tienen quienes ya estaban en el grupo.'
  ],
  'group.addNobody': [
    'Все коллеги из списка уже в этой группе',
    'Everyone in the list is already in this group',
    'Toți colegii din listă sunt deja în acest grup',
    'Alle Kollegen aus der Liste sind bereits in dieser Gruppe',
    'Todos los compañeros de la lista ya están en este grupo'
  ],
  'group.addFailed': [
    'Не удалось добавить участников',
    'Could not add the members',
    'Participanții nu au putut fi adăugați',
    'Die Mitglieder konnten nicht hinzugefügt werden',
    'No se pudieron añadir los miembros'
  ],
  'group.removeMember': [
    'Убрать из группы',
    'Remove from the group',
    'Scoate din grup',
    'Aus der Gruppe entfernen',
    'Quitar del grupo'
  ],
  'group.removeTitle': [
    'Убрать {name} из группы «{group}»?',
    'Remove {name} from the group “{group}”?',
    'Îl scoateți pe {name} din grupul „{group}”?',
    '{name} aus der Gruppe „{group}“ entfernen?',
    '¿Quitar a {name} del grupo «{group}»?'
  ],
  'group.removeDetail': [
    'Группа исчезнет у него из списка, переписка останется в его архиве. Остальные участники увидят, что вы его убрали.',
    'The group disappears from their list; the conversation stays in their archive. The other members will see that you removed them.',
    'Grupul dispare din lista lui; conversația rămâne în arhiva lui. Ceilalți participanți vor vedea că l-ați scos.',
    'Die Gruppe verschwindet aus der Liste dieser Person, die Unterhaltung bleibt in ihrem Archiv. Die anderen Mitglieder sehen, dass Sie sie entfernt haben.',
    'El grupo desaparecerá de su lista y la conversación quedará en su archivo. Los demás miembros verán que lo has quitado.'
  ],
  'group.writeTo': [
    'Написать лично',
    'Send a direct message',
    'Scrie în privat',
    'Direktnachricht senden',
    'Enviar mensaje privado'
  ],
  'group.typingOne': [
    '{name} печатает…',
    '{name} is typing…',
    '{name} scrie…',
    '{name} schreibt…',
    '{name} está escribiendo…'
  ],
  'group.typingMany': [
    'печатают: {names}',
    'typing: {names}',
    'scriu: {names}',
    'schreiben: {names}',
    'escribiendo: {names}'
  ],
  'group.readBy': [
    'Прочитали: {names}',
    'Read by: {names}',
    'Citit de: {names}',
    'Gelesen von: {names}',
    'Leído por: {names}'
  ],
  'group.readAll': ['Прочитали все', 'Read by everyone', 'Citit de toți', 'Von allen gelesen', 'Leído por todos'],
  'group.notReadYet': [
    'Пока никто не прочитал',
    'Nobody has read it yet',
    'Încă nu a citit nimeni',
    'Noch von niemandem gelesen',
    'Nadie lo ha leído todavía'
  ],

  // файлы в группу
  'file.groupSendHint': [
    'Файл уйдёт каждому участнику отдельно: {count} × {size}',
    'The file goes to each member separately: {count} × {size}',
    'Fișierul ajunge separat la fiecare participant: {count} × {size}',
    'Die Datei geht an jedes Mitglied einzeln: {count} × {size}',
    'El archivo se enviará a cada miembro por separado: {count} × {size}'
  ],
  'file.groupAccepted': [
    'Принято: {done} из {total}',
    'Accepted: {done} of {total}',
    'Acceptat: {done} din {total}',
    'Angenommen: {done} von {total}',
    'Aceptado: {done} de {total}'
  ],
  'file.groupSending': [
    'Отправляется участникам: {done} из {total}',
    'Sending to members: {done} of {total}',
    'Se trimite participanților: {done} din {total}',
    'Wird an Mitglieder gesendet: {done} von {total}',
    'Enviando a los miembros: {done} de {total}'
  ],
  'file.groupFailed': [
    'Не доставлено: {count}',
    'Not delivered: {count}',
    'Nelivrat: {count}',
    'Nicht zugestellt: {count}',
    'No entregado: {count}'
  ],
  'file.retryFailed': [
    'Повторить для них',
    'Retry for them',
    'Reîncearcă pentru ei',
    'Für sie erneut versuchen',
    'Reintentar para ellos'
  ],
  'file.partPending': ['ждёт решения', 'waiting', 'în așteptare', 'wartet', 'pendiente'],
  'file.partOffline': ['не в сети', 'offline', 'deconectat', 'offline', 'desconectado'],

  // «написать всем»
  // «Что нового»
  'whatsNew.title': [
    'Что нового в Hallway {version}',
    'What’s new in Hallway {version}',
    'Ce este nou în Hallway {version}',
    'Neu in Hallway {version}',
    'Novedades de Hallway {version}'
  ],
  'whatsNew.subtitle': [
    'Коротко о главном',
    'The highlights',
    'Pe scurt, ce contează',
    'Das Wichtigste in Kürze',
    'Lo más importante'
  ],
  'whatsNew.ok': ['Понятно', 'Got it', 'Am înțeles', 'Verstanden', 'Entendido'],
  'whatsNew.again': [
    'Открыть снова: «О программе → Что нового»',
    'Open again: “About → What’s new”',
    'Redeschideți: „Despre → Ce este nou”',
    'Erneut öffnen: „Über Hallway → Neuigkeiten“',
    'Para volver a abrirlo: «Acerca de → Novedades»'
  ],
  'whatsNew.open': [
    'Что нового в {version}',
    'What’s new in {version}',
    'Ce este nou în {version}',
    'Neuigkeiten in {version}',
    'Novedades de la {version}'
  ],
  'whatsNew.1_3.everyone.title': ['Общий чат', 'Everyone chat', 'Chat comun', 'Allgemeiner Chat', 'Chat general'],
  'whatsNew.1_3.everyone.text': [
    '«Написать всем» теперь открывает общий чат офиса. Отвечать может каждый — ответы видят все. А кто был не в сети, увидит пропущенное.',
    '“Message everyone” now opens the office-wide chat. Anyone can reply, and everyone sees the replies. Those who were offline catch up on what they missed.',
    '„Scrie tuturor” deschide acum chatul comun al biroului. Oricine poate răspunde, iar răspunsurile le văd toți. Cei care nu erau conectați văd ce au pierdut.',
    '„Nachricht an alle“ öffnet jetzt den allgemeinen Chat des Büros. Jeder kann antworten, und alle sehen die Antworten. Wer offline war, sieht, was er verpasst hat.',
    '«Escribir a todos» ahora abre el chat general de la oficina. Cualquiera puede responder y todos ven las respuestas. Quien estaba desconectado verá lo que se perdió.'
  ],
  'whatsNew.1_3.files.title': [
    'Файлы для всех',
    'Files for everyone',
    'Fișiere pentru toți',
    'Dateien für alle',
    'Archivos para todos'
  ],
  'whatsNew.1_3.files.text': [
    'В общий чат можно отправить файл или скриншот. Каждый скачает его, когда понадобится.',
    'Send a file or a screenshot to the everyone chat. Each person downloads it when they need it.',
    'Trimiteți un fișier sau o captură în chatul comun. Fiecare îl descarcă atunci când are nevoie.',
    'Im allgemeinen Chat können Sie eine Datei oder einen Screenshot senden. Jeder lädt sie herunter, wenn er sie braucht.',
    'En el chat general puedes enviar un archivo o una captura de pantalla. Cada uno lo descarga cuando lo necesita.'
  ],
  'whatsNew.1_3.delivery.title': [
    'Сообщения доходят всегда',
    'Messages always get through',
    'Mesajele ajung mereu',
    'Nachrichten kommen immer an',
    'Los mensajes siempre llegan'
  ],
  'whatsNew.1_3.delivery.text': [
    'Пишите даже тем, кто не в сети: сообщение дойдёт само, как только коллега появится.',
    'Write even to colleagues who are offline: the message is delivered as soon as they are back.',
    'Scrieți chiar și colegilor deconectați: mesajul ajunge imediat ce revin.',
    'Schreiben Sie auch Kollegen, die offline sind: Die Nachricht wird zugestellt, sobald sie wieder da sind.',
    'Escribe incluso a quien esté desconectado: el mensaje llegará solo en cuanto tu compañero se conecte.'
  ],
  'whatsNew.1_3.read.title': [
    'Прочитано — сразу видно',
    'See at a glance what was read',
    'Se vede imediat ce s-a citit',
    'Gelesen – auf einen Blick',
    'Leído, de un vistazo'
  ],
  'whatsNew.1_3.read.text': [
    'Две цветные галочки: сообщение прочитали.',
    'Two coloured ticks: the message has been read.',
    'Două bife colorate: mesajul a fost citit.',
    'Zwei farbige Häkchen: Die Nachricht wurde gelesen.',
    'Dos marcas de color: el mensaje se ha leído.'
  ],
  'whatsNew.1_3.tones.title': [
    'Своя мелодия',
    'A sound for each chat',
    'Sunetul potrivit',
    'Ein eigener Ton',
    'Un sonido propio'
  ],
  'whatsNew.1_3.tones.text': [
    'Свой звук у личных сообщений, групп и общего чата. Выбрать — «Настройки → Уведомления».',
    'Direct messages, groups and the everyone chat each have their own sound. Pick them in “Settings → Notifications”.',
    'Mesajele private, grupurile și chatul comun au fiecare sunetul lor. Alegeți din „Setări → Notificări”.',
    'Einzelnachrichten, Gruppen und der allgemeine Chat haben je einen eigenen Ton. Auswählen unter „Einstellungen → Benachrichtigungen“.',
    'Los mensajes privados, los grupos y el chat general tienen cada uno su sonido. Elígelo en «Ajustes → Notificaciones».'
  ],

  // общий чат
  'everyone.title': ['Общий чат', 'Everyone', 'Chat comun', 'Allgemeiner Chat', 'Chat general'],
  'everyone.subtitle': [
    'все, у кого Hallway · в сети: {n}',
    'everyone on Hallway · online: {n}',
    'toți cei cu Hallway · conectați: {n}',
    'alle mit Hallway · online: {n}',
    'todos con Hallway · en línea: {n}'
  ],
  'everyone.preview': [
    'Переписка со всеми, у кого Hallway',
    'A conversation with everyone on Hallway',
    'Conversație cu toți cei cu Hallway',
    'Unterhaltung mit allen, die Hallway nutzen',
    'Conversación con todos los que usan Hallway'
  ],
  'everyone.empty': [
    'Здесь переписка со всеми, у кого запущен Hallway. Сообщение сразу получат все, кто в сети, а остальные — когда появятся (за последние 3 дня).',
    'This is a conversation with everyone running Hallway. Everyone online gets a message right away; the others get it when they come online (last 3 days).',
    'Aici este conversația cu toți cei care au Hallway pornit. Cei conectați primesc mesajul imediat, ceilalți — când se conectează (ultimele 3 zile).',
    'Hier schreiben Sie mit allen, bei denen Hallway läuft. Wer online ist, erhält die Nachricht sofort, die anderen, sobald sie online kommen (innerhalb der letzten 3 Tage).',
    'Aquí conversas con todos los que tienen Hallway abierto. Quienes estén en línea recibirán el mensaje al instante, y los demás cuando se conecten (durante los últimos 3 días).'
  ],
  'everyone.composerNobody': [
    'Сейчас никого нет в сети — сообщение дойдёт, когда коллеги появятся',
    'Nobody is online right now — the message will arrive when colleagues come online',
    'Nu este nimeni conectat — mesajul va ajunge când colegii se conectează',
    'Gerade ist niemand online – die Nachricht kommt an, sobald Kollegen online sind',
    'Ahora no hay nadie en línea: el mensaje llegará cuando se conecten tus compañeros'
  ],
  'everyone.notDelivered': [
    'Пока никому не доставлено — дойдёт, когда коллеги появятся в сети',
    'Not delivered to anyone yet — it will arrive when colleagues come online',
    'Încă nu a fost livrat nimănui — va ajunge când colegii se conectează',
    'Noch niemandem zugestellt – kommt an, sobald Kollegen online sind',
    'Aún no se ha entregado a nadie: llegará cuando tus compañeros se conecten'
  ],
  'everyone.readOthers': ['и ещё {n}', 'and {n} more', 'și încă {n}', 'und {n} weitere', 'y {n} más'],
  'everyone.replyPrivately': [
    'Ответить лично',
    'Reply privately',
    'Răspunde în privat',
    'Privat antworten',
    'Responder en privado'
  ],
  'everyone.fileDownload': ['Скачать', 'Download', 'Descarcă', 'Herunterladen', 'Descargar'],
  'everyone.fileDownloadAgain': [
    'Скачать ещё раз',
    'Download again',
    'Descarcă din nou',
    'Erneut herunterladen',
    'Descargar de nuevo'
  ],
  'everyone.filePreparing': ['Готовится…', 'Preparing…', 'Se pregătește…', 'Wird vorbereitet…', 'Preparando…'],
  'everyone.fileAvailable': [
    'Файл в общем чате — скачайте, если нужен',
    'A file in the everyone chat — download it if you need it',
    'Un fișier în chatul comun — descărcați-l dacă aveți nevoie',
    'Datei im allgemeinen Chat – laden Sie sie bei Bedarf herunter',
    'Archivo en el chat general: descárgalo si lo necesitas'
  ],
  'everyone.fileNobodyDownloaded': [
    'Пока никто не скачал',
    'Nobody has downloaded it yet',
    'Încă nu l-a descărcat nimeni',
    'Noch von niemandem heruntergeladen',
    'Nadie lo ha descargado todavía'
  ],
  'everyone.fileDownloadedBy': [
    'Скачали: {n}',
    'Downloaded by {n}',
    'Descărcat de {n}',
    'Heruntergeladen: {n}',
    'Descargado por {n}'
  ],
  'everyone.fileNoSource': [
    'Сейчас файл не у кого взять — автор не в сети',
    'Nobody online has the file right now — the author is offline',
    'Acum nimeni conectat nu are fișierul — autorul nu este conectat',
    'Die Datei ist gerade nirgends verfügbar – der Absender ist offline',
    'Ahora mismo nadie tiene el archivo: el autor está desconectado'
  ],
  'everyone.fileCorrupt': [
    'Файл не совпал с оригиналом',
    'The file does not match the original',
    'Fișierul nu corespunde originalului',
    'Die Datei stimmt nicht mit dem Original überein',
    'El archivo no coincide con el original'
  ],
  'everyone.clear': [
    'Очистить историю общего чата…',
    'Clear the everyone chat history…',
    'Șterge istoricul chatului comun…',
    'Verlauf des allgemeinen Chats leeren…',
    'Borrar el historial del chat general…'
  ],
  'everyone.clearTitle': [
    'Очистить историю общего чата?',
    'Clear the everyone chat history?',
    'Ștergeți istoricul chatului comun?',
    'Verlauf des allgemeinen Chats leeren?',
    '¿Borrar el historial del chat general?'
  ],
  'everyone.clearDetail': [
    'Переписка удалится только у вас — у коллег она останется. Сообщения, написанные до этого момента, к вам больше не придут.',
    'The conversation is deleted only for you — colleagues keep it. Messages written before now will not come back to you.',
    'Conversația se șterge doar la dvs. — colegii o păstrează. Mesajele scrise până acum nu vor mai reveni la dvs.',
    'Die Unterhaltung wird nur bei Ihnen gelöscht – Ihre Kollegen behalten sie. Nachrichten, die bis jetzt geschrieben wurden, kommen nicht erneut bei Ihnen an.',
    'La conversación se borrará solo para ti; tus compañeros la conservan. Los mensajes escritos hasta ahora no volverán a llegarte.'
  ],

  // меню чата
  'menu.findInChat': [
    'Найти в переписке',
    'Find in conversation',
    'Caută în conversație',
    'Im Verlauf suchen',
    'Buscar en la conversación'
  ],
  'menu.pin': [
    'Закрепить наверху списка',
    'Pin to the top of the list',
    'Fixează în capul listei',
    'Oben in der Liste anheften',
    'Fijar arriba de la lista'
  ],
  'menu.unpin': ['Открепить', 'Unpin', 'Anulează fixarea', 'Lösen', 'Desfijar'],
  'menu.clearChat': [
    'Очистить историю чата…',
    'Clear chat history…',
    'Șterge istoricul conversației…',
    'Chatverlauf leeren…',
    'Borrar el historial del chat…'
  ],
  'menu.openLink': ['Открыть ссылку', 'Open link', 'Deschide linkul', 'Link öffnen', 'Abrir enlace'],
  'menu.copyLink': ['Копировать ссылку', 'Copy link', 'Copiază linkul', 'Link kopieren', 'Copiar enlace'],
  'menu.noSuggestions': ['Нет вариантов', 'No suggestions', 'Fără sugestii', 'Keine Vorschläge', 'No hay sugerencias'],
  'menu.addToDictionary': [
    'Добавить в словарь',
    'Add to dictionary',
    'Adaugă în dicționar',
    'Zum Wörterbuch hinzufügen',
    'Añadir al diccionario'
  ],

  // история
  'history.clearAllTitle': [
    'Очистить всю историю переписки?',
    'Clear the entire history?',
    'Ștergeți tot istoricul?',
    'Den gesamten Verlauf leeren?',
    '¿Borrar todo el historial?'
  ],
  'history.clearPeerTitle': [
    'Очистить историю переписки с «{name}»?',
    'Clear the conversation with “{name}”?',
    'Ștergeți conversația cu „{name}”?',
    'Unterhaltung mit „{name}“ leeren?',
    '¿Borrar la conversación con «{name}»?'
  ],
  'history.clearGroupTitle': [
    'Очистить переписку в группе «{name}»?',
    'Clear the conversation in the group “{name}”?',
    'Ștergeți conversația din grupul „{name}”?',
    'Unterhaltung in der Gruppe „{name}“ leeren?',
    '¿Borrar la conversación del grupo «{name}»?'
  ],
  'history.clearDetail': [
    'Сообщения удалятся только на этом компьютере — у собеседников переписка останется. Полученные файлы на диске не удаляются, незаконченные передачи продолжатся.',
    'Messages are deleted only on this computer — your contacts keep their copies. Received files stay on disk and unfinished transfers continue.',
    'Mesajele se șterg doar pe acest computer — colegii își păstrează copiile. Fișierele primite rămân pe disc, iar transferurile neterminate continuă.',
    'Die Nachrichten werden nur auf diesem Computer gelöscht – Ihre Kontakte behalten ihren Verlauf. Empfangene Dateien bleiben auf der Festplatte, laufende Übertragungen werden fortgesetzt.',
    'Los mensajes se borrarán solo en este equipo; tus contactos conservan la conversación. Los archivos recibidos no se eliminan del disco y las transferencias en curso continúan.'
  ],
  'history.sendInterrupted': [
    'Не отправлено: приложение было закрыто',
    'Not sent: the app was closed',
    'Netrimis: aplicația a fost închisă',
    'Nicht gesendet: Die App wurde geschlossen',
    'No enviado: la aplicación se cerró'
  ],
  'history.transferInterrupted': [
    'Передача прервана: приложение было закрыто',
    'Transfer interrupted: the app was closed',
    'Transfer întrerupt: aplicația a fost închisă',
    'Übertragung unterbrochen: Die App wurde geschlossen',
    'Transferencia interrumpida: la aplicación se cerró'
  ],

  // уведомления
  'notify.broadcastPrefix': [
    'Всем в сети: {text}',
    'Everyone online: {text}',
    'Tuturor conectaților: {text}',
    'An alle: {text}',
    'A todos: {text}'
  ],
  'notify.filePrefix': ['Файл: {name}', 'File: {name}', 'Fișier: {name}', 'Datei: {name}', 'Archivo: {name}'],
  'notify.groupPrefix': ['{name}: {text}', '{name}: {text}', '{name}: {text}', '{name}: {text}', '{name}: {text}'],

  // ошибки сети и передачи
  'error.appClosing': [
    'Приложение закрывается',
    'The app is closing',
    'Aplicația se închide',
    'Die App wird geschlossen',
    'La aplicación se está cerrando'
  ],
  'error.linkLost': [
    'Соединение разорвано',
    'The connection dropped',
    'Conexiunea s-a întrerupt',
    'Die Verbindung wurde getrennt',
    'Se perdió la conexión'
  ],
  'error.peerOffline': [
    'Пользователь не в сети',
    'This person is offline',
    'Persoana este deconectată',
    'Diese Person ist offline',
    'Esta persona está desconectada'
  ],
  'error.notSent': ['Не отправлено', 'Not sent', 'Netrimis', 'Nicht gesendet', 'No enviado'],
  'error.noAck': [
    'Нет подтверждения доставки',
    'No delivery confirmation',
    'Fără confirmare de livrare',
    'Keine Zustellbestätigung',
    'Sin confirmación de entrega'
  ],
  'error.noTcp': [
    'Нет TCP-соединения с {address} — проверьте брандмауэр',
    'No TCP connection to {address} — check the firewall',
    'Fără conexiune TCP la {address} — verificați firewall-ul',
    'Keine TCP-Verbindung zu {address} – prüfen Sie die Firewall',
    'Sin conexión TCP con {address}: revisa el firewall'
  ],
  'error.folderNotSupported': [
    'Папки не поддерживаются — упакуйте папку в архив',
    'Folders are not supported — put the folder into an archive',
    'Folderele nu sunt acceptate — arhivați folderul',
    'Ordner werden nicht unterstützt – packen Sie den Ordner in ein Archiv',
    'No se admiten carpetas: comprime la carpeta en un archivo ZIP'
  ],
  'error.notRegularFile': [
    'Это не обычный файл',
    'This is not a regular file',
    'Acesta nu este un fișier obișnuit',
    'Das ist keine normale Datei',
    'No es un archivo normal'
  ],
  'error.receiverSilent': [
    'Получатель не отвечает',
    'The receiver is not responding',
    'Destinatarul nu răspunde',
    'Der Empfänger antwortet nicht',
    'El destinatario no responde'
  ],
  'error.fileChanged': [
    'Файл был изменён или удалён после отправки',
    'The file was changed or deleted after sending',
    'Fișierul a fost modificat sau șters după trimitere',
    'Die Datei wurde nach dem Senden geändert oder gelöscht',
    'El archivo se modificó o eliminó después de enviarlo'
  ],
  'error.transferCanceled': [
    'Передача отменена',
    'The transfer was canceled',
    'Transferul a fost anulat',
    'Übertragung abgebrochen',
    'Transferencia cancelada'
  ],
  'error.receiverNoConfirm': [
    'Получатель не подтвердил приём',
    'The receiver did not confirm the transfer',
    'Destinatarul nu a confirmat primirea',
    'Der Empfänger hat den Empfang nicht bestätigt',
    'El destinatario no confirmó la recepción'
  ],
  'error.partialRead': [
    'Файл прочитан не полностью',
    'The file was not read completely',
    'Fișierul nu a fost citit complet',
    'Die Datei wurde nicht vollständig gelesen',
    'El archivo no se leyó por completo'
  ],
  'error.badSenderResponse': [
    'Некорректный ответ отправителя',
    'Invalid response from the sender',
    'Răspuns incorect de la expeditor',
    'Ungültige Antwort des Absenders',
    'Respuesta no válida del remitente'
  ],
  'error.noSenderConnection': [
    'Не удалось установить соединение с отправителем (брандмауэр?)',
    'Could not connect to the sender (firewall?)',
    'Nu s-a putut conecta la expeditor (firewall?)',
    'Keine Verbindung zum Absender möglich (Firewall?)',
    'No se pudo conectar con el remitente (¿firewall?)'
  ],
  'error.senderUnreachable': [
    'Не удалось связаться с отправителем',
    'Could not reach the sender',
    'Expeditorul nu a putut fi contactat',
    'Der Absender ist nicht erreichbar',
    'No se pudo contactar con el remitente'
  ],
  'error.transferStalled': [
    'Передача прервана: нет данных 30 секунд',
    'Transfer interrupted: no data for 30 seconds',
    'Transfer întrerupt: fără date timp de 30 de secunde',
    'Übertragung unterbrochen: 30 Sekunden lang keine Daten',
    'Transferencia interrumpida: 30 segundos sin datos'
  ],
  'error.tooMuchData': [
    'Получено больше данных, чем заявлено',
    'More data received than announced',
    'S-au primit mai multe date decât s-a anunțat',
    'Mehr Daten empfangen als angekündigt',
    'Se recibieron más datos de los anunciados'
  ],
  'error.peerSide': [
    'Ошибка у собеседника: {reason}',
    'Error on the other side: {reason}',
    'Eroare la celălalt capăt: {reason}',
    'Fehler auf der Gegenseite: {reason}',
    'Error en el otro extremo: {reason}'
  ],
  'error.unknown': ['неизвестно', 'unknown', 'necunoscut', 'unbekannt', 'desconocido'],
  'error.fileGone': [
    'Файл больше недоступен у отправителя',
    'The file is no longer available on the sender’s side',
    'Fișierul nu mai este disponibil la expeditor',
    'Die Datei ist beim Absender nicht mehr verfügbar',
    'El archivo ya no está disponible en el equipo del remitente'
  ],
  'error.fileModified': [
    'Файл был изменён или удалён отправителем',
    'The file was changed or deleted by the sender',
    'Fișierul a fost modificat sau șters de expeditor',
    'Die Datei wurde vom Absender geändert oder gelöscht',
    'El remitente modificó o eliminó el archivo'
  ],
  'error.declined': [
    'Собеседник отклонил передачу',
    'The other side declined the transfer',
    'Celălalt a refuzat transferul',
    'Die Gegenseite hat die Übertragung abgelehnt',
    'El contacto rechazó la transferencia'
  ],
  'error.canceledByPeer': [
    'Собеседник отменил передачу',
    'The other side canceled the transfer',
    'Celălalt a anulat transferul',
    'Die Gegenseite hat die Übertragung abgebrochen',
    'El contacto canceló la transferencia'
  ],
  'error.diskFull': [
    'Не хватает места на диске',
    'Not enough disk space',
    'Spațiu insuficient pe disc',
    'Nicht genügend Speicherplatz',
    'No hay espacio suficiente en el disco'
  ],
  'error.noAccess': [
    'Нет доступа к папке для файлов',
    'No access to the downloads folder',
    'Fără acces la folderul pentru fișiere',
    'Kein Zugriff auf den Ordner für Dateien',
    'Sin acceso a la carpeta de archivos'
  ],
  'error.badIp': [
    'Введите IPv4-адрес, например 192.168.1.20',
    'Enter an IPv4 address, for example 192.168.1.20',
    'Introduceți o adresă IPv4, de exemplu 192.168.1.20',
    'Geben Sie eine IPv4-Adresse ein, zum Beispiel 192.168.1.20',
    'Escribe una dirección IPv4, por ejemplo, 192.168.1.20'
  ],
  'error.tooManyHosts': [
    'Слишком много адресов',
    'Too many addresses',
    'Prea multe adrese',
    'Zu viele Adressen',
    'Demasiadas direcciones'
  ],
  'error.groupNoFiles': [
    'В группу файлы пока не отправляются',
    'Files cannot be sent to a group yet',
    'Fișierele nu se pot trimite încă în grup',
    'Dateien können noch nicht an Gruppen gesendet werden',
    'Todavía no se pueden enviar archivos a un grupo'
  ],
  'error.fileUnavailable': [
    'Файл недоступен: {code}',
    'The file is unavailable: {code}',
    'Fișierul nu este disponibil: {code}',
    'Die Datei ist nicht verfügbar: {code}',
    'El archivo no está disponible: {code}'
  ],
  'error.connectReceiver': [
    'Не удалось подключиться к получателю: {error}',
    'Could not connect to the receiver: {error}',
    'Nu s-a putut conecta la destinatar: {error}',
    'Keine Verbindung zum Empfänger: {error}',
    'No se pudo conectar con el destinatario: {error}'
  ],
  'error.noDownloadsAccess': [
    'Нет доступа к папке загрузок: {dir}',
    'No access to the downloads folder: {dir}',
    'Fără acces la folderul de descărcări: {dir}',
    'Kein Zugriff auf den Download-Ordner: {dir}',
    'Sin acceso a la carpeta de descargas: {dir}'
  ],
  'error.transferStalledBytes': [
    'Передача прервана: получено {done} из {total}',
    'Transfer interrupted: received {done} of {total}',
    'Transfer întrerupt: s-au primit {done} din {total}',
    'Übertragung unterbrochen: {done} von {total} empfangen',
    'Transferencia interrumpida: recibido {done} de {total}'
  ],
  'error.transferGone': [
    'Передача уже завершена или недоступна',
    'The transfer is already finished or unavailable',
    'Transferul este deja încheiat sau indisponibil',
    'Die Übertragung ist bereits beendet oder nicht verfügbar',
    'La transferencia ya terminó o no está disponible'
  ],
  'error.requestDeclined': [
    'Собеседник отклонил запрос',
    'The other side declined the request',
    'Celălalt a refuzat cererea',
    'Die Gegenseite hat die Anfrage abgelehnt',
    'El contacto rechazó la solicitud'
  ],
  'error.connectionBroken': [
    'Соединение прервано',
    'The connection was interrupted',
    'Conexiunea a fost întreruptă',
    'Die Verbindung wurde unterbrochen',
    'Se interrumpió la conexión'
  ],
  'error.saveFailed': [
    'Не удалось сохранить файл: {error}',
    'Could not save the file: {error}',
    'Fișierul nu a putut fi salvat: {error}',
    'Die Datei konnte nicht gespeichert werden: {error}',
    'No se pudo guardar el archivo: {error}'
  ],
  'error.tcpNotStarted': [
    'TCP-сервер не запущен: {error}',
    'The TCP server did not start: {error}',
    'Serverul TCP nu a pornit: {error}',
    'Der TCP-Server wurde nicht gestartet: {error}',
    'No se pudo iniciar el servidor TCP: {error}'
  ],
  'error.udpBusy': [
    'UDP-порт {port} занят другой программой — поиск собеседников не работает',
    'UDP port {port} is used by another program — discovery does not work',
    'Portul UDP {port} este folosit de alt program — descoperirea nu funcționează',
    'UDP-Port {port} wird von einem anderen Programm belegt – die Kontaktsuche funktioniert nicht',
    'Otro programa está usando el puerto UDP {port}: la búsqueda de contactos no funciona'
  ],
  'error.udpOther': [
    'Ошибка UDP: {code}',
    'UDP error: {code}',
    'Eroare UDP: {code}',
    'UDP-Fehler: {code}',
    'Error de UDP: {code}'
  ],
  'error.badAddress': [
    'Некорректный адрес',
    'Invalid address',
    'Adresă incorectă',
    'Ungültige Adresse',
    'Dirección no válida'
  ],
  'common.noName': ['Без имени', 'No name', 'Fără nume', 'Ohne Namen', 'Sin nombre'],
  'error.notDeliveredTo': [
    'Не доставлено: {names}',
    'Not delivered to: {names}',
    'Nelivrat către: {names}',
    'Nicht zugestellt an: {names}',
    'No entregado a: {names}'
  ],

  // меню приложения и трей
  'appmenu.about': ['О программе {app}', 'About {app}', 'Despre {app}', 'Über {app}', 'Acerca de {app}'],
  'appmenu.settings': ['Настройки…', 'Settings…', 'Setări…', 'Einstellungen…', 'Ajustes…'],
  'appmenu.settingsWin': ['Настройки', 'Settings', 'Setări', 'Einstellungen', 'Ajustes'],
  'appmenu.hide': ['Скрыть {app}', 'Hide {app}', 'Ascunde {app}', '{app} ausblenden', 'Ocultar {app}'],
  'appmenu.hideOthers': ['Скрыть остальные', 'Hide others', 'Ascunde celelalte', 'Andere ausblenden', 'Ocultar otros'],
  'appmenu.unhide': ['Показать все', 'Show all', 'Arată tot', 'Alle einblenden', 'Mostrar todo'],
  'appmenu.quit': ['Завершить {app}', 'Quit {app}', 'Închide {app}', '{app} beenden', 'Salir de {app}'],
  'appmenu.quitShort': ['Выход', 'Exit', 'Ieșire', 'Beenden', 'Salir'],
  'appmenu.fullscreen': ['Во весь экран', 'Full screen', 'Ecran complet', 'Vollbild', 'Pantalla completa'],
  'appmenu.windowZoom': ['Изменить масштаб окна', 'Zoom', 'Redimensionează', 'Zoomen', 'Zoom'],
  'appmenu.file': ['Файл', 'File', 'Fișier', 'Datei', 'Archivo'],
  'appmenu.edit': ['Правка', 'Edit', 'Editare', 'Bearbeiten', 'Edición'],
  'appmenu.view': ['Вид', 'View', 'Vizualizare', 'Ansicht', 'Ver'],
  'appmenu.window': ['Окно', 'Window', 'Fereastră', 'Fenster', 'Ventana'],
  'appmenu.find': [
    'Найти в переписке',
    'Find in conversation',
    'Caută în conversație',
    'Im Verlauf suchen',
    'Buscar en la conversación'
  ],
  'appmenu.zoomIn': ['Увеличить', 'Zoom in', 'Mărește', 'Vergrößern', 'Ampliar'],
  'appmenu.zoomOut': ['Уменьшить', 'Zoom out', 'Micșorează', 'Verkleinern', 'Reducir'],
  'appmenu.zoomReset': ['Реальный размер', 'Actual size', 'Dimensiune reală', 'Originalgröße', 'Tamaño real'],
  'appmenu.minimize': ['Свернуть', 'Minimize', 'Minimizează', 'Im Dock ablegen', 'Minimizar'],
  'appmenu.closeWindow': ['Закрыть окно', 'Close window', 'Închide fereastra', 'Fenster schließen', 'Cerrar ventana'],
  'appmenu.reload': [
    'Перезагрузить интерфейс',
    'Reload the interface',
    'Reîncarcă interfața',
    'Oberfläche neu laden',
    'Recargar la interfaz'
  ],
  'appmenu.devtools': [
    'Инструменты разработчика',
    'Developer tools',
    'Instrumente pentru dezvoltatori',
    'Entwicklertools',
    'Herramientas para desarrolladores'
  ],
  'tray.open': ['Открыть Hallway', 'Open Hallway', 'Deschide Hallway', 'Hallway öffnen', 'Abrir Hallway'],
  'tray.quit': ['Выйти', 'Quit', 'Ieși', 'Beenden', 'Salir'],
  'tray.tooltip': [
    'Hallway — {status}',
    'Hallway — {status}',
    'Hallway — {status}',
    'Hallway – {status}',
    'Hallway: {status}'
  ],
  'tray.hintTitle': [
    'Hallway работает в фоне',
    'Hallway keeps running',
    'Hallway rulează în fundal',
    'Hallway läuft im Hintergrund',
    'Hallway sigue abierto en segundo plano'
  ],
  'tray.hintBody': [
    'Коллеги по-прежнему видят вас в сети. Открыть — щелчок по значку, выйти — через его меню.',
    'Colleagues still see you online. Click the icon to open it, quit from its menu.',
    'Colegii vă văd în continuare conectat. Faceți clic pe pictogramă pentru a deschide, ieșiți din meniul ei.',
    'Kollegen sehen Sie weiterhin online. Zum Öffnen auf das Symbol klicken, beenden über sein Menü.',
    'Tus compañeros te siguen viendo en línea. Haz clic en el icono para abrirlo; para salir, usa su menú.'
  ],

  // настройки: общее
  'settings.title': ['Настройки', 'Settings', 'Setări', 'Einstellungen', 'Ajustes'],
  'settings.tab.profile': ['Профиль', 'Profile', 'Profil', 'Profil', 'Perfil'],
  'settings.tab.appearance': ['Внешний вид', 'Appearance', 'Aspect', 'Darstellung', 'Apariencia'],
  'settings.tab.notifications': ['Уведомления', 'Notifications', 'Notificări', 'Benachrichtigungen', 'Notificaciones'],
  'settings.tab.chat': [
    'Чат и история',
    'Chat and history',
    'Conversații și istoric',
    'Chat und Verlauf',
    'Chat e historial'
  ],
  'settings.tab.system': ['Система', 'System', 'Sistem', 'System', 'Sistema'],
  'settings.tab.network': ['Сеть', 'Network', 'Rețea', 'Netzwerk', 'Red'],
  'settings.tab.about': ['О программе', 'About', 'Despre', 'Über Hallway', 'Acerca de'],

  // настройки: профиль
  'settings.name': ['Имя', 'Name', 'Nume', 'Name', 'Nombre'],
  'settings.nameSaved': [
    'Сохранено — собеседники увидят новое имя в течение пары секунд.',
    'Saved — your contacts will see the new name within a couple of seconds.',
    'Salvat — colegii vor vedea noul nume în câteva secunde.',
    'Gespeichert – Ihre Kontakte sehen den neuen Namen in wenigen Sekunden.',
    'Guardado: tus contactos verán el nuevo nombre en un par de segundos.'
  ],
  'settings.autoAway': [
    'Автоматически «Отошёл»',
    'Automatic “Away”',
    'Marcare automată „Absent”',
    'Automatisch „Abwesend“',
    '«Ausente» automático'
  ],
  'settings.autoAwayAfter': [
    'Через {n} минут бездействия',
    'After {n} minutes of inactivity',
    'După {n} minute de inactivitate',
    'Nach {n} Minuten Inaktivität',
    'Tras {n} minutos de inactividad'
  ],
  'settings.autoAwayHint': [
    'И сразу при блокировке экрана. Как только вы вернётесь — снова «В сети». Сам статус меняется в верхней части окна, под вашим именем.',
    'And immediately when the screen locks. As soon as you are back — “Online” again. The status itself is changed at the top of the window, under your name.',
    'Și imediat la blocarea ecranului. Când reveniți — din nou „Conectat”. Statutul se schimbă în partea de sus a ferestrei, sub numele dumneavoastră.',
    'Und sofort beim Sperren des Bildschirms. Sobald Sie zurück sind, wieder „Online“. Den Status selbst ändern Sie oben im Fenster, unter Ihrem Namen.',
    'Y al instante al bloquear la pantalla. En cuanto vuelvas, pasarás de nuevo a «En línea». El estado se cambia en la parte superior de la ventana, debajo de tu nombre.'
  ],

  // настройки: внешний вид
  'settings.language': [
    'Язык интерфейса',
    'Interface language',
    'Limba interfeței',
    'Sprache der Oberfläche',
    'Idioma de la interfaz'
  ],
  'settings.languageHint': [
    'Меняется сразу, перезапуск не нужен. Системные меню и диалоги тоже переводятся.',
    'Applies immediately, no restart needed. System menus and dialogs are translated as well.',
    'Se aplică imediat, fără repornire. Meniurile și dialogurile sistemului sunt de asemenea traduse.',
    'Gilt sofort, kein Neustart nötig. Systemmenüs und Dialoge werden ebenfalls übersetzt.',
    'Se aplica al instante, sin reiniciar. Los menús y cuadros de diálogo del sistema también se traducen.'
  ],
  'settings.theme': ['Тема', 'Theme', 'Temă', 'Design', 'Tema'],
  'settings.font': ['Шрифт', 'Font', 'Font', 'Schrift', 'Fuente'],
  'settings.uiScale': [
    'Масштаб интерфейса',
    'Interface scale',
    'Scara interfeței',
    'Skalierung der Oberfläche',
    'Escala de la interfaz'
  ],
  'settings.reset': ['Сбросить', 'Reset', 'Resetează', 'Zurücksetzen', 'Restablecer'],
  'settings.scaleHint': [
    'Быстро: {mod} и «+» или «−», {mod}+0 — обычный размер.',
    'Shortcut: {mod} and “+” or “−”, {mod}+0 for the normal size.',
    'Rapid: {mod} și „+” sau „−”, {mod}+0 pentru dimensiunea normală.',
    'Schnell: {mod} und „+“ oder „−“, {mod}+0 für die normale Größe.',
    'Atajo: {mod} y «+» o «−»; {mod}+0 para el tamaño normal.'
  ],
  'settings.messageFontSize': [
    'Размер текста сообщений',
    'Message text size',
    'Dimensiunea textului mesajelor',
    'Textgröße der Nachrichten',
    'Tamaño del texto de los mensajes'
  ],
  'settings.previewBubble': [
    'Привет! Так будут выглядеть сообщения 👋',
    'Hi! This is how messages will look 👋',
    'Salut! Așa vor arăta mesajele 👋',
    'Hallo! So sehen Nachrichten aus 👋',
    '¡Hola! Así se verán los mensajes 👋'
  ],
  'settings.chatBackground': [
    'Фон чата',
    'Chat background',
    'Fundalul conversației',
    'Chat-Hintergrund',
    'Fondo del chat'
  ],
  'settings.compact': ['Компактный режим', 'Compact mode', 'Mod compact', 'Kompaktmodus', 'Modo compacto'],
  'settings.compactLabel': [
    'Плотнее список собеседников и сообщения',
    'Denser contact list and messages',
    'Listă și mesaje mai compacte',
    'Kontaktliste und Nachrichten dichter anzeigen',
    'Lista de contactos y mensajes más compactos'
  ],

  // настройки: уведомления
  'settings.whenHappens': [
    'Когда что-то происходит',
    'When something happens',
    'Când se întâmplă ceva',
    'Wenn etwas passiert',
    'Cuando pasa algo'
  ],
  'settings.systemNotifications': [
    'Системные уведомления о сообщениях и файлах',
    'System notifications about messages and files',
    'Notificări de sistem despre mesaje și fișiere',
    'Systembenachrichtigungen zu Nachrichten und Dateien',
    'Notificaciones del sistema sobre mensajes y archivos'
  ],
  'settings.systemNotificationsHint': [
    'Появляются, когда окно Hallway неактивно или свёрнуто.',
    'They appear when the Hallway window is inactive or minimized.',
    'Apar când fereastra Hallway este inactivă sau minimizată.',
    'Erscheinen, wenn das Hallway-Fenster inaktiv oder minimiert ist.',
    'Aparecen cuando la ventana de Hallway está inactiva o minimizada.'
  ],
  'settings.messageSound': [
    'Звук нового сообщения',
    'New message sound',
    'Sunet la mesaj nou',
    'Ton bei neuer Nachricht',
    'Sonido de mensaje nuevo'
  ],
  'settings.presenceSound': [
    'Звук, когда собеседник появляется в сети или выходит',
    'Sound when a contact comes online or leaves',
    'Sunet când un coleg se conectează sau iese',
    'Ton, wenn ein Kontakt online kommt oder geht',
    'Sonido cuando un contacto se conecta o se desconecta'
  ],
  'settings.presenceSoundHint': [
    'Закрытие приложения, выключение или сон компьютера слышно сразу, пропажу сети — через ~10 секунд.',
    'Closing the app, shutdown or sleep is heard immediately; a lost network — after about 10 seconds.',
    'Închiderea aplicației, oprirea sau somnul se aud imediat; pierderea rețelei — după circa 10 secunde.',
    'Schließen der App, Herunterfahren oder Ruhezustand hört man sofort, einen Netzwerkausfall nach etwa 10 Sekunden.',
    'El cierre de la aplicación, el apagado o la suspensión del equipo se oyen al instante; la pérdida de red, a los 10 segundos aproximadamente.'
  ],
  'settings.messageTone': [
    'Мелодии сообщений',
    'Message sounds',
    'Sunetele mesajelor',
    'Nachrichtentöne',
    'Sonidos de mensajes'
  ],
  'settings.tone.chime': ['Колокольчик', 'Chime', 'Clopoțel', 'Glöckchen', 'Campanilla'],
  'settings.tone.birds': ['Щебет птиц', 'Birds', 'Ciripit', 'Vogelgezwitscher', 'Pájaros'],
  'settings.tone.whistle': ['Свист', 'Whistle', 'Fluierat', 'Pfiff', 'Silbido'],
  'settings.tone.drop': ['Капля', 'Drop', 'Picătură', 'Tropfen', 'Gota'],
  'settings.tone.marimba': ['Маримба', 'Marimba', 'Marimba', 'Marimba', 'Marimba'],
  'settings.tone.pop': ['Пузырёк', 'Bubble', 'Bulă', 'Blubb', 'Burbuja'],
  'settings.tone.harp': ['Арфа', 'Harp', 'Harpă', 'Harfe', 'Arpa'],
  'settings.tone.none': ['Без звука', 'No sound', 'Fără sunet', 'Kein Ton', 'Sin sonido'],
  'settings.toneMessages': [
    'Личные сообщения',
    'Direct messages',
    'Mesaje private',
    'Einzelnachrichten',
    'Mensajes privados'
  ],
  'settings.toneGroups': ['Группы', 'Groups', 'Grupuri', 'Gruppen', 'Grupos'],
  'settings.toneEveryone': ['Общий чат', 'Everyone chat', 'Chat comun', 'Allgemeiner Chat', 'Chat general'],
  'settings.tonePlay': ['Прослушать', 'Play', 'Ascultă', 'Anhören', 'Escuchar'],
  'settings.toneHint': [
    'Своя мелодия у личных сообщений, групп и общего чата — по звуку понятно, откуда сообщение. Выбранная мелодия сразу проигрывается.',
    'Direct messages, groups and the everyone chat each have their own sound, so you can tell where a message came from. A sound plays as soon as you pick it.',
    'Mesajele private, grupurile și chatul comun au fiecare sunetul lor, ca să știți de unde vine mesajul. Sunetul ales se aude imediat.',
    'Einzelnachrichten, Gruppen und der allgemeine Chat haben je einen eigenen Ton – so hören Sie, woher eine Nachricht kommt. Der gewählte Ton wird sofort abgespielt.',
    'Los mensajes privados, los grupos y el chat general tienen cada uno su sonido, así sabes de dónde viene el mensaje. El sonido elegido se reproduce al momento.'
  ],
  'settings.toneOffHint': [
    ' Сейчас звук сообщений выключен выше.',
    ' Message sounds are switched off above.',
    ' Sunetul mesajelor este oprit mai sus.',
    ' Der Nachrichtenton ist oben gerade ausgeschaltet.',
    ' Ahora mismo el sonido de mensajes está desactivado más arriba.'
  ],
  'settings.presencePreview': [
    'Прослушать появление и выход',
    'Preview arrival and departure',
    'Ascultați sosirea și plecarea',
    'Kommen und Gehen anhören',
    'Escuchar conexión y desconexión'
  ],
  'settings.appeared': ['Появился', 'Came online', 'S-a conectat', 'Online gekommen', 'Se conectó'],
  'settings.left': ['Вышел', 'Went offline', 'S-a deconectat', 'Offline gegangen', 'Se desconectó'],
  'settings.dndHint': [
    'В статусе «Не беспокоить» звуки и уведомления отключаются, но сообщения продолжают приходить.',
    'In “Do not disturb” sounds and notifications are off, but messages keep arriving.',
    'În „Nu deranja” sunetele și notificările sunt oprite, dar mesajele continuă să sosească.',
    'Im Status „Nicht stören“ sind Töne und Benachrichtigungen aus, Nachrichten kommen aber weiterhin an.',
    'En «No molestar» se desactivan los sonidos y las notificaciones, pero los mensajes siguen llegando.'
  ],

  // настройки: чат и история
  'settings.sendKey': [
    'Отправка сообщения',
    'Sending a message',
    'Trimiterea mesajului',
    'Nachricht senden',
    'Enviar mensajes'
  ],
  'settings.sendKeyEnterHint': [
    'Новая строка — Shift+Enter.',
    'New line — Shift+Enter.',
    'Rând nou — Shift+Enter.',
    'Neue Zeile – Shift+Enter.',
    'Nueva línea: Shift+Enter.'
  ],
  'settings.sendKeyModHint': [
    'Enter — новая строка, {mod}+Enter — отправить. Удобно для длинных сообщений.',
    'Enter for a new line, {mod}+Enter to send. Handy for long messages.',
    'Enter pentru rând nou, {mod}+Enter pentru trimitere. Util pentru mesaje lungi.',
    'Enter für eine neue Zeile, {mod}+Enter zum Senden. Praktisch für lange Nachrichten.',
    'Enter para una nueva línea y {mod}+Enter para enviar. Práctico para mensajes largos.'
  ],
  'settings.readReceipts': [
    'Отметки «Прочитано»',
    'Read receipts',
    'Confirmări de citire',
    'Lesebestätigungen',
    'Confirmaciones de lectura'
  ],
  'settings.readReceiptsLabel': [
    'Показывать собеседнику, что вы прочитали сообщение',
    'Let the other side know you have read the message',
    'Arătați celuilalt că ați citit mesajul',
    'Anderen zeigen, dass Sie die Nachricht gelesen haben',
    'Mostrar al contacto que has leído el mensaje'
  ],
  'settings.readReceiptsHint': [
    'Одна галочка — доставлено, две — прочитано. Если выключить, у собеседника останется одна галочка.',
    'One tick — delivered, two — read. If switched off, the other side keeps seeing one tick.',
    'O bifă — livrat, două — citit. Dacă opriți, celălalt vede o singură bifă.',
    'Ein Häkchen – zugestellt, zwei – gelesen. Wenn ausgeschaltet, sieht die Gegenseite weiterhin nur ein Häkchen.',
    'Una marca: entregado; dos: leído. Si lo desactivas, el contacto seguirá viendo una sola marca.'
  ],
  'settings.autoAccept': [
    'Автоприём файлов',
    'Automatic file accept',
    'Acceptare automată a fișierelor',
    'Dateien automatisch annehmen',
    'Aceptar archivos automáticamente'
  ],
  'settings.autoAccept.off': ['Выключен', 'Off', 'Oprit', 'Aus', 'Desactivado'],
  'settings.autoAccept.pinned': [
    'От закреплённых',
    'From pinned',
    'De la cei fixați',
    'Von angehefteten',
    'De los fijados'
  ],
  'settings.autoAccept.all': ['От всех', 'From everyone', 'De la toți', 'Von allen', 'De todos'],
  'settings.autoAcceptHint.off': [
    'Каждый файл нужно принять вручную.',
    'Every file has to be accepted manually.',
    'Fiecare fișier trebuie acceptat manual.',
    'Jede Datei muss manuell angenommen werden.',
    'Cada archivo hay que aceptarlo a mano.'
  ],
  'settings.autoAcceptHint.pinned': [
    'Файлы от закреплённых коллег сохраняются сами. Закрепить коллегу — меню «⋯» в заголовке чата.',
    'Files from pinned colleagues are saved automatically. Pin someone from the “⋯” menu in the chat header.',
    'Fișierele de la colegii fixați se salvează automat. Fixați un coleg din meniul „⋯” din capul conversației.',
    'Dateien von angehefteten Kollegen werden automatisch gespeichert. Kollegen heften Sie über das Menü „⋯“ im Chat-Kopf an.',
    'Los archivos de los compañeros fijados se guardan solos. Para fijar a alguien, usa el menú «⋯» en la cabecera del chat.'
  ],
  'settings.autoAcceptHint.all': [
    'Файлы от всех в сети сохраняются сами — включайте только в доверенной сети.',
    'Files from everyone are saved automatically — switch this on only in a trusted network.',
    'Fișierele de la toți se salvează automat — activați doar în rețele de încredere.',
    'Dateien von allen im Netzwerk werden automatisch gespeichert – nur in einem vertrauenswürdigen Netzwerk einschalten.',
    'Los archivos de cualquiera de la red se guardan solos: actívalo solo en una red de confianza.'
  ],
  'settings.sizeUpTo': ['Размер до', 'Size up to', 'Dimensiune până la', 'Größe bis', 'Tamaño hasta'],
  'settings.sizeUnlimited': ['без ограничения', 'unlimited', 'nelimitat', 'unbegrenzt', 'sin límite'],
  'settings.history': [
    'История переписки',
    'Conversation history',
    'Istoricul conversațiilor',
    'Verlauf',
    'Historial de conversaciones'
  ],
  'settings.historyKeep': ['Хранить', 'Keep', 'Păstrează', 'Aufbewahren', 'Conservar'],
  'settings.retention.none': ['Не сохранять', 'Do not save', 'Nu salva', 'Nicht speichern', 'No guardar'],
  'settings.retention.1d': ['1 день', '1 day', 'O zi', '1 Tag', '1 día'],
  'settings.retention.7d': ['Неделю', 'One week', 'O săptămână', 'Eine Woche', 'Una semana'],
  'settings.retention.30d': ['Месяц', 'One month', 'O lună', 'Ein Monat', 'Un mes'],
  'settings.retention.90d': ['3 месяца', '3 months', '3 luni', '3 Monate', '3 meses'],
  'settings.retention.forever': ['Всегда', 'Forever', 'Întotdeauna', 'Immer', 'Siempre'],
  'settings.retentionHint.none': [
    'Переписка видна только до закрытия приложения; на диск ничего не записывается.',
    'The conversation lives only until the app is closed; nothing is written to disk.',
    'Conversația există doar până la închiderea aplicației; nimic nu se scrie pe disc.',
    'Die Unterhaltung ist nur sichtbar, bis die App geschlossen wird; auf die Festplatte wird nichts geschrieben.',
    'La conversación solo se ve hasta cerrar la aplicación; no se guarda nada en el disco.'
  ],
  'settings.retentionHint.forever': [
    'Переписка сохраняется на этом компьютере и не удаляется сама.',
    'The conversation is stored on this computer and is never deleted automatically.',
    'Conversația se păstrează pe acest computer și nu se șterge automat.',
    'Die Unterhaltung wird auf diesem Computer gespeichert und nie automatisch gelöscht.',
    'La conversación se guarda en este equipo y nunca se borra automáticamente.'
  ],
  'settings.retentionHint.age': [
    'Переписка сохраняется на этом компьютере; сообщения старше {age} удаляются автоматически.',
    'The conversation is stored on this computer; messages older than {age} are deleted automatically.',
    'Conversația se păstrează pe acest computer; mesajele mai vechi de {age} se șterg automat.',
    'Die Unterhaltung wird auf diesem Computer gespeichert; Nachrichten, die älter als {age} sind, werden automatisch gelöscht.',
    'La conversación se guarda en este equipo; los mensajes de más de {age} se borran automáticamente.'
  ],
  'settings.age.1d': ['одного дня', 'one day', 'o zi', 'ein Tag', 'un día'],
  'settings.age.7d': ['недели', 'one week', 'o săptămână', 'eine Woche', 'una semana'],
  'settings.age.30d': ['месяца', 'one month', 'o lună', 'ein Monat', 'un mes'],
  'settings.age.90d': ['трёх месяцев', 'three months', 'trei luni', 'drei Monate', 'tres meses'],
  'settings.clearAll': [
    'Очистить всю историю…',
    'Clear the entire history…',
    'Șterge tot istoricul…',
    'Gesamten Verlauf leeren…',
    'Borrar todo el historial…'
  ],
  'settings.clearAllHint': [
    'Удаляется только на этом компьютере — у собеседников переписка останется. Очистить один чат — меню «⋯» в его заголовке. Полученные файлы на диске не удаляются.',
    'Deleted only on this computer — your contacts keep their copies. To clear a single chat use the “⋯” menu in its header. Received files stay on disk.',
    'Se șterge doar pe acest computer — colegii își păstrează copiile. Pentru o singură conversație folosiți meniul „⋯” din capul ei. Fișierele primite rămân pe disc.',
    'Wird nur auf diesem Computer gelöscht – Ihre Kontakte behalten ihren Verlauf. Einen einzelnen Chat leeren Sie über das Menü „⋯“ in seinem Kopf. Empfangene Dateien bleiben auf der Festplatte.',
    'Se borra solo en este equipo; tus contactos conservan la conversación. Para borrar un solo chat, usa el menú «⋯» de su cabecera. Los archivos recibidos no se eliminan del disco.'
  ],
  'settings.downloadDir': [
    'Папка для полученных файлов',
    'Folder for received files',
    'Folder pentru fișierele primite',
    'Ordner für empfangene Dateien',
    'Carpeta para archivos recibidos'
  ],
  'settings.downloadDirHint': [
    'Скриншот из буфера обмена можно отправить прямо в поле ввода: {mod}+V.',
    'A screenshot from the clipboard can be sent straight from the input field: {mod}+V.',
    'O captură din clipboard se poate trimite direct din câmpul de text: {mod}+V.',
    'Einen Screenshot aus der Zwischenablage können Sie direkt im Eingabefeld senden: {mod}+V.',
    'Puedes enviar una captura del portapapeles directamente desde el campo de texto: {mod}+V.'
  ],
  'settings.downloadDirTitle': [
    'Папка для полученных файлов',
    'Folder for received files',
    'Folder pentru fișierele primite',
    'Ordner für empfangene Dateien',
    'Carpeta para archivos recibidos'
  ],

  // настройки: система
  'settings.background': [
    'Работа в фоне',
    'Running in the background',
    'Rulare în fundal',
    'Im Hintergrund',
    'En segundo plano'
  ],
  'settings.trayLabel': [
    'Сворачивать в трей при закрытии окна',
    'Minimize to the tray when the window is closed',
    'Minimizează în bara de sistem la închiderea ferestrei',
    'Beim Schließen des Fensters in den Infobereich minimieren',
    'Minimizar en la bandeja del sistema al cerrar la ventana'
  ],
  'settings.trayHint': [
    'Hallway продолжит работать: коллеги видят вас в сети, приходят сообщения и звуки. Выйти — через меню значка в трее.',
    'Hallway keeps running: colleagues see you online, messages and sounds keep coming. Quit from the tray icon menu.',
    'Hallway continuă să ruleze: colegii vă văd conectat, mesajele și sunetele continuă. Ieșiți din meniul pictogramei.',
    'Hallway läuft weiter: Kollegen sehen Sie online, Nachrichten und Töne kommen weiter an. Beenden über das Menü des Symbols im Infobereich.',
    'Hallway sigue funcionando: tus compañeros te ven en línea y siguen llegando mensajes y sonidos. Para salir, usa el menú del icono en la bandeja.'
  ],
  'settings.backgroundMac': [
    'На macOS закрытие окна оставляет Hallway работать в Dock: сообщения и звуки продолжают приходить. Полностью выйти — ⌘Q. Статус можно сменить в меню значка в Dock.',
    'On macOS closing the window leaves Hallway running in the Dock: messages and sounds keep coming. Quit completely with ⌘Q. The status can be changed from the Dock icon menu.',
    'Pe macOS închiderea ferestrei lasă Hallway în Dock: mesajele și sunetele continuă. Ieșiți complet cu ⌘Q. Statutul se schimbă din meniul pictogramei din Dock.',
    'Unter macOS läuft Hallway nach dem Schließen des Fensters im Dock weiter: Nachrichten und Töne kommen weiter an. Vollständig beenden mit ⌘Q. Den Status ändern Sie im Menü des Dock-Symbols.',
    'En macOS, al cerrar la ventana Hallway sigue funcionando en el Dock: siguen llegando mensajes y sonidos. Para salir del todo, pulsa ⌘Q. El estado se puede cambiar desde el menú del icono del Dock.'
  ],
  'settings.backgroundOther': [
    'Закрытие окна завершает приложение.',
    'Closing the window quits the app.',
    'Închiderea ferestrei închide aplicația.',
    'Das Schließen des Fensters beendet die App.',
    'Al cerrar la ventana se cierra la aplicación.'
  ],
  'settings.openAtLogin': [
    'Автозапуск',
    'Start at login',
    'Pornire la autentificare',
    'Autostart',
    'Inicio automático'
  ],
  'settings.openAtLoginLabel': [
    'Запускать Hallway при входе в систему',
    'Start Hallway when you log in',
    'Pornește Hallway la autentificare',
    'Hallway bei der Anmeldung starten',
    'Abrir Hallway al iniciar sesión'
  ],
  'settings.openAtLoginHint': [
    'Приложение стартует свёрнутым — окно откроется по щелчку на значке.',
    'The app starts minimized — click the icon to open the window.',
    'Aplicația pornește minimizată — faceți clic pe pictogramă pentru a deschide fereastra.',
    'Die App startet minimiert – ein Klick auf das Symbol öffnet das Fenster.',
    'La aplicación se inicia minimizada: haz clic en el icono para abrir la ventana.'
  ],
  'settings.openAtLoginDev': [
    'Доступно в установленном приложении, не в режиме разработки.',
    'Available in the installed app, not in development mode.',
    'Disponibil în aplicația instalată, nu în modul de dezvoltare.',
    'Verfügbar in der installierten App, nicht im Entwicklungsmodus.',
    'Disponible en la aplicación instalada, no en modo de desarrollo.'
  ],

  // настройки: сеть
  'settings.manualHost': [
    'Подключение по IP-адресу',
    'Connecting by IP address',
    'Conectare prin adresă IP',
    'Verbindung per IP-Adresse',
    'Conexión por dirección IP'
  ],
  'settings.manualHostPlaceholder': [
    'например, 192.168.1.20',
    'for example, 192.168.1.20',
    'de exemplu, 192.168.1.20',
    'zum Beispiel 192.168.1.20',
    'por ejemplo, 192.168.1.20'
  ],
  'settings.manualHostRemove': [
    'Удалить {host}',
    'Remove {host}',
    'Elimină {host}',
    '{host} entfernen',
    'Quitar {host}'
  ],
  'settings.manualHostFailed': [
    'Не удалось добавить адрес',
    'Could not add the address',
    'Adresa nu a putut fi adăugată',
    'Die Adresse konnte nicht hinzugefügt werden',
    'No se pudo añadir la dirección'
  ],
  'settings.manualHostHint': [
    'Нужно, только если собеседник не появляется сам: например, роутер не пропускает broadcast между Wi-Fi и кабелем или компьютеры в разных подсетях.',
    'Needed only if someone does not show up by themselves: for example, the router blocks broadcast between Wi-Fi and cable, or the computers are in different subnets.',
    'Necesar doar dacă un coleg nu apare singur: de exemplu, routerul blochează broadcast între Wi-Fi și cablu sau computerele sunt în subrețele diferite.',
    'Nur nötig, wenn jemand nicht von selbst erscheint: zum Beispiel, wenn der Router keinen Broadcast zwischen WLAN und Kabel durchlässt oder die Computer in verschiedenen Subnetzen sind.',
    'Solo hace falta si alguien no aparece por sí solo: por ejemplo, si el router no deja pasar el broadcast entre wifi y cable o si los equipos están en subredes distintas.'
  ],
  'settings.diagnostics': ['Диагностика', 'Diagnostics', 'Diagnostic', 'Diagnose', 'Diagnóstico'],
  'settings.yourAddresses': [
    'Ваши адреса',
    'Your addresses',
    'Adresele dumneavoastră',
    'Ihre Adressen',
    'Tus direcciones'
  ],
  'settings.udp': ['UDP (поиск)', 'UDP (discovery)', 'UDP (descoperire)', 'UDP (Suche)', 'UDP (búsqueda)'],
  'settings.tcp': ['TCP (сообщения)', 'TCP (messages)', 'TCP (mesaje)', 'TCP (Nachrichten)', 'TCP (mensajes)'],
  'settings.working': ['работает', 'working', 'funcționează', 'funktioniert', 'funciona'],
  'settings.notWorking': ['не работает', 'not working', 'nu funcționează', 'funktioniert nicht', 'no funciona'],
  'settings.tcpNotStarted': ['не запущен', 'not started', 'nepornit', 'nicht gestartet', 'no iniciado'],
  'settings.configFile': [
    'Файл настроек',
    'Settings file',
    'Fișierul de setări',
    'Einstellungsdatei',
    'Configuración'
  ],
  'settings.openLogs': [
    'Открыть папку с логами',
    'Open the logs folder',
    'Deschide folderul cu jurnale',
    'Protokollordner öffnen',
    'Abrir la carpeta de registros'
  ],
  'settings.portsHint': [
    'Порты меняются в config.json (у всех компьютеров UDP-порт должен совпадать), после изменения перезапустите приложение.',
    'Ports are changed in config.json (the UDP port must match on all computers); restart the app after changing them.',
    'Porturile se schimbă în config.json (portul UDP trebuie să coincidă pe toate computerele); reporniți aplicația după modificare.',
    'Die Ports werden in config.json geändert (der UDP-Port muss auf allen Computern gleich sein); starten Sie die App danach neu.',
    'Los puertos se cambian en config.json (el puerto UDP debe coincidir en todos los equipos); después, reinicia la aplicación.'
  ],

  // настройки: о программе
  'about.tagline': [
    'Мессенджер для локальной сети: работает без сервера, сообщения и файлы не выходят за пределы вашей сети.',
    'A local network messenger: it works without a server, and messages and files never leave your network.',
    'Mesagerie pentru rețeaua locală: funcționează fără server, iar mesajele și fișierele nu părăsesc rețeaua.',
    'Messenger für das lokale Netzwerk: Er funktioniert ohne Server, Nachrichten und Dateien verlassen Ihr Netzwerk nicht.',
    'Mensajería para la red local: funciona sin servidor y los mensajes y archivos nunca salen de tu red.'
  ],
  'about.version': [
    'Версия {version}',
    'Version {version}',
    'Versiunea {version}',
    'Version {version}',
    'Versión {version}'
  ],
  'about.details': ['Сведения', 'Details', 'Detalii', 'Details', 'Detalles'],
  'about.developer': ['Разработчик', 'Developer', 'Dezvoltator', 'Entwickler', 'Desarrollador'],
  'about.email': ['Почта', 'E-mail', 'E-mail', 'E-Mail', 'Correo'],
  'about.year': ['Год', 'Year', 'An', 'Jahr', 'Año'],
  'about.versionLabel': ['Версия', 'Version', 'Versiune', 'Version', 'Versión'],
  'about.system': ['Система', 'System', 'Sistem', 'System', 'Sistema'],
  'about.copy': [
    'Скопировать сведения',
    'Copy the details',
    'Copiază detaliile',
    'Details kopieren',
    'Copiar los detalles'
  ],
  'about.copied': ['Скопировано', 'Copied', 'Copiat', 'Kopiert', 'Copiado'],
  'about.copyHint': [
    'Пригодится, если нужно сообщить о проблеме.',
    'Useful when you need to report a problem.',
    'Util când trebuie să raportați o problemă.',
    'Nützlich, wenn Sie ein Problem melden möchten.',
    'Útil si necesitas informar de un problema.'
  ],
  'about.summaryDeveloper': [
    'Разработчик grigoriapps.com (grigoriapps@gmail.com), {year}',
    'Developer grigoriapps.com (grigoriapps@gmail.com), {year}',
    'Dezvoltator grigoriapps.com (grigoriapps@gmail.com), {year}',
    'Entwickler grigoriapps.com (grigoriapps@gmail.com), {year}',
    'Desarrollador grigoriapps.com (grigoriapps@gmail.com), {year}'
  ],

  // темы и шрифты
  'theme.system': ['Как в системе', 'Match the system', 'Ca în sistem', 'Wie im System', 'Como el sistema'],
  'theme.light': ['Светлая', 'Light', 'Deschisă', 'Hell', 'Claro'],
  'theme.dark': ['Тёмная', 'Dark', 'Închisă', 'Dunkel', 'Oscuro'],
  'theme.graphite': ['Графит', 'Graphite', 'Grafit', 'Graphit', 'Grafito'],
  'theme.midnight': ['Полночь', 'Midnight', 'Miezul nopții', 'Mitternacht', 'Medianoche'],
  'theme.mint': ['Мята', 'Mint', 'Mentă', 'Minze', 'Menta'],
  'theme.lavender': ['Лаванда', 'Lavender', 'Lavandă', 'Lavendel', 'Lavanda'],
  'theme.sand': ['Песок', 'Sand', 'Nisip', 'Sand', 'Arena'],
  'font.system': ['Системный', 'System', 'De sistem', 'System', 'Del sistema'],
  'font.inter': ['Inter', 'Inter', 'Inter', 'Inter', 'Inter'],
  'font.nunito': ['Nunito', 'Nunito', 'Nunito', 'Nunito', 'Nunito'],
  'font.pt-serif': ['PT Serif', 'PT Serif', 'PT Serif', 'PT Serif', 'PT Serif'],
  'font.jetbrains-mono': ['JetBrains Mono', 'JetBrains Mono', 'JetBrains Mono', 'JetBrains Mono', 'JetBrains Mono'],
  'background.none': ['Без фона', 'Plain', 'Fără fundal', 'Schlicht', 'Sin fondo'],
  'background.dots': ['Точки', 'Dots', 'Puncte', 'Punkte', 'Puntos'],
  'background.grid': ['Клетка', 'Grid', 'Grilă', 'Karo', 'Cuadrícula'],
  'background.diagonal': ['Штрих', 'Stripes', 'Dungi', 'Streifen', 'Rayas'],
  'background.gradient': ['Сияние', 'Glow', 'Strălucire', 'Schimmer', 'Brillo'],
  'background.doodles': ['Узор', 'Doodles', 'Desene', 'Muster', 'Dibujos'],

  // панель смайликов
  'emoji.recent': [
    'Часто используемые',
    'Frequently used',
    'Folosite frecvent',
    'Häufig verwendet',
    'Usados con frecuencia'
  ],
  'emoji.fun': ['Приколы', 'Fun', 'Distracție', 'Spaß', 'Diversión'],
  'emoji.smileys': ['Смайлы', 'Smileys', 'Emoticoane', 'Smileys', 'Caritas'],
  'emoji.people': [
    'Жесты и люди',
    'Gestures and people',
    'Gesturi și oameni',
    'Gesten und Menschen',
    'Gestos y personas'
  ],
  'emoji.hearts': [
    'Сердечки и эмоции',
    'Hearts and emotions',
    'Inimi și emoții',
    'Herzen und Gefühle',
    'Corazones y emociones'
  ],
  'emoji.animals': [
    'Животные и природа',
    'Animals and nature',
    'Animale și natură',
    'Tiere und Natur',
    'Animales y naturaleza'
  ],
  'emoji.food': ['Еда и напитки', 'Food and drinks', 'Mâncare și băuturi', 'Essen und Trinken', 'Comida y bebida'],
  'emoji.activity': ['Активности', 'Activities', 'Activități', 'Aktivitäten', 'Actividades'],
  'emoji.travel': [
    'Транспорт и места',
    'Travel and places',
    'Transport și locuri',
    'Reisen und Orte',
    'Viajes y lugares'
  ],
  'emoji.objects': ['Предметы', 'Objects', 'Obiecte', 'Objekte', 'Objetos'],
  'emoji.symbols': ['Символы', 'Symbols', 'Simboluri', 'Symbole', 'Símbolos'],

  // прочее
  'window.minimize': ['Свернуть', 'Minimize', 'Minimizează', 'Minimieren', 'Minimizar'],
  'window.maximize': ['Развернуть', 'Maximize', 'Maximizează', 'Maximieren', 'Maximizar'],
  'window.close': ['Закрыть', 'Close', 'Închide', 'Schließen', 'Cerrar'],
  'error.generic': [
    'Что-то пошло не так',
    'Something went wrong',
    'Ceva nu a funcționat',
    'Etwas ist schiefgelaufen',
    'Algo salió mal'
  ]
} as const satisfies Record<string, Translations>

export type MessageKey = keyof typeof MESSAGES

/** Все ключи — для проверки переводов в тестах */
export const MESSAGE_KEYS = Object.keys(MESSAGES) as MessageKey[]

export type Params = Record<string, string | number>

/** Функция перевода, которую можно передать в модуль: язык она берёт сама, на момент вызова */
export type TranslateFn = (key: MessageKey, params?: Params) => string

function fill(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name]
    return value === undefined ? `{${name}}` : String(value)
  })
}

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return fill(MESSAGES[key][INDEX[locale] ?? 0], params)
}

// ─── множественные формы ────────────────────────────────────────────────────────

const PLURALS = {
  members: {
    ru: ['{n} участник', '{n} участника', '{n} участников'],
    en: ['{n} member', '{n} members'],
    ro: ['{n} participant', '{n} participanți', '{n} de participanți'],
    de: ['{n} Mitglied', '{n} Mitglieder'],
    es: ['{n} miembro', '{n} miembros']
  },
  minutes: {
    ru: ['{n} минуту', '{n} минуты', '{n} минут'],
    en: ['{n} minute', '{n} minutes'],
    ro: ['{n} minut', '{n} minute', '{n} de minute'],
    de: ['{n} Minute', '{n} Minuten'],
    es: ['{n} minuto', '{n} minutos']
  }
} as const satisfies Record<string, Record<Locale, readonly string[]>>

export type PluralKey = keyof typeof PLURALS

/** Индекс формы: в русском три (1 / 2–4 / 5–20), в румынском три (1 / 2–19 / 20+), в остальных две (1 / прочие) */
function pluralIndex(locale: Locale, n: number): number {
  const abs = Math.abs(n)
  if (locale === 'en' || locale === 'de' || locale === 'es') return abs === 1 ? 0 : 1
  if (locale === 'ro') return abs === 1 ? 0 : abs === 0 || (abs % 100 >= 1 && abs % 100 <= 19) ? 1 : 2
  const tens = abs % 100
  const units = abs % 10
  if (units === 1 && tens !== 11) return 0
  if (units >= 2 && units <= 4 && !(tens >= 12 && tens <= 14)) return 1
  return 2
}

export function pluralize(locale: Locale, key: PluralKey, n: number): string {
  const forms = PLURALS[key][locale]
  return fill(forms[Math.min(pluralIndex(locale, n), forms.length - 1)], { n })
}

/** Переводчик, привязанный к языку: t('ключ', { подстановки }) */
export interface Translator {
  (key: MessageKey, params?: Params): string
  locale: Locale
  plural(key: PluralKey, n: number): string
}

export function createTranslator(locale: Locale): Translator {
  const t = ((key: MessageKey, params?: Params) => translate(locale, key, params)) as Translator
  t.locale = locale
  t.plural = (key, n) => pluralize(locale, key, n)
  return t
}

/** Тег для Intl: время в 24-часовом формате и месяцы на нужном языке (es-ES — ради 24 часов) */
export const LOCALE_TAGS: Record<Locale, string> = {
  ru: 'ru-RU',
  en: 'en-GB',
  de: 'de-DE',
  es: 'es-ES',
  ro: 'ro-RO'
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Язык для первого запуска: первый из предпочитаемых языков системы, на который есть перевод
 * («de-AT» → de, «es-419» → es); если ни одного — русский, как раньше.
 */
export function localeFromSystem(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split(/[-_]/)[0]
    if (isLocale(primary)) return primary
  }
  return DEFAULT_LOCALE
}

// ─── проверка орфографии ────────────────────────────────────────────────────────

/** Русский и английский оставляем всегда: в офисе пишут на двух языках сразу */
const SPELLCHECK: Record<Locale, readonly string[]> = {
  ru: ['ru', 'en-US'],
  en: ['en-US', 'ru'],
  de: ['de-DE', 'ru', 'en-US'],
  es: ['es-ES', 'ru', 'en-US'],
  ro: ['ro', 'ru', 'en-US']
}

/**
 * Словари для языка интерфейса из тех, что есть в системе. Названия у словарей разные
 * («de» или «de-DE», «es» или «es-419»), поэтому без точного совпадения берём любой вариант того же языка.
 */
export function spellcheckLanguages(locale: Locale, available: readonly string[]): string[] {
  const chosen: string[] = []
  for (const wanted of SPELLCHECK[locale]) {
    const primary = wanted.split('-')[0]
    const match =
      available.find((code) => code === wanted) ??
      available.find((code) => code === primary || code.startsWith(`${primary}-`))
    if (match && !chosen.includes(match)) chosen.push(match)
  }
  return chosen
}
