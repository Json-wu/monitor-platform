/**
 * 与仓库 `lib/rss-feeds.ts` 保持一致（Edge 无法 import 扩展源码）。
 * 修改一方时请同步另一方。
 */
export const RSS_FEEDS: Record<string, readonly string[]> = {
  ai: [
    "https://openai.com/news/rss.xml",
    "https://export.arxiv.org/rss/cs.AI",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://www.technologyreview.com/feed/",
    "https://blog.google/technology/ai/rss/",
    "https://deepmind.google/blog/rss.xml",
    "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
    "https://www.qbitai.com/feed"
  ],
  tech: [
    "https://www.theverge.com/rss/index.xml",
    "https://techcrunch.com/feed/",
    "https://www.engadget.com/rss.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"
  ],
  space: [
    "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    "https://spaceflightnow.com/feed/"
  ],
  science: [
    "https://www.sciencedaily.com/rss/all.xml",
    "https://www.newscientist.com/feed/home/?cmpid=RSS"
  ],
  auto: ["https://www.autoblog.com/rss.xml"],
  military: [
    "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml"
  ],
  politics: [
    "https://feeds.bbci.co.uk/news/politics/rss.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://www.politico.eu/feed/"
  ],
  finance: ["https://www.ft.com/?format=rss"],
  business: ["https://feeds.bbci.co.uk/news/business/rss.xml"],
  law: ["https://www.theguardian.com/law/rss"],
  environment: [
    "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    "https://www.theguardian.com/environment/rss"
  ],
  energy: [
    "https://www.theguardian.com/environment/energy/rss",
    "https://www.ft.com/companies/energy?format=rss"
  ],
  medical: ["https://feeds.bbci.co.uk/news/health/rss.xml"],
  wellness: [
    "https://www.psychologytoday.com/us/front/feed",
    "https://www.mindful.org/feed/"
  ],
  education: ["https://www.theguardian.com/education/rss"],
  sports: ["https://www.espn.com/espn/rss/news"],
  games: ["https://www.polygon.com/rss/index.xml"],
  entertainment: [
    "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
    "https://www.hollywoodreporter.com/feed/"
  ],
  art: ["https://www.theguardian.com/culture/rss"],
  history: [
    "https://www.historyextra.com/feed/",
    "https://www.smithsonianmag.com/rss/science-nature/"
  ],
  philosophy: ["https://aeon.co/feed"],
  beauty: ["https://www.allure.com/feed/rss"],
  fashion: [
    "https://www.vogue.com/feed/rss",
    "https://www.businessoffashion.com/feed"
  ],
  women: [
    "https://www.theguardian.com/lifeandstyle/women/rss",
    "https://www.womenshealthmag.com/rss/all.xml/"
  ],
  family: [
    "https://www.theguardian.com/lifeandstyle/family-and-relationships/rss",
    "https://www.scarymommy.com/feed/"
  ],
  food: ["https://www.eater.com/rss/index.xml"],
  travel: [
    "https://www.bbc.com/travel/feed.rss",
    "https://www.theguardian.com/travel/rss",
    "https://www.atlasobscura.com/feeds/latest"
  ],
  pets: [
    "https://www.petmd.com/feed",
    "https://www.theguardian.com/lifeandstyle/pets/rss"
  ],
  career: ["https://www.askamanager.org/feed"],
  agriculture: [
    "https://www.modernfarmer.com/feed/",
    "https://www.agri-pulse.com/rss",
    "https://www.agdaily.com/feed/"
  ]
}

export const BROAD_FALLBACK_FEEDS = [
  "https://feeds.bbci.co.uk/news/rss.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://www.theguardian.com/world/rss",
  "https://www.aljazeera.com/xml/rss/all.xml",
  "https://www.scmp.com/rss/91/feed"
] as const

export function allRssFeedUrls(): string[] {
  const set = new Set<string>()
  for (const urls of Object.values(RSS_FEEDS)) {
    for (const u of urls) {
      set.add(u)
    }
  }
  for (const u of BROAD_FALLBACK_FEEDS) {
    set.add(u)
  }
  return [...set]
}

export function isPresetDomainId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(RSS_FEEDS, id)
}

/** 冷启动 ingest（与 lib/industries.ts DEFAULT_FOLLOW_DOMAINS 同步） */
export const SEED_PRESET_DOMAINS = [
  "tech",
  "environment",
  "entertainment"
] as const

/** 单用户邮件内最多展示的条目数（按时间从新到旧截取） */
export const MAX_DIGEST_ITEMS = 10

/** 每个 feed 最多抓取条目再合并排序 */
export const MAX_ITEMS_PER_FEED = 25
