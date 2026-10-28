// hiring-ai: the hiring tool's calls to Claude. For now one thing: drafting a
// role's sourcing criteria from its job description.
//
// Deploy it as an Edge Function named `hiring-ai` (Dashboard > Edge Functions >
// Deploy a new function > Via editor, paste this file). Keep "Verify JWT" on.
// Then add this under Edge Functions > Secrets:
//
//   ANTHROPIC_API_KEY   the sk-ant-... key from console.anthropic.com. Never put
//                       it in the app's files: everything there is served to the
//                       browser.
//
// Who may call it: a signed-in member of staff. The role is read AS THAT USER,
// so the database's own row-level security decides what they can see.
//
// What it will not do: save anything. The draft goes back to the page, where a
// person reads it, changes what they want, and saves it themselves.
//
// Request:  POST { action: "draft_criteria", job_id }
// Response: 200 { must_haves, criteria, archetypes, card_shows } or { error }.

import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';

declare const Deno: any;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_SHOWS = ['screenshots', 'github', 'writing'];

const CORS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function reply(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    });
}

// What Claude must hand back. Strict, so the page never has to cope with a
// missing field or an extra one.
const DRAFT_SCHEMA = {
    type: 'object',
    properties: {
        must_haves: {
            type: 'array',
            items: {
                type: 'object',
                properties: { key: { type: 'string' }, label: { type: 'string' } },
                required: ['key', 'label'],
                additionalProperties: false
            }
        },
        criteria: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    key: { type: 'string' }, label: { type: 'string' },
                    weight: { type: 'integer' }, hint: { type: 'string' }
                },
                required: ['key', 'label', 'weight', 'hint'],
                additionalProperties: false
            }
        },
        archetypes: { type: 'array', items: { type: 'string' } },
        card_shows: { type: 'array', items: { type: 'string', enum: CARD_SHOWS } }
    },
    required: ['must_haves', 'criteria', 'archetypes', 'card_shows'],
    additionalProperties: false
};

const SYSTEM = `You help a hiring team set up an automated search for candidates. The search finds people on the open web (LinkedIn profiles as they appear in search results, GitHub, personal portfolio sites, talks and writing) and scores each one against criteria. A person then reviews the best matches one card at a time.

From the job description you are given, write:

must_haves: 2 to 5 hard requirements. Each must be something the search can check from public evidence, and failing it should rule a person out completely. Examples of the right kind: "8+ years of relevant experience", "Writes production front-end code", "Has shipped product work they can show". Keep each label under 60 characters.

criteria: 4 to 7 things to score from 0 to 10, with integer weights that add up to exactly 100. Weight what the description stresses most. Each label names the capability in the description's own terms, under 60 characters. Each hint says in one sentence what public evidence counts, so the scoring stays honest.

archetypes: 4 to 8 kinds of people who would fit, written as search targets, such as "Design engineers at product startups" or "Alumni of government digital services". Think about where this person actually is, not only the obvious job title.

card_shows: what the reviewer should see first on each card. "screenshots" when the work is visual, "github" when code is the main evidence, "writing" when communication or thinking is central. One to three.

Rules:
- Never include visual taste, aesthetic judgment or "eye for design" as a criterion. The reviewer judges that from the work itself.
- Never include anything about age, gender, ethnicity, nationality, religion, disability, family status, or anything that stands in for them. Years of experience is fine; age is not. Location only when the description requires it.
- Keys are short lower-case words joined by underscores, unique within their list.
- Write plain English. No marketing words.`;

// Tidies what came back: keys made safe and unique, weights made to add up to
// 100 exactly, lists kept to a sensible length. The model is asked for all of
// this; this is what makes it true.
export function tidy(d: any) {
    function keyed(list: any[], prefix: string, max: number) {
        const seen = new Set<string>();
        return (Array.isArray(list) ? list : []).slice(0, max).map((x: any, i: number) => {
            let k = String(x?.key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
            if (!k || seen.has(k)) k = prefix + (i + 1);
            seen.add(k);
            return { ...x, key: k, label: String(x?.label || '').trim().slice(0, 200) };
        }).filter((x: any) => x.label);
    }
    const must_haves = keyed(d?.must_haves, 'm', 6).map((m: any) => ({ key: m.key, label: m.label }));
    const criteria = keyed(d?.criteria, 'c', 8).map((c: any) => ({
        key: c.key, label: c.label, weight: Math.max(0, Math.round(Number(c.weight) || 0)),
        hint: String(c.hint || '').trim().slice(0, 300)
    }));
    const total = criteria.reduce((t: number, c: any) => t + c.weight, 0);
    if (criteria.length) {
        if (!total) criteria.forEach((c: any) => { c.weight = 1; });
        const sum = criteria.reduce((t: number, c: any) => t + c.weight, 0);
        criteria.forEach((c: any) => { c.weight = Math.round(c.weight / sum * 100); });
        let big = 0;
        criteria.forEach((c: any, i: number) => { if (c.weight > criteria[big].weight) big = i; });
        criteria[big].weight += 100 - criteria.reduce((t: number, c: any) => t + c.weight, 0);
    }
    const archetypes = (Array.isArray(d?.archetypes) ? d.archetypes : [])
        .map((a: any) => String(a || '').trim().slice(0, 200)).filter(Boolean).slice(0, 10);
    const card_shows = (Array.isArray(d?.card_shows) ? d.card_shows : [])
        .filter((s: any, i: number, all: any[]) => CARD_SHOWS.indexOf(s) >= 0 && all.indexOf(s) === i);
    return { must_haves, criteria, archetypes, card_shows: card_shows.length ? card_shows : ['screenshots'] };
}

export async function handle(req: Request, env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

    const SUPABASE_URL = env.SUPABASE_URL;
    if (!SUPABASE_URL) return reply(500, { error: 'SUPABASE_URL is not set.' });
    if (!env.ANTHROPIC_API_KEY) return reply(500, { error: 'The ANTHROPIC_API_KEY secret is not set on the hiring-ai function.' });

    const auth = req.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+/.test(auth)) return reply(401, { error: 'Sign in first.' });
    const apikey = req.headers.get('apikey') || '';
    const asCaller = (extra: Record<string, string> = {}) => ({ Authorization: auth, apikey, ...extra });

    let input: any;
    try { input = await req.json(); } catch (_e) { return reply(400, { error: 'The request was not JSON.' }); }
    if (input?.action !== 'draft_criteria') return reply(400, { error: 'Unknown action.' });
    const jobId = String(input?.job_id || '');
    if (!UUID.test(jobId)) return reply(400, { error: 'Unknown role.' });

    const who = await fetchImpl(SUPABASE_URL + '/auth/v1/user', { headers: asCaller() });
    if (!who.ok) return reply(401, { error: 'Your session has expired. Sign in again.' });

    // The role and the company, read as the caller.
    const jr = await fetchImpl(SUPABASE_URL + '/rest/v1/hiring_jobs?select=title,team,summary,description&id=eq.' +
        encodeURIComponent(jobId), { headers: asCaller() });
    if (!jr.ok) return reply(502, { error: 'Could not read the role: ' + (await jr.text()) });
    const job = (await jr.json())[0];
    if (!job) return reply(404, { error: 'That role no longer exists.' });
    if (!String(job.description || '').trim()) return reply(400, { error: 'This role has no description yet.' });

    const sr = await fetchImpl(SUPABASE_URL + '/rest/v1/hiring_settings?select=company,about', { headers: asCaller() });
    const settings = sr.ok ? ((await sr.json())[0] || {}) : {};

    const brief = [
        settings.company ? 'Company: ' + settings.company : '',
        settings.about ? 'About the company:\n' + settings.about : '',
        'Role: ' + job.title + (job.team ? ' (' + job.team + ')' : ''),
        job.summary ? 'Summary: ' + job.summary : '',
        'Job description:\n' + job.description
    ].filter(Boolean).join('\n\n');

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: fetchImpl, maxRetries: 1, timeout: 120000 });
    let message: any;
    try {
        message = await client.beta.messages.create({
            model: 'claude-opus-5-5',
            max_tokens: 8000,
            // Drafting is a short, bounded task; medium keeps it well inside
            // the function's time limit.
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
            // A request declined by the safety classifiers is retried on the
            // fallback model Anthropic recommends, inside the same call.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: SYSTEM,
            messages: [{ role: 'user', content: brief }]
        } as any);
    } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) return reply(502, { error: 'The Anthropic API key was refused. Check the ANTHROPIC_API_KEY secret.' });
        if (e instanceof Anthropic.RateLimitError) return reply(429, { error: 'Too many requests to Claude right now. Try again in a minute.' });
        if (e instanceof Anthropic.APIConnectionTimeoutError) return reply(504, { error: 'Claude took too long to answer. Try again.' });
        if (e instanceof Anthropic.APIError) return reply(502, { error: 'Claude could not draft the criteria (' + (e.status || 'error') + '): ' + e.message });
        throw e;
    }

    if (message.stop_reason === 'refusal') return reply(422, { error: 'Claude declined to draft criteria for this description.' });
    if (message.stop_reason === 'max_tokens') return reply(502, { error: 'The draft came back cut short. Try again.' });
    const text = (message.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    let draft: any;
    try { draft = JSON.parse(text); } catch (_e) { return reply(502, { error: 'The draft could not be read. Try again.' }); }

    return reply(200, tidy(draft));
}

if (typeof Deno !== 'undefined' && Deno.serve) {
    Deno.serve((req: Request) => handle(req, Deno.env.toObject(), fetch));
}
