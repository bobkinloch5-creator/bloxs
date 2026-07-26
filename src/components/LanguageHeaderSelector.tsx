import { useLang, LANGUAGES, type LangCode } from "@/lib/i18n";
import { Globe, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function LanguageHeaderSelector({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { lang, setLang } = useLang();
  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Change language"
          title="Change language / Cambiar idioma"
          className={`group inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-200 transition hover:border-indigo-400/50 hover:bg-indigo-500/20 hover:text-white ${className}`}
        >
          <Globe className="h-3.5 w-3.5 text-cyan-400 transition-transform duration-300 group-hover:rotate-12" />
          {!compact && (
            <span className="hidden sm:inline-block font-medium">
              {currentLang.nativeLabel}
            </span>
          )}
          <span className="inline-block uppercase tracking-wider text-[11px] text-cyan-300 font-bold sm:hidden">
            {currentLang.code}
          </span>
          <ChevronDown className="h-3 w-3 text-indigo-300/70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="max-h-80 w-56 overflow-y-auto rounded-2xl border border-indigo-500/25 bg-[#0a0a1a]/95 p-1.5 text-white shadow-[0_16px_50px_-10px_rgba(99,102,241,0.4)] backdrop-blur-xl z-50"
      >
        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/80">
          Select Language / Idioma
        </div>
        <div className="h-px bg-white/10 my-1" />
        {LANGUAGES.map((l) => {
          const active = l.code === lang;
          return (
            <DropdownMenuItem
              key={l.code}
              onSelect={() => setLang(l.code)}
              className={`cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                active
                  ? "bg-indigo-500/25 text-white font-bold"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate">
                  <span className="text-white">{l.nativeLabel}</span>
                  <span className="ml-1.5 text-[11px] text-slate-400">
                    ({l.label})
                  </span>
                </span>
                {active && <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
