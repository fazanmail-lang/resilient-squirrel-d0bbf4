import type { Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getStore } from '@netlify/blobs'

const anthropic = new Anthropic()

type Product = 'audit' | 'interview'

type UnlockRequest = {
  sessionId?: unknown
  product?: unknown
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

type AuditReport = {
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

type LikelyQuestion = {
  question: string
  category: string
  approach: string
}

type StarAnswer = {
  question: string
  situation: string
  task: string
  action: string
  result: string
}

type SmartQuestion = {
  question: string
  why: string
}

type SalaryScript = {
  scenario: string
  script: string
}

type PrepDay = {
  day: string
  focus: string
  tasks: string[]
}

type InterviewReport = {
  likelyQuestions: LikelyQuestion[]
  starAnswers: StarAnswer[]
  smartQuestions: SmartQuestion[]
  salaryPlaybook: {
    anchorRangeRationale: string
    scripts: SalaryScript[]
  }
  prepPlan: PrepDay[]
}

const AUDIT_SYSTEM_PROMPT = `You are an elite LinkedIn career strategist and recruiter (15+ years placing senior candidates at top firms). You write the deliverables a candidate would receive after paying for a one-on-one engagement.

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

const INTERVIEW_SYSTEM_PROMPT = `You are an elite interview coach (15+ years preparing senior candidates for interviews at top firms). You write the prep dossier a candidate would receive after paying for an intensive one-on-one coaching engagement.

You are given:
1. The candidate's pasted LinkedIn profile (verbatim).
2. Their target role and optional target industry.
3. The free-tier audit (score, headline rewrite, strengths, improvements).

Your job is to produce five interview-prep deliverables, all grounded strictly in evidence from the candidate's profile. NEVER invent employers, titles, dates, metrics, or credentials that are not in the source. If the profile is thin in a given area, write that section cautiously and tell the candidate where to fill the gap.

Voice: direct, specific, recruiter-grade British English. No filler ("essentially", "passionate about"), no clichés, no emoji. STAR answers and salary scripts are written in first person for the candidate to rehearse aloud.

Calibrate the difficulty and seniority of every deliverable to the target role. The questions should be the ones THIS candidate will most plausibly face given their level and trajectory.

Respond with EXACTLY one JSON object, no surrounding prose, no code fences, no extra keys, matching this TypeScript type:

{
  "likelyQuestions": [                // Exactly 10 questions. Mix categories: at least 3 Behavioural, at least 2 Role-specific/Technical, at least 2 Motivation/Fit, plus Leadership/Strategy as appropriate to seniority.
    {
      "question": string,             // The question, verbatim, as an interviewer would ask it. 1-2 sentences.
      "category": string,             // One of: "Behavioural", "Technical", "Role-specific", "Motivation", "Leadership", "Strategy".
      "approach": string              // 3-4 sentences. How to answer it: the framework to use AND specific evidence from this candidate's profile they should reach for. Name the role, project, or metric by reference.
    }
  ],
  "starAnswers": [                    // Exactly 5 STAR answers, each drawn from a DIFFERENT role/project/period in the profile. Cover a range of common behavioural prompts (conflict, ambiguity, ownership, failure, leadership/influence).
    {
      "question": string,             // The behavioural question this answer addresses, e.g. "Tell me about a time you led a project through significant ambiguity."
      "situation": string,            // 2-3 sentences. Anchored to a specific role, team, and period from the candidate's actual profile.
      "task": string,                 // 1-2 sentences naming the candidate's specific responsibility.
      "action": string,               // 4-5 sentences. The bulk of the answer: what THEY personally did, decisions they made, trade-offs they navigated.
      "result": string                // 2-3 sentences. Quantified where the profile supports it; otherwise describe the qualitative outcome and what they learned.
    }
  ],
  "smartQuestions": [                 // Exactly 8 questions the candidate should ask the interviewer. Mix: 2 about the role/scope, 2 about the team, 2 about strategy/business, 2 about success criteria/growth.
    {
      "question": string,             // The question to ask, written exactly as the candidate would say it.
      "why": string                   // 1-2 sentences. Why asking this signals seniority and fit, and what the candidate should listen for in the answer.
    }
  ],
  "salaryPlaybook": {
    "anchorRangeRationale": string,   // 3-5 sentences. Reasoning for how the candidate should think about their anchor range, given their seniority signals from the profile and the target role/industry. Do NOT invent specific numbers — instruct the candidate to triangulate from Levels.fyi, Glassdoor, and Blind for their location, and explain how to position within that range.
    "scripts": [                      // Exactly 3 scripts.
      {
        "scenario": string,           // One of: "When asked your expected salary on the first call", "Counter-offer when their first number is below your range", "How to walk away (and keep the door open) if they won't move".
        "script": string              // 4-6 sentences. First person, ready to rehearse. Polite but firm. Explicit about what the candidate is asking for and why.
      }
    ]
  },
  "prepPlan": [                       // Exactly 7 entries, one per day in the week before the interview. Day 1 = furthest out (7 days before); Day 7 = day of interview.
    {
      "day": string,                  // "Day 1 (7 days out)", "Day 2 (6 days out)", ..., "Day 7 (interview day)".
      "focus": string,                // ~10 words. The strategic focus of that day.
      "tasks": string[]               // 3-4 concrete tasks for that day, specific enough to act on.
    }
  ]
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

function coerceAudit(value: unknown): AuditReport {
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

function coerceInterview(value: unknown): InterviewReport {
  if (!value || typeof value !== 'object') {
    throw new Error('Interview response was not an object')
  }
  const v = value as Record<string, unknown>

  const likelyRaw = Array.isArray(v.likelyQuestions) ? v.likelyQuestions : []
  const likelyQuestions: LikelyQuestion[] = likelyRaw.map((q) => {
    const r = (q ?? {}) as Record<string, unknown>
    return {
      question: asString(r.question),
      category: asString(r.category),
      approach: asString(r.approach),
    }
  })

  const starRaw = Array.isArray(v.starAnswers) ? v.starAnswers : []
  const starAnswers: StarAnswer[] = starRaw.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>
    return {
      question: asString(r.question),
      situation: asString(r.situation),
      task: asString(r.task),
      action: asString(r.action),
      result: asString(r.result),
    }
  })

  const smartRaw = Array.isArray(v.smartQuestions) ? v.smartQuestions : []
  const smartQuestions: SmartQuestion[] = smartRaw.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>
    return { question: asString(r.question), why: asString(r.why) }
  })

  const salaryRaw = (v.salaryPlaybook ?? {}) as Record<string, unknown>
  const salaryScriptsRaw = Array.isArray(salaryRaw.scripts) ? salaryRaw.scripts : []
  const salaryPlaybook = {
    anchorRangeRationale: asString(salaryRaw.anchorRangeRationale),
    scripts: salaryScriptsRaw.map((s) => {
      const r = (s ?? {}) as Record<string, unknown>
      return { scenario: asString(r.scenario), script: asString(r.script) }
    }),
  }

  const prepRaw = Array.isArray(v.prepPlan) ? v.prepPlan : []
  const prepPlan: PrepDay[] = prepRaw.map((d) => {
    const r = (d ?? {}) as Record<string, unknown>
    const tasks = Array.isArray(r.tasks)
      ? r.tasks.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
      : []
    return { day: asString(r.day), focus: asString(r.focus), tasks }
  })

  if (likelyQuestions.length === 0 || starAnswers.length === 0 || prepPlan.length === 0 || !salaryPlaybook.anchorRangeRationale) {
    throw new Error('Interview response missing required fields')
  }

  return { likelyQuestions, starAnswers, smartQuestions, salaryPlaybook, prepPlan }
}

function storesFor(product: Product) {
  if (product === 'interview') {
    return {
      paid: getStore({ name: 'paid-interview-sessions', consistency: 'strong' }),
      reports: getStore({ name: 'interview-reports', consistency: 'strong' }),
    }
  }
  return {
    paid: getStore({ name: 'paid-sessions', consistency: 'strong' }),
    reports: getStore({ name: 'premium-reports', consistency: 'strong' }),
  }
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

  const product: Product = body.product === 'interview' ? 'interview' : 'audit'

  const sessions = getStore({ name: 'sessions', consistency: 'strong' })
  const { paid, reports } = storesFor(product)

  const entitlement = await paid.get(sessionId, { type: 'json' })
  if (!entitlement) {
    return Response.json({ error: 'Payment not yet confirmed.', status: 'pending', product }, { status: 402 })
  }

  // Reuse a previously generated report so the candidate can reload without re-spending tokens or money.
  const cached = await reports.get(sessionId, { type: 'json' })
  if (cached) {
    return Response.json({ status: 'ready', product, report: cached })
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
    product === 'interview'
      ? 'Produce the interview-prep deliverables now. Return only the JSON object specified in the system prompt.'
      : 'Produce the premium deliverables now. Return only the JSON object specified in the system prompt.',
  ].join('\n')

  let message
  try {
    message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: product === 'interview' ? 7000 : 6000,
      system: product === 'interview' ? INTERVIEW_SYSTEM_PROMPT : AUDIT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Generation failed: ${detail}` }, { status: 502 })
  }

  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'Model returned no text' }, { status: 502 })
  }

  let report: AuditReport | InterviewReport
  try {
    const parsed = extractJson(textBlock.text)
    report = product === 'interview' ? coerceInterview(parsed) : coerceAudit(parsed)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Could not parse model response: ${detail}` }, { status: 502 })
  }

  try {
    await reports.setJSON(sessionId, report)
  } catch {
    // Caching is best-effort. Returning the report is the priority.
  }

  return Response.json({ status: 'ready', product, report })
}

export const config = {
  path: '/api/unlock',
}
