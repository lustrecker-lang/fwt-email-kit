// hiring-notify: the two emails an applicant gets without anyone on staff
// pressing a button, sent through Resend.
//
//   started    when they begin an application. Carries their personal link,
//              which is otherwise only in the browser they applied from.
//   submitted  when they finish the last step.
//
// Deploy it as an Edge Function named `hiring-notify` (Dashboard > Edge Functions
// > Deploy a new function > Via editor, paste this file) with "Verify JWT" turned
// OFF. The apply page calls it as an anonymous visitor, with the publishable key,
// which is not a JWT and would be refused if that check were on. The function
// does its own checking instead (see below).
//
// Secrets (Edge Functions > Secrets). The first two are shared with hiring-email:
//
//   RESEND_API_KEY    the re_... key from Resend
//   HIRING_FROM       who it comes from, e.g. Flying Whale Hiring <noreply@flyingwhale.ai>
//   HIRING_REPLY_TO   optional: where replies go. Without it, the emails say the
//                     address is not monitored.
//   HIRING_APPLY_URL  optional: the public https address of apps/hiring/apply.html.
//                     Without it, the "started" email has no resume link and tells
//                     the applicant to use the link they applied from.
//   HIRING_COMPANY    optional: the name the emails are signed with. Default below.
//
// It reads the database with the project's secret key, which Supabase gives every
// Edge Function on its own; there is nothing to set for that.
//
// Why this is safe to leave callable by anyone:
//   - it needs the applicant's token, an unguessable id only they hold;
//   - it only ever emails the address stored for that applicant, never one sent
//     in the request;
//   - each kind goes out at most once per applicant. A unique index on
//     hiring_email_log enforces that, so two calls at the same moment cannot
//     both send.
// So the most it can do is send one application its own two emails.
//
// Request:  POST { token, kind: "started" | "submitted" }
// Response: 200 { ok: true, sent: true | false, reason? } or { error } on 4xx/5xx.
//
// Plain fetch, no SDK, the same as hiring-email.

declare const Deno: any;

const KINDS = ['started', 'submitted'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_COMPANY = 'Flying Whale';

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

function esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// The project's secret key. Newer projects get named keys as JSON; older ones the
// single service_role JWT. Either bypasses row-level security, which is what
// reading an applicant by token from here needs.
export function adminKey(env: Record<string, string | undefined>): string {
    try {
        const named = JSON.parse(env.SUPABASE_SECRET_KEYS || '{}');
        if (named && typeof named.default === 'string' && named.default) return named.default;
    } catch (_e) { /* not JSON; fall through */ }
    return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function adminHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { apikey: key, ...extra };
    // A legacy service_role key is a JWT and goes on Authorization as well. A new
    // sb_secret_ key is not a JWT; the gateway reads it from apikey alone.
    if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
    return h;
}

// Where the applicant goes to carry on: apply.html?job=<slug>#<token>, the same
// shape the apply page itself writes into the address bar.
export function resumeLink(base: string | undefined, slug: string, token: string): string {
    if (!base || !/^https:\/\//i.test(base.trim())) return '';
    try {
        const u = new URL(base.trim());
        u.searchParams.set('job', slug);
        u.hash = token;
        return u.toString();
    } catch (_e) {
        return '';
    }
}

export interface Email { subject: string; text: string; html: string; }

// A block is a paragraph of plain text, or a link shown on its own line.
type Block = string | { link: string };

function render(blocks: Block[]): { text: string; html: string } {
    const text = blocks.map((b) => typeof b === 'string' ? b : b.link).join('\n\n');
    const body = blocks.map((b) => {
        if (typeof b === 'string') {
            return '<p style="margin:0 0 16px 0;">' + esc(b).replace(/\n/g, '<br>') + '</p>';
        }
        return '<p style="margin:0 0 16px 0;"><a href="' + esc(b.link) +
            '" style="color:#222222;font-weight:600;text-decoration:underline;word-break:break-all;">' +
            esc(b.link) + '</a></p>';
    }).join('');
    const html = '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;">' +
        '<div style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;' +
        'font-size:15px;line-height:1.6;color:#222222;">' + body + '</div></body></html>';
    return { text, html };
}

// The two emails. Kept short and plain on purpose: they are confirmations, and
// the one thing in them that matters is the link.
export function buildEmail(kind: string, v: {
    firstName: string; role: string; company: string; link: string; monitored: boolean;
}): Email {
    const hi = 'Hi ' + (v.firstName || 'there') + ',';
    const footer = v.monitored ? [] : ['This address isn\u2019t monitored, so please don\u2019t reply to this email.'];

    if (kind === 'started') {
        const how: Block[] = v.link
            ? ['To pick up where you left off, use your personal link:', { link: v.link },
               'Keep this email. The link is the only way back into your application, and it is yours alone, so please don\u2019t share it.']
            : ['To pick up where you left off, open the link you applied from, on the same device and browser.'];
        return {
            subject: 'Your application for ' + v.role,
            ...render([
                hi,
                'Thanks for starting your application for the ' + v.role + ' role at ' + v.company +
                    '. Your progress is saved as you go.',
                ...how,
                v.company,
                ...footer
            ])
        };
    }

    return {
        subject: 'We\u2019ve received your application for ' + v.role,
        ...render([
            hi,
            'Thanks for applying for the ' + v.role + ' role at ' + v.company +
                '. We\u2019ve received your application and everything you sent with it.',
            'We read every application. If yours looks like a fit, we\u2019ll be in touch by email to arrange an interview.',
            v.company,
            ...footer
        ])
    };
}

export async function handle(req: Request, env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

    const SUPABASE_URL = env.SUPABASE_URL;
    const key = adminKey(env);
    if (!SUPABASE_URL) return reply(500, { error: 'SUPABASE_URL is not set.' });
    if (!key) return reply(500, { error: 'No secret key is available to this function.' });
    if (!env.RESEND_API_KEY) return reply(500, { error: 'The RESEND_API_KEY secret is not set on this function.' });
    if (!env.HIRING_FROM) return reply(500, { error: 'The HIRING_FROM secret is not set on this function.' });

    let input: any;
    try { input = await req.json(); } catch (_e) { return reply(400, { error: 'The request was not JSON.' }); }
    const token = String(input && input.token || '');
    const kind = String(input && input.kind || '');
    if (!UUID.test(token)) return reply(400, { error: 'Unknown application.' });
    if (KINDS.indexOf(kind) < 0) return reply(400, { error: 'Unknown kind of email.' });

    const rest = SUPABASE_URL + '/rest/v1/';

    // The applicant, found by the token only they hold.
    const ar = await fetchImpl(rest + 'hiring_applicants?select=id,name,email,status,hiring_jobs(title,slug)&token=eq.' +
        encodeURIComponent(token), { headers: adminHeaders(key) });
    if (!ar.ok) return reply(502, { error: 'Could not read the application.' });
    const app = (await ar.json())[0];
    if (!app || !app.email) return reply(404, { error: 'Unknown application.' });

    // Each email only makes sense at its own moment: "started" while they are
    // still working through it, "submitted" once they have finished.
    if (kind === 'started' && app.status !== 'in_progress') return reply(200, { ok: true, sent: false, reason: 'not_in_progress' });
    if (kind === 'submitted' && app.status === 'in_progress') return reply(200, { ok: true, sent: false, reason: 'not_submitted' });

    const name = String(app.name || '').trim();
    const job = app.hiring_jobs || {};
    const company = (env.HIRING_COMPANY || '').trim() || DEFAULT_COMPANY;
    const mail = buildEmail(kind, {
        firstName: name.split(/\s+/)[0] || name,
        role: String(job.title || 'this'),
        company,
        link: kind === 'started' ? resumeLink(env.HIRING_APPLY_URL, String(job.slug || ''), token) : '',
        monitored: !!env.HIRING_REPLY_TO
    });
    const subject = mail.subject.replace(/[\r\n]+/g, ' ');

    // Claim the send before making it. The unique index lets exactly one claim
    // per applicant per kind succeed, so a repeat or a race gets a 409 here and
    // nothing is sent twice.
    const claim = await fetchImpl(rest + 'hiring_email_log', {
        method: 'POST',
        headers: adminHeaders(key, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ applicant_id: app.id, kind, recipient: app.email, subject, sent_by: null })
    });
    if (claim.status === 409) return reply(200, { ok: true, sent: false, reason: 'already' });
    if (!claim.ok) return reply(502, { error: 'Could not record the email: ' + (await claim.text()) });
    const logId = ((await claim.json())[0] || {}).id;

    const payload: Record<string, unknown> = {
        from: env.HIRING_FROM,
        to: [app.email],
        subject,
        text: mail.text,
        html: mail.html,
        tags: [{ name: 'kind', value: kind }]
    };
    if (env.HIRING_REPLY_TO) payload.reply_to = env.HIRING_REPLY_TO;

    const sr = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + env.RESEND_API_KEY,
            'Content-Type': 'application/json',
            'Idempotency-Key': kind + '-' + app.id
        },
        body: JSON.stringify(payload)
    });
    const sent = await sr.json().catch(() => ({}));

    if (!sr.ok) {
        // Give the claim back, so the next visit to the apply page tries again.
        if (logId) {
            await fetchImpl(rest + 'hiring_email_log?id=eq.' + encodeURIComponent(logId), {
                method: 'DELETE', headers: adminHeaders(key)
            }).catch(() => null);
        }
        return reply(502, { error: 'Resend refused the email: ' + (sent.message || sent.name || sr.status) });
    }

    if (logId && sent.id) {
        await fetchImpl(rest + 'hiring_email_log?id=eq.' + encodeURIComponent(logId), {
            method: 'PATCH',
            headers: adminHeaders(key, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
            body: JSON.stringify({ provider_id: sent.id })
        }).catch(() => null);
    }

    return reply(200, { ok: true, sent: true, id: sent.id || null });
}

if (typeof Deno !== 'undefined' && Deno.serve) {
    Deno.serve((req: Request) => handle(req, Deno.env.toObject(), fetch));
}
