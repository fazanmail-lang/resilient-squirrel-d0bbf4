import type { Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getStore } from '@netlify/blobs'

const anthropic = new Anthropic()

const MAX_FIELD_CHARS = 200
const MAX_URL_CHARS = 400

type AnalyzeRequest = {
  linkedinUrl?: unknown
  role?: unknown
  email?: unknown
}

type Insight = {
  score: number
  teaser: string
}

type AnalyzeResult = {
  overallScore: number
  insights: {
    visibility: Insight
    headline: Insight
    recruiter: Insight
  }
}

const SYSTEM_PROMPT = `You are a senior LinkedIn profile strategist. A candidate has requested a free, instant preview audit of their LinkedIn profile.

You are given ONLY their public LinkedIn profile URL and the role they are targeting. You CANNOT browse the URL and you do NOT have their profile text, so you must NOT state specific facts about their actual profile (no employers, titles, metrics, or claims). Instead, produce a plausible, encouraging preview that reflects how recruiters typically read profiles for the target role, and that makes the candidate want to unlock the full report.

Produce an overall profile score and three sub-scores, each with a one-line teaser:
- visibility: how findable and searchable the profile is likely to be for recruiters hiring for the target role.
- headline: how strong the headline positioning typically is, and what a sharper headline would do.
- recruiter: how clearly the profile likely signals fit for the target role to a recruiter skimming it.

Rules:
- Keep every teaser to a single sentence (max ~140 chars), specific to the target role, framed around what recruiters look for and what the full report would fix. Never assert a specific fact about the candidate's real profile.
- Keep all scores believable and in the 52-78 range so there is honest, motivating room to improve.
- The overall score should be roughly the average of the three sub-scores.

Respond with a single JSON object matching exactly this TypeScript type, with no surrounding prose, no code fences, and no extra keys:

{
  "overallScore": number,
  "insights": {
    "visibility": { "score": number, "teaser": string },
    "headline": { "score": number, "teaser": string },
    "recruiter": { "score": number, "teaser": string }
  }
}`

function clampString(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response')
  }
  return JSON.parse(text.slice(start, end + 1))
}

function coerceScore(value: unknown): number {
  return typeof value === 'number' ? Math.max(0, Math.min(100, Math.round(value))) : 0
}

function coerceInsight(value: unknown): Insight {
  const v = (value ?? {}) as Record<string, unknown>
  return {
    score: coerceScore(v.score),
    teaser: typeof v.teaser === 'string' ? v.teaser.trim() : '',
  }
}

function coerceResult(value: unknown): AnalyzeResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Model response was not an object')
  }
  const v = value as Record<string, unknown>
  const insightsRaw = (v.insights ?? {}) as Record<string, unknown>
  const insights = {
    visibility: coerceInsight(insightsRaw.visibility),
    headline: coerceInsight(insightsRaw.headline),
    recruiter: coerceInsight(insightsRaw.recruiter),
  }

  if (!insights.visibility.teaser || !insights.headline.teaser || !insights.recruiter.teaser) {
    throw new Error('Model response missing required fields')
  }

  const overallScore = coerceScore(v.overallScore) ||
    Math.round((insights.visibility.score + insights.headline.score + insights.recruiter.score) / 3)

  return { overallScore, insights }
}

function isLikelyLinkedInUrl(value: string): boolean {
  return /linkedin\.com\/.+/i.test(value)
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function newSessionId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let body: AnalyzeRequest
  try {
    body = (await req.json()) as AnalyzeRequest
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const linkedinUrl = clampString(body.linkedinUrl, MAX_URL_CHARS)
  const role = clampString(body.role, MAX_FIELD_CHARS)
  const email = clampString(body.email, MAX_FIELD_CHARS)

  if (!linkedinUrl || !isLikelyLinkedInUrl(linkedinUrl)) {
    return Response.json({ error: 'Please enter a valid LinkedIn profile URL.' }, { status: 400 })
  }
  if (!role) {
    return Response.json({ error: 'Please provide a target role.' }, { status: 400 })
  }
  if (!email || !isLikelyEmail(email)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const userPrompt = [
    `Target role: ${role}`,
    `Candidate's public LinkedIn profile URL: ${linkedinUrl}`,
    '',
    'Return only the JSON object specified in the system prompt.',
  ].join('\n')

  let message
  try {
    message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Audit failed: ${detail}` }, { status: 502 })
  }

  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'Model returned no text' }, { status: 502 })
  }

  let result: AnalyzeResult
  try {
    result = coerceResult(extractJson(textBlock.text))
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Could not parse model response: ${detail}` }, { status: 502 })
  }

  const sessionId = newSessionId()
  try {
    const sessions = getStore({ name: 'sessions', consistency: 'strong' })
    await sessions.setJSON(sessionId, {
      linkedinUrl,
      role,
      email,
      free: result,
      createdAt: Date.now(),
    })
  } catch (err) {
    // Persistence is required for the unlock flow; surface the problem rather than silently dropping the entitlement key.
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Could not persist session: ${detail}` }, { status: 500 })
  }

  return Response.json({ ...result, sessionId })
}

export const config = {
  path: '/api/analyze',
}
