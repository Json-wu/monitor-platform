/** Edge 侧领域展示名（与 lib/messages.ts domainLabel 同步） */
import { normalizeArticleLocale } from "./article-locale"

const LABELS_ZH: Record<string, string> = {
  ai: "AI",
  tech: "科技",
  space: "航天",
  science: "科学",
  auto: "汽车",
  military: "军事",
  politics: "政治",
  finance: "金融",
  business: "商业",
  law: "法律",
  environment: "环境",
  energy: "能源",
  medical: "医疗",
  wellness: "身心健康",
  education: "教育",
  sports: "体育",
  games: "游戏",
  entertainment: "娱乐",
  art: "艺术",
  history: "历史",
  philosophy: "哲学",
  beauty: "美容",
  fashion: "时尚",
  women: "女性",
  family: "家庭育儿",
  food: "美食",
  travel: "旅游",
  pets: "宠物",
  career: "职场",
  agriculture: "农业"
}

const LABELS_EN: Record<string, string> = {
  ai: "AI",
  tech: "Technology",
  space: "Space",
  science: "Science",
  auto: "Automotive",
  military: "Defense",
  politics: "Politics",
  finance: "Finance",
  business: "Business",
  law: "Law",
  environment: "Environment",
  energy: "Energy",
  medical: "Healthcare",
  wellness: "Wellness",
  education: "Education",
  sports: "Sports",
  games: "Games",
  entertainment: "Entertainment",
  art: "Arts",
  history: "History",
  philosophy: "Philosophy",
  beauty: "Beauty",
  fashion: "Fashion",
  women: "Women",
  family: "Family & Parenting",
  food: "Food",
  travel: "Travel",
  pets: "Pets",
  career: "Career",
  agriculture: "Agriculture"
}

export function domainDisplayLabel(domainId: string, locale: string): string {
  const id = domainId.trim().toLowerCase()
  const loc = normalizeArticleLocale(locale)
  const map = loc === "zh" ? LABELS_ZH : LABELS_EN
  return map[id] ?? domainId
}
