import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type LangCode =
  | "en" | "es" | "pt" | "fr" | "de" | "it" | "ru"
  | "ar" | "zh" | "ja" | "ko" | "hi" | "bn" | "id"
  | "vi" | "th" | "ms" | "fil" | "tr" | "pl" | "nl"
  | "sv" | "uk" | "el" | "ro" | "hu" | "cs";

export const LANGUAGES: { code: LangCode; label: string; nativeLabel: string; rtl?: boolean; aiName: string }[] = [
  { code: "en",  label: "English",    nativeLabel: "English",          aiName: "English" },
  { code: "es",  label: "Spanish",    nativeLabel: "Español",          aiName: "Spanish" },
  { code: "pt",  label: "Portuguese", nativeLabel: "Português",        aiName: "Portuguese" },
  { code: "fr",  label: "French",     nativeLabel: "Français",         aiName: "French" },
  { code: "de",  label: "German",     nativeLabel: "Deutsch",          aiName: "German" },
  { code: "it",  label: "Italian",    nativeLabel: "Italiano",         aiName: "Italian" },
  { code: "ru",  label: "Russian",    nativeLabel: "Русский",          aiName: "Russian" },
  { code: "ar",  label: "Arabic",     nativeLabel: "العربية",          rtl: true, aiName: "Arabic" },
  { code: "zh",  label: "Chinese",    nativeLabel: "中文",              aiName: "Chinese (Simplified)" },
  { code: "ja",  label: "Japanese",   nativeLabel: "日本語",            aiName: "Japanese" },
  { code: "ko",  label: "Korean",     nativeLabel: "한국어",            aiName: "Korean" },
  { code: "hi",  label: "Hindi",      nativeLabel: "हिन्दी",             aiName: "Hindi" },
  { code: "bn",  label: "Bengali",    nativeLabel: "বাংলা",             aiName: "Bengali" },
  { code: "id",  label: "Indonesian", nativeLabel: "Bahasa Indonesia", aiName: "Indonesian" },
  { code: "vi",  label: "Vietnamese", nativeLabel: "Tiếng Việt",       aiName: "Vietnamese" },
  { code: "th",  label: "Thai",       nativeLabel: "ไทย",              aiName: "Thai" },
  { code: "ms",  label: "Malay",      nativeLabel: "Bahasa Melayu",    aiName: "Malay" },
  { code: "fil", label: "Filipino",   nativeLabel: "Tagalog",          aiName: "Filipino" },
  { code: "tr",  label: "Turkish",    nativeLabel: "Türkçe",           aiName: "Turkish" },
  { code: "pl",  label: "Polish",     nativeLabel: "Polski",           aiName: "Polish" },
  { code: "nl",  label: "Dutch",      nativeLabel: "Nederlands",       aiName: "Dutch" },
  { code: "sv",  label: "Swedish",    nativeLabel: "Svenska",          aiName: "Swedish" },
  { code: "uk",  label: "Ukrainian",  nativeLabel: "Українська",       aiName: "Ukrainian" },
  { code: "el",  label: "Greek",      nativeLabel: "Ελληνικά",         aiName: "Greek" },
  { code: "ro",  label: "Romanian",   nativeLabel: "Română",           aiName: "Romanian" },
  { code: "hu",  label: "Hungarian",  nativeLabel: "Magyar",           aiName: "Hungarian" },
  { code: "cs",  label: "Czech",      nativeLabel: "Čeština",          aiName: "Czech" },
];

// Translations: key → per-language string. English is the canonical fallback.
type Dict = Partial<Record<LangCode, string>> & { en: string };
const D = (en: string, rest: Partial<Record<LangCode, string>> = {}): Dict => ({ en, ...rest });

const T: Record<string, Dict> = {
  // Generic & Common UI
  "common.save":          D("Save",          { es: "Guardar", pt: "Salvar", fr: "Enregistrer", de: "Speichern", it: "Salva", ru: "Сохранить", ar: "حفظ", zh: "保存", ja: "保存", ko: "저장", hi: "सहेजें", tr: "Kaydet", pl: "Zapisz", nl: "Opslaan" }),
  "common.saved":         D("Saved.",        { es: "Guardado.", pt: "Salvo.", fr: "Enregistré.", de: "Gespeichert.", it: "Salvato.", ru: "Сохранено.", ar: "تم الحفظ.", zh: "已保存。", ja: "保存しました。", ko: "저장됨.", hi: "सहेजा गया।", tr: "Kaydedildi.", pl: "Zapisano.", nl: "Opgeslagen." }),
  "common.cancel":        D("Cancel",        { es: "Cancelar", pt: "Cancelar", fr: "Annuler", de: "Abbrechen", it: "Annulla", ru: "Отмена", ar: "إلغاء", zh: "取消", ja: "キャンセル", ko: "취소", hi: "रद्द करें", tr: "İptal", pl: "Anuluj", nl: "Annuleren" }),
  "common.send":          D("Send",          { es: "Enviar", pt: "Enviar", fr: "Envoyer", de: "Senden", it: "Invia", ru: "Отправить", ar: "إرسال", zh: "发送", ja: "送信", ko: "보내기", hi: "भेजें", tr: "Gönder", pl: "Wyślij", nl: "Versturen" }),
  "common.loading":       D("Loading…",      { es: "Cargando…", pt: "Carregando…", fr: "Chargement…", de: "Lädt…", it: "Caricamento…", ru: "Загрузка…", ar: "جارٍ التحميل…", zh: "加载中…", ja: "読み込み中…", ko: "불러오는 중…", hi: "लोड हो रहा है…", tr: "Yükleniyor…", pl: "Wczytywanie…", nl: "Laden…" }),
  "common.language":      D("Language",      { es: "Idioma", pt: "Idioma", fr: "Langue", de: "Sprache", it: "Lingua", ru: "Язык", ar: "اللغة", zh: "语言", ja: "言語", ko: "언어", hi: "भाषा", tr: "Dil", pl: "Język", nl: "Taal" }),
  "common.signOut":       D("Sign out",      { es: "Cerrar sesión", pt: "Sair", fr: "Se déconnecter", de: "Abmelden", it: "Esci", ru: "Выйти", ar: "تسجيل الخروج", zh: "退出登录", ja: "サインアウト", ko: "로그아웃", hi: "साइन आउट", tr: "Çıkış yap", pl: "Wyloguj", nl: "Afmelden" }),

  // Navigation
  "nav.home":             D("Home",          { es: "Inicio", pt: "Início", fr: "Accueil", de: "Startseite", it: "Home", ru: "Главная", ar: "الرئيسية", zh: "首页", ja: "ホーム", ko: "홈", hi: "होम", tr: "Ana Sayfa", pl: "Strona główna", nl: "Startpagina" }),
  "nav.pricing":          D("Pricing & Top-Ups", { es: "Precios y recargas", pt: "Preços e recargas", fr: "Tarifs & Recharges", de: "Preise & Aufladungen", it: "Prezzi e ricariche", ru: "Цены и пополнение", ar: "الأسعار والتعبئة", zh: "价格与充值", ja: "料金・チャージ", ko: "요금 및 충전", hi: "मूल्य निर्धारण और टॉप-अप", tr: "Fiyatlandırma ve Yüklemeler", pl: "Cennik i doładowania", nl: "Prijzen & Opwaarderen" }),
  "nav.frontpage":       D("Front Page",    { es: "Página principal", pt: "Página principal", fr: "Page d'accueil", de: "Hauptseite", it: "Pagina principale", ru: "Титульная страница", ar: "الصفحة الرئيسية", zh: "首页展示", ja: "トップページ", ko: "프론트 페이지", hi: "मुख्य पृष्ठ", tr: "Ana Sayfa", pl: "Strona główna", nl: "Voorpagina" }),
  "nav.projects":        D("Projects",      { es: "Proyectos", pt: "Projetos", fr: "Projets", de: "Projekte", it: "Progetti", ru: "Проекты", ar: "المشاريع", zh: "项目", ja: "プロジェクト", ko: "프로젝트", hi: "प्रोजेक्ट्स", tr: "Projeler", pl: "Projekty", nl: "Projecten" }),
  "nav.models":          D("3D Models",     { es: "Modelos 3D", pt: "Modelos 3D", fr: "Modèles 3D", de: "3D-Modelle", it: "Modelli 3D", ru: "3D-Модели", ar: "نماذج ثلاثية الأبعاد", zh: "3D 模型", ja: "3D モデル", ko: "3D 모델", hi: "3D मॉडल", tr: "3D Modeller", pl: "Modele 3D", nl: "3D-modellen" }),
  "nav.ui":              D("UI Generator",  { es: "Generador de UI", pt: "Gerador de UI", fr: "Générateur d'UI", de: "UI-Generator", it: "Generatore UI", ru: "Генератор UI", ar: "مولد الواجهة", zh: "UI 生成器", ja: "UI ジェネレーター", ko: "UI 생성기", hi: "UI जनरेटर", tr: "Arayüz Oluşturucu", pl: "Generator UI", nl: "UI Generator" }),
  "nav.plugin":          D("Studio Plugin", { es: "Plugin de Studio", pt: "Plugin do Studio", fr: "Plugin Studio", de: "Studio-Plugin", it: "Plugin Studio", ru: "Плагин Studio", ar: "إضافة Studio", zh: "Studio 插件", ja: "Studio プラグイン", ko: "Studio 플러グ인", hi: "Studio प्लगइन", tr: "Studio Eklentisi", pl: "Wtyczka Studio", nl: "Studio plug-in" }),
  "nav.mcp":             D("MCP Servers",   { es: "Servidores MCP", pt: "Servidores MCP", fr: "Serveurs MCP", de: "MCP-Server", it: "Server MCP", ru: "Серверы MCP", ar: "خوادم MCP", zh: "MCP 服务器", ja: "MCP サーバー", ko: "MCP 서버", hi: "MCP सर्वर", tr: "MCP Sunucuları", pl: "Serwery MCP", nl: "MCP-servers" }),
  "nav.community":       D("Community",     { es: "Comunidad", pt: "Comunidade", fr: "Communauté", de: "Community", it: "Community", ru: "Сообщество", ar: "المجتمع", zh: "社区", ja: "コミュニティ", ko: "커뮤니티", hi: "समुदाय", tr: "Topluluk", pl: "Społeczność", nl: "Community" }),
  "nav.referrals":       D("Invite Friends",{ es: "Invitar amigos", pt: "Convidar amigos", fr: "Inviter des amis", de: "Freunde einladen", it: "Invita amici", ru: "Пригласить друзей", ar: "دعوة الأصدقاء", zh: "邀请好友", ja: "友達を招待", ko: "친구 초대", hi: "मित्रों को आमंत्रित करें", tr: "Arkadaşları Davet Et", pl: "Zaproś znajomych", nl: "Vrienden uitnodigen" }),
  "nav.settings":        D("Settings",      { es: "Configuración", pt: "Configurações", fr: "Paramètres", de: "Einstellungen", it: "Impostazioni", ru: "Настройки", ar: "الإعدادات", zh: "设置", ja: "設定", ko: "설정", hi: "सेटिंग्स", tr: "Ayarlar", pl: "Ustawienia", nl: "Instellingen" }),
  "nav.discord":         D("Join Discord",  { es: "Unirse a Discord", pt: "Entrar no Discord", fr: "Rejoindre Discord", de: "Discord beitreten", it: "Unisciti a Discord", ru: "Присоединиться к Discord", ar: "الانضمام إلى ديسكورد", zh: "加入 Discord", ja: "Discord に参加", ko: "Discord 참여", hi: "Discord में शामिल हों", tr: "Discord'a Katıl", pl: "Dołącz do Discorda", nl: "Word lid van Discord" }),
  "nav.newProject":      D("New Project",   { es: "Nuevo proyecto", pt: "Novo projeto", fr: "Nouveau projet", de: "Neues Projekt", it: "Nuovo progetto", ru: "Новый проект", ar: "مشروع جديد", zh: "新建项目", ja: "新規プロジェクト", ko: "새 프로젝트", hi: "नया प्रोजेक्ट", tr: "Yeni Proje", pl: "Nowy projekt", nl: "Nieuw project" }),
  "nav.export":          D("Export Game",   { es: "Exportar juego", pt: "Exportar jogo", fr: "Exporter le jeu", de: "Spiel exportieren", it: "Esporta gioco", ru: "Экспортировать игру", ar: "تصدير اللعبة", zh: "导出游戏", ja: "ゲームをエクスポート", ko: "게임 내보내기", hi: "गेम निर्यात करें", tr: "Oyunu Dışa Aktar", pl: "Eksportuj grę", nl: "Spel exporteren" }),

  // Dashboard & Workspace
  "dash.welcome":        D("Welcome back",  { es: "Bienvenido de nuevo", pt: "Bem-vindo de volta", fr: "Bon retour", de: "Willkommen zurück", it: "Bentornato", ru: "С возвращением", ar: "مرحبًا بعودتك", zh: "欢迎回来", ja: "おかえりなさい", ko: "다시 오신 것을 환영합니다", hi: "वापसी पर स्वागत है", tr: "Tekrar Hoş Geldiniz", pl: "Witaj ponownie", nl: "Welkom terug" }),
  "dash.subtitle":       D("What do you want to build today?", { es: "¿Qué quieres construir hoy?", pt: "O que você quer construir hoje?", fr: "Que voulez-vous créer aujourd'hui ?", de: "Was möchtest du heute bauen?", it: "Cosa vuoi costruire oggi?", ru: "Что вы хотите построить сегодня?", ar: "ماذا تريد أن تبني اليوم؟", zh: "今天你想构建什么？", ja: "今日は何をビルドしますか？", ko: "오늘 무엇을 빌드하고 싶으신가요?", hi: "आज आप क्या बनाना चाहते हैं?", tr: "Bugün ne inşa etmek istersiniz?", pl: "Co chcesz dzisiaj zbudować?", nl: "Wat wil je vandaag bouwen?" }),
  "dash.topUp":          D("Top Up",        { es: "Recargar", pt: "Recarregar", fr: "Recharger", de: "Aufladen", it: "Ricarica", ru: "Пополнить", ar: "تعبئة", zh: "充值", ja: "チャージ", ko: "충전", hi: "टॉप अप", tr: "Yükle", pl: "Doładuj", nl: "Opwaarderen" }),
  "dash.quickActions":   D("Quick Actions", { es: "Acciones rápidas", pt: "Ações rápidas", fr: "Actions rapides", de: "Schnellaktionen", it: "Azioni rapide", ru: "Быстрые действия", ar: "إجراءات سريعة", zh: "快捷操作", ja: "クイックアクション", ko: "빠른 작업", hi: "त्वरित कार्रवाई", tr: "Hızlı Eylemler", pl: "Szybkie akcje", nl: "Snelle acties" }),
  "dash.recentProjects": D("Recent Projects", { es: "Proyectos recientes", pt: "Projetos recentes", fr: "Projets récents", de: "Neueste Projekte", it: "Progetti recenti", ru: "Недавние проекты", ar: "المشاريع الأخيرة", zh: "近期项目", ja: "最近のプロジェクト", ko: "최근 프로젝트", hi: "हाल के प्रोजेक्ट्स", tr: "Son Projeler", pl: "Ostatnie projekty", nl: "Recente projecten" }),
  "dash.recentActivity": D("Recent Activity", { es: "Actividad reciente", pt: "Atividade recente", fr: "Activité récente", de: "Letzte Aktivitäten", it: "Attività recente", ru: "Недавняя активность", ar: "النشاط اخیر", zh: "近期活动", ja: "最近のアクティビティ", ko: "최근 활동", hi: "हाल की गतिविधि", tr: "Son Etkinlikler", pl: "Ostatnia aktywność", nl: "Recente activiteit" }),

  // Actions
  "action.buildFullGame": D("Build Full Game", { es: "Construir juego completo", pt: "Construir jogo completo", fr: "Créer un jeu complet", de: "Komplettes Spiel bauen", it: "Crea gioco completo", ru: "Создать полную игру", ar: "بناء لعبة كاملة", zh: "构建完整游戏", ja: "フルゲームをビルド", ko: "전체 게임 빌드", hi: "पूरा गेम बनाएँ", tr: "Tam Oyun İnşa Et", pl: "Zbuduj pełną grę", nl: "Volledig spel bouwen" }),
  "action.makePlayable":  D("Make It Playable", { es: "Hacer jugable", pt: "Tornar jogável", fr: "Rendre jouable", de: "Spielbar machen", it: "Rendi giocabile", ru: "Сделать играбельной", ar: "جعله قابلاً للعب", zh: "使其可玩", ja: "プレイ可能にする", ko: "플레이 가능하게 만들기", hi: "इसे खेलने योग्य बनाएँ", tr: "Oynanabilir Yap", pl: "Zrób grywalnym", nl: "Speelbaar maken" }),
  "action.buildMap":      D("Build Map",       { es: "Construir mapa", pt: "Construir mapa", fr: "Créer la carte", de: "Karte bauen", it: "Crea mappa", ru: "Построить карту", ar: "بناء الخريطة", zh: "构建地图", ja: "マップをビルド", ko: "지도 빌드", hi: "मानचित्र बनाएँ", tr: "Harita İnşa Et", pl: "Zbuduj mapę", nl: "Kaart bouwen" }),
  "action.generateUi":    D("Generate UI",     { es: "Generar interfaz", pt: "Gerar UI", fr: "Générer l'interface", de: "UI generieren", it: "Genera UI", ru: "Создать интерфейс", ar: "إنشاء الواجهة", zh: "生成 UI", ja: "UI を生成", ko: "UI 생성", hi: "UI उत्पन्न करें", tr: "Arayüz Oluştur", pl: "Wygeneruj UI", nl: "UI genereren" }),
  "action.addNpcs":       D("Add NPCs",        { es: "Añadir NPCs", pt: "Adicionar NPCs", fr: "Ajouter des PNJ", de: "NPCs hinzufügen", it: "Aggiungi NPC", ru: "Добавить NPC", ar: "إضافة شخصيات", zh: "添加 NPC", ja: "NPC を追加", ko: "NPC 추가", hi: "NPC जोड़ें", tr: "NPC Ekle", pl: "Dodaj NPC", nl: "NPC's toevoegen" }),
  "action.addCurrency":   D("Add Currency",    { es: "Añadir moneda", pt: "Adicionar moeda", fr: "Ajouter de la monnaie", de: "Währung hinzufügen", it: "Aggiungi valuta", ru: "Добавить валюту", ar: "إضافة عملة", zh: "添加货币", ja: "通貨を追加", ko: "통화 추가", hi: "मुद्रा जोड़ें", tr: "Para Birimi Ekle", pl: "Dodaj walutę", nl: "Valuta toevoegen" }),
  "action.fixErrors":     D("Fix Errors",      { es: "Corregir errores", pt: "Corrigir erros", fr: "Corriger les erreurs", de: "Fehler beheben", it: "Correggi errori", ru: "Исправить ошибки", ar: "إصلاح الأخطاء", zh: "修复错误", ja: "エラーを修正", ko: "오류 수정", hi: "त्रुटियाँ सुधारें", tr: "Hataları Düzelt", pl: "Napraw błędy", nl: "Fouten herstellen" }),
  "action.optimize":      D("Optimize Performance", { es: "Optimizar rendimiento", pt: "Otimizar desempenho", fr: "Optimiser les performances", de: "Leistung optimieren", it: "Ottimizza prestazioni", ru: "Оптимизировать производительность", ar: "تحسين الأداء", zh: "优化性能", ja: "パフォーマンス最適化", ko: "성능 최적화", hi: "प्रदर्शन अनुकूलित करें", tr: "Performansı Optimize Et", pl: "Zoptymalizuj wydajność", nl: "Prestaties optimaliseren" }),
  "action.fixUi":         D("Fix UI",          { es: "Corregir UI", pt: "Corrigir UI", fr: "Corriger l'UI", de: "UI korrigieren", it: "Correggi UI", ru: "Исправить UI", ar: "إصلاح الواجهة", zh: "修复 UI", ja: "UI を修正", ko: "UI 수정", hi: "UI सुधारें", tr: "Arayüzü Düzelt", pl: "Napraw UI", nl: "UI herstellen" }),
  "action.fixMobile":     D("Fix Mobile",      { es: "Ajustar móvil", pt: "Ajustar mobile", fr: "Ajuster mobile", de: "Mobile anpassen", it: "Adatta mobile", ru: "Оптимизировать для мобильных", ar: "تحسين للهاتف", zh: "适配移动端", ja: "モバイル対応", ko: "모바일 수정", hi: "मोबाइल सुधारें", tr: "Mobil Düzelt", pl: "Dostosuj do mobile", nl: "Mobiel herstellen" }),
  "action.organize":      D("Organize",        { es: "Organizar", pt: "Organizar", fr: "Organiser", de: "Organisieren", it: "Organizza", ru: "Организовать", ar: "تنظيم", zh: "整理项目", ja: "整理する", ko: "정리하기", hi: "व्यवस्थित करें", tr: "Düzenle", pl: "Zorganizuj", nl: "Organiseren" }),
  "action.makePremium":   D("Make Premium",    { es: "Mejorar a Premium", pt: "Tornar Premium", fr: "Rendre Premium", de: "Premium machen", it: "Rendi Premium", ru: "Улучшить до Premium", ar: "جعل ممتاز", zh: "提升至 Premium", ja: "プレミアム化", ko: "프리미엄 만들기", hi: "प्रीमियम बनाएँ", tr: "Premium Yap", pl: "Zrób Premium", nl: "Premium maken" }),
  "action.aiPlaytest":    D("AI Playtest",     { es: "Prueba IA", pt: "Teste IA", fr: "Test IA", de: "KI-Spieltest", it: "Playtest IA", ru: "ИИ-тест", ar: "اختبار الذكاء الاصطناعي", zh: "AI 测试", ja: "AI プレイテスト", ko: "AI 플레이테스트", hi: "AI प्लेटेस्ट", tr: "AI Testi", pl: "Playtest AI", nl: "AI Playtest" }),
  "action.scanGame":      D("Scan Game",       { es: "Escanear juego", pt: "Escanear juego", fr: "Analyser el jeu", de: "Spiel scannen", it: "Scansiona gioco", ru: "Сканировать игру", ar: "فحص اللعبة", zh: "扫描游戏", ja: "ゲーム को スキャン", ko: "게임 스캔", hi: "गेम स्कैन करें", tr: "Oyunu Tara", pl: "Skanuj grę", nl: "Spel scannen" }),
  "action.safetyScan":    D("Safety Scan",     { es: "Escaneo de seguridad", pt: "Escaneamento de segurança", fr: "Analyse de sécurité", de: "Sicherheits-Scan", it: "Scansione sicurezza", ru: "Проверка безопасности", ar: "فحص الأمان", zh: "安全扫描", ja: "安全スキャン", ko: "보안 스캔", hi: "सुरक्षा स्कैन", tr: "Güvenlik Taraması", pl: "Skan bezpieczeństwa", nl: "Veiligheidsscan" }),
  "action.testGame":      D("Test Game",       { es: "Probar juego", pt: "Testar jogo", fr: "Tester le jeu", de: "Spiel testen", it: "Testa gioco", ru: "Протестировать игру", ar: "اختبار اللعبة", zh: "测试游戏", ja: "ゲームをテスト", ko: "게임 테스트", hi: "गेम टेस्ट करें", tr: "Oyunu Test Et", pl: "Przetestuj grę", nl: "Spel testen" }),

  // Stats & Status
  "stat.projectHealth":   D("Project Health",  { es: "Salud del proyecto", pt: "Saúde do projeto", fr: "Santé du projet", de: "Projektstatus", it: "Salute del progetto", ru: "Здоровье проекта", ar: "حالة المشروع", zh: "项目健康度", ja: "プロジェクトの健全性", ko: "프로젝트 상태", hi: "प्रोजेक्ट स्वास्थ्य", tr: "Proje Durumu", pl: "Stan projektu", nl: "Projectgezondheid" }),
  "stat.buildQuality":    D("Build Quality",   { es: "Calidad de construcción", pt: "Qualidade da build", fr: "Qualité de la build", de: "Bauqualität", it: "Qualità build", ru: "Качество сборки", ar: "جودة البناء", zh: "构建质量", ja: "ビルド品質", ko: "빌드 품질", hi: "बिल्ड गुणवत्ता", tr: "İnşa Kalitesi", pl: "Jakość budowy", nl: "Buildkwaliteit" }),
  "stat.studioActions":   D("Studio Actions",  { es: "Acciones de Studio", pt: "Ações do Studio", fr: "Actions Studio", de: "Studio-Aktionen", it: "Azioni Studio", ru: "Действия Studio", ar: "إجراءات Studio", zh: "Studio 操作", ja: "Studio アクション", ko: "Studio 작업", hi: "Studio कार्रवाइयाँ", tr: "Studio Eylemleri", pl: "Akcje Studio", nl: "Studio-acties" }),
  "stat.credits":         D("Credits",         { es: "Créditos", pt: "Créditos", fr: "Crédits", de: "Credits", it: "Crediti", ru: "Кредиты", ar: "الرصيد", zh: "积分", ja: "クレジット", ko: "크레딧", hi: "क्रेडिट", tr: "Krediler", pl: "Kredyty", nl: "Credits" }),
  "stat.creditsToday":    D("Credits Today",   { es: "Créditos hoy", pt: "Créditos hoje", fr: "Crédits aujourd'hui", de: "Credits heute", it: "Crediti oggi", ru: "Кредиты сегодня", ar: "الرصيد اليوم", zh: "今日积分", ja: "本日のクレジット", ko: "오늘의 크레딧", hi: "आज के क्रेडिट", tr: "Bugünün Kredileri", pl: "Dzisiejsze kredyty", nl: "Credits vandaag" }),
  "worker.aiWorkers":     D("AI Workers",      { es: "Trabajadores IA", pt: "Trabalhadores IA", fr: "Agents IA", de: "KI-Arbeiter", it: "Lavoratori IA", ru: "ИИ-агенты", ar: "عمال الذكاء الاصطناعي", zh: "AI 工作者", ja: "AI ワーカー", ko: "AI 워커", hi: "AI कार्यकर्ता", tr: "AI Çalışanları", pl: "Pracownicy AI", nl: "AI Workers" }),

  // Settings page
  "settings.title":       D("Settings",      { es: "Configuración", pt: "Configurações", fr: "Paramètres", de: "Einstellungen", it: "Impostazioni", ru: "Настройки", ar: "الإعدادات", zh: "设置", ja: "設定", ko: "설정", hi: "सेटिंग्स", tr: "Ayarlar", pl: "Ustawienia", nl: "Instellingen" }),
  "settings.displayName": D("Display name",  { es: "Nombre para mostrar", pt: "Nome de exibição", fr: "Nom affiché", de: "Anzeigename", it: "Nome visualizzato", ru: "Отображаемое имя", ar: "الاسم الظاهر", zh: "显示名称", ja: "表示名", ko: "표시 이름", hi: "प्रदर्शन नाम", tr: "Görünen ad", pl: "Wyświetlana nazwa", nl: "Weergavenaam" }),
  "settings.bio":         D("Bio",           { es: "Biografía", pt: "Bio", fr: "Bio", de: "Bio", it: "Bio", ru: "О себе", ar: "نبذة", zh: "简介", ja: "自己紹介", ko: "소개", hi: "बायो", tr: "Hakkında", pl: "O mnie", nl: "Bio" }),
  "settings.robloxUser":  D("Roblox username", { es: "Usuario de Roblox", pt: "Usuário do Roblox", fr: "Nom d'utilisateur Roblox", de: "Roblox-Benutzername", it: "Nome utente Roblox", ru: "Имя пользователя Roblox", ar: "اسم مستخدم Roblox", zh: "Roblox 用户名", ja: "Roblox ユーザー名", ko: "Roblox 사용자 이름", hi: "Roblox उपयोगकर्ता नाम", tr: "Roblox kullanıcı adı", pl: "Nazwa użytkownika Roblox", nl: "Roblox-gebruikersnaam" }),
  "settings.private":     D("Private profile", { es: "Perfil privado", pt: "Perfil privado", fr: "Profil privé", de: "Privates Profil", it: "Profilo privato", ru: "Закрытый профиль", ar: "ملف شخصي خاص", zh: "私密资料", ja: "非公開プロフィール", ko: "비공개 프로필", hi: "निजी प्रोफ़ाइल", tr: "Gizli profil", pl: "Prywatny profil", nl: "Privé-profiel" }),
  "settings.languageHelp":D("BloxSmith and the AI will reply in this language.", { es: "BloxSmith y la IA responderán en este idioma.", pt: "BloxSmith e a IA responderão neste idioma.", fr: "BloxSmith et l'IA répondront dans cette langue.", de: "BloxSmith und die KI antworten in dieser Sprache.", it: "BloxSmith e l'IA risponderanno in questa lingua.", ru: "BloxSmith и ИИ будут отвечать на этом языке.", ar: "سيرد BloxSmith والذكاء الاصطناعي بهذه اللغة.", zh: "BloxSmith 和 AI 将以此语言回复。", ja: "BloxSmith と AI はこの言語で返信します。", ko: "BloxSmith와 AI가 이 언어로 응답합니다.", hi: "BloxSmith और AI इस भाषा में जवाब देंगे।", tr: "BloxSmith ve AI bu dilde yanıt verecek.", pl: "BloxSmith i AI będą odpowiadać w tym języku.", nl: "BloxSmith en de AI antwoorden in deze taal." }),

  // Profile menu
  "profile.account":      D("Account",       { es: "Cuenta", pt: "Conta", fr: "Compte", de: "Konto", it: "Account", ru: "Аккаунт", ar: "الحساب", zh: "账户", ja: "アカウント", ko: "계정", hi: "खाता", tr: "Hesap", pl: "Konto", nl: "Account" }),
  "profile.viewProfile":  D("View Profile",  { es: "Ver perfil", pt: "Ver perfil", fr: "Voir le profil", de: "Profil ansehen", it: "Vedi profilo", ru: "Профиль", ar: "عرض الملف", zh: "查看资料", ja: "プロフィール", ko: "프로필 보기", hi: "प्रोफ़ाइल देखें", tr: "Profili görüntüle", pl: "Zobacz profil", nl: "Profiel bekijken" }),
  "profile.accountSettings": D("Account Settings", { es: "Configuración de cuenta", pt: "Configurações da conta", fr: "Paramètres du compte", de: "Kontoeinstellungen", it: "Impostazioni account", ru: "Настройки аккаунта", ar: "إعدادات الحساب", zh: "账户设置", ja: "アカウント設定", ko: "계정 설정", hi: "खाता सेटिंग्स", tr: "Hesap ayarları", pl: "Ustawienia konta", nl: "Accountinstellingen" }),
  "profile.myProjects":   D("My Projects",   { es: "Mis proyectos", pt: "Meus projetos", fr: "Mes projets", de: "Meine Projekte", it: "I miei progetti", ru: "Мои проекты", ar: "مشاريعي", zh: "我的项目", ja: "マイプロジェクト", ko: "내 프로젝트", hi: "मेरे प्रोजेक्ट", tr: "Projelerim", pl: "Moje projekty", nl: "Mijn projecten" }),
  "profile.creditsPlan":  D("Credits & Plan",{ es: "Créditos y plan", pt: "Créditos e plano", fr: "Crédits & forfait", de: "Credits & Plan", it: "Crediti e piano", ru: "Кредиты и план", ar: "الرصيد والخطة", zh: "积分与方案", ja: "クレジットとプラン", ko: "크레딧 및 플랜", hi: "क्रेडिट और योजना", tr: "Kredi ve plan", pl: "Kredyty i plan", nl: "Credits & abonnement" }),
  "profile.credits":      D("Credits",       { es: "Créditos", pt: "Créditos", fr: "Crédits", de: "Credits", it: "Crediti", ru: "Кредиты", ar: "الرصيد", zh: "积分", ja: "クレジット", ko: "크레딧", hi: "क्रेडिट", tr: "Krediler", pl: "Kredyty", nl: "Credits" }),

  // Chat / Build composer
  "chat.modeChat":        D("Chat",          { es: "Chat", pt: "Chat", fr: "Discussion", de: "Chat", it: "Chat", ru: "Чат", ar: "محادثة", zh: "聊天", ja: "チャット", ko: "채팅", hi: "चैट", tr: "Sohbet", pl: "Czat", nl: "Chat" }),
  "chat.modeBuild":       D("Build",         { es: "Construir", pt: "Construir", fr: "Construire", de: "Bauen", it: "Costruisci", ru: "Создать", ar: "بناء", zh: "构建", ja: "ビルド", ko: "ビルド", hi: "बनाएँ", tr: "İnşa et", pl: "Buduj", nl: "Bouwen" }),
  "chat.chatBanner":      D("Chat mode: BloxSmith will brainstorm and plan with you — it won't create anything in Studio. Switch to Build when you're ready.", { es: "Modo Chat: BloxSmith planificará contigo y no creará nada en Studio. Cambia a Construir cuando estés listo.", pt: "Modo Chat: o BloxSmith vai planejar com você — não cria nada no Studio. Mude para Construir quando estiver pronto.", fr: "Mode Chat : BloxSmith réfléchit avec vous sans rien créer dans Studio. Passez en mode Construire quand vous êtes prêt.", de: "Chat-Modus: BloxSmith plant mit dir und baut nichts in Studio. Wechsle zu Bauen, wenn du bereit bist.", it: "Modalità Chat: BloxSmith pianifica con te e non crea nulla in Studio. Passa a Costruisci quando sei pronto.", ru: "Режим чата: BloxSmith только планирует с вами и ничего не строит в Studio. Переключитесь на «Создать», когда будете готовы.", ar: "وضع المحادثة: سيخطط BloxSmith معك دون إنشاء أي شيء في Studio. انتقل إلى وضع البناء عندما تكون جاهزًا.", zh: "聊天模式：BloxSmith 只会与你头脑风暴，不会在 Studio 创建任何内容。准备好后切换到构建。", ja: "チャットモード：BloxSmith は計画のみで Studio には何も作りません。準備ができたらビルドに切り替えてください。", ko: "채팅 모드: BloxSmith는 함께 계획만 세우고 Studio에는 아무것도 만들지 않습니다. 준비되면 빌드로 전환하세요.", hi: "चैट मोड: BloxSmith आपके साथ योजना बनाएगा — Studio में कुछ नहीं बनाएगा। तैयार होने पर बिल्ड पर स्विच करें।", tr: "Sohbet modu: BloxSmith seninle plan yapar, Studio'da bir şey oluşturmaz. Hazır olduğunda Build'e geç.", pl: "Tryb czatu: BloxSmith tylko planuje z tobą i niczego nie tworzy w Studio. Przełącz na Buduj, gdy jesteś gotów.", nl: "Chat-modus: BloxSmith brainstormt en plant alleen — bouwt niets in Studio. Schakel over naar Bouwen wanneer je klaar bent." }),
  "chat.pushStudio":      D("Push to Studio",{ es: "Enviar a Studio", pt: "Enviar ao Studio", fr: "Envoyer à Studio", de: "An Studio senden", it: "Invia a Studio", ru: "Отправить в Studio", ar: "إرسال إلى Studio", zh: "推送到 Studio", ja: "Studio に送信", ko: "Studio로 보내기", hi: "Studio पर भेजें", tr: "Studio'ya gönder", pl: "Wyślij do Studio", nl: "Naar Studio sturen" }),
  "chat.autoExecute":     D("Auto-execute",  { es: "Ejecución automática", pt: "Execução automática", fr: "Exécution auto", de: "Auto-Ausführung", it: "Esecuzione automatica", ru: "Авто-запуск", ar: "تشغيل تلقائي", zh: "自动执行", ja: "自動実行", ko: "자동 실행", hi: "स्वतः निष्पादन", tr: "Otomatik çalıştır", pl: "Automatyczne wykonanie", nl: "Automatisch uitvoeren" }),
  "chat.autoExecuteHint": D("When off, BloxSmith drafts the build and waits for you to click Push to Studio.", { es: "Cuando está desactivado, BloxSmith prepara la construcción y espera a que pulses Enviar a Studio.", pt: "Quando desativado, o BloxSmith prepara a build e espera você clicar em Enviar ao Studio.", fr: "Désactivé, BloxSmith prépare la build et attend que vous cliquiez sur Envoyer à Studio.", de: "Wenn aus, plant BloxSmith und wartet auf An Studio senden.", it: "Quando disattivato, BloxSmith prepara la build e aspetta che tu prema Invia a Studio.", ru: "Когда выключено, BloxSmith готовит сборку и ждёт нажатия «Отправить в Studio».", ar: "عند الإيقاف، يجهز BloxSmith البناء وينتظر ضغطك على إرسال إلى Studio.", zh: "关闭时，BloxSmith 会准备好构建并等待你点击“推送到 Studio”。", ja: "オフのとき、BloxSmith はビルドを準備し「Studio に送信」を待ちます。", ko: "꺼져 있으면 BloxSmith가 빌드를 준비하고 Studio로 보내기 클릭을 기다립니다.", hi: "बंद होने पर BloxSmith बिल्ड तैयार करेगा और Studio पर भेजें क्लिक का इंतज़ार करेगा।", tr: "Kapalıyken BloxSmith yapıyı hazırlar ve Studio'ya gönder'i beklemeni bekler.", pl: "Gdy wyłączone, BloxSmith przygotowuje build i czeka, aż klikniesz Wyślij do Studio.", nl: "Uit: BloxSmith stelt de build samen en wacht tot je op Naar Studio sturen klikt." }),
  "chat.stop":            D("Stop build",    { es: "Detener", pt: "Parar build", fr: "Arrêter", de: "Build stoppen", it: "Ferma build", ru: "Остановить", ar: "إيقاف البناء", zh: "停止构建", ja: "ビルド停止", ko: "빌드 중지", hi: "बिल्ड रोकें", tr: "Durdur", pl: "Zatرمی", nl: "Build stoppen" }),
  "chat.undo":            D("Undo last",     { es: "Deshacer", pt: "Desfazer", fr: "Annuler", de: "Rückgängig", it: "Annulla", ru: "Отменить", ar: "تراجع", zh: "撤销", ja: "元に戻す", ko: "되돌리기", hi: "पूर्ववत करें", tr: "Geri al", pl: "Cofnij", nl: "Ongedaan" }),

  // Plugin status
  "plugin.online":        D("Plugin online", { es: "Plugin en línea", pt: "Plugin online", fr: "Plugin en ligne", de: "Plugin online", it: "Plugin online", ru: "Плагин онлайн", ar: "الإضافة متصلة", zh: "插件在线", ja: "プラグイン接続中", ko: "플러그인 온라인", hi: "प्लगइन ऑनलाइन", tr: "Eklenti çevrimiçi", pl: "Wtyczka online", nl: "Plug-in online" }),
  "plugin.offline":       D("Plugin offline",{ es: "Plugin desconectado", pt: "Plugin offline", fr: "Plugin hors ligne", de: "Plugin offline", it: "Plugin offline", ru: "Плагин не подключён", ar: "الإضافة غير متصلة", zh: "插件离线", ja: "プラグインオフライン", ko: "플러그인 오프라인", hi: "प्लगइन ऑफ़लाइन", tr: "Eklenti çevrimdışı", pl: "Wtyczka offline", nl: "Plug-in offline" }),
};

// Map of canonical English text to dictionary keys for auto-translating plain text
const STRING_KEY_MAP: Record<string, string> = {
  "Home": "nav.home",
  "Pricing & Top-Ups": "nav.pricing",
  "Front Page": "nav.frontpage",
  "Projects": "nav.projects",
  "My Projects": "profile.myProjects",
  "3D Models": "nav.models",
  "UI Generator": "nav.ui",
  "Studio Plugin": "nav.plugin",
  "MCP Servers": "nav.mcp",
  "Community": "nav.community",
  "Browse Community": "nav.community",
  "Invite Friends": "nav.referrals",
  "Settings": "nav.settings",
  "Account Settings": "profile.accountSettings",
  "Join Discord": "nav.discord",
  "Join our Discord": "nav.discord",
  "New Project": "nav.newProject",
  "Export Game": "nav.export",
  "Export": "nav.export",
  "Welcome back": "dash.welcome",
  "What do you want to build today?": "dash.subtitle",
  "Top Up": "dash.topUp",
  "Quick Actions": "dash.quickActions",
  "Recent Projects": "dash.recentProjects",
  "Recent Activity": "dash.recentActivity",
  "Build Full Game": "action.buildFullGame",
  "Make It Playable": "action.makePlayable",
  "Build Map": "action.buildMap",
  "Generate UI": "action.generateUi",
  "Add NPCs": "action.addNpcs",
  "Add Currency": "action.addCurrency",
  "Fix Errors": "action.fixErrors",
  "Optimize Performance": "action.optimize",
  "Fix UI": "action.fixUi",
  "Fix Mobile": "action.fixMobile",
  "Organize": "action.organize",
  "Make Premium": "action.makePremium",
  "AI Playtest": "action.aiPlaytest",
  "Scan Game": "action.scanGame",
  "Safety Scan": "action.safetyScan",
  "Test Game": "action.testGame",
  "Project Health": "stat.projectHealth",
  "Build Quality": "stat.buildQuality",
  "Studio Actions": "stat.studioActions",
  "Credits": "profile.credits",
  "Credits Today": "stat.creditsToday",
  "AI Workers": "worker.aiWorkers",
  "Sign out": "common.signOut",
  "Language": "common.language",
  "Save": "common.save",
  "Saved.": "common.saved",
  "Cancel": "common.cancel",
  "Send": "common.send",
  "Loading…": "common.loading",
  "Account": "profile.account",
  "View Profile": "profile.viewProfile",
  "Credits & Plan": "profile.creditsPlan",
  "Chat": "chat.modeChat",
  "Build": "chat.modeBuild",
  "Push to Studio": "chat.pushStudio",
  "Auto-execute": "chat.autoExecute",
  "Stop build": "chat.stop",
  "Undo last": "chat.undo",
  "Plugin online": "plugin.online",
  "Plugin offline": "plugin.offline",
};

export function translate(keyOrText: string, lang: LangCode): string {
  if (!keyOrText) return "";
  const key = STRING_KEY_MAP[keyOrText] ?? keyOrText;
  const entry = T[key];
  if (!entry) return keyOrText;
  return entry[lang] ?? entry.en;
}

type Ctx = {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: string) => string;
  aiName: string;
  rtl: boolean;
};

const LangCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "bs-lang";

function readInitial(): LangCode {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY) as LangCode | null;
  if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  const nav = (window.navigator.language || "en").slice(0, 2).toLowerCase();
  const match = LANGUAGES.find((l) => l.code === nav);
  return match?.code ?? "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("en");

  // Hydrate on client
  useEffect(() => {
    setLangState(readInitial());
  }, []);

  const setLang = (l: LangCode) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  };

  const meta = useMemo(() => LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0], [lang]);

  // Reflect on <html> for accessibility / RTL
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.rtl ? "rtl" : "ltr";
  }, [lang, meta.rtl]);

  const value = useMemo<Ctx>(() => ({
    lang,
    setLang,
    t: (key: string) => translate(key, lang),
    aiName: meta.aiName,
    rtl: !!meta.rtl,
  }), [lang, meta]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangCtx);
  if (!ctx) {
    // Safe fallback so components outside the provider still render English.
    return {
      lang: "en",
      setLang: () => {},
      t: (k: string) => translate(k, "en"),
      aiName: "English",
      rtl: false,
    };
  }
  return ctx;
}

export function useT() {
  return useLang().t;
}
