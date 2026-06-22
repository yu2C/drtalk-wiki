type SearchEntry = {
  file: string
  date?: string
  title?: string
  tags?: string[]
  main_point?: string
  summary?: string
  key_insights?: string
  hook?: string
  searchable?: string
}

type Env = {
  AI?: {
    run: (model: string, input: unknown) => Promise<unknown>
  }
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
}

const MODEL = "@cf/meta/llama-3.2-3b-instruct"
const MAX_CONTEXT_CHARS = 9000
const MAX_QUESTION_CHARS = 200
const MAX_ANSWER_CHARS = 1200
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5
const rateLimits = new Map<string, { count: number; resetAt: number }>()

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/api/ask") {
      if (request.method === "GET") {
        return json({
          ok: true,
          endpoint: "/api/ask",
          method: "POST",
          body: { question: "久哥怎麼看財富自由？" },
        })
      }

      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405)
      }

      return handleAsk(request, env)
    }

    return env.ASSETS.fetch(request)
  },
}

async function handleAsk(request: Request, env: Env) {
  const rateLimit = checkRateLimit(request)
  if (!rateLimit.allowed) {
    return json(
      {
        error: "請稍後再試。每分鐘最多 5 次查詢。",
        retry_after_seconds: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      },
      429,
    )
  }

  let question = ""
  try {
    const body = (await request.json()) as { question?: string }
    question = (body.question ?? "").trim()
  } catch {
    return json({ error: "Invalid JSON body." }, 400)
  }

  if (question.length < 2) {
    return json({ error: "Question is too short." }, 400)
  }

  if (question.length > MAX_QUESTION_CHARS) {
    return json({ error: `Question is too long. Maximum is ${MAX_QUESTION_CHARS} characters.` }, 400)
  }

  let matches: SearchEntry[]
  try {
    const index = await loadIndex()
    matches = searchIndex(index, question).slice(0, 8)
  } catch (error) {
    return json(
      {
        error: "Unable to load the public search index.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    )
  }

  if (matches.length === 0) {
    return json({
      answer: "公開資料中沒有找到足夠內容。可以換一個關鍵字，或先用網站搜尋瀏覽相關主題。",
      sources: [],
      mode: "search-only",
    })
  }

  if (!env.AI) {
    return json({
      answer: "目前尚未啟用 Workers AI。先列出最相關的公開資料來源，啟用 AI binding 後會改為生成回答。",
      sources: matches.map(toSource),
      mode: "search-only",
    })
  }

  const context = buildContext(matches)
  const prompt = [
    "你是 DRtalk Wiki 的公開資料問答助手。",
    "只能根據下方公開資料回答；不要使用外部知識，不要補腦。",
    "如果資料不足，請明確說「公開資料中沒有足夠內容」。",
    "回答使用繁體中文，語氣清楚、保守、像知識庫導覽。",
    "回答最後用「來源」列出引用的標題。",
    "",
    `使用者問題：${question}`,
    "",
    "公開資料：",
    context,
  ].join("\n")

  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: "你只根據提供的資料回答，並保留不確定性。",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 650,
      temperature: 0.2,
    })

    return json({
      answer: limitText(extractAiText(result), MAX_ANSWER_CHARS),
      sources: matches.map(toSource),
      mode: "ai",
      model: MODEL,
    })
  } catch (error) {
    return json({
      answer: "Workers AI 呼叫失敗。先列出最相關的公開資料來源，請稍後再試。",
      sources: matches.map(toSource),
      mode: "search-only",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function loadIndex(): Promise<SearchEntry[]> {
  const response = await fetch(
    "https://raw.githubusercontent.com/yu2C/drtalk-wiki/v4/query/search-index.json",
    { cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit,
  )

  if (!response.ok) {
    throw new Error(`Unable to load search index: ${response.status}`)
  }

  const raw = (await response.json()) as Record<string, SearchEntry>
  return Object.values(raw)
}

function searchIndex(entries: SearchEntry[], question: string) {
  const terms = buildTerms(question)
  return entries
    .map((entry) => {
      const title = entry.title ?? ""
      const haystack = [
        title,
        entry.date ?? "",
        ...(entry.tags ?? []),
        entry.main_point ?? "",
        entry.summary ?? "",
        entry.key_insights ?? "",
        entry.hook ?? "",
        entry.searchable ?? "",
      ]
        .join("\n")
        .toLowerCase()

      let score = 0
      for (const term of terms) {
        if (!term) continue
        const weight = title.toLowerCase().includes(term) ? 6 : 1
        score += countOccurrences(haystack, term) * weight
      }

      return { entry, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry)
}

function buildTerms(question: string) {
  const normalized = question.trim().toLowerCase()
  const terms = new Set<string>()
  for (const part of normalized.split(/[\s,，。！？?、]+/)) {
    if (part.length >= 2) terms.add(part)
  }
  for (let i = 0; i < normalized.length - 1; i++) {
    const token = normalized.slice(i, i + 2)
    if (/[\p{Script=Han}a-z0-9]{2}/u.test(token)) terms.add(token)
  }
  return [...terms].slice(0, 80)
}

function countOccurrences(text: string, term: string) {
  let count = 0
  let index = text.indexOf(term)
  while (index !== -1) {
    count++
    index = text.indexOf(term, index + term.length)
  }
  return count
}

function buildContext(entries: SearchEntry[]) {
  let used = 0
  const chunks: string[] = []

  for (const entry of entries) {
    const chunk = [
      `標題：${entry.title ?? entry.file}`,
      `日期：${entry.date ?? "unknown"}`,
      `路徑：${entry.file}`,
      `重點：${entry.main_point ?? ""}`,
      `摘要：${entry.summary ?? ""}`,
      `關鍵觀點：${entry.key_insights ?? ""}`,
      `hook：${entry.hook ?? ""}`,
    ].join("\n")

    if (used + chunk.length > MAX_CONTEXT_CHARS) break
    used += chunk.length
    chunks.push(chunk)
  }

  return chunks.join("\n\n---\n\n")
}

function toSource(entry: SearchEntry) {
  return {
    title: entry.title ?? entry.file,
    date: entry.date,
    file: entry.file,
    url: toUrl(entry.file),
  }
}

function toUrl(file: string) {
  const path = file.replace(/\.md$/, "")
  return `/${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`
}

function extractAiText(result: unknown) {
  if (typeof result === "string") return result
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>
    if (typeof record.response === "string") return record.response
    if (typeof record.result === "string") return record.result
    if (typeof record.text === "string") return record.text
  }
  return "Workers AI 已回應，但格式無法解析。請查看來源連結。"
}

function checkRateLimit(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  const now = Date.now()

  for (const [key, bucket] of rateLimits) {
    if (bucket.resetAt <= now) rateLimits.delete(key)
  }

  const bucket = rateLimits.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS
    rateLimits.set(ip, { count: 1, resetAt })
    return { allowed: true, resetAt }
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, resetAt: bucket.resetAt }
  }

  bucket.count += 1
  return { allowed: true, resetAt: bucket.resetAt }
}

function limitText(text: string, maxChars: number) {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, maxChars)}...`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
