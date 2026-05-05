import type { Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getStore } from '@netlify/blobs'

const anthropic = new Anthropic()

const MAX_PROFILE_CHARS = 12_000
const MAX_FIELD_CHARS = 200

type AnalyzeRequest = {
  profile?: unknown
  role?: unknown
  industry?: unknown
}

type AnalyzeResult = {
  score: number
  headline: string
  postIdea: string
  strengths: string[]
  improvements: string[]
}

const SYSTEM_PROMPT = `You are a senior LinkedIn profile strategist who helps candidates land interviews.
You receive a candidate's pasted LinkedIn profile text, the role they want next, and optionally a target industry.
You produce a brutally honest but constructive analysis grounded only in the text provided.
Never invent experience, employers, metrics, or credentials that are not present in the input.
If the profile is too thin to assess a category, say so plainly inside the relevant field.

Respond with a single JSON object matching exactly this TypeScript type, with no surrounding prose, no code fences, and no extra keys:

{
  "score": number,            // 0-100 recruiter-fit score for the target role, calibrated honestly
  "headline": string,         // a rewritten LinkedIn headline (max ~220 chars) tailored to the target role and grounded in the profile
  "postIdea": string,         // one specific LinkedIn post idea (3-5 sentences) the candidate could publish this week, drawing on something concrete in their profile
  "strengths": string[],      // 3 short bullets (max ~140 chars each) naming real strengths visible in the profile for the target role
  "improvements": string[]    // 3 short bullets (max ~140 chars each) naming the highest-leverage gaps to fix for the target role
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

function coerceResult(value: unknown): AnalyzeResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Model response was not an object')
  }
  const v = value as Record<string, unknown>
  const score = typeof v.score === 'number' ? Math.max(0, Math.min(100, Math.round(v.score))) : 0
  const headline = typeof v.headline === 'string' ? v.headline.trim() : ''
  const postIdea = typeof v.postIdea === 'string' ? v.postIdea.trim() : ''
  const strengths = Array.isArray(v.strengths)
    ? v.strengths.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
    : []
  const improvements = Array.isArray(v.improvements)
    ? v.improvements.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
    : []

  if (!headline || !postIdea) {
    throw new Error('Model response missing required fields')
  }

  return { score, headline, postIdea, strengths, improvements }
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

  const profile = clampString(body.profile, MAX_PROFILE_CHARS)
  const role = clampString(body.role, MAX_FIELD_CHARS)
  const industry = clampString(body.industry, MAX_FIELD_CHARS)

  if (!profile || profile.length < 40) {
    return Response.json(
      { error: 'Please paste a longer LinkedIn profile (at least 40 characters).' },
      { status: 400 },
    )
  }
  if (!role) {
    return Response.json({ error: 'Please provide a target role.' }, { status: 400 })
  }

  const userPrompt = [
    `Target role: ${role}`,
    industry ? `Target industry: ${industry}` : 'Target industry: (not specified)',
    '',
    'LinkedIn profile text (verbatim from the candidate):',
    '"""',
    profile,
    '"""',
    '',
    'Return only the JSON object specified in the system prompt.',
  ].join('\n')

  let message
  try {
    message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Analysis failed: ${detail}` }, { status: 502 })
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
      profile,
      role,
      industry,
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
