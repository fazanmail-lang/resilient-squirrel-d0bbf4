import type { Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getStore } from '@netlify/blobs'

const anthropic = new Anthropic()

type UnlockRequest = {
  sessionId?: unknown
}

type StoredFreeResult = {
  score: number
  headline: string
  postIdea: string
  strengths: string[]
  improvements: string[]
}

type StoredSession = {
  profile: string
  role: string
  industry: string
  free: StoredFreeResult
  createdAt: number
}

type OutreachScript = {
  subject: string
  body: string
}

type ContentPlanPost = {
  day: string
  format: string
  hook: string
  angle: string
}

type ContentPlanWeek = {
  week: number
  theme: string
  posts: ContentPlanPost[]
}

type PremiumReport = {
  aboutRewrite: string
  outreachScripts: {
    hiringManager: OutreachScript
    recruiter: OutreachScript
    warmReferral: OutreachScript
  }
  contentPlan: ContentPlanWeek[]
  positioning: {
    statement: string
    rationale: string
  }
}

const PREMIUM_SYSTEM_PROMPT = `You are an elite LinkedIn career strategist and recruiter (15+ years placing senior candidates at top firms). You write the deliverables a candidate would receive after paying for a one-on-one engagement.

You are given:
1. The candidate's pasted LinkedIn profile (verbatim).
2. Their target role and optional target industry.
3. The free-tier audit you previously produced (score, headline rewrite, strengths, improvements).

Your job is to produce four premium deliverables, all grounded strictly in evidence from the profile. NEVER invent employers, titles, dates, metrics, or credentials that are not present. If a category cannot be justified by the profile, write it cautiously rather than fabricating detail.

Voice: confident, specific, recruiter-grade British English. Direct, not flowery. No buzzword soup, no "passionate about", no "results-driven", no emoji except where explicitly requested in the content plan. First person where the deliverable is written for the candidate to use.

Tailor everything to the target role. If the profile is sparse, say so honestly inside the deliverable while still doing the strategic work. Re-use the strengths and improvements you already identified — the premium output should feel like a logical continuation of the free audit, not a contradiction.

Respond with EXACTLY one JSON object, no surrounding prose, no code fences, no extra keys, matching this TypeScript type:

{
  "aboutRewrite": string,             // A complete LinkedIn About section the candidate can paste in. 1800-2400 characters. First person. Opens with a hook line that names the outcome they create. Includes 2-4 short paragraphs separated by blank lines. Embeds 6-10 keywords a recruiter would search for the target role. Ends with a clear call-to-action (e.g. "If you're hiring for X, message me here or at..."). Use only experience, skills, and metrics that appear in the source profile.
  "outreachScripts": {
    "hiringManager": { "subject": string, "body": string },   // Cold message to a hiring manager at a target company. Subject under 60 chars. Body 80-130 words. References a plausible reason for reaching out (e.g. their team, their stack, a job post) without inventing facts about that company. Closes with a low-friction ask (15 min call, or 'reply yes/no').
    "recruiter": { "subject": string, "body": string },        // Cold message to an in-house or agency recruiter who works the target role/industry. Subject under 60 chars. Body 80-130 words. Lead with the candidate's strongest quantified outcome from the profile. Be explicit about the role(s) they're open to.
    "warmReferral": { "subject": string, "body": string }      // Message to a former colleague / classmate / weak tie asking for a referral or intro. Subject under 60 chars. Body 80-130 words. Acknowledge the relationship, name the specific role/team they want introduced to, make the ask easy to forward (include a one-line blurb the contact can paste).
  },
  "contentPlan": [                    // Exactly 4 entries, weeks 1-4. Posts must build a coherent narrative arc that culminates in inbound interest from recruiters in the target role.
    {
      "week": number,                 // 1, 2, 3, or 4
      "theme": string,                // ~10 words. The strategic point of this week (e.g. "Week 1 — Establish authority on <topic the profile actually demonstrates>").
      "posts": [                      // Exactly 3 posts per week, 12 posts total across 30 days.
        {
          "day": string,              // "Monday" / "Wednesday" / "Friday" — pick the cadence that fits each week.
          "format": string,           // Post format: "Story post", "Carousel (5 slides)", "Short text post", "Poll", "Comment-bait question", "Lessons-learned list", etc.
          "hook": string,             // The literal first 1-2 lines of the post (what shows above the 'see more' fold). Specific and curiosity-inducing. Max 220 chars.
          "angle": string             // 2-3 sentences explaining what the post argues, what evidence from the profile it draws on, and why it moves the candidate toward the target role.
        }
      ]
    }
  ],
  "positioning": {
    "statement": string,              // ONE sentence (max 35 words). Format: "I help <who> <achieve outcome> by <unique mechanism>." Must be specific enough that a recruiter could decide in 5 seconds whether to message. No buzzwords.
    "rationale": string               // 3-5 sentences explaining why this positioning fits the candidate's actual evidence, what alternatives were rejected and why, and how the candidate should use it (headline, About opener, networking intro).
  }
}`

function clampString(value: unknown, max = 64): string {
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

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function asScript(v: unknown): OutreachScript {
  if (!v || typeof v !== 'object') return { subject: '', body: '' }
  const r = v as Record<string, unknown>
  return { subject: asString(r.subject), body: asString(r.body) }
}

function coercePremium(value: unknown): PremiumReport {
  if (!value || typeof value !== 'object') {
    throw new Error('Premium response was not an object')
  }
  const v = value as Record<string, unknown>

  const scriptsRaw = (v.outreachScripts ?? {}) as Record<string, unknown>
  const outreachScripts = {
    hiringManager: asScript(scriptsRaw.hiringManager),
    recruiter: asScript(scriptsRaw.recruiter),
    warmReferral: asScript(scriptsRaw.warmReferral),
  }

  const contentPlanRaw = Array.isArray(v.contentPlan) ? v.contentPlan : []
  const contentPlan: ContentPlanWeek[] = contentPlanRaw.map((entry, idx) => {
    const e = (entry ?? {}) as Record<string, unknown>
    const postsRaw = Array.isArray(e.posts) ? e.posts : []
    return {
      week: typeof e.week === 'number' ? e.week : idx + 1,
      theme: asString(e.theme),
      posts: postsRaw.map((p) => {
        const post = (p ?? {}) as Record<string, unknown>
        return {
          day: asString(post.day),
          format: asString(post.format),
          hook: asString(post.hook),
          angle: asString(post.angle),
        }
      }),
    }
  })

  const positioningRaw = (v.positioning ?? {}) as Record<string, unknown>
  const positioning = {
    statement: asString(positioningRaw.statement),
    rationale: asString(positioningRaw.rationale),
  }

  const aboutRewrite = asString(v.aboutRewrite)
  if (!aboutRewrite || !positioning.statement || contentPlan.length === 0) {
    throw new Error('Premium response missing required fields')
  }

  return { aboutRewrite, outreachScripts, contentPlan, positioning }
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let body: UnlockRequest
  try {
    body = (await req.json()) as UnlockRequest
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sessionId = clampString(body.sessionId, 64)
  if (!sessionId || !/^[a-f0-9]{16,64}$/i.test(sessionId)) {
    return Response.json({ error: 'Missing or invalid sessionId.' }, { status: 400 })
  }

  const sessions = getStore({ name: 'sessions', consistency: 'strong' })
  const paid = getStore({ name: 'paid-sessions', consistency: 'strong' })
  const reports = getStore({ name: 'premium-reports', consistency: 'strong' })

  const entitlement = await paid.get(sessionId, { type: 'json' })
  if (!entitlement) {
    return Response.json({ error: 'Payment not yet confirmed.', status: 'pending' }, { status: 402 })
  }

  // Reuse a previously generated report so the candidate can reload without re-spending tokens or money.
  const cached = (await reports.get(sessionId, { type: 'json' })) as PremiumReport | null
  if (cached) {
    return Response.json({ status: 'ready', report: cached })
  }

  const session = (await sessions.get(sessionId, { type: 'json' })) as StoredSession | null
  if (!session) {
    return Response.json({ error: 'Session expired or not found.' }, { status: 404 })
  }

  const userPrompt = [
    `Target role: ${session.role}`,
    session.industry ? `Target industry: ${session.industry}` : 'Target industry: (not specified)',
    '',
    'Free-tier audit produced for this candidate (already shown to them):',
    JSON.stringify(session.free, null, 2),
    '',
    'LinkedIn profile text (verbatim from the candidate):',
    '"""',
    session.profile,
    '"""',
    '',
    'Produce the premium deliverables now. Return only the JSON object specified in the system prompt.',
  ].join('\n')

  let message
  try {
    message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 6000,
      system: PREMIUM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Premium generation failed: ${detail}` }, { status: 502 })
  }

  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'Model returned no text' }, { status: 502 })
  }

  let report: PremiumReport
  try {
    report = coercePremium(extractJson(textBlock.text))
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Could not parse premium response: ${detail}` }, { status: 502 })
  }

  try {
    await reports.setJSON(sessionId, report)
  } catch {
    // Caching is best-effort. Returning the report is the priority.
  }

  return Response.json({ status: 'ready', report })
}

export const config = {
  path: '/api/unlock',
}
