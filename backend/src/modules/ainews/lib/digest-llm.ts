import type { DigestArticle } from '../ainews-digest-collect';
import type { ArticleLocaleKey } from "./article-locale"
import { normalizeArticleLocale } from "./article-locale"
import { domainDisplayLabel } from "./domain-labels"
import {
  digestOutputLanguageName,
  digestUiStrings
} from "./digest-locale-strings"
import { env } from "./env"

export type DigestBriefSection = {
  domain: string
  domainLabel: string
  events: string
  impact: string
  recommendations: string
}

export type DigestBrief = {
  title: string
  intro: string
  sections: DigestBriefSection[]
  references: Array<{ title: string; url: string }>
}

const DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com"

function extractChatCompletionText(data: unknown): string {
  const root = data as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const text = root.choices?.[0]?.message?.content
  return typeof text === "string" ? text : ""
}

async function callDeepSeek(
  systemContent: string,
  userContent: string,
  maxTokens = 8192
): Promise<string> {
  const deepseekKey = env("DEEPSEEK_API_KEY")
  if (!deepseekKey) {
    throw new Error("DEEPSEEK_API_KEY not set")
  }
  const model = env("DEEPSEEK_MODEL", "deepseek-chat")
  const apiBase = env("DEEPSEEK_API_BASE", DEFAULT_DEEPSEEK_BASE).replace(/\/$/, "")
  const llmRes = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent }
      ],
      temperature: 0.4,
      max_tokens: maxTokens
    })
  })
  if (!llmRes.ok) {
    const errText = await llmRes.text()
    throw new Error(`DeepSeek HTTP ${llmRes.status}: ${errText.slice(0, 200)}`)
  }
  const llmJson: unknown = await llmRes.json()
  const rawText = extractChatCompletionText(llmJson)
  if (!rawText) {
    throw new Error("empty model output")
  }
  return rawText
}

function parseBriefJson(text: string): DigestBrief | null {
  let t = text.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t)
  if (fence) {
    t = fence[1].trim()
  }
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>
    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const intro = typeof parsed.intro === "string" ? parsed.intro.trim() : ""
    const sectionsRaw = parsed.sections
    const sections: DigestBriefSection[] = []
    if (Array.isArray(sectionsRaw)) {
      for (const row of sectionsRaw) {
        if (!row || typeof row !== "object") {
          continue
        }
        const o = row as Record<string, unknown>
        const domain = typeof o.domain === "string" ? o.domain : ""
        const domainLabel =
          typeof o.domainLabel === "string" ? o.domainLabel : domain
        const events = typeof o.events === "string" ? o.events.trim() : ""
        const impact = typeof o.impact === "string" ? o.impact.trim() : ""
        const recommendations =
          typeof o.recommendations === "string" ? o.recommendations.trim() : ""
        if (domain && (events || impact || recommendations)) {
          sections.push({
            domain,
            domainLabel,
            events,
            impact,
            recommendations
          })
        }
      }
    }
    const refsRaw = parsed.references
    const references: Array<{ title: string; url: string }> = []
    if (Array.isArray(refsRaw)) {
      for (const row of refsRaw) {
        if (!row || typeof row !== "object") {
          continue
        }
        const o = row as Record<string, unknown>
        const refTitle = typeof o.title === "string" ? o.title.trim() : ""
        const url = typeof o.url === "string" ? o.url.trim() : ""
        if (refTitle && url) {
          references.push({ title: refTitle, url })
        }
      }
    }
    if (!title || sections.length === 0) {
      return null
    }
    return { title, intro, sections, references }
  } catch {
    return null
  }
}

function buildLlmPayload(
  grouped: Map<string, DigestArticle[]>,
  locale: string,
  dateLabel: string
): string {
  const blocks: Array<Record<string, unknown>> = []
  for (const [domain, items] of grouped) {
    blocks.push({
      domain,
      domainLabel: domainDisplayLabel(domain, locale),
      articles: items.slice(0, 25).map((a) => ({
        title: a.title,
        summary: a.summary.slice(0, 400),
        source: a.source,
        url: a.sourceUrl,
        publishedAt: a.publishedAt
      }))
    })
  }
  return JSON.stringify({ date: dateLabel, domains: blocks })
}

function buildPrompts(
  locale: ArticleLocaleKey,
  payload: string
): { system: string; user: string } {
  const langName = digestOutputLanguageName(locale)
  return {
    system:
      `You are a senior industry analyst and news editor. Output valid JSON only, no markdown fences. ` +
      `Every string value in the JSON (title, intro, domainLabel, events, impact, recommendations, reference titles) MUST be written in ${langName}.`,
    user:
      `Using the following news items from the past 24 hours (grouped by follow domain), write a professional daily industry news brief entirely in ${langName}.\n` +
      `Requirements:\n` +
      `1. For each domain: summarize key events (events, 2–4 short paragraphs, factual)\n` +
      `2. Analyze likely impact (impact, 1–2 paragraphs)\n` +
      `3. Practical recommendations for readers (recommendations, 1–2 paragraphs)\n` +
      `4. domainLabel must be the ${langName} display name for that domain\n` +
      `5. If a domain has few items, summarize briefly without inventing facts\n` +
      `6. references: key source links used (title in ${langName}, url, max 15)\n\n` +
      `Output JSON:\n` +
      `{"title":"...","intro":"...","sections":[{"domain":"id","domainLabel":"localized label","events":"...","impact":"...","recommendations":"..."}],"references":[{"title":"...","url":"..."}]}\n\n` +
      `Input:\n${payload}`
  }
}

export async function generateDailyDigestBrief(
  grouped: Map<string, DigestArticle[]>,
  locale: string,
  dateLabel: string
): Promise<DigestBrief> {
  const uiLocale = normalizeArticleLocale(locale)
  const payload = buildLlmPayload(grouped, uiLocale, dateLabel)
  const { system, user } = buildPrompts(uiLocale, payload)
  const raw = await callDeepSeek(system, user)
  const parsed = parseBriefJson(raw)
  if (parsed) {
    return parsed
  }
  throw new Error("failed to parse daily digest brief JSON")
}

export function briefToPlainText(brief: DigestBrief, locale: string): string {
  const ui = digestUiStrings(normalizeArticleLocale(locale))
  const lines: string[] = [brief.title, "", brief.intro, ""]
  for (const s of brief.sections) {
    lines.push(`## ${s.domainLabel}`)
    lines.push("")
    lines.push(`${ui.events}: ${s.events}`)
    lines.push("")
    lines.push(`${ui.impact}: ${s.impact}`)
    lines.push("")
    lines.push(`${ui.recommendations}: ${s.recommendations}`)
    lines.push("")
  }
  if (brief.references.length > 0) {
    lines.push("---")
    lines.push(ui.referencesPlain)
    for (const r of brief.references) {
      lines.push(`• ${r.title}\n  ${r.url}`)
    }
  }
  return lines.join("\n")
}

export function briefToHtml(
  brief: DigestBrief,
  locale: string,
  escHtml: (s: string) => string
): string {
  const ui = digestUiStrings(normalizeArticleLocale(locale))
  const sectionHtml = brief.sections
    .map((s) => {
      return `<section style="margin:1.25em 0;padding:1em 1.1em;background:#f8fafc;border-radius:8px;border-left:4px solid #0284c7;">
<h2 style="margin:0 0 0.65em;font-size:16px;color:#0f172a;">${escHtml(s.domainLabel)}</h2>
<p style="margin:0.5em 0;font-size:13px;color:#334155;line-height:1.6;"><strong style="color:#475569;">${escHtml(ui.events)}</strong><br/>${escHtml(s.events).replace(/\n/g, "<br/>")}</p>
<p style="margin:0.75em 0;font-size:13px;color:#334155;line-height:1.6;"><strong style="color:#475569;">${escHtml(ui.impact)}</strong><br/>${escHtml(s.impact).replace(/\n/g, "<br/>")}</p>
<p style="margin:0.75em 0 0;font-size:13px;color:#334155;line-height:1.6;"><strong style="color:#475569;">${escHtml(ui.recommendations)}</strong><br/>${escHtml(s.recommendations).replace(/\n/g, "<br/>")}</p>
</section>`
    })
    .join("\n")

  const refs =
    brief.references.length > 0
      ? `<ul style="padding-left:1.2em;margin:0.75em 0 0;font-size:12px;color:#475569;">${brief.references
          .map(
            (r) =>
              `<li style="margin:0.35em 0;"><a href="${escHtml(r.url)}" style="color:#0284c7;">${escHtml(r.title)}</a></li>`
          )
          .join("")}</ul>`
      : ""

  return `<div style="font-family:system-ui,sans-serif;color:#0f172a;line-height:1.55;">
<h1 style="font-size:20px;margin:0 0 0.5em;">${escHtml(brief.title)}</h1>
<p style="font-size:14px;color:#475569;margin:0 0 1.25em;">${escHtml(brief.intro)}</p>
${sectionHtml}
${refs ? `<h3 style="font-size:13px;color:#64748b;margin:1.5em 0 0.5em;">${escHtml(ui.sources)}</h3>${refs}` : ""}
</div>`
}
