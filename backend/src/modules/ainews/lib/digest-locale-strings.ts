import type { ArticleLocaleKey } from "./article-locale"
import { localeDisplayName } from "./article-locale"

export type DigestUiStrings = {
  events: string
  impact: string
  recommendations: string
  sources: string
  referencesPlain: string
  unsubscribeSettings: string
  unsubscribeLink: string
  compliance: (timezone: string) => string
  compliancePlain: (timezone: string) => string
  subjectSuffix: string
  trialSubjectPrefix?: string
  trialCompliance?: string
  htmlLang: string
}

const STRINGS: Record<ArticleLocaleKey, DigestUiStrings> = {
  zh: {
    events: "事件",
    impact: "影响",
    recommendations: "建议",
    sources: "参考来源",
    referencesPlain: "参考链接：",
    unsubscribeSettings: "若不想再收，可在扩展「设置」中关闭邮件简报。",
    unsubscribeLink: "点击退订邮件简报",
    compliance: (tz) =>
      `您已订阅 Aivelo Industry AI News 每日汇总（本地时区 ${tz} 22:00 发送）。内容基于您关注领域过去 24 小时内入库的新闻，由 AI 生成简报，不含个性化广告。`,
    compliancePlain: (tz) => `每日汇总 · 时区 ${tz} · 22:00 · 过去 24 小时新闻`,
    subjectSuffix: "Aivelo 每日汇总",
    trialSubjectPrefix: "【体验】",
    trialCompliance:
      "这是一封一次性体验邮件：展示 Industry AI News 每日 AI 汇总简报样例。升级 Unlimited 可在本地时区 22:00 每日接收；不含个性化广告。",
    htmlLang: "zh-CN"
  },
  en: {
    events: "Events",
    impact: "Impact",
    recommendations: "Recommendations",
    sources: "Sources",
    referencesPlain: "References:",
    unsubscribeSettings:
      "To unsubscribe, turn off the email digest in extension Settings.",
    unsubscribeLink: "Unsubscribe from email digest",
    compliance: (tz) =>
      `You subscribed to the Aivelo Industry AI News daily digest (sent at 22:00 in ${tz}). Content covers news from your follow domains in the past 24 hours, summarized by AI. No personalized ads.`,
    compliancePlain: (tz) => `Daily digest · ${tz} · 22:00 · past 24h news`,
    subjectSuffix: "Aivelo Daily Digest",
    trialSubjectPrefix: "[Trial] ",
    trialCompliance:
      "This is a one-time sample of the Industry AI News daily AI digest. Upgrade to Unlimited for daily delivery at 22:00 in your timezone. No personalized ads.",
    htmlLang: "en"
  },
  ja: {
    events: "出来事",
    impact: "影響",
    recommendations: "提言",
    sources: "参考ソース",
    referencesPlain: "参考リンク：",
    unsubscribeSettings:
      "配信停止は拡張機能の「設定」でメールブリーフをオフにしてください。",
    unsubscribeLink: "メール配信を停止",
    compliance: (tz) =>
      `Aivelo Industry AI News のデイリーダイジェスト（${tz} の現地時間 22:00 配信）に登録しています。過去 24 時間のフォロー分野ニュースを AI が要約します。`,
    compliancePlain: (tz) => `デイリーダイジェスト · ${tz} · 22:00 · 過去 24 時間`,
    subjectSuffix: "Aivelo デイリーダイジェスト",
    htmlLang: "ja"
  },
  ko: {
    events: "주요 사건",
    impact: "영향",
    recommendations: "제안",
    sources: "참고 출처",
    referencesPlain: "참고 링크:",
    unsubscribeSettings:
      "수신 거부는 확장 프로그램 「설정」에서 이메일 브리핑을 끄세요.",
    unsubscribeLink: "이메일 수신 거부",
    compliance: (tz) =>
      `Aivelo Industry AI News 일일 브리핑(${tz} 현지 시간 22:00 발송)을 구독 중입니다. 지난 24시간 팔로우 분야 뉴스를 AI가 요약합니다.`,
    compliancePlain: (tz) => `일일 브리핑 · ${tz} · 22:00 · 지난 24시간`,
    subjectSuffix: "Aivelo 일일 브리핑",
    htmlLang: "ko"
  },
  fr: {
    events: "Événements",
    impact: "Impacts",
    recommendations: "Recommandations",
    sources: "Sources",
    referencesPlain: "Liens de référence :",
    unsubscribeSettings:
      "Pour vous désabonner, désactivez le digest e-mail dans les Paramètres de l’extension.",
    unsubscribeLink: "Se désabonner",
    compliance: (tz) =>
      `Vous êtes abonné au digest quotidien Aivelo Industry AI News (envoi à 22:00, fuseau ${tz}). Actualités des 24 dernières heures, résumées par IA.`,
    compliancePlain: (tz) => `Digest quotidien · ${tz} · 22:00 · 24 h`,
    subjectSuffix: "Digest quotidien Aivelo",
    htmlLang: "fr"
  },
  de: {
    events: "Ereignisse",
    impact: "Auswirkungen",
    recommendations: "Empfehlungen",
    sources: "Quellen",
    referencesPlain: "Referenzlinks:",
    unsubscribeSettings:
      "Abmelden: E-Mail-Digest in den Erweiterungseinstellungen deaktivieren.",
    unsubscribeLink: "Abmelden",
    compliance: (tz) =>
      `Sie abonnieren den täglichen Aivelo Industry AI News Digest (Versand 22:00 Uhr, Zeitzone ${tz}). Nachrichten der letzten 24 Stunden, KI-Zusammenfassung.`,
    compliancePlain: (tz) => `Täglicher Digest · ${tz} · 22:00 · 24 h`,
    subjectSuffix: "Aivelo Tagesdigest",
    htmlLang: "de"
  },
  es: {
    events: "Eventos",
    impact: "Impacto",
    recommendations: "Recomendaciones",
    sources: "Fuentes",
    referencesPlain: "Enlaces de referencia:",
    unsubscribeSettings:
      "Para cancelar, desactiva el digest por correo en Ajustes de la extensión.",
    unsubscribeLink: "Cancelar suscripción",
    compliance: (tz) =>
      `Estás suscrito al digest diario de Aivelo Industry AI News (envío a las 22:00, zona ${tz}). Noticias de las últimas 24 horas resumidas por IA.`,
    compliancePlain: (tz) => `Digest diario · ${tz} · 22:00 · 24 h`,
    subjectSuffix: "Digest diario Aivelo",
    htmlLang: "es"
  },
  pt: {
    events: "Eventos",
    impact: "Impacto",
    recommendations: "Recomendações",
    sources: "Fontes",
    referencesPlain: "Links de referência:",
    unsubscribeSettings:
      "Para cancelar, desative o digest por e-mail nas Configurações da extensão.",
    unsubscribeLink: "Cancelar inscrição",
    compliance: (tz) =>
      `Você assina o digest diário Aivelo Industry AI News (envio às 22:00, fuso ${tz}). Notícias das últimas 24 horas resumidas por IA.`,
    compliancePlain: (tz) => `Digest diário · ${tz} · 22:00 · 24 h`,
    subjectSuffix: "Digest diário Aivelo",
    htmlLang: "pt"
  },
  ru: {
    events: "События",
    impact: "Влияние",
    recommendations: "Рекомендации",
    sources: "Источники",
    referencesPlain: "Ссылки:",
    unsubscribeSettings:
      "Чтобы отписаться, отключите e-mail-дайджест в настройках расширения.",
    unsubscribeLink: "Отписаться",
    compliance: (tz) =>
      `Вы подписаны на ежедневный дайджест Aivelo Industry AI News (отправка в 22:00, ${tz}). Новости за 24 часа, сводка ИИ.`,
    compliancePlain: (tz) => `Ежедневный дайджест · ${tz} · 22:00 · 24 ч`,
    subjectSuffix: "Ежедневный дайджест Aivelo",
    htmlLang: "ru"
  },
  hi: {
    events: "घटनाएँ",
    impact: "प्रभाव",
    recommendations: "सुझाव",
    sources: "स्रोत",
    referencesPlain: "संदर्भ लिंक:",
    unsubscribeSettings:
      "सदस्यता रद्द करने के लिए एक्सटेंशन सेटिंग में ईमेल डाइजेस्ट बंद करें।",
    unsubscribeLink: "सदस्यता रद्द करें",
    compliance: (tz) =>
      `आप Aivelo Industry AI News दैनिक डाइजेस्ट (${tz} में 22:00) की सदस्यता में हैं। पिछले 24 घंटे की खबरें, AI सारांश।`,
    compliancePlain: (tz) => `दैनिक डाइजेस्ट · ${tz} · 22:00 · 24 घं.`,
    subjectSuffix: "Aivelo दैनिक डाइजेस्ट",
    htmlLang: "hi"
  }
}

export function digestUiStrings(locale: ArticleLocaleKey): DigestUiStrings {
  return STRINGS[locale] ?? STRINGS.en
}

export function digestOutputLanguageName(locale: ArticleLocaleKey): string {
  return localeDisplayName(locale)
}

export function trialDigestCopy(locale: ArticleLocaleKey): {
  subjectPrefix: string
  compliance: string
} {
  const ui = digestUiStrings(locale)
  const en = STRINGS.en
  return {
    subjectPrefix: ui.trialSubjectPrefix ?? en.trialSubjectPrefix ?? "[Trial] ",
    compliance:
      ui.trialCompliance ??
      en.trialCompliance ??
      "One-time sample of the Industry AI News daily digest."
  }
}
