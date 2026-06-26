import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type LangCode =
  | "en" | "es" | "pt" | "fr" | "de" | "it" | "ru"
  | "ar" | "zh" | "ja" | "ko" | "hi" | "tr" | "pl" | "nl";

export const LANGUAGES: { code: LangCode; label: string; nativeLabel: string; rtl?: boolean; aiName: string }[] = [
  { code: "en", label: "English",    nativeLabel: "English",     aiName: "English" },
  { code: "es", label: "Spanish",    nativeLabel: "Español",     aiName: "Spanish" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português",   aiName: "Portuguese" },
  { code: "fr", label: "French",     nativeLabel: "Français",    aiName: "French" },
  { code: "de", label: "German",     nativeLabel: "Deutsch",     aiName: "German" },
  { code: "it", label: "Italian",    nativeLabel: "Italiano",    aiName: "Italian" },
  { code: "ru", label: "Russian",    nativeLabel: "Русский",     aiName: "Russian" },
  { code: "ar", label: "Arabic",     nativeLabel: "العربية",     rtl: true, aiName: "Arabic" },
  { code: "zh", label: "Chinese",    nativeLabel: "中文",         aiName: "Chinese (Simplified)" },
  { code: "ja", label: "Japanese",   nativeLabel: "日本語",       aiName: "Japanese" },
  { code: "ko", label: "Korean",     nativeLabel: "한국어",       aiName: "Korean" },
  { code: "hi", label: "Hindi",      nativeLabel: "हिन्दी",        aiName: "Hindi" },
  { code: "tr", label: "Turkish",    nativeLabel: "Türkçe",       aiName: "Turkish" },
  { code: "pl", label: "Polish",     nativeLabel: "Polski",       aiName: "Polish" },
  { code: "nl", label: "Dutch",      nativeLabel: "Nederlands",   aiName: "Dutch" },
];

// Translations: key → per-language string. English is the canonical fallback.
type Dict = Partial<Record<LangCode, string>> & { en: string };
const D = (en: string, rest: Partial<Record<LangCode, string>> = {}): Dict => ({ en, ...rest });

const T: Record<string, Dict> = {
  // Generic
  "common.save":          D("Save",          { es: "Guardar", pt: "Salvar", fr: "Enregistrer", de: "Speichern", it: "Salva", ru: "Сохранить", ar: "حفظ", zh: "保存", ja: "保存", ko: "저장", hi: "सहेजें", tr: "Kaydet", pl: "Zapisz", nl: "Opslaan" }),
  "common.saved":         D("Saved.",        { es: "Guardado.", pt: "Salvo.", fr: "Enregistré.", de: "Gespeichert.", it: "Salvato.", ru: "Сохранено.", ar: "تم الحفظ.", zh: "已保存。", ja: "保存しました。", ko: "저장됨.", hi: "सहेजा गया।", tr: "Kaydedildi.", pl: "Zapisano.", nl: "Opgeslagen." }),
  "common.cancel":        D("Cancel",        { es: "Cancelar", pt: "Cancelar", fr: "Annuler", de: "Abbrechen", it: "Annulla", ru: "Отмена", ar: "إلغاء", zh: "取消", ja: "キャンセル", ko: "취소", hi: "रद्द करें", tr: "İptal", pl: "Anuluj", nl: "Annuleren" }),
  "common.send":          D("Send",          { es: "Enviar", pt: "Enviar", fr: "Envoyer", de: "Senden", it: "Invia", ru: "Отправить", ar: "إرسال", zh: "发送", ja: "送信", ko: "보내기", hi: "भेजें", tr: "Gönder", pl: "Wyślij", nl: "Versturen" }),
  "common.loading":       D("Loading…",      { es: "Cargando…", pt: "Carregando…", fr: "Chargement…", de: "Lädt…", it: "Caricamento…", ru: "Загрузка…", ar: "جارٍ التحميل…", zh: "加载中…", ja: "読み込み中…", ko: "불러오는 중…", hi: "लोड हो रहा है…", tr: "Yükleniyor…", pl: "Wczytywanie…", nl: "Laden…" }),
  "common.language":      D("Language",      { es: "Idioma", pt: "Idioma", fr: "Langue", de: "Sprache", it: "Lingua", ru: "Язык", ar: "اللغة", zh: "语言", ja: "言語", ko: "언어", hi: "भाषा", tr: "Dil", pl: "Język", nl: "Taal" }),
  "common.signOut":       D("Sign out",      { es: "Cerrar sesión", pt: "Sair", fr: "Se déconnecter", de: "Abmelden", it: "Esci", ru: "Выйти", ar: "تسجيل الخروج", zh: "退出登录", ja: "サインアウト", ko: "로그아웃", hi: "साइन आउट", tr: "Çıkış yap", pl: "Wyloguj", nl: "Afmelden" }),

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
  "chat.modeBuild":       D("Build",         { es: "Construir", pt: "Construir", fr: "Construire", de: "Bauen", it: "Costruisci", ru: "Создать", ar: "بناء", zh: "构建", ja: "ビルド", ko: "빌드", hi: "बनाएँ", tr: "İnşa et", pl: "Buduj", nl: "Bouwen" }),
  "chat.chatBanner":      D("Chat mode: BloxSmith will brainstorm and plan with you — it won't create anything in Studio. Switch to Build when you're ready.", { es: "Modo Chat: BloxSmith planificará contigo y no creará nada en Studio. Cambia a Construir cuando estés listo.", pt: "Modo Chat: o BloxSmith vai planejar com você — não cria nada no Studio. Mude para Construir quando estiver pronto.", fr: "Mode Chat : BloxSmith réfléchit avec vous sans rien créer dans Studio. Passez en mode Construire quand vous êtes prêt.", de: "Chat-Modus: BloxSmith plant mit dir und baut nichts in Studio. Wechsle zu Bauen, wenn du bereit bist.", it: "Modalità Chat: BloxSmith pianifica con te e non crea nulla in Studio. Passa a Costruisci quando sei pronto.", ru: "Режим чата: BloxSmith только планирует с вами и ничего не строит в Studio. Переключитесь на «Создать», когда будете готовы.", ar: "وضع المحادثة: سيخطط BloxSmith معك دون إنشاء أي شيء في Studio. انتقل إلى وضع البناء عندما تكون جاهزًا.", zh: "聊天模式：BloxSmith 只会与你头脑风暴，不会在 Studio 创建任何内容。准备好后切换到构建。", ja: "チャットモード：BloxSmith は計画のみで Studio には何も作りません。準備ができたらビルドに切り替えてください。", ko: "채팅 모드: BloxSmith는 함께 계획만 세우고 Studio에는 아무것도 만들지 않습니다. 준비되면 빌드로 전환하세요.", hi: "चैट मोड: BloxSmith आपके साथ योजना बनाएगा — Studio में कुछ नहीं बनाएगा। तैयार होने पर बिल्ड पर स्विच करें।", tr: "Sohbet modu: BloxSmith seninle plan yapar, Studio'da bir şey oluşturmaz. Hazır olduğunda Build'e geç.", pl: "Tryb czatu: BloxSmith tylko planuje z tobą i niczego nie tworzy w Studio. Przełącz na Buduj, gdy jesteś gotów.", nl: "Chat-modus: BloxSmith brainstormt en plant alleen — bouwt niets in Studio. Schakel over naar Bouwen wanneer je klaar bent." }),
  "chat.pushStudio":      D("Push to Studio",{ es: "Enviar a Studio", pt: "Enviar ao Studio", fr: "Envoyer à Studio", de: "An Studio senden", it: "Invia a Studio", ru: "Отправить в Studio", ar: "إرسال إلى Studio", zh: "推送到 Studio", ja: "Studio に送信", ko: "Studio로 보내기", hi: "Studio पर भेजें", tr: "Studio'ya gönder", pl: "Wyślij do Studio", nl: "Naar Studio sturen" }),
  "chat.autoExecute":     D("Auto-execute",  { es: "Ejecución automática", pt: "Execução automática", fr: "Exécution auto", de: "Auto-Ausführung", it: "Esecuzione automatica", ru: "Авто-запуск", ar: "تشغيل تلقائي", zh: "自动执行", ja: "自動実行", ko: "자동 실행", hi: "स्वतः निष्पादन", tr: "Otomatik çalıştır", pl: "Automatyczne wykonanie", nl: "Automatisch uitvoeren" }),
  "chat.autoExecuteHint": D("When off, BloxSmith drafts the build and waits for you to click Push to Studio.", { es: "Cuando está desactivado, BloxSmith prepara la construcción y espera a que pulses Enviar a Studio.", pt: "Quando desativado, o BloxSmith prepara a build e espera você clicar em Enviar ao Studio.", fr: "Désactivé, BloxSmith prépare la build et attend que vous cliquiez sur Envoyer à Studio.", de: "Wenn aus, plant BloxSmith und wartet auf An Studio senden.", it: "Quando disattivato, BloxSmith prepara la build e aspetta che tu prema Invia a Studio.", ru: "Когда выключено, BloxSmith готовит сборку и ждёт нажатия «Отправить в Studio».", ar: "عند الإيقاف، يجهز BloxSmith البناء وينتظر ضغطك على إرسال إلى Studio.", zh: "关闭时，BloxSmith 会准备好构建并等待你点击“推送到 Studio”。", ja: "オフのとき、BloxSmith はビルドを準備し「Studio に送信」を待ちます。", ko: "꺼져 있으면 BloxSmith가 빌드를 준비하고 Studio로 보내기 클릭을 기다립니다.", hi: "बंद होने पर BloxSmith बिल्ड तैयार करेगा और Studio पर भेजें क्लिक का इंतज़ार करेगा।", tr: "Kapalıyken BloxSmith yapıyı hazırlar ve Studio'ya gönder'i beklemeni bekler.", pl: "Gdy wyłączone, BloxSmith przygotowuje build i czeka, aż klikniesz Wyślij do Studio.", nl: "Uit: BloxSmith stelt de build samen en wacht tot je op Naar Studio sturen klikt." }),
  "chat.stop":            D("Stop build",    { es: "Detener", pt: "Parar build", fr: "Arrêter", de: "Build stoppen", it: "Ferma build", ru: "Остановить", ar: "إيقاف البناء", zh: "停止构建", ja: "ビルド停止", ko: "빌드 중지", hi: "बिल्ड रोकें", tr: "Durdur", pl: "Zatrzymaj", nl: "Build stoppen" }),
  "chat.undo":            D("Undo last",     { es: "Deshacer", pt: "Desfazer", fr: "Annuler", de: "Rückgängig", it: "Annulla", ru: "Отменить", ar: "تراجع", zh: "撤销", ja: "元に戻す", ko: "되돌리기", hi: "पूर्ववत करें", tr: "Geri al", pl: "Cofnij", nl: "Ongedaan" }),

  // Plugin status
  "plugin.online":        D("Plugin online", { es: "Plugin en línea", pt: "Plugin online", fr: "Plugin en ligne", de: "Plugin online", it: "Plugin online", ru: "Плагин онлайн", ar: "الإضافة متصلة", zh: "插件在线", ja: "プラグイン接続中", ko: "플러그인 온라인", hi: "प्लगइन ऑनलाइन", tr: "Eklenti çevrimiçi", pl: "Wtyczka online", nl: "Plug-in online" }),
  "plugin.offline":       D("Plugin offline",{ es: "Plugin desconectado", pt: "Plugin offline", fr: "Plugin hors ligne", de: "Plugin offline", it: "Plugin offline", ru: "Плагин не подключён", ar: "الإضافة غير متصلة", zh: "插件离线", ja: "プラグインオフライン", ko: "플러그인 오프라인", hi: "प्लगइन ऑफ़लाइन", tr: "Eklenti çevrimdışı", pl: "Wtyczka offline", nl: "Plug-in offline" }),
};

export function translate(key: string, lang: LangCode): string {
  const entry = T[key];
  if (!entry) return key;
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
