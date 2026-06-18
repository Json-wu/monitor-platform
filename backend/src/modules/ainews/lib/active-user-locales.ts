import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

import {
  normalizeArticleLocale,
  type ArticleLocaleKey
} from "./article-locale"

const FALLBACK_LOCALES: ArticleLocaleKey[] = ["en"]

function addLocale(set: Set<ArticleLocaleKey>, raw: unknown) {
  if (typeof raw !== "string") {
    return
  }
  const t = raw.trim()
  if (!t) {
    return
  }
  set.add(normalizeArticleLocale(t))
}

/** 汇总 anon_users + user_extension_preferences 中用户实际使用的界面语言。 */
export async function loadActiveUserLocales(
  admin: SupabaseClient
): Promise<ArticleLocaleKey[]> {
  const set = new Set<ArticleLocaleKey>()

  const { data: anonRows, error: anonErr } = await admin
    .from("anon_users")
    .select("ui_lang")
    .neq("ui_lang", "")
  if (anonErr) {
    console.warn("[active-user-locales] anon_users", anonErr.message)
  } else {
    for (const row of anonRows ?? []) {
      addLocale(set, (row as { ui_lang?: string }).ui_lang)
    }
  }

  const { data: prefRows, error: prefErr } = await admin
    .from("user_extension_preferences")
    .select("ui_lang")
    .neq("ui_lang", "")
  if (prefErr) {
    console.warn("[active-user-locales] user_extension_preferences", prefErr.message)
  } else {
    for (const row of prefRows ?? []) {
      addLocale(set, (row as { ui_lang?: string }).ui_lang)
    }
  }

  if (set.size === 0) {
    return [...FALLBACK_LOCALES]
  }
  return [...set].sort()
}
