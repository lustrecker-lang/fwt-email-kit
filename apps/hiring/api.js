/* Supabase access for the hiring tool.
 *
 * Two audiences use this file, and the split matters:
 *
 *   Staff      signed in; read and write the tables directly.
 *   Applicants anonymous; read an open job and its steps, and otherwise only call
 *              the functions in supabase/hiring.sql, which check their token.
 *
 * Everything an applicant does goes through Backend.anonHeaders / rpc(..., true),
 * so the public page behaves the same in a browser that also holds a staff
 * session.
 */

var HiringApi = (function () {
    /* Applicant documents and applicant videos are separate private buckets so
     * each can carry its own size limit; staff briefs go in a public one. */
    var BUCKET = 'hiring-uploads';
    var VIDEO_BUCKET = 'hiring-videos';
    var MEDIA_BUCKET = 'hiring-media';
    var headers = Backend.headers;
    var authed = Backend.authed;
    var check = Backend.check;

    /* One request as staff, with the token refresh and JSON handling the rest of
     * the app relies on. `prefer` is PostgREST's Prefer header. */
    function staff(path, method, body, prefer) {
        return authed(function () {
            var h = {};
            if (body !== undefined) h['Content-Type'] = 'application/json';
            if (prefer) h['Prefer'] = prefer;
            return fetch(SUPABASE.url + '/rest/v1/' + path, {
                method: method || 'GET',
                headers: headers(h),
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        }).then(check);
    }

    function q(v) { return encodeURIComponent(v); }

    /* ------------------------------------------------------------------ shape */

    /* What an applicant can be asked. `answer` is how the value is stored. */
    var FIELD_TYPES = [
        { key: 'text',     label: 'Short answer' },
        { key: 'longtext', label: 'Long answer' },
        { key: 'choice',   label: 'Pick one' },
        { key: 'url',      label: 'Link' },
        { key: 'github',   label: 'GitHub repository' },
        { key: 'video',    label: 'Video upload' },
        { key: 'file',     label: 'File upload' }
    ];

    /* Links. An applicant may write google.com, www.google.com/work or a full
     * https:// address; what is checked is that it is shaped like a web address,
     * not that it carries a scheme. Another scheme (javascript:, ftp:, data:)
     * does not fit the pattern, which is what keeps those out. The database
     * applies the same rules. */
    var LINK_RE = /^(https?:\/\/)?((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+\p{L}{2,})(:\d{1,5})?([/?#][^\s<>"]*)?$/iu;
    var GITHUB_RE = /^(https?:\/\/)?(www\.)?github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+(\/\S*)?$/i;

    /* Returns a sentence about what is wrong with a typed link, or '' if it is
     * fine. An empty value is fine here; whether it is required is another rule. */
    function checkLink(type, value) {
        var v = String(value || '').trim();
        if (!v) return '';
        if (type === 'github') {
            return GITHUB_RE.test(v) ? '' : 'Please link a GitHub repository, like github.com/name/project';
        }
        return LINK_RE.test(v) ? '' : 'That does not look like a web address, for example example.com';
    }

    /* The address to actually open: what was typed, with https:// in front if it
     * had no scheme. Only ever called on something checkLink accepted. */
    function linkHref(value) {
        var v = String(value || '').trim();
        return /^https?:\/\//i.test(v) ? v : 'https://' + v;
    }

    var APPLICANT_STATUSES = [
        { key: 'in_progress', label: 'In progress', tone: '' },
        { key: 'submitted',   label: 'Submitted',   tone: 'look' },
        { key: 'shortlisted', label: 'Shortlisted', tone: 'look' },
        { key: 'interview',   label: 'Interview',   tone: 'go' },
        { key: 'hired',       label: 'Hired',       tone: 'go' },
        { key: 'rejected',    label: 'Rejected',    tone: 'no' }
    ];

    var JOB_STATUSES = [
        { key: 'draft',  label: 'Draft',  tone: '' },
        { key: 'open',   label: 'Open',   tone: 'go' },
        { key: 'closed', label: 'Closed', tone: 'look' }
    ];

    function isHttps(url) { return /^https:\/\/[^\s<>"']+$/i.test(String(url || '').trim()); }

    /* ------------------------------------------------------------------- jobs */

    function listJobs() {
        return staff('hiring_jobs?select=id,slug,title,team,status,updated_at&order=updated_at.desc');
    }

    /* Applicant counts for every job in one read. A few hundred rows of two short
     * columns is nothing, and it saves a request per job. */
    function applicantCounts() {
        return staff('hiring_applicants?select=job_id,status').then(function (rows) {
            var out = {};
            rows.forEach(function (r) {
                var c = out[r.job_id] || (out[r.job_id] = { total: 0, submitted: 0 });
                c.total++;
                if (r.status !== 'in_progress') c.submitted++;
            });
            return out;
        });
    }

    function getJob(id) {
        return staff('hiring_jobs?select=*&id=eq.' + q(id)).then(function (rows) { return rows[0] || null; });
    }

    function saveJob(j) {
        var body = {
            slug: j.slug, title: j.title, team: j.team || null,
            summary: j.summary || null, description: j.description || '',
            status: j.status || 'draft'
        };
        var req = j.id
            ? staff('hiring_jobs?id=eq.' + q(j.id), 'PATCH', body, 'return=representation')
            : staff('hiring_jobs', 'POST', body, 'return=representation');
        return req.then(function (rows) { return rows[0]; });
    }

    function setJobStatus(id, status) {
        return staff('hiring_jobs?id=eq.' + q(id), 'PATCH', { status: status }, 'return=minimal');
    }

    function deleteJob(id) {
        return staff('hiring_jobs?id=eq.' + q(id), 'DELETE', undefined, 'return=minimal');
    }

    /* ------------------------------------------------------------------ steps */

    function listSteps(jobId) {
        return staff('hiring_steps?select=*&order=position.asc&job_id=eq.' + q(jobId));
    }

    /* Writes the whole list in order. Existing steps are updated in place, so the
     * ids that applicants' answers hang off survive; new ones are inserted;
     * removed ones are deleted last, and the database refuses a delete that would
     * orphan answers. Positions are 1..n, which the server's ordering check
     * relies on being distinct. */
    function saveSteps(jobId, steps, removedIds) {
        function bodyOf(s, i) {
            return {
                position: i + 1, title: s.title, body: s.body || '',
                video_url: s.video_url ? s.video_url.trim() : null, fields: s.fields || [],
                time_limit_hours: s.time_limit_hours || null,
                intro: (s.intro || '').trim() || null
            };
        }
        var chain = Promise.resolve();

        /* Updates first. Repeating one is harmless, so a failed save can simply
         * be tried again. */
        steps.forEach(function (s, i) {
            if (!s.id) return;
            chain = chain.then(function () {
                return staff('hiring_steps?id=eq.' + q(s.id), 'PATCH', bodyOf(s, i), 'return=minimal');
            });
        });

        /* New steps go in as one request, so they either all arrive or none do,
         * and the ids that come back are written onto the step objects. Without
         * that a retry after a later failure would insert them a second time. */
        var fresh = steps.filter(function (s) { return !s.id; });
        if (fresh.length) {
            chain = chain.then(function () {
                var rows = fresh.map(function (s) {
                    return Object.assign({ job_id: jobId }, bodyOf(s, steps.indexOf(s)));
                });
                return staff('hiring_steps', 'POST', rows, 'return=representation').then(function (made) {
                    made.forEach(function (row, i) { fresh[i].id = row.id; });
                });
            });
        }

        (removedIds || []).forEach(function (id) {
            chain = chain.then(function () {
                return staff('hiring_steps?id=eq.' + q(id), 'DELETE', undefined, 'return=minimal');
            });
        });
        return chain;
    }

    /* -------------------------------------------------------------- applicants */

    function listApplicants(jobId) {
        return staff('hiring_applicants?select=*&order=created_at.desc&job_id=eq.' + q(jobId));
    }

    /* Which steps each applicant has answered: { applicantId: [stepId, ...] }.
     * The progress column needs the count, and the timed-out badge needs to know
     * which steps. */
    function responseSteps(applicantIds) {
        if (!applicantIds.length) return Promise.resolve({});
        return staff('hiring_responses?select=applicant_id,step_id&applicant_id=in.(' +
            applicantIds.map(q).join(',') + ')').then(function (rows) {
            var out = {};
            rows.forEach(function (r) { (out[r.applicant_id] = out[r.applicant_id] || []).push(r.step_id); });
            return out;
        });
    }

    /* The clocks that have been started: { applicantId: { stepId: {started_at,
     * deadline_at} } }. */
    function listStarts(applicantIds) {
        if (!applicantIds.length) return Promise.resolve({});
        return staff('hiring_step_starts?select=applicant_id,step_id,started_at,deadline_at&applicant_id=in.(' +
            applicantIds.map(q).join(',') + ')').then(function (rows) {
            var out = {};
            rows.forEach(function (r) {
                (out[r.applicant_id] = out[r.applicant_id] || {})[r.step_id] =
                    { started_at: r.started_at, deadline_at: r.deadline_at };
            });
            return out;
        });
    }

    /* Grants more time on a step by moving its deadline. */
    function setDeadline(applicantId, stepId, iso) {
        return staff('hiring_step_starts?applicant_id=eq.' + q(applicantId) + '&step_id=eq.' + q(stepId),
            'PATCH', { deadline_at: iso }, 'return=minimal');
    }

    function getResponses(applicantId) {
        return staff('hiring_responses?select=step_id,answers&applicant_id=eq.' + q(applicantId))
            .then(function (rows) {
                var out = {};
                rows.forEach(function (r) { out[r.step_id] = r.answers; });
                return out;
            });
    }

    function updateApplicant(id, patch) {
        return staff('hiring_applicants?id=eq.' + q(id), 'PATCH', patch, 'return=minimal');
    }

    /* Removes the files an applicant uploaded, then the applicant (and with them
     * their answers). Files first: once the row is gone nothing records the
     * folder name, and the files would sit in the bucket with no way to find them. */
    function deleteApplicant(applicant) {
        return removeFolder(BUCKET, applicant.token).then(function () {
            return removeFolder(VIDEO_BUCKET, applicant.token);
        }).then(function () {
            return staff('hiring_applicants?id=eq.' + q(applicant.id), 'DELETE', undefined, 'return=minimal');
        });
    }

    /* Deletes everything in one applicant's folder of a bucket. A bucket that does
     * not exist yet (a database that has not had the latest hiring.sql) simply has
     * nothing to delete, rather than stopping whatever called this. */
    function removeFolder(bucket, folder) {
        return authed(function () {
            return fetch(SUPABASE.url + '/storage/v1/object/list/' + bucket, {
                method: 'POST',
                headers: headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ prefix: folder, limit: 1000, offset: 0 })
            });
        }).then(check).then(function (items) {
            var paths = (items || []).filter(function (o) { return o && o.name; })
                .map(function (o) { return folder + '/' + o.name; });
            if (!paths.length) return null;
            return authed(function () {
                return fetch(SUPABASE.url + '/storage/v1/object/' + bucket, {
                    method: 'DELETE',
                    headers: headers({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ prefixes: paths })
                });
            }).then(check);
        }).catch(function (ex) {
            if (/bucket not found/i.test(ex && ex.message)) return null;
            throw ex;
        });
    }

    /* A role and everything in it: every applicant's files and videos, then the
     * applicants (their answers, clocks and email history go with them), then the
     * role (its steps and templates go with it).
     *
     * Files first, for the same reason as deleteApplicant: the folder names are
     * the applicants' tokens, and once those rows are gone nothing records where
     * the files are. If this stops part-way, running it again finishes the job.
     *
     * The database refuses to delete a role that still has applicants, which is
     * what stops an accidental delete taking everyone with it. Removing the
     * applicants first is the deliberate route past that. If someone applies in
     * the moment between the two, the role's delete is refused and the whole
     * thing runs once more to catch them.
     *
     * onProgress(done, total) reports applicants whose files are cleared. */
    function deleteJobCompletely(jobId, onProgress) {
        function attempt() {
            /* Sourced people's pictures first. Their rows go with the role, and
             * after that nothing says which folders were theirs. */
            return staff('hiring_prospects?select=id&job_id=eq.' + q(jobId)).catch(function () { return []; })
                .then(function (ps) {
                    var chain = Promise.resolve();
                    ps.forEach(function (p) { chain = chain.then(function () { return removeFolder(PROSPECT_BUCKET, p.id); }); });
                    return chain;
                }).then(function () {
                    return staff('hiring_applicants?select=id,token&job_id=eq.' + q(jobId));
                }).then(function (apps) {
                var queue = apps.slice(), done = 0, total = apps.length;
                /* A few folders at a time: one by one is slow on a busy role, all
                 * at once is a burst of hundreds of requests. */
                function worker() {
                    var a = queue.shift();
                    if (!a) return Promise.resolve();
                    return removeFolder(BUCKET, a.token).then(function () {
                        return removeFolder(VIDEO_BUCKET, a.token);
                    }).then(function () {
                        done++;
                        if (onProgress) onProgress(done, total);
                        return worker();
                    });
                }
                var workers = [];
                for (var i = 0; i < Math.min(4, total); i++) workers.push(worker());
                return Promise.all(workers);
            }).then(function () {
                return staff('hiring_applicants?job_id=eq.' + q(jobId), 'DELETE', undefined, 'return=minimal');
            }).then(function () {
                return staff('hiring_jobs?id=eq.' + q(jobId), 'DELETE', undefined, 'return=minimal');
            });
        }
        return attempt().catch(function (ex) {
            if (/foreign key|violates/i.test(ex && ex.message)) return attempt();
            throw ex;
        });
    }

    /* ----------------------------------------------------------------- emails */

    /* What a role says when it rejects someone, until it is edited. {{first_name}},
     * {{name}} and {{role}} are filled in before the email is shown for sending. */
    var DEFAULT_TEMPLATES = {
        rejected: {
            subject: 'Your application for {{role}}',
            body: 'Hi {{first_name}},\n\n' +
                'Thank you for applying for the {{role}} role, and for the time you put into it.\n\n' +
                'We have decided not to take your application further. It was not an easy decision, ' +
                'and we had to choose between a number of strong candidates.\n\n' +
                'We wish you every success, and hope our paths cross again.\n\n' +
                'The FWT team'
        }
    };

    function fill(text, vars) {
        return String(text || '').replace(/\{\{\s*(first_name|name|role)\s*\}\}/g, function (m, k) { return vars[k] || ''; });
    }

    function templateVars(applicant, job) {
        var name = String(applicant.name || '').trim();
        return { name: name, first_name: name.split(/\s+/)[0] || name, role: (job && job.title) || '' };
    }

    /* The saved template for this kind of email, shared by every role, or null
     * when it has never been edited. */
    function getTemplate(kind) {
        return staff('hiring_templates?select=subject,body&kind=eq.' + q(kind))
            .then(function (rows) { return rows[0] || null; });
    }

    function saveTemplate(kind, subject, body) {
        return staff('hiring_templates?on_conflict=kind', 'POST',
            { kind: kind, subject: subject, body: body },
            'resolution=merge-duplicates,return=minimal');
    }

    /* Emails already sent: { applicantId: [{ kind, sent_at, sent_by }] }, newest first. */
    function emailLog(applicantIds) {
        if (!applicantIds.length) return Promise.resolve({});
        return staff('hiring_email_log?select=applicant_id,kind,sent_at,sent_by&order=sent_at.desc&applicant_id=in.(' +
            applicantIds.map(q).join(',') + ')').then(function (rows) {
            var out = {};
            rows.forEach(function (r) { (out[r.applicant_id] = out[r.applicant_id] || []).push(r); });
            return out;
        });
    }

    /* Sends through the hiring-email Edge Function, which holds the Resend key.
     * The recipient is never passed: the function looks it up. Rejects with an
     * Error whose `code` is 'already' (with `sent_at`) when it was sent before. */
    function sendEmail(applicantId, kind, subject, body, force) {
        return authed(function () {
            return fetch(SUPABASE.url + '/functions/v1/hiring-email', {
                method: 'POST',
                headers: headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ applicant_id: applicantId, kind: kind, subject: subject, body: body, force: !!force })
            });
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
                if (r.ok) return j;
                var e = new Error(j.error || j.message || ('The email could not be sent (' + r.status + ').'));
                if (r.status === 409) { e.code = 'already'; e.sent_at = j.sent_at; }
                if (r.status === 404 && /function was not found/i.test(j.message || '')) {
                    e.message = 'The email function is not set up yet. Deploy supabase/functions/hiring-email (see the README).';
                }
                throw e;
            });
        });
    }

    /* A link to something an applicant uploaded. Documents expire in five minutes;
     * a video gets an hour, because a player keeps asking for the next part of the
     * file while it plays and a link that lapsed mid-video would stop it. */
    function fileUrl(path, kind) {
        return kind === 'video'
            ? Backend.signedUrl(VIDEO_BUCKET, path, 3600)
            : Backend.signedUrl(BUCKET, path, 300);
    }

    /* Attach a video to a step. Goes to the public media bucket and comes back as
     * its address, which is what the step stores. */
    function uploadBrief(file, onProgress) {
        return Backend.uploadFile(file, 'video', MEDIA_BUCKET, onProgress);
    }

    /* --------------------------------------------------------------- sourcing */

    /* Photos and screenshots of sourced people. Private: opened through signed
     * links, in a folder named after the prospect's id. */
    var PROSPECT_BUCKET = 'hiring-prospects';

    var PROSPECT_STAGES = [
        { key: 'discovered', label: 'Found',      tone: '' },
        { key: 'enriched',   label: 'Found',      tone: '' },
        { key: 'scored',     label: 'Scored',     tone: '' },
        { key: 'queued',     label: 'To review',  tone: 'look' },
        { key: 'maybe',      label: 'Maybe',      tone: 'look' },
        { key: 'passed',     label: 'Passed',     tone: 'no' },
        { key: 'reach_out',  label: 'To contact', tone: 'go' },
        { key: 'contacted',  label: 'Contacted',  tone: 'go' },
        { key: 'replied',    label: 'Replied',    tone: 'go' },
        { key: 'declined',   label: 'Declined',   tone: 'no' },
        { key: 'applied',    label: 'Applied',    tone: 'go' },
        { key: 'dropped',    label: 'Dropped',    tone: '' }
    ];

    var SOURCES = [
        { key: 'linkedin',  label: 'LinkedIn profiles, through search results' },
        { key: 'github',    label: 'GitHub' },
        { key: 'portfolio', label: 'Portfolio and personal sites' },
        { key: 'similar',   label: 'People similar to those you picked' }
    ];

    var SOURCE_LABELS = {
        linkedin: 'LinkedIn search', github: 'GitHub', portfolio: 'Portfolio search',
        similar: 'Similar to a pick', web: 'Web search', manual: 'Added by hand', inbound: 'Applied'
    };

    var CARD_SHOWS = [
        { key: 'screenshots', label: 'Screenshots of their work' },
        { key: 'github',      label: 'GitHub activity' },
        { key: 'writing',     label: 'Writing and talks' }
    ];

    /* What a role's sourcing starts as, before anyone has saved it. Mirrors the
     * column defaults in hiring_sourcing. */
    function defaultSourcing(jobId) {
        return {
            job_id: jobId, enabled: false, cards_per_week: 12, weekly_budget: 60,
            archetypes: [], examples: [], regions: [], base_timezone: '', overlap_hours: 0,
            sources: ['linkedin', 'github', 'portfolio'], skip: [], card_shows: ['screenshots'],
            swipers: [], outreach_by: [], message: DEFAULT_MESSAGE
        };
    }

    var DEFAULT_MESSAGE = 'Hi {{first_name}},\n\n' +
        '{{personal_line}}\n\n' +
        'We are hiring a {{role}} at {{company}}, and I think you could be a great fit. ' +
        'Everything about the role, and a short case study, is here:\n\n' +
        '{{apply_link}}\n\n' +
        '{{signature}}';

    /* Fills an outreach message. Unlike `fill`, which knows the three applicant
     * email words, this takes whatever the caller hands it; a word it is not
     * given is left as it was, so a gap is visible rather than silently blank.
     * A line that ends up empty (no personal line yet) is dropped with the blank
     * line after it. */
    function fillMessage(text, vars) {
        return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) {
            return Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : m;
        }).replace(/\n{3,}/g, '\n\n').trim();
    }

    function getSettings() {
        return staff('hiring_settings?select=*').then(function (rows) { return rows[0] || null; });
    }

    function saveSettings(s) {
        return staff('hiring_settings?id=eq.true', 'PATCH', {
            company: s.company, about: s.about, signature: s.signature, pass_reasons: s.pass_reasons,
            sourcing_admins: s.sourcing_admins, monthly_limit: s.monthly_limit, keep_passed_days: s.keep_passed_days
        }, 'return=representation').then(function (rows) { return rows[0]; });
    }

    function getSourcing(jobId) {
        return staff('hiring_sourcing?select=*&job_id=eq.' + q(jobId)).then(function (rows) {
            return rows[0] || null;
        });
    }

    function saveSourcing(s) {
        var body = {
            job_id: s.job_id, enabled: !!s.enabled, cards_per_week: s.cards_per_week, weekly_budget: s.weekly_budget,
            archetypes: s.archetypes, examples: s.examples, regions: s.regions, base_timezone: s.base_timezone,
            overlap_hours: s.overlap_hours, sources: s.sources, skip: s.skip, card_shows: s.card_shows,
            swipers: s.swipers, outreach_by: s.outreach_by, message: s.message,
            updated_by: Backend.currentEmail()
        };
        return staff('hiring_sourcing?on_conflict=job_id', 'POST', body,
            'resolution=merge-duplicates,return=representation').then(function (rows) { return rows[0]; });
    }

    /* Every version of a role's criteria, newest first. A card scored against an
     * older version needs that version's labels, not today's. */
    function listCriteria(jobId) {
        return staff('hiring_criteria?select=*&order=version.desc&job_id=eq.' + q(jobId));
    }

    /* The newest version of a role's criteria, or null when it has none yet. */
    function getCriteria(jobId) {
        return staff('hiring_criteria?select=*&order=version.desc&limit=1&job_id=eq.' + q(jobId))
            .then(function (rows) { return rows[0] || null; });
    }

    /* Criteria are never edited in place: a change is a new version, so scores
     * made against the old one still mean what they meant. Two people saving at
     * once both aim for the same number, and the database refuses the second;
     * trying again takes the next one. */
    function saveCriteria(jobId, c, snapshot) {
        function attempt(tries) {
            return getCriteria(jobId).then(function (cur) {
                return staff('hiring_criteria', 'POST', {
                    job_id: jobId, version: cur ? cur.version + 1 : 1,
                    must_haves: c.must_haves, criteria: c.criteria,
                    description_snapshot: snapshot || '', created_by: Backend.currentEmail()
                }, 'return=representation');
            }).then(function (rows) { return rows[0]; }).catch(function (ex) {
                if (tries > 0 && /duplicate key/i.test(ex && ex.message)) return attempt(tries - 1);
                throw ex;
            });
        }
        return attempt(2);
    }

    /* Everything the swipe and outreach screens draw, in one read. The token is
     * left out here; outreach asks for it separately, when it builds a link. */
    var PROSPECT_COLS = 'id,job_id,name,headline,company,location,timezone,years_experience,summary,experience,' +
        'tags,personal_line,photo_path,screenshots,linkedin_url,portfolio_url,portfolio_embeds,github_url,product_url,stage,' +
        'applicant_id,created_at,updated_at,' +
        'hiring_prospect_scores(criteria_id,match,must_haves,scores,weakest,created_at),' +
        'hiring_prospect_sources(source,query,found_at),' +
        'hiring_decisions(id,decision,reasons,note,decided_by,decided_at),' +
        'hiring_outreach(message,channel,status,sent_by,sent_at,replied_at,updated_at)';

    function listProspects(jobId, stages) {
        return staff('hiring_prospects?select=' + PROSPECT_COLS + '&order=created_at.asc&job_id=eq.' + q(jobId) +
            (stages ? '&stage=in.(' + stages.map(q).join(',') + ')' : ''));
    }

    /* The personal-link tokens for some prospects: { prospectId: token }. */
    function prospectTokens(ids) {
        if (!ids.length) return Promise.resolve({});
        return staff('hiring_prospects?select=id,token&id=in.(' + ids.map(q).join(',') + ')').then(function (rows) {
            var out = {};
            rows.forEach(function (r) { out[r.id] = r.token; });
            return out;
        });
    }

    /* How many prospects each role has at each stage, for the roles list:
     * { jobId: { queued: 4, reach_out: 2, ... } }. */
    function prospectCounts() {
        return staff('hiring_prospects?select=job_id,stage').then(function (rows) {
            var out = {};
            rows.forEach(function (r) {
                var c = out[r.job_id] || (out[r.job_id] = {});
                c[r.stage] = (c[r.stage] || 0) + 1;
            });
            return out;
        }).catch(function () { return {}; });
    }

    /* The most recent search run for a role, or null when none has run. */
    function lastRun(jobId) {
        return staff('hiring_agent_runs?select=*&order=started_at.desc&limit=1&job_id=eq.' + q(jobId))
            .then(function (rows) { return rows[0] || null; }).catch(function () { return null; });
    }

    /* Makes sure a prospect has an outreach row, without touching one that is
     * already there. */
    function ensureOutreach(prospectId, message) {
        return staff('hiring_outreach?on_conflict=prospect_id', 'POST', { prospect_id: prospectId, message: message || '' },
            'resolution=ignore-duplicates,return=minimal');
    }

    /* Which roles have sourcing switched on: { jobId: true }. */
    function sourcingFlags() {
        return staff('hiring_sourcing?select=job_id,enabled&enabled=eq.true').then(function (rows) {
            var out = {};
            rows.forEach(function (r) { out[r.job_id] = true; });
            return out;
        }).catch(function () { return {}; });
    }

    /* A swipe. The database moves the prospect's stage when the decision lands.
     * Reaching out also writes the outreach row with the message ready, unless
     * one is already there (a second right-swipe keeps the first message). */
    function decide(prospectId, decision, reasons, note, message) {
        return staff('hiring_decisions', 'POST', {
            prospect_id: prospectId, decision: decision, reasons: reasons || [],
            note: note || null, decided_by: Backend.currentEmail()
        }, 'return=representation').then(function (rows) {
            var made = rows[0];
            if (decision !== 'reach_out') return made;
            return staff('hiring_outreach?on_conflict=prospect_id', 'POST',
                { prospect_id: prospectId, message: message || '' },
                'resolution=ignore-duplicates,return=minimal').then(function () { return made; });
        });
    }

    /* Takes a swipe back. Removing the decision puts the stage back to what the
     * one before it said (or to review). An outreach row that was never sent goes
     * too; one that was sent stays, because that already happened. */
    function undoDecision(d, prospectId) {
        return staff('hiring_decisions?id=eq.' + q(d.id), 'DELETE', undefined, 'return=minimal').then(function () {
            if (d.decision !== 'reach_out') return null;
            return staff('hiring_outreach?prospect_id=eq.' + q(prospectId) + '&status=eq.ready',
                'DELETE', undefined, 'return=minimal');
        });
    }

    /* Adds the reasons to a pass after the fact: the card is already gone when
     * they are picked. */
    function updateDecision(id, patch) {
        return staff('hiring_decisions?id=eq.' + q(id), 'PATCH', patch, 'return=minimal');
    }

    function updateOutreach(prospectId, patch) {
        return staff('hiring_outreach?prospect_id=eq.' + q(prospectId), 'PATCH', patch, 'return=minimal');
    }

    /* Signed links for many prospect files at once: { path: url }. One request
     * for a whole deck of cards rather than one per picture. An hour, so a screen
     * left open while someone works through the queue keeps its pictures. */
    function prospectFileUrls(paths) {
        paths = paths.filter(Boolean);
        if (!paths.length) return Promise.resolve({});
        return authed(function () {
            return fetch(SUPABASE.url + '/storage/v1/object/sign/' + PROSPECT_BUCKET, {
                method: 'POST',
                headers: headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ expiresIn: 3600, paths: paths })
            });
        }).then(check).then(function (rows) {
            var out = {};
            (rows || []).forEach(function (r) {
                var u = r && (r.signedURL || r.signedUrl);
                if (!u) return;
                out[r.path] = u.indexOf('/storage/v1') === 0 ? SUPABASE.url + u : SUPABASE.url + '/storage/v1' + u;
            });
            return out;
        }).catch(function () { return {}; });
    }

    /* A prospect and their pictures. Pictures first, for the same reason as an
     * applicant's files: once the row is gone nothing records the folder. */
    function deleteProspect(id) {
        return removeFolder(PROSPECT_BUCKET, id).then(function () {
            return staff('hiring_prospects?id=eq.' + q(id), 'DELETE', undefined, 'return=minimal');
        });
    }

    /* Clears passed and dropped prospects untouched for `days`, across every
     * role. Returns how many went. Done from here rather than in SQL because the
     * pictures have to go through the storage API. */
    function purgeProspects(days) {
        var cutoff = new Date(Date.now() - days * 86400000).toISOString();
        return staff('hiring_prospects?select=id&stage=in.(passed,dropped)&updated_at=lt.' + q(cutoff))
            .then(function (rows) {
                var chain = Promise.resolve();
                rows.forEach(function (r) { chain = chain.then(function () { return deleteProspect(r.id); }); });
                return chain.then(function () { return rows.length; });
            });
    }

    /* Asks the hiring-ai Edge Function to draft a role's criteria from its
     * description. Returns { must_haves, criteria, archetypes, card_shows }; it
     * saves nothing, so the person can read it and change it first. */
    function draftCriteria(jobId) {
        return authed(function () {
            return fetch(SUPABASE.url + '/functions/v1/hiring-ai', {
                method: 'POST',
                headers: headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ action: 'draft_criteria', job_id: jobId })
            });
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
                if (r.ok) return j;
                var msg = j.error || j.message || ('The draft could not be made (' + r.status + ').');
                if (r.status === 404 && /function was not found/i.test(j.message || '')) {
                    msg = 'The AI function is not set up yet. Deploy supabase/functions/hiring-ai (see the README).';
                }
                throw new Error(msg);
            });
        });
    }

    /* ------------------------------------------------- the public (applicant) side */

    function anonGet(path) {
        return fetch(SUPABASE.url + '/rest/v1/' + path, { headers: Backend.anonHeaders() }).then(check);
    }

    /* Only an OPEN job is visible to the public; for anything else this is null. */
    function publicJob(slug) {
        return anonGet('hiring_jobs?select=id,slug,title,team,summary,description&status=eq.open&slug=eq.' +
            q(slug)).then(function (rows) { return rows[0] || null; });
    }

    /* The steps as the public may see them. A timed step arrives with its title
     * and limit but no content; that comes from openStep() once the clock starts. */
    function outline(slug) {
        return Backend.rpc('hiring_outline', { p_slug: slug }, true);
    }

    /* A step's full content. For a timed step, start=true starts the clock (once;
     * asking again returns the same deadline) and start=false only works if it is
     * already running. */
    function openStep(token, stepId, start) {
        return Backend.rpc('hiring_open_step', { p_token: token, p_step: stepId, p_start: !!start }, true);
    }

    /* Staff previewing a funnel that is still a draft. Same shapes as above, read
     * with the staff session, which is the only way to see a job that is not open. */
    function previewJob(slug) {
        return staff('hiring_jobs?select=id,slug,title,team,summary,description&slug=eq.' + q(slug))
            .then(function (rows) { return rows[0] || null; });
    }

    function previewSteps(jobId) {
        return staff('hiring_steps?select=id,position,title,body,video_url,fields,time_limit_hours,intro&order=position.asc&job_id=eq.' +
            q(jobId));
    }

    /* `ref` is the token from a sourced person's personal link, when there is
     * one; it joins the application to them. */
    function apply(slug, name, email, ref) {
        var args = { p_slug: slug, p_name: name, p_email: email };
        if (ref) args.p_ref = ref;
        return Backend.rpc('hiring_apply', args, true);
    }

    function progress(token) {
        return Backend.rpc('hiring_progress', { p_token: token }, true);
    }

    function saveStep(token, stepId, answers) {
        return Backend.rpc('hiring_save_step', { p_token: token, p_step: stepId, p_answers: answers }, true);
    }

    /* Asks the hiring-notify Edge Function for the applicant's own email: kind is
     * 'started' or 'submitted'. Safe to call again and again: the function sends
     * each one once per applicant and answers "already" after that. Never throws
     * and never holds anything up, because an email that fails must not stop
     * someone applying. */
    function notify(token, kind) {
        if (!token) return Promise.resolve(null);
        return fetch(SUPABASE.url + '/functions/v1/hiring-notify', {
            method: 'POST',
            headers: Backend.anonHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ token: token, kind: kind })
        }).then(function (r) { return r.json().catch(function () { return null; }); })
          .catch(function () { return null; });
    }

    /* kind is 'applicant' for documents or 'video' for a video answer. */
    function uploadApplicantFile(token, file, kind, onProgress) {
        return Backend.uploadPrivate(kind === 'video' ? VIDEO_BUCKET : BUCKET, token, file,
            kind === 'video' ? 'video' : 'applicant', onProgress);
    }

    return {
        FIELD_TYPES: FIELD_TYPES,
        APPLICANT_STATUSES: APPLICANT_STATUSES,
        JOB_STATUSES: JOB_STATUSES,
        isHttps: isHttps,
        checkLink: checkLink,
        linkHref: linkHref,
        acceptAttr: function (kind) { return Backend.acceptAttr(kind === 'video' ? 'video' : 'applicant'); },
        maxMb: function (kind) { return Backend.maxMb(kind === 'video' ? 'video' : 'applicant'); },
        uploadBrief: uploadBrief,
        DEFAULT_TEMPLATES: DEFAULT_TEMPLATES,
        fill: fill,
        templateVars: templateVars,
        getTemplate: getTemplate,
        saveTemplate: saveTemplate,
        emailLog: emailLog,
        sendEmail: sendEmail,

        listJobs: listJobs,
        applicantCounts: applicantCounts,
        getJob: getJob,
        saveJob: saveJob,
        setJobStatus: setJobStatus,
        deleteJob: deleteJob,
        deleteJobCompletely: deleteJobCompletely,
        listSteps: listSteps,
        saveSteps: saveSteps,
        PROSPECT_STAGES: PROSPECT_STAGES,
        SOURCES: SOURCES,
        SOURCE_LABELS: SOURCE_LABELS,
        CARD_SHOWS: CARD_SHOWS,
        DEFAULT_MESSAGE: DEFAULT_MESSAGE,
        defaultSourcing: defaultSourcing,
        fillMessage: fillMessage,
        getSettings: getSettings,
        saveSettings: saveSettings,
        getSourcing: getSourcing,
        saveSourcing: saveSourcing,
        listCriteria: listCriteria,
        getCriteria: getCriteria,
        saveCriteria: saveCriteria,
        listProspects: listProspects,
        prospectTokens: prospectTokens,
        prospectCounts: prospectCounts,
        sourcingFlags: sourcingFlags,
        lastRun: lastRun,
        ensureOutreach: ensureOutreach,
        decide: decide,
        undoDecision: undoDecision,
        updateDecision: updateDecision,
        updateOutreach: updateOutreach,
        prospectFileUrls: prospectFileUrls,
        deleteProspect: deleteProspect,
        purgeProspects: purgeProspects,
        draftCriteria: draftCriteria,

        listApplicants: listApplicants,
        responseSteps: responseSteps,
        listStarts: listStarts,
        setDeadline: setDeadline,
        getResponses: getResponses,
        updateApplicant: updateApplicant,
        deleteApplicant: deleteApplicant,
        fileUrl: fileUrl,

        publicJob: publicJob,
        outline: outline,
        openStep: openStep,
        previewJob: previewJob,
        previewSteps: previewSteps,
        apply: apply,
        progress: progress,
        saveStep: saveStep,
        notify: notify,
        uploadApplicantFile: uploadApplicantFile
    };
})();
