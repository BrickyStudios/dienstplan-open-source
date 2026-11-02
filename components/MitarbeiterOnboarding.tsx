"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PulseLoader } from "@/components/PulseLoader";
import { useLang, LANGUAGES, type Lang } from "@/lib/LanguageContext";
const ICONS = ["waving_hand", "calendar_month", "schedule", "beach_access", "favorite", "checklist", "shield_person", "check_circle"];
type StepText = {
    title: string;
    desc: string;
    hint?: string;
};
type Copy = {
    langTitle: string;
    langDesc: string;
    continue: string;
    skip: string;
    back: string;
    next: string;
    start: string;
    demoNote: string;
    footer: string;
    footerDemo: string;
    errFinish: string;
    errConn: string;
    steps: StepText[];
};
const COPY: Record<Lang, Copy> = {
    de: {
        langTitle: "Sprache wählen", langDesc: "In welcher Sprache möchtest du Nurvo nutzen? Du kannst das später in den Einstellungen jederzeit ändern.",
        continue: "Weiter", skip: "Überspringen", back: "Zurück", next: "Weiter", start: "Loslegen",
        demoNote: "Demo-Vorschau — nur zum Ausprobieren. Es wird nichts gespeichert.",
        footer: "Nurvo · Diese Einführung findest du später in den Einstellungen",
        footerDemo: "Nurvo · Demo-Vorschau des Mitarbeiter-Onboardings",
        errFinish: "Konnte nicht abgeschlossen werden — bitte erneut versuchen.", errConn: "Verbindungsfehler — bitte erneut versuchen.",
        steps: [
            { title: "Willkommen bei Nurvo", desc: "Eine kurze Einführung in dein Mitarbeiter-Portal — in unter einer Minute. Du kannst sie später in den Einstellungen jederzeit erneut öffnen." },
            { title: "Mein Schichtplan", desc: "Deine kommenden Schichten auf einen Blick — mit Station, Datum und Uhrzeit, immer aktuell.", hint: "Seitenleiste · Mein Plan" },
            { title: "Zeiterfassung", desc: "Stempel dich per GPS ein und aus — deine Arbeitszeiten werden automatisch dokumentiert. Eingestempelt zu sein ist auch Voraussetzung, um Aufgaben als erledigt zu markieren.", hint: "Seitenleiste · Zeiterfassung" },
            { title: "Urlaub beantragen", desc: "Stelle Urlaubsanträge direkt in der App — die Leitung wird informiert und du siehst die Entscheidung sofort. Oben steht dein Jahresanspruch, inklusive eventuell von der Leitung freigeschaltetem Zusatz-Urlaub.", hint: "Seitenleiste · Urlaub" },
            { title: "Dienstwünsche", desc: "Teile der Leitung Wünsche für kommende Schichten mit — z.B. bevorzugte Schicht, freie Tage oder Tage, an denen du nicht kannst.", hint: "Seitenleiste · Dienstwünsche" },
            { title: "Aufgaben deiner Station / deines Bereichs", desc: "Unter „Aufgaben“ siehst du, was auf deiner Station oder in deinem Bereich zu erledigen ist. Solange du eingestempelt bist, kannst du Aufgaben abhaken.", hint: "Seitenleiste · Aufgaben" },
            { title: "Falls du Stations- oder Bereichsleitung bist", desc: "Ernennt dich die Leitung dazu, siehst du zusätzlich wer gerade im Dienst ist und den Schichtplan deiner Station. Du kannst Mitarbeiter mit einem Tipp krankmelden, im Notfall per „Verstärkung anfordern“ kurzfristig Springer rufen — und, wenn die Leitung es freischaltet, Urlaubsanträge und Dienstwünsche deiner Station selbst bearbeiten." },
            { title: "Fertig!", desc: "Das war's — du kennst jetzt die wichtigsten Funktionen. Bei Fragen erreichst du jederzeit den Support über die Seitenleiste. Viel Erfolg!" },
        ],
    },
    en: {
        langTitle: "Choose language", langDesc: "Which language would you like to use Nurvo in? You can change this any time later in Settings.",
        continue: "Continue", skip: "Skip", back: "Back", next: "Next", start: "Get started",
        demoNote: "Demo preview — just for trying out. Nothing is saved.",
        footer: "Nurvo · You'll find this intro later in Settings",
        footerDemo: "Nurvo · Demo preview of the employee onboarding",
        errFinish: "Couldn't be completed — please try again.", errConn: "Connection error — please try again.",
        steps: [
            { title: "Welcome to Nurvo", desc: "A short intro to your employee portal — in under a minute. You can reopen it any time later in Settings." },
            { title: "My schedule", desc: "Your upcoming shifts at a glance — with ward, date and time, always up to date.", hint: "Sidebar · My schedule" },
            { title: "Time tracking", desc: "Clock in and out via GPS — your working hours are documented automatically. Being clocked in is also required to mark tasks as done.", hint: "Sidebar · Time tracking" },
            { title: "Request leave", desc: "Submit leave requests right in the app — management is notified and you see the decision instantly. Your annual entitlement is shown at the top, including any extra leave granted by management.", hint: "Sidebar · Leave" },
            { title: "Shift preferences", desc: "Share preferences for upcoming shifts with management — e.g. preferred shift, days off, or days you can't work.", hint: "Sidebar · Shift preferences" },
            { title: "Tasks for your ward / area", desc: "Under “Tasks” you see what needs doing on your ward or in your area. As long as you're clocked in, you can check tasks off.", hint: "Sidebar · Tasks" },
            { title: "If you're a ward or area lead", desc: "If management appoints you, you'll also see who's currently on duty and your ward's schedule. You can report staff sick with one tap, call in temps at short notice via “Request backup” in an emergency — and, if management enables it, handle your ward's leave requests and shift preferences yourself." },
            { title: "Done!", desc: "That's it — you now know the key features. If you have questions, you can reach support any time via the sidebar. Good luck!" },
        ],
    },
    tr: {
        langTitle: "Dil seçin", langDesc: "Nurvo'yu hangi dilde kullanmak istersiniz? Bunu daha sonra Ayarlar'dan istediğiniz zaman değiştirebilirsiniz.",
        continue: "Devam", skip: "Atla", back: "Geri", next: "İleri", start: "Başla",
        demoNote: "Demo önizleme — yalnızca denemek için. Hiçbir şey kaydedilmez.",
        footer: "Nurvo · Bu tanıtımı daha sonra Ayarlar'da bulabilirsiniz",
        footerDemo: "Nurvo · Çalışan tanıtımının demo önizlemesi",
        errFinish: "Tamamlanamadı — lütfen tekrar deneyin.", errConn: "Bağlantı hatası — lütfen tekrar deneyin.",
        steps: [
            { title: "Nurvo'ya hoş geldiniz", desc: "Çalışan portalınıza kısa bir giriş — bir dakikadan kısa sürede. Daha sonra Ayarlar'dan istediğiniz zaman yeniden açabilirsiniz." },
            { title: "Vardiya planım", desc: "Yaklaşan vardiyalarınız bir bakışta — istasyon, tarih ve saat ile, her zaman güncel.", hint: "Kenar çubuğu · Planım" },
            { title: "Zaman takibi", desc: "GPS ile giriş ve çıkış yapın — çalışma saatleriniz otomatik olarak kaydedilir. Görevleri tamamlandı olarak işaretlemek için de giriş yapmış olmanız gerekir.", hint: "Kenar çubuğu · Zaman takibi" },
            { title: "İzin talebi", desc: "İzin taleplerinizi doğrudan uygulamada gönderin — yönetim bilgilendirilir ve kararı anında görürsünüz. Üstte, yönetimin tanıdığı olası ek izin dahil yıllık hakkınız görünür.", hint: "Kenar çubuğu · İzin" },
            { title: "Vardiya tercihleri", desc: "Yaklaşan vardiyalar için tercihlerinizi yönetimle paylaşın — örn. tercih edilen vardiya, boş günler veya çalışamayacağınız günler.", hint: "Kenar çubuğu · Vardiya tercihleri" },
            { title: "İstasyonunuzun / biriminizin görevleri", desc: "“Görevler” altında istasyonunuzda veya biriminizde yapılması gerekenleri görürsünüz. Giriş yaptığınız sürece görevleri işaretleyebilirsiniz.", hint: "Kenar çubuğu · Görevler" },
            { title: "İstasyon veya birim sorumlusuysanız", desc: "Yönetim sizi görevlendirirse, ayrıca kimin görevde olduğunu ve istasyonunuzun vardiya planını görürsünüz. Çalışanları tek dokunuşla hasta bildirebilir, acil durumda “Takviye iste” ile kısa sürede yedek personel çağırabilirsiniz — ve yönetim izin verirse istasyonunuzun izin taleplerini ve vardiya tercihlerini kendiniz yönetebilirsiniz." },
            { title: "Tamamlandı!", desc: "İşte bu kadar — artık temel işlevleri biliyorsunuz. Sorularınız olursa kenar çubuğundan istediğiniz zaman desteğe ulaşabilirsiniz. Başarılar!" },
        ],
    },
    pl: {
        langTitle: "Wybierz język", langDesc: "W jakim języku chcesz korzystać z Nurvo? Możesz to później w każdej chwili zmienić w Ustawieniach.",
        continue: "Dalej", skip: "Pomiń", back: "Wstecz", next: "Dalej", start: "Zaczynajmy",
        demoNote: "Podgląd demo — tylko do wypróbowania. Nic nie jest zapisywane.",
        footer: "Nurvo · To wprowadzenie znajdziesz później w Ustawieniach",
        footerDemo: "Nurvo · Podgląd demo onboardingu pracownika",
        errFinish: "Nie udało się zakończyć — spróbuj ponownie.", errConn: "Błąd połączenia — spróbuj ponownie.",
        steps: [
            { title: "Witamy w Nurvo", desc: "Krótkie wprowadzenie do Twojego portalu pracownika — w niecałą minutę. Możesz je później otworzyć ponownie w każdej chwili w Ustawieniach." },
            { title: "Mój grafik", desc: "Twoje nadchodzące zmiany w skrócie — z oddziałem, datą i godziną, zawsze aktualne.", hint: "Panel boczny · Mój grafik" },
            { title: "Rejestracja czasu", desc: "Zamelduj się i wymelduj przez GPS — Twój czas pracy jest dokumentowany automatycznie. Zameldowanie jest też warunkiem oznaczania zadań jako wykonane.", hint: "Panel boczny · Rejestracja czasu" },
            { title: "Wniosek urlopowy", desc: "Składaj wnioski urlopowe bezpośrednio w aplikacji — kierownictwo jest powiadamiane, a decyzję widzisz od razu. U góry widnieje Twój roczny wymiar, w tym ewentualny dodatkowy urlop przyznany przez kierownictwo.", hint: "Panel boczny · Urlop" },
            { title: "Preferencje zmian", desc: "Przekaż kierownictwu preferencje dotyczące nadchodzących zmian — np. preferowaną zmianę, dni wolne lub dni, w które nie możesz.", hint: "Panel boczny · Preferencje zmian" },
            { title: "Zadania Twojego oddziału / obszaru", desc: "W sekcji “Zadania” widzisz, co należy zrobić na Twoim oddziale lub w Twoim obszarze. Dopóki jesteś zameldowany, możesz odhaczać zadania.", hint: "Panel boczny · Zadania" },
            { title: "Jeśli jesteś kierownikiem oddziału lub obszaru", desc: "Jeśli kierownictwo Cię wyznaczy, dodatkowo zobaczysz, kto jest obecnie na służbie, oraz grafik Twojego oddziału. Możesz jednym dotknięciem zgłosić chorobę pracownika, w nagłym przypadku wezwać zastępstwo przez “Poproś o wsparcie” — a jeśli kierownictwo to włączy, samodzielnie obsługiwać wnioski urlopowe i preferencje zmian swojego oddziału." },
            { title: "Gotowe!", desc: "To wszystko — znasz już najważniejsze funkcje. W razie pytań w każdej chwili skontaktujesz się z pomocą przez panel boczny. Powodzenia!" },
        ],
    },
    ro: {
        langTitle: "Alege limba", langDesc: "În ce limbă vrei să folosești Nurvo? Poți schimba oricând mai târziu din Setări.",
        continue: "Continuă", skip: "Sari peste", back: "Înapoi", next: "Înainte", start: "Să începem",
        demoNote: "Previzualizare demo — doar pentru testare. Nu se salvează nimic.",
        footer: "Nurvo · Găsești această introducere mai târziu în Setări",
        footerDemo: "Nurvo · Previzualizare demo a onboardingului pentru angajați",
        errFinish: "Nu a putut fi finalizat — încearcă din nou.", errConn: "Eroare de conexiune — încearcă din nou.",
        steps: [
            { title: "Bine ai venit la Nurvo", desc: "O scurtă introducere în portalul tău de angajat — în mai puțin de un minut. O poți redeschide oricând mai târziu din Setări." },
            { title: "Programul meu", desc: "Turele tale următoare dintr-o privire — cu secția, data și ora, mereu la zi.", hint: "Bară laterală · Programul meu" },
            { title: "Pontaj", desc: "Pontează intrarea și ieșirea prin GPS — orele tale de lucru sunt documentate automat. Să fii pontat este și condiția pentru a marca sarcini ca finalizate.", hint: "Bară laterală · Pontaj" },
            { title: "Cerere de concediu", desc: "Trimite cereri de concediu direct în aplicație — conducerea este notificată și vezi decizia imediat. Sus apare dreptul tău anual, inclusiv eventualul concediu suplimentar acordat de conducere.", hint: "Bară laterală · Concediu" },
            { title: "Preferințe de tură", desc: "Comunică-i conducerii preferințele pentru turele viitoare — de ex. tura preferată, zilele libere sau zilele în care nu poți.", hint: "Bară laterală · Preferințe de tură" },
            { title: "Sarcinile secției / zonei tale", desc: "La “Sarcini” vezi ce e de făcut pe secția sau în zona ta. Cât timp ești pontat, poți bifa sarcinile.", hint: "Bară laterală · Sarcini" },
            { title: "Dacă ești responsabil de secție sau zonă", desc: "Dacă te numește conducerea, vezi în plus cine este în tură acum și programul secției tale. Poți anunța un angajat bolnav cu o atingere, poți chema în regim de urgență personal de rezervă prin “Cere întăriri” — și, dacă conducerea activează, poți gestiona chiar tu cererile de concediu și preferințele de tură ale secției tale." },
            { title: "Gata!", desc: "Asta e tot — acum cunoști funcțiile principale. Dacă ai întrebări, poți contacta oricând suportul din bara laterală. Mult succes!" },
        ],
    },
    ar: {
        langTitle: "اختر اللغة", langDesc: "بأي لغة تريد استخدام نورفو؟ يمكنك تغيير ذلك لاحقاً في أي وقت من الإعدادات.",
        continue: "متابعة", skip: "تخطّي", back: "رجوع", next: "التالي", start: "لنبدأ",
        demoNote: "معاينة تجريبية — للتجربة فقط. لا يتم حفظ أي شيء.",
        footer: "نورفو · ستجد هذه المقدمة لاحقاً في الإعدادات",
        footerDemo: "نورفو · معاينة تجريبية لتهيئة الموظف",
        errFinish: "تعذّر الإكمال — يرجى المحاولة مرة أخرى.", errConn: "خطأ في الاتصال — يرجى المحاولة مرة أخرى.",
        steps: [
            { title: "مرحباً بك في نورفو", desc: "مقدمة قصيرة لبوابة الموظف الخاصة بك — في أقل من دقيقة. يمكنك إعادة فتحها لاحقاً في أي وقت من الإعدادات." },
            { title: "جدول مناوباتي", desc: "مناوباتك القادمة في لمحة — مع القسم والتاريخ والوقت، محدّثة دائماً.", hint: "الشريط الجانبي · جدولي" },
            { title: "تسجيل الوقت", desc: "سجّل الدخول والخروج عبر GPS — تُوثّق ساعات عملك تلقائياً. تسجيل الدخول شرط أيضاً لوضع علامة على المهام كمنجزة.", hint: "الشريط الجانبي · تسجيل الوقت" },
            { title: "طلب إجازة", desc: "قدّم طلبات الإجازة مباشرة في التطبيق — تُبلَّغ الإدارة وترى القرار فوراً. في الأعلى يظهر رصيدك السنوي، بما في ذلك أي إجازة إضافية تمنحها الإدارة.", hint: "الشريط الجانبي · الإجازة" },
            { title: "تفضيلات المناوبات", desc: "شارك الإدارة تفضيلاتك للمناوبات القادمة — مثل المناوبة المفضّلة أو الأيام الحرة أو الأيام التي لا تستطيع فيها العمل.", hint: "الشريط الجانبي · تفضيلات المناوبات" },
            { title: "مهام قسمك / منطقتك", desc: "ضمن “المهام” ترى ما ينبغي إنجازه في قسمك أو منطقتك. وطالما أنك مسجّل الدخول، يمكنك تعليم المهام كمنجزة.", hint: "الشريط الجانبي · المهام" },
            { title: "إذا كنت مسؤول قسم أو منطقة", desc: "إذا عيّنتك الإدارة، ترى أيضاً من هو في المناوبة الآن وجدول قسمك. يمكنك الإبلاغ عن مرض موظف بنقرة واحدة، واستدعاء بدلاء بسرعة عند الطوارئ عبر “طلب دعم” — وإذا فعّلت الإدارة ذلك، يمكنك بنفسك معالجة طلبات الإجازة وتفضيلات المناوبات لقسمك." },
            { title: "تم!", desc: "هذا كل شيء — أنت الآن تعرف الوظائف الأساسية. عند وجود أسئلة يمكنك الوصول إلى الدعم في أي وقت عبر الشريط الجانبي. بالتوفيق!" },
        ],
    },
    ru: {
        langTitle: "Выберите язык", langDesc: "На каком языке вы хотите использовать Nurvo? Вы можете изменить это позже в любой момент в Настройках.",
        continue: "Далее", skip: "Пропустить", back: "Назад", next: "Далее", start: "Начать",
        demoNote: "Демо-предпросмотр — только для ознакомления. Ничего не сохраняется.",
        footer: "Nurvo · Это введение вы позже найдёте в Настройках",
        footerDemo: "Nurvo · Демо-предпросмотр онбординга сотрудника",
        errFinish: "Не удалось завершить — попробуйте ещё раз.", errConn: "Ошибка соединения — попробуйте ещё раз.",
        steps: [
            { title: "Добро пожаловать в Nurvo", desc: "Краткое введение в ваш портал сотрудника — меньше чем за минуту. Позже вы сможете открыть его в любой момент в Настройках." },
            { title: "Мой график", desc: "Ваши предстоящие смены с одного взгляда — с отделением, датой и временем, всегда актуально.", hint: "Боковая панель · Мой график" },
            { title: "Учёт времени", desc: "Отмечайте приход и уход по GPS — ваше рабочее время документируется автоматически. Отметка о приходе также необходима, чтобы отмечать задачи как выполненные.", hint: "Боковая панель · Учёт времени" },
            { title: "Запрос отпуска", desc: "Подавайте заявки на отпуск прямо в приложении — руководство получает уведомление, а решение вы видите сразу. Вверху показан ваш годовой лимит, включая возможный дополнительный отпуск, предоставленный руководством.", hint: "Боковая панель · Отпуск" },
            { title: "Пожелания по сменам", desc: "Сообщайте руководству пожелания по будущим сменам — например, предпочитаемую смену, выходные или дни, когда вы не можете.", hint: "Боковая панель · Пожелания по сменам" },
            { title: "Задачи вашего отделения / участка", desc: "В разделе “Задачи” вы видите, что нужно сделать в вашем отделении или на участке. Пока вы отмечены как пришедший, вы можете отмечать задачи выполненными.", hint: "Боковая панель · Задачи" },
            { title: "Если вы старший отделения или участка", desc: "Если руководство вас назначит, вы дополнительно увидите, кто сейчас на смене, и график вашего отделения. Вы можете одним касанием отметить сотрудника как заболевшего, в экстренном случае быстро вызвать подмену через “Запросить подкрепление” — и, если руководство это включит, самостоятельно обрабатывать заявки на отпуск и пожелания по сменам вашего отделения." },
            { title: "Готово!", desc: "Вот и всё — теперь вы знаете основные функции. При вопросах вы в любой момент можете обратиться в поддержку через боковую панель. Удачи!" },
        ],
    },
};
const PRAXIS: Record<Lang, Record<number, StepText>> = {
    de: {
        1: { title: "Mein Schichtplan", desc: "Deine kommenden Schichten auf einen Blick — mit Datum und Uhrzeit, immer aktuell.", hint: "Seitenleiste · Mein Plan" },
        5: { title: "Aufgaben in der Praxis", desc: "Unter „Aufgaben“ siehst du, was in der Praxis zu erledigen ist. Solange du eingestempelt bist, kannst du Aufgaben abhaken.", hint: "Seitenleiste · Aufgaben" },
        6: { title: "Falls du die Praxis mitorganisierst", desc: "Gibt dir die Praxisleitung diese Rolle, siehst du zusätzlich, wer gerade im Dienst ist, und den Dienstplan der Praxis. Du kannst Kolleginnen und Kollegen mit einem Tipp krankmelden und, wenn die Leitung es freischaltet, Urlaubsanträge und Dienstwünsche selbst bearbeiten." },
    },
    en: {
        1: { title: "My schedule", desc: "Your upcoming shifts at a glance — with date and time, always up to date.", hint: "Sidebar · My schedule" },
        5: { title: "Tasks in the practice", desc: "Under “Tasks” you see what needs doing in the practice. As long as you're clocked in, you can check tasks off.", hint: "Sidebar · Tasks" },
        6: { title: "If you help run the practice", desc: "If the practice management gives you this role, you'll also see who's on duty and the practice schedule. You can report colleagues sick with one tap and, if management allows it, handle leave requests and shift preferences yourself." },
    },
    tr: {
        1: { title: "Vardiya planım", desc: "Yaklaşan vardiyalarınız bir bakışta — tarih ve saat ile, her zaman güncel.", hint: "Kenar çubuğu · Planım" },
        5: { title: "Muayenehanedeki görevler", desc: "“Görevler” altında muayenehanede yapılması gerekenleri görürsünüz. Giriş yapmış olduğunuz sürece görevleri tamamlandı olarak işaretleyebilirsiniz.", hint: "Kenar çubuğu · Görevler" },
        6: { title: "Muayenehanenin organizasyonuna yardım ediyorsanız", desc: "Muayenehane yönetimi size bu rolü verirse, ayrıca kimin görevde olduğunu ve muayenehanenin vardiya planını görürsünüz. Çalışma arkadaşlarınızı tek dokunuşla hasta bildirebilir ve yönetim izin verirse izin taleplerini ve vardiya tercihlerini kendiniz yönetebilirsiniz." },
    },
    pl: {
        1: { title: "Mój grafik", desc: "Twoje nadchodzące zmiany w skrócie — z datą i godziną, zawsze aktualne.", hint: "Pasek boczny · Mój grafik" },
        5: { title: "Zadania w praktyce", desc: "W „Zadaniach” widzisz, co jest do zrobienia w praktyce. Dopóki jesteś zalogowany na zmianie, możesz odhaczać zadania.", hint: "Pasek boczny · Zadania" },
        6: { title: "Jeśli współorganizujesz praktykę", desc: "Jeśli kierownictwo praktyki nada Ci tę rolę, zobaczysz dodatkowo, kto jest na dyżurze, i grafik praktyki. Możesz jednym dotknięciem zgłosić chorobę współpracownika, a jeśli kierownictwo na to pozwoli, samodzielnie obsługiwać wnioski urlopowe i życzenia dotyczące zmian." },
    },
    ro: {
        1: { title: "Programul meu", desc: "Turele tale viitoare dintr-o privire — cu dată și oră, mereu actualizate.", hint: "Bara laterală · Programul meu" },
        5: { title: "Sarcini în cabinet", desc: "La „Sarcini” vezi ce este de făcut în cabinet. Cât timp ești pontat, poți bifa sarcinile.", hint: "Bara laterală · Sarcini" },
        6: { title: "Dacă ajuți la organizarea cabinetului", desc: "Dacă conducerea cabinetului îți dă acest rol, vezi în plus cine este de serviciu și programul cabinetului. Poți anunța colegi bolnavi cu o atingere și, dacă conducerea permite, poți gestiona singur cererile de concediu și dorințele de tură." },
    },
    ar: {
        1: { title: "جدول نوباتي", desc: "نوباتك القادمة في لمحة — مع التاريخ والوقت، محدّثة دائمًا.", hint: "الشريط الجانبي · جدولي" },
        5: { title: "مهام العيادة", desc: "تحت “المهام” ترى ما يجب إنجازه في العيادة. طالما أنك مسجّل الحضور، يمكنك وضع علامة على المهام المنجزة.", hint: "الشريط الجانبي · المهام" },
        6: { title: "إذا كنت تساعد في تنظيم العيادة", desc: "إذا منحتك إدارة العيادة هذا الدور، سترى أيضًا من هو في الخدمة الآن وجدول العيادة. يمكنك الإبلاغ عن مرض زميل بلمسة واحدة، وإذا سمحت الإدارة، معالجة طلبات الإجازة ورغبات النوبات بنفسك." },
    },
    ru: {
        1: { title: "Мой график", desc: "Ваши предстоящие смены с одного взгляда — с датой и временем, всегда актуально.", hint: "Боковая панель · Мой график" },
        5: { title: "Задачи в практике", desc: "В разделе “Задачи” вы видите, что нужно сделать в практике. Пока вы отмечены на смене, можно отмечать задачи выполненными.", hint: "Боковая панель · Задачи" },
        6: { title: "Если вы помогаете организовывать практику", desc: "Если руководство практики даст вам эту роль, вы дополнительно увидите, кто сейчас на смене, и график практики. Вы сможете одним касанием сообщить о болезни коллеги, а если руководство разрешит, сами обрабатывать заявки на отпуск и пожелания по сменам." },
    },
};
export default function MitarbeiterOnboarding({ userName, demo = false, onClose, praxis = false, }: {
    userName: string;
    demo?: boolean;
    onClose?: () => void;
    praxis?: boolean;
}) {
    const router = useRouter();
    const { lang, setLang } = useLang();
    const overlay = !!onClose;
    const [phase, setPhase] = useState<"lang" | "tour">("lang");
    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const c = COPY[lang] ?? COPY.de;
    const steps = c.steps.map((s, i) => ({ ...((praxis && PRAXIS[lang]?.[i]) || s), icon: ICONS[i] }));
    const isFirst = step === 0;
    const isLast = step === steps.length - 1;
    const cur = steps[step];
    const firstName = userName ? userName.split(" ")[0] : "";
    async function finish() {
        if (onClose) {
            onClose();
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const res = await fetch("/api/onboarding/complete-mitarbeiter", { method: "POST" });
            if (!res.ok) {
                setError(c.errFinish);
                setSubmitting(false);
                return;
            }
            router.push("/mein-dashboard");
        }
        catch {
            setError(c.errConn);
            setSubmitting(false);
        }
    }
    const wrapperClass = overlay
        ? "fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        : "min-h-svh bg-[var(--papier-tief)] flex items-center justify-center p-4";
    const closeButton = overlay ? (<button onClick={() => finish()} aria-label="Schließen" className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-[var(--papier)] border border-[var(--linie)] shadow flex items-center justify-center text-[var(--tinte-matt)] hover:text-[var(--tinte)]">
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
    </button>) : null;
    const demoBanner = demo ? (<div className="flex items-center gap-2 px-5 py-2.5 bg-[var(--warnung-flaeche)] border-b border-[var(--linie)] text-[var(--warnung)] text-[13px] font-medium">
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>science</span>
      {c.demoNote}
    </div>) : null;
    if (phase === "lang") {
        return (<div className={wrapperClass}>
        <div className="w-full max-w-md relative">
          {closeButton}
          <div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)]  overflow-hidden">
            {demoBanner}
            <div className="p-6 sm:p-8">
              <div className="w-12 h-12 rounded-xl bg-[var(--akzent-flaeche)] flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 24 }}>language</span>
              </div>
              <h1 className="text-[20px] font-semibold text-[var(--tinte)] mb-2">{c.langTitle}</h1>
              <p className="text-[var(--tinte-matt)] text-[14px] leading-relaxed mb-6">{c.langDesc}</p>
              <div className="grid grid-cols-2 gap-3">
                {LANGUAGES.map(l => (<button key={l.code} onClick={() => setLang(l.code)} className={`flex items-center gap-3 p-4 rounded-xl border-2 transition text-left ${lang === l.code ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:border-[#c7d2fe]"}`}>
                    <span className="font-semibold text-[15px] text-[var(--tinte)] flex-1">{l.label}</span>
                    {lang === l.code && <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>check</span>}
                  </button>))}
              </div>
              <button onClick={() => setPhase("tour")} className="mt-6 w-full py-3 rounded-xl text-[14px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
                {c.continue}
              </button>
            </div>
          </div>
        </div>
      </div>);
    }
    return (<div className={wrapperClass}>
      <div className="w-full max-w-md relative">
        {closeButton}
        
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {steps.map((_, i) => (<button key={i} onClick={() => setStep(i)} className="h-1.5 rounded-full transition-[width,background-color] duration-[240ms]" style={{ width: i === step ? 22 : 6, background: i === step ? "var(--akzent)" : i < step ? "#94a3b8" : "#e2e8f0" }}/>))}
        </div>

        <div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)]  overflow-hidden">
          {demoBanner}
          <div className="p-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--akzent-flaeche)] flex items-center justify-center mb-5">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}>{cur.icon}</span>
            </div>
            <h1 className="text-[20px] font-semibold text-[var(--tinte)] mb-2">
              {isFirst && firstName ? `${cur.title}, ${firstName}` : cur.title}
            </h1>
            <p className="text-[var(--tinte-matt)] text-[14px] leading-relaxed">{cur.desc}</p>
            {cur.hint && (<div className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] font-medium">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                {cur.hint}
              </div>)}
            {error && (<div className="mt-4 p-3 rounded-lg bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] text-[var(--gefahr)]">{error}</div>)}
          </div>

          <div className="flex items-center justify-between px-8 pb-7 pt-1">
            <button onClick={() => (isFirst ? finish() : setStep(s => s - 1))} disabled={submitting} className="flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] transition-colors disabled:opacity-40">
              {isFirst ? c.skip : (<><span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span> {c.back}</>)}
            </button>
            <button onClick={() => (isLast ? finish() : setStep(s => s + 1))} disabled={submitting} className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors disabled:opacity-60" style={{ background: isLast ? "#10b981" : "var(--tinte)" }}>
              {submitting ? <PulseLoader size={14}/>
            : isLast ? (<><span className="material-symbols-outlined" style={{ fontSize: 15 }}>check</span> {c.start}</>)
                : (<>{c.next} <span className="material-symbols-outlined" style={{ fontSize: 15 }}>chevron_right</span></>)}
            </button>
          </div>
        </div>

        <p className="text-center text-[13px] text-[var(--tinte-leise)] mt-4">{demo ? c.footerDemo : c.footer}</p>
      </div>
    </div>);
}
