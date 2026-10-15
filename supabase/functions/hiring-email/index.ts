// hiring-email: sends an email to an applicant through Resend.
//
// Deploy it as an Edge Function named `hiring-email` (Dashboard > Edge Functions >
// Deploy a new function > Via editor, paste this file). Keep "Verify JWT" on.
// Then add these under Edge Functions > Secrets:
//
//   RESEND_API_KEY   the re_... key from Resend. Never put it in the app's files:
//                    everything there is served to the browser.
//   HIRING_FROM      who it comes from, e.g.  FWT Hiring <hiring@your-domain.com>
//                    The domain must be verified in Resend, or Resend refuses to
//                    send to anyone but the account's own address.
//   HIRING_REPLY_TO  optional: where replies go, e.g.  jobs@your-domain.com
//
// Who may call it: a signed-in member of staff. The platform checks the JWT, and
// this checks it again with Supabase Auth, then reads the applicant AS THAT USER,
// so the database's own row-level security decides what they can see.
//
// What it will not do: send to an address the caller supplies. The recipient is
// always the applicant's email as stored in the database, so this cannot be used
// to email arbitrary people. And it sends a given kind of email to an applicant
// once; a second send needs `force: true` (the app asks first).
//
// Request:  POST { applicant_id, kind: "rejected", subject, body, force? }
// Response: 200 { ok, id, sent_at } or { error } with a 4xx/5xx status.
//
// Plain fetch, no SDK, so it runs on Deno and can be tested under Node as well.

declare const Deno: any;

const KINDS = ['rejected'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// {{first_name}}, {{name}} and {{role}}. The app fills them in before showing the
// email, but anything left over is filled here so a placeholder never arrives.
export function fill(text: string, vars: Record<string, string>): string {
    return String(text).replace(/\{\{\s*(first_name|name|role)\s*\}\}/g, (_m: string, k: string) => vars[k] || '');
}

// The typed message as a calm, readable email: paragraphs on blank lines, line
// breaks kept, everything escaped. Deliberately plain; it is a personal note.
export function toHtml(text: string): string {
    const paras = String(text).trim().split(/\n[ \t]*\n/).map((p: string) =>
        '<p style="margin:0 0 16px 0;">' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
    return '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;">' +
        '<div style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;' +
        'font-size:15px;line-height:1.6;color:#222222;">' + paras + '</div></body></html>';
}

export async function handle(req: Request, env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

    const SUPABASE_URL = env.SUPABASE_URL;
    if (!SUPABASE_URL) return reply(500, { error: 'SUPABASE_URL is not set.' });
    if (!env.RESEND_API_KEY) return reply(500, { error: 'The RESEND_API_KEY secret is not set on this function.' });
    if (!env.HIRING_FROM) return reply(500, { error: 'The HIRING_FROM secret is not set on this function.' });

    const auth = req.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+/.test(auth)) return reply(401, { error: 'Sign in to send emails.' });
    // Forward the caller's own credentials, so every read and write below runs as
    // them and is held to the same policies as the app.
    const apikey = req.headers.get('apikey') || '';
    const asCaller = (extra: Record<string, string> = {}) => ({ Authorization: auth, apikey, ...extra });

    let input: any;
    try { input = await req.json(); } catch (_e) { return reply(400, { error: 'The request was not JSON.' }); }
    const applicantId = String(input && input.applicant_id || '');
    const kind = String(input && input.kind || '');
    const subjectIn = typeof input?.subject === 'string' ? input.subject.trim() : '';
    const bodyIn = typeof input?.body === 'string' ? input.body.trim() : '';
    if (!UUID.test(applicantId)) return reply(400, { error: 'Unknown applicant.' });
    if (KINDS.indexOf(kind) < 0) return reply(400, { error: 'Unknown kind of email.' });
    if (!subjectIn || subjectIn.length > 200) return reply(400, { error: 'The subject must be 1 to 200 characters.' });
    if (!bodyIn || bodyIn.length > 10000) return reply(400, { error: 'The message must be 1 to 10,000 characters.' });

    // Who is asking. A dead or forged token fails here.
    const who = await fetchImpl(SUPABASE_URL + '/auth/v1/user', { headers: asCaller() });
    if (!who.ok) return reply(401, { error: 'Your session has expired. Sign in again.' });
    const user = await who.json();

    // The applicant, and the role's title, read as the caller.
    const ar = await fetchImpl(SUPABASE_URL + '/rest/v1/hiring_applicants?select=id,name,email,hiring_jobs(title)&id=eq.' +
        encodeURIComponent(applicantId), { headers: asCaller() });
    if (!ar.ok) return reply(502, { error: 'Could not read the applicant: ' + (await ar.text()) });
    const app = (await ar.json())[0];
    if (!app || !app.email) return reply(404, { error: 'That applicant no longer exists.' });

    // Once per applicant per kind, unless the caller says so.
    const lr = await fetchImpl(SUPABASE_URL + '/rest/v1/hiring_email_log?select=sent_at&applicant_id=eq.' +
        encodeURIComponent(applicantId) + '&kind=eq.' + kind + '&order=sent_at.desc&limit=1', { headers: asCaller() });
    if (!lr.ok) return reply(502, { error: 'Could not read the email log: ' + (await lr.text()) });
    const prior = (await lr.json())[0];
    if (prior && !input.force) {
        return reply(409, { error: 'This email was already sent on ' + prior.sent_at + '.', sent_at: prior.sent_at });
    }

    const name = String(app.name || '').trim();
    const vars = { name, first_name: name.split(/\s+/)[0] || name, role: (app.hiring_jobs && app.hiring_jobs.title) || '' };
    const subject = fill(subjectIn, vars).replace(/[\r\n]+/g, ' ');
    const text = fill(bodyIn, vars);

    const payload: Record<string, unknown> = {
        from: env.HIRING_FROM,
        to: [app.email],
        subject,
        text,
        html: toHtml(text),
        tags: [{ name: 'kind', value: kind }]
    };
    if (env.HIRING_REPLY_TO) payload.reply_to = env.HIRING_REPLY_TO;

    const sr = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + env.RESEND_API_KEY,
            'Content-Type': 'application/json',
            // A retried request within a day sends once, not twice. A deliberate
            // second send gets its own key.
            'Idempotency-Key': kind + '-' + applicantId + (input.force ? '-' + Date.now() : '')
        },
        body: JSON.stringify(payload)
    });
    const sent = await sr.json().catch(() => ({}));
    if (!sr.ok) {
        return reply(502, { error: 'Resend refused the email: ' + (sent.message || sent.name || sr.status) });
    }

    // Recorded as the caller. If this fails the email has still gone, so say so
    // rather than reporting a failure that would invite a second send.
    const sentAt = new Date().toISOString();
    const log = await fetchImpl(SUPABASE_URL + '/rest/v1/hiring_email_log', {
        method: 'POST',
        headers: asCaller({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({
            applicant_id: applicantId, kind, recipient: app.email, subject,
            provider_id: sent.id || null, sent_by: user.email || null, sent_at: sentAt
        })
    });

    return reply(200, { ok: true, id: sent.id || null, sent_at: sentAt, logged: log.ok });
}

if (typeof Deno !== 'undefined' && Deno.serve) {
    Deno.serve((req: Request) => handle(req, Deno.env.toObject(), fetch));
}
