import type { Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getStore } from '@netlify/blobs'

const anthropic = new Anthropic()

type Product = 'audit' | 'interview' | 'career' | 'executive'

type UnlockRequest = {
  sessionId?: unknown
  product?: unknown
}

type StoredFreeResult = {
  overallScore: number
  insights: {
    visibility: { score: number; teaser: string }
    headline: { score: number; teaser: string }
    recruiter: { score: number; teaser: string }
  }
}

type StoredSession = {
  linkedinUrl: string
  role: string
  email: string
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

type CvExperience = {
  title: string
  company: string
  period: string
  bullets: string[]
}

type CvRewrite = {
  summary: string
  experience: CvExperience[]
  skills: string[]
  education: string[]
}

type RoadmapMonth = {
  month: number
  focus: string
  objective: string
  milestones: string[]
}

type SkillsGapItem = {
  skill: string
  whyItMatters: string
  howToDemonstrate: string
}

type NetworkingTarget = {
  priority: string
  who: string
  why: string
}

type NetworkingScript = {
  scenario: string
  subject: string
  body: string
}

type CareerReport = {
  cvRewrite: CvRewrite
  roadmap: RoadmapMonth[]
  skillsGapPlan: SkillsGapItem[]
  networkingPlan: {
    targets: NetworkingTarget[]
    scripts: NetworkingScript[]
  }
  brandStory: {
    headline: string
    elevatorPitch: string
    whyThisRole: string
    signatureStory: string
  }
}

type KeynoteTopic = {
  topic: string
  angle: string
  targetVenue: string
}

type ThoughtLeadership = {
  signaturePov: {
    thesis: string
    supportingArgument: string
  }
  keynoteTopics: KeynoteTopic[]
  publicationTargets: string[]
}

type ExecutiveBio = {
  shortBio: string
  conferenceBio: string
  fullBio: string
}

type LinkedinExperienceBullet = {
  title: string
  company: string
  bullets: string[]
}

type LinkedinOverhaul = {
  headline: string
  aboutSection: string
  featuredSectionStrategy: string[]
  experienceBullets: LinkedinExperienceBullet[]
}

type PresencePillar = {
  pillar: string
  currentAssessment: string
  actionPlan: string
}

type ExecutivePresence = {
  pillars: PresencePillar[]
  boardMeetingGuidance: string
  interviewPresenceTips: string
}

type StakeholderScript = {
  scenario: string
  context: string
  script: string
}

type ExecutiveReport = {
  thoughtLeadership: ThoughtLeadership
  executiveBio: ExecutiveBio
  linkedinOverhaul: LinkedinOverhaul
  executivePresence: ExecutivePresence
  stakeholderScripts: StakeholderScript[]
}

const AUDIT_SYSTEM_PROMPT = `You are an elite LinkedIn career strategist and recruiter (15+ years placing senior candidates at top firms). You write the deliverables a candidate would receive after paying for a one-on-one engagement.

You are given:
1. The candidate's public LinkedIn profile URL (you CANNOT browse it).
2. The role they are targeting.
3. The free-tier preview audit (an overall profile score plus sub-scores and teasers for visibility, headline strength, and recruiter relevance).

You do NOT have the candidate's profile text, so you cannot cite specific employers, titles, dates, or metrics. Produce four premium deliverables calibrated to the target role and the typical trajectory of a strong candidate pursuing it. Where a deliverable needs a specific only the candidate can supply (a company, a metric, a date), insert a clearly marked placeholder such as [your company] or [add a metric] for them to complete — never invent it as fact.

Voice: confident, specific, recruiter-grade British English. Direct, not flowery. No buzzword soup, no "passionate about", no "results-driven", no emoji except where explicitly requested in the content plan. First person where the deliverable is written for the candidate to use.

Tailor everything to the target role. If a deliverable cannot be completed without a specific the candidate must supply, use a placeholder rather than fabricating it. Re-use the themes from the free preview audit — the premium output should feel like a logical continuation of it, not a contradiction.

Respond with EXACTLY one JSON object, no surrounding prose, no code fences, no extra keys, matching this TypeScript type:

{
  "aboutRewrite": string,             // A complete LinkedIn About section the candidate can paste in. 1800-2400 characters. First person. Opens with a hook line that names the outcome they create. Includes 2-4 short paragraphs separated by blank lines. Embeds 6-10 keywords a recruiter would search for the target role. Ends with a clear call-to-action (e.g. "If you're hiring for X, message me here or at..."). Use placeholders such as [your company] or [add a metric] for specifics only the candidate can supply; do not fabricate them as fact.
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
1. The candidate's public LinkedIn profile URL (you CANNOT browse it).
2. The role they are targeting.
3. The free-tier preview audit (an overall profile score plus sub-scores and teasers for visibility, headline strength, and recruiter relevance).

You do NOT have the candidate's profile text, so you cannot cite specific employers, titles, dates, or metrics. Produce five interview-prep deliverables calibrated to the target role and the typical trajectory of a strong candidate pursuing it. Where a deliverable needs a specific only the candidate can supply (an employer, a project, a metric), insert a clearly marked placeholder such as [your company] or [add a metric] for them to complete, and tell the candidate where to fill the gap — never invent it as fact.

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

const CAREER_SYSTEM_PROMPT = `You are an elite career strategist and executive coach (15+ years guiding senior candidates through career changes at top firms). You write the toolkit a candidate would receive after paying for an intensive multi-week engagement.

You are given:
1. The candidate's public LinkedIn profile URL (you CANNOT browse it).
2. The role they are targeting.
3. The free-tier preview audit (an overall profile score plus sub-scores and teasers for visibility, headline strength, and recruiter relevance).

You do NOT have the candidate's profile text, so you cannot cite specific employers, titles, dates, or metrics. Produce five career-toolkit deliverables calibrated to the target role and the typical trajectory of a strong candidate pursuing it. Where a deliverable needs a specific only the candidate can supply (an employer, a project, a metric), insert a clearly marked placeholder such as [your company] or [add a metric] for them to complete, and tell the candidate where to fill the gap — never invent it as fact.

Voice: confident, specific, recruiter-grade British English. Direct, not flowery. No buzzword soup, no "passionate about", no "results-driven", no emoji. CV bullets and brand story are written in first person where appropriate for the candidate to use directly.

Calibrate every deliverable to the target role and the candidate's seniority. The CV rewrite and roadmap should feel like a logical continuation of the free audit, not a contradiction.

Respond with EXACTLY one JSON object, no surrounding prose, no code fences, no extra keys, matching this TypeScript type:

{
  "cvRewrite": {
    "summary": string,                // 3-5 sentence professional summary at the top of the CV. First person implied (CV style). Leads with the outcome the candidate creates and the role they want next. 350-550 chars.
    "experience": [                   // One entry per role visible in the profile, most recent first. Include every role the profile describes with enough detail to rewrite. Do NOT invent roles.
      {
        "title": string,              // The role title as on the profile (or a tightened version that means the same thing).
        "company": string,            // Company name as it appears in the profile.
        "period": string,             // The dates as in the profile, e.g. "2021 — 2024" or "2019 — Present".
        "bullets": string[]           // 3-5 bullets per role. Each bullet starts with a strong action verb, names a specific outcome, and quantifies wherever the profile supports it. Each bullet 18-30 words.
      }
    ],
    "skills": string[],               // 8-14 skills/keywords for the target role. Only include skills evidenced or strongly implied by the profile.
    "education": string[]             // Each entry one line, e.g. "MBA, London Business School, 2018". Only include what's in the profile.
  },
  "roadmap": [                        // Exactly 3 entries, one per month over the next 90 days.
    {
      "month": number,                // 1, 2, or 3.
      "focus": string,                // ~10 words. The strategic focus of that month (e.g. "Month 1 — Tighten narrative and rebuild signal").
      "objective": string,            // 1-2 sentences naming the single outcome the candidate is aiming for that month.
      "milestones": string[]          // 4-6 concrete milestones for the month, specific enough that the candidate knows whether they hit them. Reference the profile, target role, or industry where relevant.
    }
  ],
  "skillsGapPlan": [                  // Exactly 5 skills the candidate needs to develop or signal more strongly to win the target role.
    {
      "skill": string,                // The skill, named precisely (e.g. "B2B SaaS commercial pricing", not "communication").
      "whyItMatters": string,         // 2-3 sentences. Why this skill matters for the target role and what the gap looks like given the profile evidence.
      "howToDemonstrate": string      // 2-3 sentences. A concrete way to develop and demonstrate the skill within 90 days — a project, a talk, a piece of writing, a side gig, a cert, etc. Specific to the candidate.
    }
  ],
  "networkingPlan": {
    "targets": [                      // Exactly 8 target people or archetypes to reach. Mix: 2 hiring managers at target companies, 2 in-house recruiters in the target space, 2 peer practitioners (potential allies/referrers), 2 dormant contacts (former colleagues / classmates / weak ties). Use archetypes ("Heads of Product at Series B fintechs in London") rather than inventing real names.
      {
        "priority": string,           // "Tier 1", "Tier 2", or "Tier 3" — how high to prioritise this archetype.
        "who": string,                // The archetype, named precisely.
        "why": string                 // 1-2 sentences explaining why this archetype is high-leverage for this candidate's target role.
      }
    ],
    "scripts": [                      // Exactly 3 outreach scripts, one per scenario below.
      {
        "scenario": string,           // One of: "Cold outreach to a hiring manager", "Reactivating a dormant contact", "Asking for a warm referral".
        "subject": string,            // Subject line under 60 chars.
        "body": string                // 80-130 word message. First person, polite, specific to the candidate's profile, easy to forward where applicable.
      }
    ]
  },
  "brandStory": {
    "headline": string,               // ONE sentence (max 25 words) that the candidate uses as the spine of their story. Specific outcome + who it's for + unique mechanism.
    "elevatorPitch": string,          // The 60-second intro the candidate uses at networking events, written verbatim in first person. 110-160 words. Anchored to specific evidence from the profile.
    "whyThisRole": string,            // The candidate's answer to "Why are you interested in this role?", written in first person. 4-6 sentences. Connects past evidence to the target role honestly.
    "signatureStory": string          // The single memorable story the candidate tells in interviews and at events, written in first person. 5-7 sentences. Drawn from a specific moment in the profile, with a clear lesson and a clear outcome.
  }
}`

const EXECUTIVE_SYSTEM_PROMPT = `You are an elite executive brand strategist and leadership coach (15+ years advising C-suite executives, board members, and senior leaders on personal branding, thought leadership, and executive presence). You write the premium executive-branding package a senior candidate would receive after paying for a bespoke multi-week engagement.

You are given:
1. The candidate's public LinkedIn profile URL (you CANNOT browse it).
2. The role they are targeting.
3. The free-tier preview audit (an overall profile score plus sub-scores and teasers for visibility, headline strength, and recruiter relevance).

You do NOT have the candidate's profile text, so you cannot cite specific employers, titles, dates, or metrics. Produce five executive-branding deliverables calibrated to the target role and the typical trajectory of a senior leader pursuing it. Where a deliverable needs a specific only the candidate can supply (an employer, a board, a metric), insert a clearly marked placeholder such as [your company] or [add a metric] for them to complete, and tell the candidate where to fill the gap — never invent it as fact.

Voice: authoritative, polished, executive-grade British English. Direct and confident without being pompous. No buzzword soup, no clichés, no emoji. Written for a senior professional who commands rooms, not someone starting out.

Calibrate every deliverable to the target role and the candidate's seniority. The output should feel like a significant step up from the Career Toolkit — this is premium executive positioning.

Respond with EXACTLY one JSON object, no surrounding prose, no code fences, no extra keys, matching this TypeScript type:

{
  "thoughtLeadership": {
    "signaturePov": {
      "thesis": string,
      "supportingArgument": string
    },
    "keynoteTopics": [
      {
        "topic": string,
        "angle": string,
        "targetVenue": string
      }
    ],
    "publicationTargets": string[]
  },
  "executiveBio": {
    "shortBio": string,
    "conferenceBio": string,
    "fullBio": string
  },
  "linkedinOverhaul": {
    "headline": string,
    "aboutSection": string,
    "featuredSectionStrategy": string[],
    "experienceBullets": [
      {
        "title": string,
        "company": string,
        "bullets": string[]
      }
    ]
  },
  "executivePresence": {
    "pillars": [
      {
        "pillar": string,
        "currentAssessment": string,
        "actionPlan": string
      }
    ],
    "boardMeetingGuidance": string,
    "interviewPresenceTips": string
  },
  "stakeholderScripts": [
    {
      "scenario": string,
      "context": string,
      "script": string
    }
  ]
}

Field-level instructions:

thoughtLeadership.signaturePov.thesis: ONE bold thesis statement (max 40 words) that defines the candidate's unique perspective in their domain. Should be provocative enough to spark discussion but grounded in their actual experience.
thoughtLeadership.signaturePov.supportingArgument: 4-6 sentences. The evidence-based argument for why this candidate is uniquely positioned to hold this view, drawing on their career trajectory, results, and expertise from the profile.
thoughtLeadership.keynoteTopics: Exactly 3 keynote/speaking topics the candidate could own. Each topic under 80 chars, specific and compelling. Each angle is 3-4 sentences on what the talk argues and why an audience of peers would care. targetVenue names the type of event this talk suits.
thoughtLeadership.publicationTargets: Exactly 5 publications, newsletters, or platforms where the candidate should publish or be featured, specific to their industry and seniority. Each entry is the publication name plus a 1-sentence rationale.

executiveBio.shortBio: Exactly 50 words. The bio used for panel introductions and speaker cards. Third person, authoritative, names the outcome they create.
executiveBio.conferenceBio: 140-160 words. The bio used in conference programmes and event marketing. Third person, anchored to specific achievements from the profile.
executiveBio.fullBio: 280-350 words. The narrative biography for executive profiles, media kits, and board packs. Third person, tells the career story with a clear arc, weaving in the biggest outcomes and the strategic thread that connects them.

linkedinOverhaul.headline: Max 220 chars. Executive-level LinkedIn headline that signals seniority, domain, and outcome — not a job title.
linkedinOverhaul.aboutSection: 1800-2400 chars. A complete executive-level About section. First person. Opens with the strategic outcome they create. Weaves in 2-3 signature achievements. Includes a clear call-to-action for boards, investors, or hiring committees. Embeds 8-12 executive-level keywords.
linkedinOverhaul.featuredSectionStrategy: Exactly 4 items the candidate should pin in their Featured section, each described in one sentence.
linkedinOverhaul.experienceBullets: One entry per role visible in the profile, most recent first. 3-5 bullets per role leading with strategic impact (revenue, growth, transformation), naming the scale (team size, budget), and quantifying wherever the profile supports it. Executive voice — no "responsible for".

executivePresence.pillars: Exactly 3 pillars of executive presence, personalised to this candidate. Each pillar has a name, a 2-3 sentence honest assessment, and a 3-4 sentence actionable plan for the next 90 days.
executivePresence.boardMeetingGuidance: 4-6 sentences. Specific guidance for how this candidate should conduct themselves in board meetings or executive committee sessions.
executivePresence.interviewPresenceTips: 4-6 sentences. How to project executive presence in C-suite or board-level interviews.

stakeholderScripts: Exactly 5 scripts. Scenarios: "Board update / executive summary", "Investor or stakeholder pitch", "Team rallying during transformation", "Crisis communication to senior stakeholders", "Executive networking introduction". Each context is 1-2 sentences on when to use it. Each script is 5-8 sentences, first person, ready to deliver.`

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

function coerceCareer(value: unknown): CareerReport {
  if (!value || typeof value !== 'object') {
    throw new Error('Career response was not an object')
  }
  const v = value as Record<string, unknown>

  const cvRaw = (v.cvRewrite ?? {}) as Record<string, unknown>
  const experienceRaw = Array.isArray(cvRaw.experience) ? cvRaw.experience : []
  const cvRewrite: CvRewrite = {
    summary: asString(cvRaw.summary),
    experience: experienceRaw.map((e) => {
      const r = (e ?? {}) as Record<string, unknown>
      const bullets = Array.isArray(r.bullets)
        ? r.bullets.filter((b): b is string => typeof b === 'string').map((b) => b.trim()).filter(Boolean)
        : []
      return {
        title: asString(r.title),
        company: asString(r.company),
        period: asString(r.period),
        bullets,
      }
    }),
    skills: Array.isArray(cvRaw.skills)
      ? cvRaw.skills.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
      : [],
    education: Array.isArray(cvRaw.education)
      ? cvRaw.education.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
      : [],
  }

  const roadmapRaw = Array.isArray(v.roadmap) ? v.roadmap : []
  const roadmap: RoadmapMonth[] = roadmapRaw.map((m, idx) => {
    const r = (m ?? {}) as Record<string, unknown>
    const milestones = Array.isArray(r.milestones)
      ? r.milestones.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
      : []
    return {
      month: typeof r.month === 'number' ? r.month : idx + 1,
      focus: asString(r.focus),
      objective: asString(r.objective),
      milestones,
    }
  })

  const skillsRaw = Array.isArray(v.skillsGapPlan) ? v.skillsGapPlan : []
  const skillsGapPlan: SkillsGapItem[] = skillsRaw.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>
    return {
      skill: asString(r.skill),
      whyItMatters: asString(r.whyItMatters),
      howToDemonstrate: asString(r.howToDemonstrate),
    }
  })

  const networkingRaw = (v.networkingPlan ?? {}) as Record<string, unknown>
  const targetsRaw = Array.isArray(networkingRaw.targets) ? networkingRaw.targets : []
  const targets: NetworkingTarget[] = targetsRaw.map((t) => {
    const r = (t ?? {}) as Record<string, unknown>
    return { priority: asString(r.priority), who: asString(r.who), why: asString(r.why) }
  })
  const netScriptsRaw = Array.isArray(networkingRaw.scripts) ? networkingRaw.scripts : []
  const netScripts: NetworkingScript[] = netScriptsRaw.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>
    return { scenario: asString(r.scenario), subject: asString(r.subject), body: asString(r.body) }
  })

  const brandRaw = (v.brandStory ?? {}) as Record<string, unknown>
  const brandStory = {
    headline: asString(brandRaw.headline),
    elevatorPitch: asString(brandRaw.elevatorPitch),
    whyThisRole: asString(brandRaw.whyThisRole),
    signatureStory: asString(brandRaw.signatureStory),
  }

  if (
    !cvRewrite.summary ||
    cvRewrite.experience.length === 0 ||
    roadmap.length === 0 ||
    skillsGapPlan.length === 0 ||
    !brandStory.headline
  ) {
    throw new Error('Career response missing required fields')
  }

  return {
    cvRewrite,
    roadmap,
    skillsGapPlan,
    networkingPlan: { targets, scripts: netScripts },
    brandStory,
  }
}

function coerceExecutive(value: unknown): ExecutiveReport {
  if (!value || typeof value !== 'object') {
    throw new Error('Executive response was not an object')
  }
  const v = value as Record<string, unknown>

  const tlRaw = (v.thoughtLeadership ?? {}) as Record<string, unknown>
  const povRaw = (tlRaw.signaturePov ?? {}) as Record<string, unknown>
  const keynoteRaw = Array.isArray(tlRaw.keynoteTopics) ? tlRaw.keynoteTopics : []
  const thoughtLeadership: ThoughtLeadership = {
    signaturePov: {
      thesis: asString(povRaw.thesis),
      supportingArgument: asString(povRaw.supportingArgument),
    },
    keynoteTopics: keynoteRaw.map((k) => {
      const r = (k ?? {}) as Record<string, unknown>
      return { topic: asString(r.topic), angle: asString(r.angle), targetVenue: asString(r.targetVenue) }
    }),
    publicationTargets: Array.isArray(tlRaw.publicationTargets)
      ? tlRaw.publicationTargets.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
      : [],
  }

  const bioRaw = (v.executiveBio ?? {}) as Record<string, unknown>
  const executiveBio: ExecutiveBio = {
    shortBio: asString(bioRaw.shortBio),
    conferenceBio: asString(bioRaw.conferenceBio),
    fullBio: asString(bioRaw.fullBio),
  }

  const overhaulRaw = (v.linkedinOverhaul ?? {}) as Record<string, unknown>
  const expBulletsRaw = Array.isArray(overhaulRaw.experienceBullets) ? overhaulRaw.experienceBullets : []
  const linkedinOverhaul: LinkedinOverhaul = {
    headline: asString(overhaulRaw.headline),
    aboutSection: asString(overhaulRaw.aboutSection),
    featuredSectionStrategy: Array.isArray(overhaulRaw.featuredSectionStrategy)
      ? overhaulRaw.featuredSectionStrategy.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
      : [],
    experienceBullets: expBulletsRaw.map((e) => {
      const r = (e ?? {}) as Record<string, unknown>
      const bullets = Array.isArray(r.bullets)
        ? r.bullets.filter((b): b is string => typeof b === 'string').map((b) => b.trim()).filter(Boolean)
        : []
      return { title: asString(r.title), company: asString(r.company), bullets }
    }),
  }

  const presenceRaw = (v.executivePresence ?? {}) as Record<string, unknown>
  const pillarsRaw = Array.isArray(presenceRaw.pillars) ? presenceRaw.pillars : []
  const executivePresence: ExecutivePresence = {
    pillars: pillarsRaw.map((p) => {
      const r = (p ?? {}) as Record<string, unknown>
      return {
        pillar: asString(r.pillar),
        currentAssessment: asString(r.currentAssessment),
        actionPlan: asString(r.actionPlan),
      }
    }),
    boardMeetingGuidance: asString(presenceRaw.boardMeetingGuidance),
    interviewPresenceTips: asString(presenceRaw.interviewPresenceTips),
  }

  const scriptsRaw = Array.isArray(v.stakeholderScripts) ? v.stakeholderScripts : []
  const stakeholderScripts: StakeholderScript[] = scriptsRaw.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>
    return { scenario: asString(r.scenario), context: asString(r.context), script: asString(r.script) }
  })

  if (
    !thoughtLeadership.signaturePov.thesis ||
    thoughtLeadership.keynoteTopics.length === 0 ||
    !executiveBio.shortBio ||
    !linkedinOverhaul.headline ||
    executivePresence.pillars.length === 0 ||
    stakeholderScripts.length === 0
  ) {
    throw new Error('Executive response missing required fields')
  }

  return { thoughtLeadership, executiveBio, linkedinOverhaul, executivePresence, stakeholderScripts }
}

function storesFor(product: Product) {
  if (product === 'interview') {
    return {
      paid: getStore({ name: 'paid-interview-sessions', consistency: 'strong' }),
      reports: getStore({ name: 'interview-reports', consistency: 'strong' }),
    }
  }
  if (product === 'career') {
    return {
      paid: getStore({ name: 'paid-career-sessions', consistency: 'strong' }),
      reports: getStore({ name: 'career-reports', consistency: 'strong' }),
    }
  }
  if (product === 'executive') {
    return {
      paid: getStore({ name: 'paid-executive-sessions', consistency: 'strong' }),
      reports: getStore({ name: 'executive-reports', consistency: 'strong' }),
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

  const product: Product =
    body.product === 'interview' ? 'interview' : body.product === 'career' ? 'career' : body.product === 'executive' ? 'executive' : 'audit'

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

  const finalInstruction =
    product === 'interview'
      ? 'Produce the interview-prep deliverables now. Return only the JSON object specified in the system prompt.'
      : product === 'career'
        ? 'Produce the career-toolkit deliverables now. Return only the JSON object specified in the system prompt.'
        : product === 'executive'
          ? 'Produce the executive-branding deliverables now. Return only the JSON object specified in the system prompt.'
          : 'Produce the premium deliverables now. Return only the JSON object specified in the system prompt.'

  const userPrompt = [
    `Target role: ${session.role}`,
    `Candidate's public LinkedIn profile URL: ${session.linkedinUrl}`,
    '',
    'Free-tier preview audit produced for this candidate (already shown to them):',
    JSON.stringify(session.free, null, 2),
    '',
    finalInstruction,
  ].join('\n')

  const systemPrompt =
    product === 'interview'
      ? INTERVIEW_SYSTEM_PROMPT
      : product === 'career'
        ? CAREER_SYSTEM_PROMPT
        : product === 'executive'
          ? EXECUTIVE_SYSTEM_PROMPT
          : AUDIT_SYSTEM_PROMPT
  const maxTokens = product === 'interview' ? 7000 : product === 'career' ? 8000 : product === 'executive' ? 9000 : 6000

  let message
  try {
    message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: maxTokens,
      system: systemPrompt,
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

  let report: AuditReport | InterviewReport | CareerReport | ExecutiveReport
  try {
    const parsed = extractJson(textBlock.text)
    report =
      product === 'interview'
        ? coerceInterview(parsed)
        : product === 'career'
          ? coerceCareer(parsed)
          : product === 'executive'
            ? coerceExecutive(parsed)
            : coerceAudit(parsed)
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
