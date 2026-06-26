import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { useLang, LANGUAGES, type LangCode } from "@/lib/i18n";

/**
 * Mounts inside the authenticated tree. Syncs the persisted profile language
 * with the in-app LanguageProvider in both directions.
 */
export function LanguageSync() {
  const { lang, setLang } = useLang();
  const profileFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const hydrated = useRef(false);
  const save = useMutation({
    mutationFn: (l: LangCode) => updateFn({ data: { language: l } as any }),
  });

  // Pull from profile once it loads (profile wins on first load if different).
  useEffect(() => {
    if (hydrated.current || !profile) return;
    hydrated.current = true;
    const profLang = (profile as any).language as LangCode | undefined;
    if (profLang && LANGUAGES.some((l) => l.code === profLang) && profLang !== lang) {
      setLang(profLang);
    }
  }, [profile, lang, setLang]);

  // Push local changes back to profile.
  useEffect(() => {
    if (!hydrated.current || !profile) return;
    const profLang = (profile as any).language as LangCode | undefined;
    if (lang !== profLang) save.mutate(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return null;
}
