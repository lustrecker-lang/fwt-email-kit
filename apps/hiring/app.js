/* The hiring tool, staff side: roles, their funnels, and the people in them.
 *
 * Routes (hash): #/ roles  ·  #/new  ·  #/j/<id> edit  ·  #/j/<id>/applicants
 * Sign-in is shared with the other tools through Backend.
 */

var esc = UI.esc, toast = UI.toast;
function $(id) { return document.getElementById(id); }

/* 16x16 line icons, drawn in currentColor like the rest of the interface. */
function svg(path) { return '<svg viewBox="0 0 16 16" aria-hidden="true">' + path + '</svg>'; }
var ICON = {
    x:    svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    chev: svg('<path d="M4 6l4 4 4-4"/>'),
    help: svg('<circle cx="8" cy="8" r="5.6"/><path d="M6.4 6.3a1.65 1.65 0 013.25.42c0 1.1-1.65 1.35-1.65 2.45"/><path d="M8 11.4h.01"/>'),
    copy: svg('<rect x="5.4" y="5.4" width="8" height="8" rx="1.6"/><path d="M10.6 5.4V4a1.4 1.4 0 00-1.4-1.4H4A1.4 1.4 0 002.6 4v5.2A1.4 1.4 0 004 10.6h1.4"/>'),
    play: svg('<path d="M5.4 3.6v8.8l7-4.4z"/>'),
    doc:  svg('<path d="M4 2.6h4.8l3.2 3.2v7.6H4z"/><path d="M8.8 2.6v3.2H12"/>')
};

/* Every explanation in the editor lives behind a small i on the thing it
 * explains, rather than in a paragraph underneath it. */
var TIPS = {
    status: 'Draft: only you can see it. Open: the link accepts applicants. Closed: the link stops accepting them.',
    slug: 'The end of the applicant link (apply.html?job=\u2026). Lower-case letters, numbers and hyphens. Set it before you share the link; changing it later breaks links already sent.',
    desc: 'A blank line starts a new paragraph.',
    steps: 'Applicants go through these in order. Each step unlocks the next.',
    text: 'What the applicant reads on this step. A blank line starts a new paragraph.',
    video: 'A video that plays above the questions. MP4, MOV or WebM, up to 50 MB. On a timed step it only appears once the applicant starts the clock.',
    intro: 'Shown on the start screen, before the clock runs, so the applicant can prepare: what they will be asked to do, what to have ready, how to plan their time. The step\u2019s own text, video and questions stay hidden until they press Start.',
    time: 'The applicant gets this many hours from the moment they press Start, and a late answer is refused. Until they start, they cannot see this step\u2019s text, video or questions.',
    notes: 'Only signed-in staff can see these.',
    timers: 'The clock on each timed step. Giving more time moves the deadline a full day on from now, or from the old deadline if that is later.'
};

var S = {
    jobs: [], counts: {},
    job: null,            /* the role being edited */
    steps: [],            /* its funnel, in order */
    removed: [],          /* ids of steps taken out since the last save */
    dirty: false,
    hintOpen: {},         /* question id -> its help-text box is showing */
    slugTouched: false,   /* once the link name is typed by hand, stop deriving it */
    app: { job: null, steps: [], list: [], answered: {}, starts: {}, filter: 'all', open: null }
};

/* ================================================================== router */

function showView(name) {
    ['viewLogin', 'viewJobs', 'viewJob', 'viewApplicants'].forEach(function (v) {
        $(v).classList.toggle('on', v === name);
    });
}

function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

function route() {
    var h = location.hash || '#/', m;
    if (!Backend.isSignedIn()) { showView('viewLogin'); return; }

    if (h === '#/new') { showView('viewJob'); startNewJob(); return; }
    if ((m = h.match(/^#\/j\/([0-9a-f-]+)\/applicants$/i))) { showView('viewApplicants'); openApplicants(m[1]); return; }
    if ((m = h.match(/^#\/j\/([0-9a-f-]+)$/i))) { showView('viewJob'); openJob(m[1]); return; }

    showView('viewJobs');
    loadJobs();
}
window.addEventListener('hashchange', route);

/* Leaving the editor with unsaved work asks first. Only the buttons in this app
 * can be intercepted; the browser's own prompt covers closing the tab. */
function leaveTo(hash) {
    if (!S.dirty) { go(hash); return; }
    UI.ask({ title: 'Discard your changes?', body: 'This role has changes that are not saved.', yes: 'Discard' })
        .then(function (yes) { if (yes) { S.dirty = false; go(hash); } });
}

window.addEventListener('beforeunload', function (e) {
    if (S.dirty && $('viewJob').classList.contains('on')) { e.preventDefault(); e.returnValue = ''; }
});

/* Turn a database or network error into a sentence about what to do. */
function friendly(ex) {
    var m = (ex && ex.message) || String(ex);
    if (/hiring_jobs_slug_key|duplicate key.*slug/i.test(m)) return 'Another role already uses that link name. Pick a different one.';
    if (/on table "hiring_jobs".*hiring_applicants|hiring_applicants_job_id_fkey/i.test(m)) {
        return 'Someone applied while the role was being deleted.';
    }
    if (/foreign key|violates.*hiring_responses/i.test(m)) {
        return 'A step that applicants have already answered cannot be deleted. Keep the step, or close the role.';
    }
    /* Buckets and columns are created by supabase/hiring.sql, so a missing one
     * means the database is behind the code. */
    if (/bucket not found|could not find the '\w+' column|could not find the table|relation .* does not exist/i.test(m)) {
        return 'The database is behind this version of the app. Run supabase/hiring.sql again in the Supabase SQL Editor, then retry.';
    }
    return m;
}

/* ================================================================== login */

$('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('loginGo'), err = $('loginErr');
    btn.disabled = true; btn.textContent = 'Signing in…'; err.textContent = '';
    Backend.signIn($('loginEmail').value.trim(), $('loginPass').value).then(function () {
        $('loginPass').value = '';
        go('#/'); route();
    }).catch(function (ex) {
        err.textContent = ex.message;
    }).then(function () {
        btn.disabled = false; btn.textContent = 'Sign in';
    });
});

$('btnSignOut').addEventListener('click', function () {
    Backend.signOut().then(function () { location.hash = '#/'; route(); });
});

Backend.onAuthLost(function () {
    toast('Your session expired. Sign in again to carry on.', 'err');
    route();
    $('loginEmail').focus();
});

/* ============================================================== roles list */

function publicLink(slug, preview) {
    return new URL('apply.html?job=' + encodeURIComponent(slug) + (preview ? '&preview=1' : ''), location.href).href;
}

function toneOf(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].tone;
    return '';
}

function statusSelect(list, value, attr, id, label) {
    return '<select class="pill ' + toneOf(list, value) + '" ' + attr + '="' + esc(id) + '"' +
        ' aria-label="' + esc(label) + '">' +
        list.map(function (s) {
            return '<option value="' + s.key + '"' + (s.key === value ? ' selected' : '') + '>' + s.label + '</option>';
        }).join('') + '</select>';
}

function loadJobs() {
    $('jobList').innerHTML = '<div class="blank">Loading…</div>';
    Promise.all([HiringApi.listJobs(), HiringApi.applicantCounts()]).then(function (r) {
        S.jobs = r[0]; S.counts = r[1];
        renderJobs();
    }).catch(function (ex) {
        $('jobList').innerHTML = '<div class="blank">Could not load roles:<br>' + esc(friendly(ex)) + '</div>';
    });
}

function renderJobs() {
    if (!S.jobs.length) {
        $('jobList').innerHTML = '<div class="blank">No roles yet.<br>Hit <b>New role</b> to build your first funnel.</div>';
        return;
    }
    $('jobList').innerHTML = '<div class="panel"><table class="tbl"><thead><tr>' +
        '<th>Role</th><th class="shrink">Status</th><th>Applicants</th><th>Updated</th><th></th>' +
        '</tr></thead><tbody>' +
        S.jobs.map(function (j) {
            var c = S.counts[j.id] || { total: 0, submitted: 0 };
            return '<tr data-open="' + esc(j.id) + '">' +
                '<td class="nm"><b>' + esc(j.title) + '</b>' + (j.team ? '<small>' + esc(j.team) + '</small>' : '') + '</td>' +
                '<td class="shrink">' + statusSelect(HiringApi.JOB_STATUSES, j.status, 'data-jstatus', j.id, 'Status for ' + j.title) + '</td>' +
                '<td class="sm"><button type="button" class="linkbtn" data-apps="' + esc(j.id) + '">' + c.total +
                    (c.total === 1 ? ' applicant' : ' applicants') + '</button>' +
                    (c.total ? ' \u00b7 ' + c.submitted + ' submitted' : '') + '</td>' +
                '<td class="sm">' + UI.fmtDate(j.updated_at) + '</td>' +
                '<td class="rowacts">' +
                    '<button class="iconbtn" data-link="' + esc(j.slug) + '" title="Copy the applicant link" aria-label="Copy the applicant link">' + ICON.copy + '</button>' +
                    '<button class="iconbtn del" data-del="' + esc(j.id) + '" title="Delete" aria-label="Delete">' + ICON.x + '</button>' +
                '</td></tr>';
        }).join('') + '</tbody></table></div>';
}

$('btnNewJob').addEventListener('click', function () { go('#/new'); });

$('jobList').addEventListener('click', function (e) {
    if (e.target.closest('[data-jstatus]')) { e.stopPropagation(); return; }

    var apps = e.target.closest('[data-apps]');
    if (apps) { go('#/j/' + apps.getAttribute('data-apps') + '/applicants'); return; }

    var link = e.target.closest('[data-link]');
    if (link) {
        UI.copyText(publicLink(link.getAttribute('data-link'))).then(function () { toast('Applicant link copied'); });
        return;
    }

    var del = e.target.closest('[data-del]');
    if (del) {
        var job = S.jobs.filter(function (j) { return j.id === del.getAttribute('data-del'); })[0];
        if (!job) return;
        deleteRole(job, del.closest('tr'));
        return;
    }

    var row = e.target.closest('[data-open]');
    if (row) go('#/j/' + row.getAttribute('data-open'));
});

/* Deleting a role. Never refused: it asks once, says exactly what goes with it,
 * and then removes all of it, applicants included. */
function deleteRole(job, row) {
    var n = (S.counts[job.id] || {}).total || 0;
    var people = n === 1 ? '1 applicant' : n + ' applicants';
    UI.ask({
        title: 'Delete \u201c' + job.title + '\u201d?',
        body: n
            ? 'This permanently deletes the role, its steps, and all ' + people + ': their answers, uploaded files and videos, ' +
              'timers, notes and email history. It cannot be undone. To keep the applicants, set the role to Closed instead.'
            : 'The role and its steps are removed. This cannot be undone.',
        yes: n ? 'Delete everything' : 'Delete',
        danger: true
    }).then(function (yes) {
        if (!yes) return;
        /* The row says what is happening while files are cleared, which takes a
         * moment on a role with many applicants. */
        var note = row && row.querySelector('td.nm small');
        if (!note && row) { note = document.createElement('small'); row.querySelector('td.nm').appendChild(note); }
        if (row) { row.style.opacity = '.55'; row.style.pointerEvents = 'none'; }
        if (note) note.textContent = 'Deleting\u2026';
        return HiringApi.deleteJobCompletely(job.id, function (done, total) {
            if (note) note.textContent = 'Deleting files\u2026 ' + done + ' of ' + total;
        }).then(loadJobs).then(function () {
            toast('Deleted \u201c' + job.title + '\u201d' + (n ? ' and ' + people : ''));
        }).catch(function (ex) {
            toast('Delete did not finish: ' + friendly(ex) + ' Try again to finish it.', 'err');
            loadJobs();
        });
    });
}

$('jobList').addEventListener('change', function (e) {
    var sel = e.target.closest('[data-jstatus]');
    if (!sel) return;
    var id = sel.getAttribute('data-jstatus'), next = sel.value;
    var job = S.jobs.filter(function (j) { return j.id === id; })[0];
    if (!job || next === job.status) return;
    sel.disabled = true;

    /* An open role with no steps would let someone apply and then be stuck with
     * nothing to fill in. */
    var gate = next === 'open'
        ? HiringApi.listSteps(id).then(function (steps) {
            if (!steps.length) throw new Error('Add at least one step to this role before opening it.');
        })
        : Promise.resolve();

    gate.then(function () { return HiringApi.setJobStatus(id, next); }).then(function () {
        job.status = next;
        toast(next === 'open' ? 'Open. The applicant link is live.' : 'Status set to ' + next);
    }).catch(function (ex) {
        toast(friendly(ex), 'err');
        sel.value = job.status;
    }).then(function () {
        sel.disabled = false;
        sel.className = 'pill ' + toneOf(HiringApi.JOB_STATUSES, sel.value);
    });
});

/* ============================================================= role editor */

function randomId(prefix) { return prefix + Math.random().toString(36).slice(2, 8); }

function newField(type, label) {
    return { id: randomId('f'), label: label || '', type: type || 'text', required: false, hint: '', options: [] };
}

function newStep(title) {
    /* _video and _timed are the two switches. They are separate from the values
     * so a switch can be on before there is anything behind it (no video yet),
     * and so switching off and on again gives back what was there. */
    return { id: null, title: title || '', body: '', intro: '', video_url: '', time_limit_hours: null, fields: [],
             _video: false, _timed: false };
}

function markDirty() { S.dirty = true; }

function startNewJob() {
    S.dirty = false; S.removed = []; S.slugTouched = false;
    S.job = { id: null, slug: '', title: '', team: '', summary: '', description: '', status: 'draft' };

    /* A funnel to start from, so the shape is visible: a few quick questions,
     * then the case study. Delete or rewrite whatever does not fit. */
    var q = newStep('A few quick questions');
    q.body = 'Tell us a little about you. This takes about two minutes.';
    q.fields = [
        (function () { var f = newField('url', 'Portfolio or website'); f.required = true; return f; })(),
        (function () { var f = newField('longtext', 'Why this role?'); f.required = true; return f; })(),
        newField('file', 'CV')
    ];
    var c = newStep('Case study');
    c.body = 'Take your time. We care more about how you think than how fast you are.';
    c.time_limit_hours = 48;
    c._timed = true;
    c.intro = 'You will get a short brief and a video explaining the problem, then build a small solution. ' +
        'Have your usual tools ready and set aside a few focused hours; you can split the work across the two days.';
    c.fields = [
        (function () { var f = newField('github', 'Your repository'); f.required = true;
                       f.hint = 'Make it public, or invite us to it.'; return f; })(),
        (function () { var f = newField('video', 'A short video walking us through it'); f.required = true;
                       f.hint = 'A minute or two is plenty.'; return f; })(),
        newField('longtext', 'Anything we should know about your approach?')
    ];
    q._open = c._open = true;
    S.steps = [q, c];
    fillEditor();
}

function openJob(id) {
    S.dirty = false; S.removed = [];
    $('stepList').innerHTML = '<div class="blank">Loading…</div>';
    Promise.all([
        HiringApi.getJob(id), HiringApi.listSteps(id)
    ]).then(function (r) {
        if (!r[0]) { toast('That role no longer exists.', 'err'); go('#/'); return; }
        S.job = r[0];
        S.slugTouched = true;
        S.steps = r[1].map(function (s) {
            return {
                id: s.id, title: s.title, body: s.body || '', intro: s.intro || '', video_url: s.video_url || '',
                time_limit_hours: s.time_limit_hours || null, fields: s.fields || [],
                _video: !!s.video_url, _timed: s.time_limit_hours != null
            };
        });
        fillEditor();
    }).catch(function (ex) { toast(friendly(ex), 'err'); go('#/'); });
}

function fillEditor() {
    var j = S.job;
    $('jTitle').value = j.title; $('jTeam').value = j.team || '';
    $('jSummary').value = j.summary || ''; $('jDescription').value = j.description || '';
    $('jSlug').value = j.slug; $('jStatus').value = j.status;
    $('jSlug').classList.remove('bad');
    $('jobTitleBar').textContent = j.title || 'New role';

    var saved = !!j.id;
    ['btnJobApplicants', 'btnJobPreview', 'btnCopyLink'].forEach(function (id) {
        $(id).style.display = saved ? '' : 'none';
    });
    renderSteps();
}

['jTitle', 'jTeam', 'jSummary', 'jDescription', 'jSlug', 'jStatus'].forEach(function (id) {
    $(id).addEventListener('input', function () {
        var j = S.job;
        if (!j) return;
        markDirty();
        if (id === 'jTitle') {
            j.title = this.value;
            $('jobTitleBar').textContent = j.title || 'New role';
            if (!S.slugTouched) { j.slug = UI.slugify(j.title); $('jSlug').value = j.slug; }
        } else if (id === 'jSlug') {
            S.slugTouched = true;
            j.slug = UI.slugify(this.value, 60);
            if (this.value !== j.slug) this.value = j.slug;
        } else if (id === 'jTeam') j.team = this.value;
        else if (id === 'jSummary') j.summary = this.value;
        else if (id === 'jDescription') j.description = this.value;
        else if (id === 'jStatus') j.status = this.value;
    });
});

/* ---- steps ---- */

/* The tips on the static labels, added once. */
(function () {
    function tipOn(el, text) { el.insertAdjacentHTML('beforeend', UI.tip(text)); }
    tipOn(document.querySelector('label[for="jStatus"]'), TIPS.status);
    tipOn($('lblSlug'), TIPS.slug);
    tipOn($('lblDesc'), TIPS.desc);
    tipOn($('lblNotes'), TIPS.notes);
    $('stepsHead').querySelector('h2').insertAdjacentHTML('afterend', UI.tip(TIPS.steps));
})();

function iconBtn(act, icon, title, extra, disabled) {
    return '<button type="button" class="iconbtn' + (extra || '') + '" data-act="' + act + '" title="' + title +
        '" aria-label="' + title + '"' + (disabled ? ' disabled' : '') + '>' + ICON[icon] + '</button>';
}

/* `j` is the question's position within its step, which the click and input
 * handlers read back off data-f to find the right object. */
function questionHtml(f, j, many) {
    var hint = !!f.hint || !!S.hintOpen[f.id];
    return '<div class="q" data-f="' + j + '">' +
        '<div class="qtop">' +
            (many ? UI.grip('q', 'Question ' + (j + 1)) : '') +
            '<input type="text" data-fk="label" placeholder="Question" value="' + esc(f.label) + '" maxlength="200" aria-label="Question">' +
            '<select data-fk="type" aria-label="Answer type">' +
                HiringApi.FIELD_TYPES.map(function (t) {
                    return '<option value="' + t.key + '"' + (t.key === f.type ? ' selected' : '') + '>' + t.label + '</option>';
                }).join('') + '</select>' +
            '<label class="req"><input type="checkbox" data-fk="required"' + (f.required ? ' checked' : '') + '> Required</label>' +
            '<span class="tools">' +
                iconBtn('fhint', 'help', 'Add help text under this question') +
                iconBtn('fdel', 'x', 'Remove question', ' del') +
            '</span>' +
        '</div>' +
        (hint ? '<input type="text" class="hintrow" data-fk="hint" placeholder="Help text shown under the question" value="' +
            esc(f.hint || '') + '" maxlength="200" aria-label="Help text for this question">' : '') +
        (f.type === 'choice'
            ? '<textarea data-fk="options" rows="3" placeholder="One option per line" aria-label="Options">' +
                esc((f.options || []).join('\n')) + '</textarea>'
            : '') +
        '</div>';
}

/* One row of the step's settings: a name, its tip, a switch, and whatever the
 * switch reveals underneath. The whole row is the switch's label. */
function settingRow(name, tipText, on, which, body) {
    return '<div class="srow">' +
        '<label class="shead"><span>' + name + '</span>' + UI.tip(tipText) + '<span class="spacer"></span>' +
            UI.toggle(on, name, 'data-sw="' + which + '"') + '</label>' +
        (on ? '<div class="sbody">' + body + '</div>' : '') +
    '</div>';
}

function stepHtml(s, i) {
    var open = !!s._open, many = S.steps.length > 1;
    var head = '<div class="stephead"' + (open ? '' : ' role="button" tabindex="0" aria-expanded="false"') + '>' +
        (many ? UI.grip('step', 'Step ' + (i + 1)) : '') +
        '<span class="num">' + (i + 1) + '</span>' +
        (open
            ? '<input type="text" data-k="title" placeholder="Step title" value="' + esc(s.title) + '" maxlength="120" aria-label="Step title">'
            : '<span class="name' + (s.title ? '' : ' empty') + '">' + esc(s.title || 'Untitled step') + '</span>') +
        '<span class="tools">' +
            iconBtn('del', 'x', 'Remove step', ' del') +
            '<span class="chev" data-chev>' + ICON.chev + '</span>' +
        '</span>' +
    '</div>';
    if (!open) return '<div class="stepcard" data-s="' + i + '">' + head + '</div>';

    var video = s.video_url
        ? '<video class="brief" controls preload="metadata" playsinline src="' + esc(s.video_url) + '"></video>' +
          '<button type="button" class="sm" data-act="vidup">Replace video</button>'
        : '<button type="button" data-act="vidup">Upload a video</button>';
    var hours = '<div class="timebox"><input type="number" data-k="time_limit_hours" min="1" max="720" step="1" value="' +
        esc(s.time_limit_hours == null ? '' : s.time_limit_hours) + '" aria-label="Time limit in hours"> ' +
        '<span class="muted">hours</span></div>' +
        /* The start screen's own words. Only meaningful on a timed step, so it
         * lives under this switch. */
        '<div class="field intro"><label>Before they start' + UI.tip(TIPS.intro) + '</label>' +
            '<textarea data-k="intro" rows="3" maxlength="5000" placeholder="What is coming and what to have ready. ' +
            'Shown on the start screen, before the clock runs.">' + esc(s.intro || '') + '</textarea></div>';

    return '<div class="stepcard open" data-s="' + i + '">' + head +
        '<div class="stepbody">' +
            '<div class="field"><label>Text' + UI.tip(TIPS.text) + '</label>' +
                '<textarea data-k="body" rows="3" placeholder="Instructions, context, the brief\u2026">' + esc(s.body) + '</textarea></div>' +
            '<div class="settings">' +
                settingRow('Video', TIPS.video, !!s._video, 'video', video) +
                settingRow('Time limit', TIPS.time, !!s._timed, 'time', hours) +
            '</div>' +
            '<div>' +
                '<div class="qhead"><h3>Questions</h3></div>' +
                '<div class="qlist">' + s.fields.map(function (f, j) { return questionHtml(f, j, s.fields.length > 1); }).join('') + '</div>' +
                '<button type="button" class="addq" data-act="addfield">+ Add question</button>' +
            '</div>' +
        '</div>' +
    '</div>';
}

function renderSteps() {
    if (!S.steps.length) {
        $('stepList').innerHTML = '<div class="blank" style="padding:30px">No steps yet.</div>';
        return;
    }
    $('stepList').innerHTML = S.steps.map(stepHtml).join('');
}

$('stepList').addEventListener('input', function (e) {
    var card = e.target.closest('[data-s]');
    if (!card || e.target.hasAttribute('data-sw')) return;
    var s = S.steps[+card.getAttribute('data-s')];
    markDirty();

    var k = e.target.getAttribute('data-k');
    if (k) { s[k] = e.target.value; return; }
    var fk = e.target.getAttribute('data-fk');
    var fe = e.target.closest('[data-f]');
    if (!fk || !fe) return;
    var f = s.fields[+fe.getAttribute('data-f')];
    if (fk === 'required') f.required = e.target.checked;
    else if (fk === 'options') f.options = e.target.value.split('\n');
    else if (fk === 'label') f.label = e.target.value;
    else if (fk === 'hint') f.hint = e.target.value;
});

$('stepList').addEventListener('change', function (e) {
    var card = e.target.closest('[data-s]');
    if (!card) return;
    var i = +card.getAttribute('data-s'), s = S.steps[i];

    /* The two switches. Turning one off puts its value aside rather than losing
     * it, so turning it back on returns the same video or the same hours. */
    var sw = e.target.getAttribute('data-sw');
    if (sw === 'video') {
        s._video = e.target.checked;
        if (s._video) { s.video_url = s.video_url || s._videoKept || ''; }
        else { s._videoKept = s.video_url; s.video_url = ''; }
        markDirty(); renderSteps();
        refocus('[data-s="' + i + '"] [data-sw="video"]');
        return;
    }
    if (sw === 'time') {
        s._timed = e.target.checked;
        if (s._timed) { s.time_limit_hours = s.time_limit_hours || s._hoursKept || 48; }
        else { s._hoursKept = s.time_limit_hours; s.time_limit_hours = null; }
        markDirty(); renderSteps();
        refocus(s._timed ? '[data-s="' + i + '"] [data-k="time_limit_hours"]' : '[data-s="' + i + '"] [data-sw="time"]');
        return;
    }

    if (e.target.getAttribute('data-fk') !== 'type') return;
    var fe = e.target.closest('[data-f]');
    s.fields[+fe.getAttribute('data-f')].type = e.target.value;
    markDirty();
    renderSteps();
});

function refocus(selector) {
    var el = $('stepList').querySelector(selector);
    if (el) el.focus();
}

/* Open and close a step from its header. A closed one opens from anywhere on the
 * row; an open one only closes from the chevron or the number, because the rest
 * of the row is its title box. The grip never toggles: it is for dragging. */
function toggleStep(card, e) {
    var head = e.target.closest('.stephead');
    if (!head || e.target.closest('[data-act]') || e.target.closest('input') || e.target.closest('[data-grip]')) return false;
    var s = S.steps[+card.getAttribute('data-s')];
    if (s._open && !e.target.closest('[data-chev]') && !e.target.closest('.num')) return false;
    s._open = !s._open;
    renderSteps();
    return true;
}

$('stepList').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var head = e.target.closest('.stephead[role="button"]');
    if (!head || e.target.closest('[data-grip]')) return;
    e.preventDefault();
    S.steps[+head.closest('[data-s]').getAttribute('data-s')]._open = true;
    renderSteps();
});

$('stepList').addEventListener('click', function (e) {
    var card = e.target.closest('[data-s]');
    if (!card) return;
    var btn = e.target.closest('[data-act]');
    if (!btn) { toggleStep(card, e); return; }

    var i = +card.getAttribute('data-s'), s = S.steps[i];
    var fe = e.target.closest('[data-f]');
    var j = fe ? +fe.getAttribute('data-f') : -1;
    var focus = null;

    switch (btn.getAttribute('data-act')) {
        case 'del':
            if (s.id) S.removed.push(s.id);
            S.steps.splice(i, 1);
            break;
        case 'addfield':
            s.fields.push(newField('text'));
            focus = '[data-s="' + i + '"] .q:last-child [data-fk="label"]';
            break;
        case 'fhint':
            if (j >= 0) { S.hintOpen[s.fields[j].id] = true; focus = '[data-s="' + i + '"] [data-f="' + j + '"] [data-fk="hint"]'; }
            break;
        case 'vidup': pickBrief(i); return;
        case 'fdel': if (j >= 0) s.fields.splice(j, 1); break;
        default: return;
    }
    markDirty();
    renderSteps();
    if (focus) refocus(focus);
});

/* ---- reordering ---- */

function moveIn(arr, from, to) { arr.splice(to, 0, arr.splice(from, 1)[0]); }

UI.sortable($('stepList'), {
    items: '.stepcard',
    handle: '[data-grip="step"]',
    onMove: function (from, to, item, byKeyboard) {
        moveIn(S.steps, from, to);
        markDirty();
        renderSteps();
        if (byKeyboard) refocus('[data-s="' + to + '"] [data-grip="step"]');
    }
});

UI.sortable($('stepList'), {
    items: '.q',
    handle: '[data-grip="q"]',
    onMove: function (from, to, item, byKeyboard) {
        var i = +item.closest('[data-s]').getAttribute('data-s');
        moveIn(S.steps[i].fields, from, to);
        markDirty();
        renderSteps();
        if (byKeyboard) refocus('[data-s="' + i + '"] [data-f="' + to + '"] [data-grip="q"]');
    }
});

/* ---- the brief video ---- */

var briefTarget = -1;

function pickBrief(i) {
    briefTarget = i;
    var p = $('briefPicker');
    p.value = '';
    p.click();
}

$('briefPicker').addEventListener('change', function () {
    var file = this.files && this.files[0], i = briefTarget;
    if (!file || !S.steps[i]) return;
    var bad = Backend.checkFile(file, 'video');
    if (bad) { toast(bad, 'err'); return; }

    /* Locked while it uploads: a large video takes a while, and reordering or
     * deleting steps underneath it would attach the video to the wrong one. */
    var ed = document.querySelector('#viewJob .editor');
    var btn = $('stepList').querySelector('[data-s="' + i + '"] [data-act="vidup"]');
    var label = btn ? btn.textContent : '';
    ed.inert = true;
    $('btnJobSave').disabled = true;

    HiringApi.uploadBrief(file, function (done, total) {
        if (btn) btn.textContent = 'Uploading ' + Math.round(done / total * 100) + '%';
    }).then(function (url) {
        S.steps[i].video_url = url;
        S.steps[i]._video = true;
        markDirty();
        toast('Video uploaded. Save the role to keep it.');
    }).catch(function (ex) {
        toast('Upload failed: ' + friendly(ex), 'err');
        if (btn) btn.textContent = label;
    }).then(function () {
        ed.inert = false;
        $('btnJobSave').disabled = false;
        renderSteps();
    });
});

$('btnAddStep').addEventListener('click', function () {
    var s = newStep('');
    s._open = true;
    S.steps.push(s);
    markDirty();
    renderSteps();
    var cards = $('stepList').querySelectorAll('.stepcard');
    var last = cards[cards.length - 1];
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); last.querySelector('input').focus(); }
});

/* ---- saving ---- */

/* Tidy the model in place before it is checked or sent: trimmed text, options
 * only on the question types that use them. Done on the real objects so the ids
 * saveSteps writes back land on the steps the editor is holding. */
function tidy() {
    var j = S.job;
    j.title = j.title.trim(); j.team = (j.team || '').trim(); j.summary = (j.summary || '').trim();
    S.steps.forEach(function (s) {
        s.title = s.title.trim();
        s.intro = (s.intro || '').trim();
        s.video_url = s._video ? (s.video_url || '').trim() : '';
        if (s._timed) {
            var raw = String(s.time_limit_hours == null ? '' : s.time_limit_hours).trim();
            s.time_limit_hours = raw === '' ? null : Number(raw);
        } else {
            s.time_limit_hours = null;
        }
        s.fields.forEach(function (f) {
            f.label = f.label.trim();
            f.hint = (f.hint || '').trim();
            if (!f.hint) delete f.hint;
            if (f.type === 'choice') {
                f.options = (f.options || []).map(function (o) { return o.trim(); }).filter(Boolean);
            } else {
                delete f.options;
            }
        });
    });
}

var badStep = -1;

function validateJob() {
    var j = S.job;
    badStep = -1;
    if (!j.title) return 'Give the role a title.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(j.slug)) {
        $('jSlug').classList.add('bad');
        return 'The link name needs lower-case letters, numbers and hyphens, like product-designer.';
    }
    for (var i = 0; i < S.steps.length; i++) {
        var s = S.steps[i], n = 'Step ' + (i + 1) + ': ';
        badStep = i;
        if (!s.title) return n + 'give it a title.';
        if (s._video && !s.video_url) return n + 'upload a video, or switch Video off.';
        if (s.video_url && !HiringApi.isHttps(s.video_url)) return n + 'the video link must start with https://';
        if (s._timed && s.time_limit_hours === null) return n + 'set how many hours, or switch Time limit off.';
        if (s._timed &&
            !(Number.isInteger(s.time_limit_hours) && s.time_limit_hours >= 1 && s.time_limit_hours <= 720)) {
            return n + 'the time limit must be a whole number of hours between 1 and 720.';
        }
        for (var k = 0; k < s.fields.length; k++) {
            var f = s.fields[k];
            if (!f.label) return n + 'question ' + (k + 1) + ' needs wording.';
            if (f.type === 'choice' && f.options.length < 2) return n + '“' + f.label + '” needs at least two options.';
        }
        badStep = -1;
    }
    if (j.status === 'open' && !S.steps.length) return 'Add at least one step before opening the role.';
    return null;
}

$('btnJobSave').addEventListener('click', function () {
    if (!S.job) return;
    tidy();
    var bad = validateJob();
    if (bad) {
        /* Open the step the message is about, so the problem is on screen. */
        if (badStep >= 0 && S.steps[badStep]) { S.steps[badStep]._open = true; renderSteps(); }
        toast(bad, 'err');
        return;
    }

    var btn = this;
    btn.disabled = true; btn.textContent = 'Saving…';
    var fresh = !S.job.id;
    /* Nothing can be typed while the request is in flight. The steps are checked
     * and tidied above, but they are sent a moment later, and an edit in between
     * would go out without having been checked. */
    var ed = document.querySelector('#viewJob .editor');
    ed.inert = true;

    HiringApi.saveJob(S.job).then(function (row) {
        /* Recorded straight away: if saving the steps fails, the next attempt
         * updates this role instead of creating a second one. */
        S.job.id = row.id;
        return HiringApi.saveSteps(row.id, S.steps, S.removed);
    }).then(function () {
        S.removed = []; S.dirty = false;
        toast('Saved “' + S.job.title + '”');
        fillEditor();
        if (fresh) history.replaceState(null, '', '#/j/' + S.job.id);
    }).catch(function (ex) {
        fillEditor();
        toast('Save failed: ' + friendly(ex), 'err');
    }).then(function () {
        ed.inert = false;
        btn.disabled = false; btn.textContent = 'Save';
    });
});

$('btnJobBack').addEventListener('click', function () { leaveTo('#/'); });
$('btnJobApplicants').addEventListener('click', function () { if (S.job && S.job.id) leaveTo('#/j/' + S.job.id + '/applicants'); });
$('btnJobPreview').addEventListener('click', function () {
    if (!S.job || !S.job.id) return;
    if (S.dirty) toast('The preview shows the last saved version.');
    window.open(publicLink(S.job.slug, true), '_blank', 'noopener');
});
$('btnCopyLink').addEventListener('click', function () {
    if (!S.job || !S.job.id) return;
    UI.copyText(publicLink(S.job.slug)).then(function () {
        toast(S.job.status === 'open' ? 'Applicant link copied' : 'Link copied. It only works once the role is open.');
    });
});

/* ============================================================== applicants */

function statusLabel(key) {
    var l = HiringApi.APPLICANT_STATUSES.filter(function (s) { return s.key === key; })[0];
    return l ? l.label : key;
}

function openApplicants(jobId) {
    var A = S.app;
    A.job = null; A.open = null; A.filter = 'all';
    $('appList').innerHTML = '<div class="blank">Loading…</div>';
    $('appFilters').innerHTML = '';
    $('appTitleBar').textContent = 'Applicants';

    Promise.all([HiringApi.getJob(jobId), HiringApi.listSteps(jobId), HiringApi.listApplicants(jobId)])
        .then(function (r) {
            if (!r[0]) { toast('That role no longer exists.', 'err'); go('#/'); return; }
            A.job = r[0]; A.steps = r[1]; A.list = r[2];
            $('appTitleBar').textContent = A.job.title;
            var ids = A.list.map(function (a) { return a.id; });
            return Promise.all([
                HiringApi.responseSteps(ids), HiringApi.listStarts(ids)
            ]).then(function (r) {
                A.answered = r[0]; A.starts = r[1];
                renderApplicants();
            });
        }).catch(function (ex) {
            $('appList').innerHTML = '<div class="blank">Could not load applicants:<br>' + esc(friendly(ex)) + '</div>';
        });
}

/* Where each timed step stands for one applicant. The clock the applicant sees is
 * the server's; this is for the staff view, where a minute either way does not
 * matter, so it uses this computer's time. */
function timedState(a) {
    var A = S.app, now = Date.now(), out = [];
    A.steps.forEach(function (s) {
        if (!s.time_limit_hours) return;
        var st = (A.starts[a.id] || {})[s.id];
        var done = (A.answered[a.id] || []).indexOf(s.id) >= 0;
        var deadline = st ? Date.parse(st.deadline_at) : null;
        out.push({
            step: s, start: st, done: done, deadline: deadline,
            state: done ? 'done' : !st ? 'notstarted' : deadline < now ? 'expired' : 'running'
        });
    });
    return out;
}

function span(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    if (m >= 2880) return Math.floor(m / 1440) + 'd ' + Math.floor((m % 1440) / 60) + 'h';
    if (m >= 60) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
    return m + 'm';
}

function when(iso) {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* A short note for the list: only for people still going, since a submitted
 * application has nothing left to time out. */
function clockTag(a) {
    if (a.status !== 'in_progress') return '';
    var t = timedState(a), now = Date.now();
    var expired = t.filter(function (x) { return x.state === 'expired'; });
    if (expired.length) return ' <span class="chip no" style="margin-left:8px">Timed out</span>';
    var running = t.filter(function (x) { return x.state === 'running'; });
    if (running.length) {
        var least = Math.min.apply(null, running.map(function (x) { return x.deadline - now; }));
        return ' <span class="chip look" style="margin-left:8px" title="A timed step is in progress">' + span(least) + ' left</span>';
    }
    return '';
}

function renderApplicants() {
    var A = S.app;
    var counts = { all: A.list.length };
    A.list.forEach(function (a) { counts[a.status] = (counts[a.status] || 0) + 1; });

    var tabs = [{ key: 'all', label: 'All' }].concat(HiringApi.APPLICANT_STATUSES.filter(function (s) {
        return counts[s.key];
    }));
    $('appFilters').innerHTML = '<div class="seg" role="group" aria-label="Filter by status">' +
        tabs.map(function (t) {
            var on = A.filter === t.key;
            return '<button type="button" data-filter="' + t.key + '"' + (on ? ' class="on"' : '') +
                ' aria-pressed="' + on + '">' + esc(t.label) + '<span class="ct">' + (counts[t.key] || 0) + '</span></button>';
        }).join('') + '</div>';

    var rows = A.list.filter(function (a) { return A.filter === 'all' || a.status === A.filter; });
    if (!rows.length) {
        $('appList').innerHTML = '<div class="blank">' + (A.list.length
            ? 'Nobody with that status.'
            : 'No applicants yet.<br>' + (A.job.status === 'open'
                ? 'Share the applicant link from the role to get started.'
                : 'Set the role to <b>Open</b> and share its link.')) + '</div>';
        return;
    }

    var total = A.steps.length;
    $('appList').innerHTML = '<div class="panel"><table class="tbl"><thead><tr>' +
        '<th>Applicant</th><th class="shrink">Status</th><th>Progress</th><th>Interview</th><th>Applied</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (a) {
            return '<tr data-app="' + esc(a.id) + '">' +
                '<td class="nm"><b>' + esc(a.name) + '</b><small>' + esc(a.email) + '</small></td>' +
                '<td class="shrink">' + statusSelect(HiringApi.APPLICANT_STATUSES, a.status, 'data-astatus', a.id, 'Status for ' + a.name) + '</td>' +
                '<td class="sm">' + (A.answered[a.id] || []).length + ' / ' + total + clockTag(a) + '</td>' +
                '<td class="sm">' + (a.interview_at ? esc(new Date(a.interview_at).toLocaleString(undefined,
                    { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '') + '</td>' +
                '<td class="sm">' + UI.fmtDate(a.created_at) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>';
}

function applicantById(id) {
    return S.app.list.filter(function (a) { return a.id === id; })[0];
}

$('appFilters').addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (!b) return;
    S.app.filter = b.getAttribute('data-filter');
    renderApplicants();
});

$('appList').addEventListener('click', function (e) {
    if (e.target.closest('[data-astatus]')) { e.stopPropagation(); return; }
    var row = e.target.closest('[data-app]');
    if (row) openApplicant(row.getAttribute('data-app'));
});

$('appList').addEventListener('change', function (e) {
    var sel = e.target.closest('[data-astatus]');
    if (!sel) return;
    var a = applicantById(sel.getAttribute('data-astatus'));
    if (!a || sel.value === a.status) return;
    sel.disabled = true;
    HiringApi.updateApplicant(a.id, { status: sel.value }).then(function () {
        a.status = sel.value;
        renderApplicants();
    }).catch(function (ex) {
        toast(friendly(ex), 'err');
        sel.value = a.status;
        sel.disabled = false;
    });
});

$('btnAppBack').addEventListener('click', function () { go('#/'); });
$('btnAppEdit').addEventListener('click', function () { if (S.app.job) go('#/j/' + S.app.job.id); });

/* ---- one applicant ---- */

function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    function p(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fmtSize(n) {
    if (!n) return '';
    return n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
}

function answerHtml(f, v) {
    if (v === undefined || v === null || v === '') return '<span class="none">No answer</span>';
    if (f.type === 'video' && v && v.path) {
        /* Not signed until asked for: the link lasts an hour and there is no
         * reason to make one for every video on every open dialog. */
        return '<button type="button" class="filebtn" data-video="' + esc(v.path) + '">' + ICON.play +
            '<span>' + esc(v.name || 'Play video') + '</span>' + (v.size ? '<small>' + fmtSize(v.size) + '</small>' : '') + '</button>';
    }
    if (f.type === 'file' && v && v.path) {
        return '<button type="button" class="filebtn" data-file="' + esc(v.path) + '">' + ICON.doc +
            '<span>' + esc(v.name || 'Open file') + '</span>' + (v.size ? '<small>' + fmtSize(v.size) + '</small>' : '') + '</button>';
    }
    if ((f.type === 'url' || f.type === 'github') && typeof v === 'string' && !HiringApi.checkLink(f.type, v)) {
        /* Typed as google.com or https://google.com; either way it opens as one. */
        return '<a href="' + esc(HiringApi.linkHref(v)) + '" target="_blank" rel="noopener noreferrer">' + esc(v) + '</a>';
    }
    return UI.paras(typeof v === 'object' ? JSON.stringify(v) : v);
}

/* The clocks, in the side column: a chip per timed step for where it stands, and
 * the exact times on the i. */
function renderTimers(a) {
    var rows = timedState(a);
    $('dTimers').innerHTML = rows.length ? '<div class="timers"><div class="lbl">Timed steps' + UI.tip(TIPS.timers) + '</div>' +
        rows.map(function (x) {
            var chip, detail;
            if (x.state === 'notstarted') { chip = '<span class="chip">Not started</span>'; detail = x.step.time_limit_hours + ' hours once they begin.'; }
            else if (x.state === 'done') { chip = '<span class="chip go">Submitted</span>'; detail = x.start ? 'Deadline was ' + when(x.start.deadline_at) + '.' : 'Submitted.'; }
            else if (x.state === 'running') { chip = '<span class="chip look">' + span(x.deadline - Date.now()) + ' left</span>'; detail = 'Started ' + when(x.start.started_at) + '. Due ' + when(x.start.deadline_at) + '.'; }
            else { chip = '<span class="chip no">Timed out</span>'; detail = 'Started ' + when(x.start.started_at) + '. The deadline passed ' + when(x.start.deadline_at) + ' with nothing submitted.'; }
            var canExtend = a.status === 'in_progress' && (x.state === 'running' || x.state === 'expired');
            return '<div class="timer-row"><div><div class="tt">' + esc(x.step.title) + UI.tip(detail) + '</div>' +
                '<div class="chips" style="margin-top:5px">' + chip + '</div></div>' +
                (canExtend ? '<button type="button" class="sm" data-extend="' + esc(x.step.id) + '" title="Give 24 more hours">+24h</button>' : '') +
            '</div>';
        }).join('') + '</div>' : '';
}

$('dTimers').addEventListener('click', function (e) {
    var b = e.target.closest('[data-extend]');
    var a = S.app.open;
    if (!b || !a) return;
    var stepId = b.getAttribute('data-extend');
    var st = (S.app.starts[a.id] || {})[stepId];
    if (!st) return;
    /* From the later of now and the old deadline, so extending an expired clock
     * really gives a full day and extending a running one adds to it. */
    var next = new Date(Math.max(Date.now(), Date.parse(st.deadline_at)) + 24 * 3600 * 1000).toISOString();
    b.disabled = true;
    HiringApi.setDeadline(a.id, stepId, next).then(function () {
        st.deadline_at = next;
        renderTimers(a);
        renderApplicants();
        toast('Deadline moved to ' + when(next));
    }).catch(function (ex) {
        toast('Could not extend: ' + friendly(ex), 'err');
        b.disabled = false;
    });
});

function openApplicant(id) {
    var a = applicantById(id);
    if (!a) return;
    S.app.open = a;

    $('dlgAppName').textContent = a.name;
    $('dlgAppEmail').textContent = a.email;
    $('dStatus').innerHTML = HiringApi.APPLICANT_STATUSES.map(function (s) {
        return '<option value="' + s.key + '">' + s.label + '</option>';
    }).join('');
    $('dStatus').value = a.status;
    $('dInterview').value = toLocalInput(a.interview_at);
    $('dNotes').value = a.notes || '';
    renderTimers(a);
    $('dAnswers').innerHTML = '<div class="none">Loading\u2026</div>';
    $('dlgApplicant').showModal();

    HiringApi.getResponses(a.id).then(function (resp) {
        if (S.app.open !== a) return;
        $('dAnswers').innerHTML = S.app.steps.map(function (s, i) {
            var r = resp[s.id];
            return '<section class="ans"><h4><span class="n">' + (i + 1) + '</span>' + esc(s.title) + '</h4>' +
                (!r ? '<div class="none">Not answered yet</div>'
                    : (s.fields || []).map(function (f) {
                        return '<div class="qa"><div class="q-l">' + esc(f.label) + '</div><div class="q-a">' +
                            answerHtml(f, r[f.id]) + '</div></div>';
                    }).join('') || '<div class="none">Nothing to answer on this step</div>') +
            '</section>';
        }).join('') || '<div class="none">This role has no steps.</div>';
    }).catch(function (ex) {
        $('dAnswers').innerHTML = '<div class="err">Could not load answers: ' + esc(friendly(ex)) + '</div>';
    });
}

$('dAnswers').addEventListener('click', function (e) {
    var vb = e.target.closest('[data-video]');
    if (vb) {
        vb.disabled = true;
        HiringApi.fileUrl(vb.getAttribute('data-video'), 'video').then(function (url) {
            var box = document.createElement('div');
            box.innerHTML = '<video class="answervid" controls autoplay playsinline src="' + esc(url) + '"></video>' +
                '<div class="chips" style="margin-top:8px"><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open in a new tab</a>' +
                UI.tip('If it does not play, open or download it. An iPhone video can be in a format only Safari plays.') + '</div>';
            vb.replaceWith(box);
        }).catch(function (ex) { toast('Could not open the video: ' + friendly(ex), 'err'); vb.disabled = false; });
        return;
    }
    var b = e.target.closest('[data-file]');
    if (!b) return;
    /* A fresh link each time. They expire after a few minutes on purpose, so a
     * copied address does not keep working for someone who should not have it. */
    HiringApi.fileUrl(b.getAttribute('data-file')).then(function (url) {
        window.open(url, '_blank', 'noopener');
    }).catch(function (ex) { toast('Could not open the file: ' + friendly(ex), 'err'); });
});

$('dlgAppClose').addEventListener('click', function () { $('dlgApplicant').close(); });
$('dlgApplicant').addEventListener('close', function () { S.app.open = null; });

$('dSave').addEventListener('click', function () {
    var a = S.app.open;
    if (!a) return;
    var btn = this;
    var when = $('dInterview').value;
    var patch = {
        status: $('dStatus').value,
        notes: $('dNotes').value,
        interview_at: when ? new Date(when).toISOString() : null
    };
    function applied() {
        a.status = patch.status; a.notes = patch.notes; a.interview_at = patch.interview_at;
        renderApplicants();
        $('dlgApplicant').close();
    }
    btn.disabled = true; btn.textContent = 'Saving…';
    HiringApi.updateApplicant(a.id, patch).then(function () {
        applied();
        toast('Saved');
    }).catch(function (ex) {
        toast('Save failed: ' + friendly(ex), 'err');
    }).then(function () {
        btn.disabled = false; btn.textContent = 'Save';
    });
});

$('dDelete').addEventListener('click', function () {
    var a = S.app.open;
    if (!a) return;
    UI.ask({
        title: 'Delete ' + a.name + '?',
        body: 'Their details, every answer and any files they uploaded are permanently removed. This cannot be undone.',
        yes: 'Delete'
    }).then(function (yes) {
        if (!yes) return;
        return HiringApi.deleteApplicant(a).then(function () {
            S.app.list = S.app.list.filter(function (x) { return x.id !== a.id; });
            $('dlgApplicant').close();
            renderApplicants();
            toast('Deleted ' + a.name);
        }).catch(function (ex) { toast('Delete failed: ' + friendly(ex), 'err'); });
    });
});

/* ==================================================================== boot */

route();
