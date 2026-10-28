/* The hiring tool's sourcing screens: finding people for a role instead of
 * waiting for them to apply.
 *
 *   #/j/<id>/sourcing   what a good match is, where to look, who acts on it
 *   #/j/<id>/swipe      one card at a time: pass, maybe, or reach out
 *   #/j/<id>/outreach   the people to contact, their message and their link
 *   #/settings          what every role shares
 *
 * Loads after app.js and uses its helpers ($, S, go, leaveTo, friendly,
 * publicLink, toneOf). The search agent that fills the swipe screen is separate;
 * everything here only reads what it found and records what people decided.
 */

var SRC_TIPS = {
    enabled: 'When this is on, the weekly search looks for people for this role and puts the best ones on the swipe screen.',
    musts: 'Someone who fails one of these never reaches the swipe screen.',
    criteria: 'What the bars on each card measure. The weights decide how much each one counts towards the match, and add up to 100.',
    taste: 'Visual taste is never scored. You judge it yourself from their work.',
    archetypes: 'The kinds of people the search looks for, one per line. For example: design engineers at startups.',
    examples: 'Real portfolios or profiles that show what good looks like, or what to avoid. The search uses them to find similar people.',
    regions: 'Countries or regions to search in, separated by commas. Leave it empty to search everywhere.',
    overlap: 'How many working hours a day they need to share with your timezone. 0 means it does not matter.',
    skip: 'Companies or people the search should never bring back, one per line: clients, your own staff.',
    people: 'Email addresses, separated by commas. Leave it empty and anyone signed in can do it.',
    message: 'The first message, with these filled in for each person: {{first_name}}, {{personal_line}} (one sentence about their work), {{role}}, {{company}}, {{apply_link}} (their personal link) and {{signature}}.',
    budget: 'How many people the search may look at for this role each week. Most are dropped; only the best reach your swipe screen.',
    link: 'This link is only for this person. When they open it and start, they show up as applied, here and in Applicants.',
    about: 'What the company does, in a few paragraphs. Every role’s search and scoring reads it, so nobody has to put it in each job description.',
    reasons: 'The quick reasons offered when someone passes on a card, one per line. They teach the search what to avoid.',
    admins: 'Email addresses, separated by commas, of the people who may switch sourcing on and change the monthly limit. Leave it empty and anyone signed in can.',
    limit: 'The most people the search may look at in a month, across every role.',
    keep: 'Passed candidates are cleared after this many days, with their pictures.'
};

function one(x) { return Array.isArray(x) ? x[0] || null : x || null; }
function lines(text) { return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean); }
function commas(text) { return String(text || '').split(',').map(function (l) { return l.trim(); }).filter(Boolean); }
function firstName(name) { var n = String(name || '').trim(); return n.split(/\s+/)[0] || n; }
function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
}
function stageLabel(key) {
    var l = HiringApi.PROSPECT_STAGES.filter(function (s) { return s.key === key; })[0];
    return l ? l.label : key;
}
function safeHref(u) { return /^https:\/\/[^\s<>"']+$/i.test(String(u || '')) ? u : ''; }

/* ================================================================ role tabs */

/* The tabs under a role's app bar. Drawn into whichever view is showing; a role
 * that is not saved yet has nothing but its editor, so they are hidden. */
function renderRoleTabs(job, active) {
    var nav = document.querySelector('[data-tabs="' + active + '"]');
    if (!nav) return;
    if (!job || !job.id) { nav.style.display = 'none'; nav.innerHTML = ''; return; }
    nav.style.display = '';
    var c = S.prospects[job.id] || {};
    /* Sourcing is set once and left alone, so it goes last. */
    var tabs = [
        { key: 'role', label: 'Role and funnel', hash: '#/j/' + job.id },
        { key: 'swipe', label: 'Swipe', hash: '#/j/' + job.id + '/swipe', n: (c.queued || 0) + (c.maybe || 0) },
        { key: 'outreach', label: 'Outreach', hash: '#/j/' + job.id + '/outreach', n: c.reach_out },
        { key: 'applicants', label: 'Applicants', hash: '#/j/' + job.id + '/applicants' },
        { key: 'sourcing', label: 'Sourcing', hash: '#/j/' + job.id + '/sourcing' }
    ];
    nav.innerHTML = tabs.map(function (t) {
        var on = t.key === active;
        return '<button type="button" data-go="' + esc(t.hash) + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' +
            esc(t.label) + (t.n ? '<span class="ct">' + t.n + '</span>' : '') + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.view.on [data-title]'), function (el) {
        el.textContent = job.title;
    });
}

document.addEventListener('click', function (e) {
    var t = e.target.closest('.roletabs [data-go]');
    if (t) { if (!t.classList.contains('on')) leaveTo(t.getAttribute('data-go')); return; }
    if (e.target.closest('[data-back]')) leaveTo('#/');
});

/* Keeps the counts on the tabs and the roles list in step with what was just
 * done here, without reading everything again. */
function bumpCount(jobId, stage, by) {
    var c = S.prospects[jobId] || (S.prospects[jobId] = {});
    c[stage] = Math.max(0, (c[stage] || 0) + by);
}

/* ================================================================= sourcing */

var SRC = { job: null, saved: null, criteria: null, run: null, d: null, draftedFrom: null };

function randomKey(prefix) { return prefix + Math.random().toString(36).slice(2, 8); }

function openSourcing(jobId) {
    S.srcDirty = false;
    SRC.job = null; SRC.draftedFrom = null;
    $('srcEditor').innerHTML = '<div class="blank">Loading…</div>';
    Promise.all([
        HiringApi.getJob(jobId), HiringApi.getSourcing(jobId), HiringApi.getCriteria(jobId),
        HiringApi.lastRun(jobId), HiringApi.prospectCounts()
    ]).then(function (r) {
        if (!r[0]) { toast('That role no longer exists.', 'err'); go('#/'); return; }
        SRC.job = r[0]; SRC.criteria = r[2]; SRC.run = r[3]; S.prospects = r[4];
        SRC.saved = r[1] || HiringApi.defaultSourcing(jobId);
        var s = SRC.saved, c = SRC.criteria;
        /* The editing copy. Lists typed one per line are kept as the typed text
         * until saving, so a half-typed line is not tidied away under the cursor. */
        SRC.d = {
            enabled: s.enabled, cards_per_week: s.cards_per_week, weekly_budget: s.weekly_budget,
            archetypes: (s.archetypes || []).join('\n'), examples: (s.examples || []).map(function (x) {
                return { url: x.url || '', kind: x.kind === 'avoid' ? 'avoid' : 'ideal', note: x.note || '' };
            }),
            regions: (s.regions || []).join(', '), base_timezone: s.base_timezone || '', overlap_hours: s.overlap_hours || 0,
            sources: (s.sources || []).slice(), skip: (s.skip || []).join('\n'), card_shows: (s.card_shows || []).slice(),
            swipers: (s.swipers || []).join(', '), outreach_by: (s.outreach_by || []).join(', '),
            message: s.message || HiringApi.DEFAULT_MESSAGE,
            must_haves: c ? JSON.parse(JSON.stringify(c.must_haves || [])) : [],
            criteria: c ? JSON.parse(JSON.stringify(c.criteria || [])) : []
        };
        renderRoleTabs(SRC.job, 'sourcing');
        renderSourcing();
    }).catch(function (ex) {
        $('srcEditor').innerHTML = '<div class="blank">Could not load sourcing:<br>' + esc(friendly(ex)) + '</div>';
    });
}

function weightTotal() {
    return SRC.d.criteria.reduce(function (t, c) { return t + (Number(c.weight) || 0); }, 0);
}

function checkList(list, chosen, attr) {
    return '<div class="checks">' + list.map(function (o) {
        return '<label><input type="checkbox" ' + attr + '="' + o.key + '"' + (chosen.indexOf(o.key) >= 0 ? ' checked' : '') +
            '> ' + esc(o.label) + '</label>';
    }).join('') + '</div>';
}

function runNote() {
    var r = SRC.run;
    if (!r) return 'No search has run for this role yet.';
    var st = r.stats || {};
    var when = UI.fmtDate(r.started_at);
    if (r.status === 'running') return 'A search is running now (started ' + when + ').';
    if (r.status === 'failed') return 'The last search, ' + when + ', did not finish' + (r.note ? ': ' + r.note : '.');
    return 'Last search ' + when + (st.queued != null ? ': ' + st.queued + ' new cards' : '') + '.';
}

function renderSourcing() {
    var d = SRC.d, job = SRC.job, c = SRC.criteria;
    var changed = c && staleCriteria() && !draftIsFresh();
    var total = weightTotal();
    var estimate = Math.max(5, Math.round(d.weekly_budget * 4.3 * 0.1 / 5) * 5);

    $('srcEditor').innerHTML =
        '<div class="card">' +
            '<div class="switchrow">' +
                '<div class="t"><b>Find candidates automatically' + UI.tip(SRC_TIPS.enabled) + '</b>' +
                    '<small>Every Monday · ' + d.cards_per_week + ' cards a week · ' + esc(runNote()) + '</small></div>' +
                '<span class="spacer"></span>' + UI.toggle(!!d.enabled, 'Find candidates automatically', 'data-k="enabled"') +
            '</div>' +
        '</div>' +

        '<div class="card">' +
            '<h2>Ideal candidate<span class="spacer"></span>' +
                '<button type="button" class="sm" data-act="draft">' + (c || d.criteria.length ? 'Redraft from description' : 'Draft from description') + '</button></h2>' +
            (!c && !d.criteria.length
                ? '<div class="note">No criteria yet. Draft them from the description, or add them by hand.</div>'
                : draftIsFresh() ? '<div class="note">New draft from the description. It is not saved yet: check it, then press Save.</div>'
                : changed ? '<div class="note warn">The description has changed since these criteria were written. Redraft them, or check they still fit and press Save.</div>' : '') +
            '<div class="field"><label>Must-haves' + UI.tip(SRC_TIPS.musts) + '</label>' +
                '<div class="rows">' + d.must_haves.map(function (m, i) {
                    return '<div class="rowline" data-list="must_haves" data-i="' + i + '">' +
                        '<input type="text" data-f="label" value="' + esc(m.label) + '" maxlength="200" placeholder="8+ years of craft experience" aria-label="Must-have">' +
                        '<button type="button" class="iconbtn del" data-act="rm" title="Remove" aria-label="Remove">' + ICON.x + '</button></div>';
                }).join('') + '</div>' +
                '<button type="button" class="addq" data-act="add-must">+ Add must-have</button></div>' +
            '<div class="field"><label>Scored, with weight' + UI.tip(SRC_TIPS.criteria) + '</label>' +
                '<div>' + d.criteria.map(function (k, i) {
                    return '<div class="crit" data-list="criteria" data-i="' + i + '">' +
                        '<div class="rowline">' +
                            '<input type="text" data-f="label" value="' + esc(k.label) + '" maxlength="200" placeholder="Builds live prototypes" aria-label="Criterion">' +
                            '<input type="number" data-f="weight" min="0" max="100" step="1" value="' + esc(k.weight) + '" aria-label="Weight"><span class="pct">%</span>' +
                            '<button type="button" class="iconbtn del" data-act="rm" title="Remove" aria-label="Remove">' + ICON.x + '</button>' +
                        '</div>' +
                        '<input type="text" class="hint" data-f="hint" value="' + esc(k.hint || '') + '" maxlength="300" placeholder="What counts as evidence (optional)" aria-label="What counts as evidence">' +
                    '</div>';
                }).join('') + '</div>' +
                '<button type="button" class="addq" data-act="add-crit">+ Add criterion</button>' +
                (d.criteria.length
                    ? '<div class="rowline"><span class="total' + (total === 100 ? '' : ' bad') + '" id="srcTotal">Weights add up to ' + total +
                        (total === 100 ? '.' : '. They need to add up to 100.') + '</span>' +
                        (total === 100 ? '' : '<button type="button" class="sm" data-act="balance">Make them add up to 100</button>') + '</div>'
                    : '') +
            '</div>' +
            '<div class="note">' + esc(SRC_TIPS.taste) + '</div>' +
            '<div class="field"><label for="srcArch">Who to look for' + UI.tip(SRC_TIPS.archetypes) + '</label>' +
                '<textarea id="srcArch" data-k="archetypes" rows="4" placeholder="Design engineers at product startups&#10;Government digital service alumni">' + esc(d.archetypes) + '</textarea></div>' +
            '<div class="field"><label>Examples <span class="opt">optional</span>' + UI.tip(SRC_TIPS.examples) + '</label>' +
                '<div class="rows">' + d.examples.map(function (x, i) {
                    return '<div class="rowline" data-list="examples" data-i="' + i + '">' +
                        '<input type="url" data-f="url" value="' + esc(x.url) + '" maxlength="500" placeholder="https://portfolio.example" aria-label="Link">' +
                        '<select data-f="kind" aria-label="Kind"><option value="ideal"' + (x.kind === 'ideal' ? ' selected' : '') + '>Ideal</option>' +
                            '<option value="avoid"' + (x.kind === 'avoid' ? ' selected' : '') + '>Avoid</option></select>' +
                        '<input type="text" data-f="note" value="' + esc(x.note) + '" maxlength="200" placeholder="Why (optional)" aria-label="Why">' +
                        '<button type="button" class="iconbtn del" data-act="rm" title="Remove" aria-label="Remove">' + ICON.x + '</button></div>';
                }).join('') + '</div>' +
                '<button type="button" class="addq" data-act="add-example">+ Add an example</button></div>' +
        '</div>' +

        '<div class="card">' +
            '<h2>Where to look</h2>' +
            '<div class="field"><label for="srcRegions">Regions' + UI.tip(SRC_TIPS.regions) + '</label>' +
                '<input type="text" id="srcRegions" data-k="regions" value="' + esc(d.regions) + '" placeholder="Georgia, Armenia, Europe"></div>' +
            '<div class="two">' +
                '<div class="field"><label for="srcTz">Your timezone</label>' +
                    '<input type="text" id="srcTz" data-k="base_timezone" value="' + esc(d.base_timezone) + '" maxlength="40" placeholder="UTC+4"></div>' +
                '<div class="field"><label for="srcOverlap">Hours of overlap' + UI.tip(SRC_TIPS.overlap) + '</label>' +
                    '<input type="number" id="srcOverlap" data-k="overlap_hours" min="0" max="12" step="1" value="' + esc(d.overlap_hours) + '"></div>' +
            '</div>' +
            '<div class="field"><label>Search in</label>' + checkList(HiringApi.SOURCES, d.sources, 'data-source') + '</div>' +
            '<div class="field"><label for="srcSkip">Never bring back' + UI.tip(SRC_TIPS.skip) + '</label>' +
                '<textarea id="srcSkip" data-k="skip" rows="3" placeholder="One company or person per line">' + esc(d.skip) + '</textarea></div>' +
        '</div>' +

        '<div class="card">' +
            '<h2>Card and outreach</h2>' +
            '<div class="field"><label>The card shows</label>' + checkList(HiringApi.CARD_SHOWS, d.card_shows, 'data-show') + '</div>' +
            '<div class="two">' +
                '<div class="field"><label for="srcSwipers">Who swipes' + UI.tip(SRC_TIPS.people) + '</label>' +
                    '<input type="text" id="srcSwipers" data-k="swipers" value="' + esc(d.swipers) + '" placeholder="you@company.com"></div>' +
                '<div class="field"><label for="srcOutBy">Who reaches out' + UI.tip(SRC_TIPS.people) + '</label>' +
                    '<input type="text" id="srcOutBy" data-k="outreach_by" value="' + esc(d.outreach_by) + '" placeholder="assistant@company.com"></div>' +
            '</div>' +
            '<div class="field"><label for="srcMessage">First message' + UI.tip(SRC_TIPS.message) + '</label>' +
                '<textarea id="srcMessage" data-k="message" rows="9" maxlength="5000">' + esc(d.message) + '</textarea></div>' +
        '</div>' +

        '<div class="card">' +
            '<h2>Budget</h2>' +
            '<div class="two">' +
                '<div class="field"><label for="srcBudget">People checked a week' + UI.tip(SRC_TIPS.budget) + '</label>' +
                    '<input type="number" id="srcBudget" data-k="weekly_budget" min="5" max="500" step="1" value="' + esc(d.weekly_budget) + '"></div>' +
                '<div class="field"><label for="srcCards">Cards a week</label>' +
                    '<input type="number" id="srcCards" data-k="cards_per_week" min="1" max="50" step="1" value="' + esc(d.cards_per_week) + '"></div>' +
            '</div>' +
            '<div class="estimate" id="srcEstimate">About <b>$' + estimate + ' a month</b> for this role. A rough guess until the search has run for a few weeks.</div>' +
        '</div>';
}

var SRC_NUMBERS = { cards_per_week: 1, weekly_budget: 1, overlap_hours: 1 };

$('srcEditor').addEventListener('input', function (e) {
    var d = SRC.d;
    if (!d) return;
    var t = e.target, k = t.getAttribute('data-k');
    if (k === 'enabled' || t.hasAttribute('data-source') || t.hasAttribute('data-show')) return;
    S.srcDirty = true;
    if (k) {
        d[k] = SRC_NUMBERS[k] ? (t.value === '' ? '' : Number(t.value)) : t.value;
        if (k === 'weekly_budget' || k === 'cards_per_week') {
            var est = $('srcEstimate');
            if (est && d.weekly_budget) {
                est.innerHTML = 'About <b>$' + Math.max(5, Math.round(d.weekly_budget * 4.3 * 0.1 / 5) * 5) +
                    ' a month</b> for this role. A rough guess until the search has run for a few weeks.';
            }
        }
        return;
    }
    var row = t.closest('[data-list]'), f = t.getAttribute('data-f');
    if (!row || !f) return;
    var item = d[row.getAttribute('data-list')][+row.getAttribute('data-i')];
    item[f] = f === 'weight' ? (t.value === '' ? '' : Number(t.value)) : t.value;
    if (f === 'weight') {
        var tot = weightTotal(), el = $('srcTotal');
        if (el) {
            el.textContent = 'Weights add up to ' + tot + (tot === 100 ? '.' : '. They need to add up to 100.');
            el.classList.toggle('bad', tot !== 100);
        }
    }
});

$('srcEditor').addEventListener('change', function (e) {
    var d = SRC.d, t = e.target;
    if (!d) return;
    if (t.getAttribute('data-k') === 'enabled') {
        if (t.checked && !d.criteria.length) {
            t.checked = false;
            toast('Add the criteria first, so the search knows what to look for.', 'err');
            return;
        }
        d.enabled = t.checked; S.srcDirty = true;
        return;
    }
    var src = t.getAttribute('data-source'), show = t.getAttribute('data-show');
    var list = src ? d.sources : show ? d.card_shows : null, key = src || show;
    if (!list) return;
    var at = list.indexOf(key);
    if (t.checked && at < 0) list.push(key);
    if (!t.checked && at >= 0) list.splice(at, 1);
    S.srcDirty = true;
});

$('srcEditor').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || !SRC.d) return;
    var d = SRC.d, act = b.getAttribute('data-act'), focus = null;
    if (act === 'draft') { draftFromDescription(b); return; }
    if (act === 'rm') {
        var row = b.closest('[data-list]');
        d[row.getAttribute('data-list')].splice(+row.getAttribute('data-i'), 1);
    } else if (act === 'add-must') {
        d.must_haves.push({ key: randomKey('m'), label: '' });
        focus = '[data-list="must_haves"]:last-child input';
    } else if (act === 'add-crit') {
        d.criteria.push({ key: randomKey('c'), label: '', weight: 0, hint: '' });
        focus = '.crit:last-child input[data-f="label"]';
    } else if (act === 'add-example') {
        d.examples.push({ url: '', kind: 'ideal', note: '' });
        focus = '[data-list="examples"]:last-child input';
    } else if (act === 'balance') {
        balanceWeights();
    } else return;
    S.srcDirty = true;
    renderSourcing();
    if (focus) { var el = $('srcEditor').querySelector(focus); if (el) el.focus(); }
});

/* Scales the weights to add up to 100, keeping their proportions. Whatever
 * rounding leaves over goes on the largest, so the total is exact. */
function balanceWeights() {
    var list = SRC.d.criteria, total = weightTotal();
    if (!list.length) return;
    if (!total) list.forEach(function (c) { c.weight = 1; });
    total = weightTotal();
    list.forEach(function (c) { c.weight = Math.round((Number(c.weight) || 0) / total * 100); });
    var diff = 100 - weightTotal(), big = 0;
    list.forEach(function (c, i) { if (c.weight > list[big].weight) big = i; });
    list[big].weight += diff;
}

/* Whether the saved criteria were written for an older description. */
function staleCriteria() {
    var c = SRC.criteria;
    return !!c && String(c.description_snapshot || '').trim() !== String(SRC.job.description || '').trim();
}

/* Whether the editor holds a draft made from today's description, not saved yet. */
function draftIsFresh() {
    return SRC.draftedFrom != null && SRC.draftedFrom.trim() === String(SRC.job.description || '').trim();
}

function draftFromDescription(btn) {
    var job = SRC.job, d = SRC.d;
    if (!String(job.description || '').trim()) {
        toast('Write the job description first, on Role and funnel.', 'err');
        return;
    }
    var ask = d.criteria.length || d.must_haves.length
        ? UI.ask({ title: 'Replace the criteria with a new draft?', body: 'The must-haves, scored criteria and who to look for are replaced with a draft from the description. Nothing is saved until you press Save.', yes: 'Draft' })
        : Promise.resolve(true);
    ask.then(function (yes) {
        if (!yes) return;
        var label = btn.textContent;
        btn.disabled = true; btn.textContent = 'Drafting…';
        return HiringApi.draftCriteria(job.id).then(function (r) {
            d.must_haves = (r.must_haves || []).map(function (m) { return { key: m.key || randomKey('m'), label: m.label || '' }; });
            d.criteria = (r.criteria || []).map(function (c) {
                return { key: c.key || randomKey('c'), label: c.label || '', weight: Number(c.weight) || 0, hint: c.hint || '' };
            });
            if (d.criteria.length && weightTotal() !== 100) balanceWeights();
            if (r.archetypes && r.archetypes.length) d.archetypes = r.archetypes.join('\n');
            if (r.card_shows && r.card_shows.length) d.card_shows = r.card_shows.slice();
            SRC.draftedFrom = job.description || '';
            S.srcDirty = true;
            renderSourcing();
            toast('Draft ready. Check it, then save.');
        }).catch(function (ex) {
            toast(friendly(ex), 'err');
            btn.disabled = false; btn.textContent = label;
        });
    });
}

function cleanCriteria() {
    var d = SRC.d;
    return {
        must_haves: d.must_haves.map(function (m) { return { key: m.key, label: String(m.label || '').trim() }; })
            .filter(function (m) { return m.label; }),
        criteria: d.criteria.map(function (c) {
            var out = { key: c.key, label: String(c.label || '').trim(), weight: Math.round(Number(c.weight) || 0) };
            var hint = String(c.hint || '').trim();
            if (hint) out.hint = hint;
            return out;
        }).filter(function (c) { return c.label; })
    };
}

/* The database hands jsonb back with its keys in its own order, so compare
 * field by field, not as text. */
function sameCriteria(a, b) {
    if (!b) return false;
    function flat(list, fields) {
        return JSON.stringify((list || []).map(function (x) {
            return fields.map(function (f) { return x[f] == null ? '' : String(x[f]); });
        }));
    }
    return flat(a.must_haves, ['key', 'label']) === flat(b.must_haves, ['key', 'label']) &&
        flat(a.criteria, ['key', 'label', 'weight', 'hint']) === flat(b.criteria, ['key', 'label', 'weight', 'hint']);
}

function validateSourcing(crit) {
    var d = SRC.d;
    var total = crit.criteria.reduce(function (t, c) { return t + c.weight; }, 0);
    if (crit.criteria.length && total !== 100) return 'The weights add up to ' + total + '. Make them add up to 100.';
    if (d.enabled && !crit.criteria.length) return 'Add at least one scored criterion before switching the search on.';
    if (!(d.cards_per_week >= 1 && d.cards_per_week <= 50)) return 'Cards a week must be between 1 and 50.';
    if (!(d.weekly_budget >= 5 && d.weekly_budget <= 500)) return 'People checked a week must be between 5 and 500.';
    if (!(d.overlap_hours >= 0 && d.overlap_hours <= 12)) return 'Hours of overlap must be between 0 and 12.';
    if (d.weekly_budget < d.cards_per_week) return 'People checked a week cannot be fewer than the cards a week.';
    var bad = d.examples.filter(function (x) { return x.url.trim() && HiringApi.checkLink('url', x.url); })[0];
    if (bad) return 'An example link does not look like a web address: ' + bad.url;
    var emails = commas(d.swipers).concat(commas(d.outreach_by)).filter(function (m) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m); });
    if (emails.length) return 'That does not look like an email address: ' + emails[0];
    return null;
}

$('btnSrcSave').addEventListener('click', function () {
    if (!SRC.d || !SRC.job) return;
    var d = SRC.d, crit = cleanCriteria();
    var bad = validateSourcing(crit);
    if (bad) { toast(bad, 'err'); return; }
    var btn = this;
    btn.disabled = true; btn.textContent = 'Saving…';

    var body = {
        job_id: SRC.job.id, enabled: !!d.enabled, cards_per_week: d.cards_per_week, weekly_budget: d.weekly_budget,
        archetypes: lines(d.archetypes),
        examples: d.examples.filter(function (x) { return x.url.trim(); }).map(function (x) {
            var out = { url: HiringApi.linkHref(x.url), kind: x.kind };
            if (x.note.trim()) out.note = x.note.trim();
            return out;
        }),
        regions: commas(d.regions), base_timezone: d.base_timezone.trim(), overlap_hours: d.overlap_hours || 0,
        sources: d.sources, skip: lines(d.skip), card_shows: d.card_shows,
        swipers: commas(d.swipers), outreach_by: commas(d.outreach_by), message: d.message.trim()
    };
    /* Criteria first: switching the search on needs them. A new version is
     * written when they changed, or when they were written for an older
     * description and saving them again says they still fit. */
    var critStep = (sameCriteria(crit, SRC.criteria) && !staleCriteria()) ||
        (!crit.criteria.length && !crit.must_haves.length && !SRC.criteria)
        ? Promise.resolve(SRC.criteria)
        : HiringApi.saveCriteria(SRC.job.id, crit, SRC.job.description || '');
    critStep.then(function (c) {
        SRC.criteria = c;
        SRC.draftedFrom = null;
        return HiringApi.saveSourcing(body);
    }).then(function (row) {
        SRC.saved = row;
        S.srcDirty = false;
        if (row.enabled) S.sourcingOn[SRC.job.id] = true; else delete S.sourcingOn[SRC.job.id];
        toast('Saved sourcing for “' + SRC.job.title + '”');
        renderSourcing();
    }).catch(function (ex) {
        toast('Save failed: ' + friendly(ex), 'err');
    }).then(function () {
        btn.disabled = false; btn.textContent = 'Save';
    });
});

/* ==================================================================== swipe */

/* A stack of cards. Drag right (or press the tick) to reach out, left to pass,
 * or send a card to the back with Later. Passed people leave the stack; people
 * to reach out go to Outreach; Later puts a card behind everything else until
 * it comes round again. Everything the card leaves out is one tap away, in a
 * sheet. */

var SW = {
    job: null, sourcing: null, settings: null, versions: [], all: [], urls: {},
    front: null, cardId: null, shot: 0, last: [], why: null, busy: false
};

function openSwipe(jobId, quiet) {
    if (!quiet) { SW.last = []; SW.why = null; SW.front = null; $('swipeDeck').innerHTML = '<div class="blank">Loading…</div>'; }
    SW.busy = false;
    return Promise.all([
        HiringApi.getJob(jobId), HiringApi.listProspects(jobId, ['queued', 'maybe']),
        HiringApi.listCriteria(jobId), HiringApi.getSettings(), HiringApi.getSourcing(jobId), HiringApi.prospectCounts()
    ]).then(function (r) {
        if (!r[0]) { toast('That role no longer exists.', 'err'); go('#/'); return; }
        SW.job = r[0]; SW.all = r[1]; SW.versions = r[2]; SW.settings = r[3] || {};
        SW.sourcing = r[4] || HiringApi.defaultSourcing(jobId); S.prospects = r[5];
        renderRoleTabs(SW.job, 'swipe');
        var paths = [];
        SW.all.forEach(function (p) {
            if (p.photo_path) paths.push(p.photo_path);
            (p.screenshots || []).slice(0, 3).forEach(function (s) { if (s && s.path) paths.push(s.path); });
        });
        return HiringApi.prospectFileUrls(paths).then(function (urls) {
            SW.urls = urls;
            renderSwipe();
        });
    }).catch(function (ex) {
        $('swipeDeck').innerHTML = '<div class="blank">Could not load candidates:<br>' + esc(friendly(ex)) + '</div>';
    });
}

/* New cards first, best match first; then the ones sent to the back, the one
 * sent back longest ago first. A card just brought back by Undo goes on top. */
function deck() {
    var fresh = SW.all.filter(function (p) { return p.stage === 'queued'; })
        .sort(function (a, b) { return (scoreOf(b).match || 0) - (scoreOf(a).match || 0); });
    var later = SW.all.filter(function (p) { return p.stage === 'maybe'; })
        .sort(function (a, b) { return (lastDecision(a).decided_at || '') < (lastDecision(b).decided_at || '') ? -1 : 1; });
    var list = fresh.concat(later);
    if (SW.front) {
        var f = list.filter(function (p) { return p.id === SW.front; })[0];
        if (f) list = [f].concat(list.filter(function (p) { return p !== f; }));
    }
    return list;
}

/* The score to show: against the newest criteria when there is one, otherwise
 * the most recent, marked as older. */
function scoreOf(p) {
    var scores = p.hiring_prospect_scores || [];
    if (!scores.length) return {};
    var newest = SW.versions[0];
    var s = newest && scores.filter(function (x) { return x.criteria_id === newest.id; })[0];
    if (!s) s = scores.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
    var v = SW.versions.filter(function (x) { return x.id === s.criteria_id; })[0] || null;
    return { match: s.match, s: s, version: v, old: !!(newest && v && v.id !== newest.id) };
}

function lastDecision(p) {
    var ds = (p.hiring_decisions || []).slice().sort(function (a, b) { return a.decided_at < b.decided_at ? 1 : -1; });
    return ds[0] || {};
}

function current() { return deck()[0] || null; }

var SVG_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
var SVG_TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var SVG_LATER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg>';
var SVG_UNDO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5L2.5 6.5l3 3"/><path d="M2.8 6.5H10a3.5 3.5 0 0 1 0 7H7"/></svg>';

function renderSwipe() {
    var list = deck(), p = list[0];
    if (!p || p.id !== SW.cardId) { SW.cardId = p ? p.id : null; SW.shot = 0; }

    $('swipeBar').innerHTML = '<span class="count"><b>' + list.length + '</b> to review</span><span class="spacer"></span>' +
        (SW.last.length ? '<button type="button" class="iconbtn" data-act="undo" title="Undo (Z)" aria-label="Undo the last swipe">' + SVG_UNDO + '</button>' : '');

    if (!p) {
        $('swipeDeck').innerHTML = '<div class="blank">All done for now.<br>' + ((SW.sourcing && SW.sourcing.enabled)
            ? 'New cards arrive after the next weekly search.'
            : 'Switch the search on in <button type="button" class="linkbtn" data-act="to-sourcing">Sourcing</button> and new cards arrive every week.') + '</div>';
        $('swipeActs').innerHTML = '';
    } else {
        $('swipeDeck').innerHTML = cardHtml(p);
        $('swipeActs').innerHTML =
            '<button type="button" class="round no" data-act="pass" title="Pass (←)" aria-label="Pass">' + SVG_X + '</button>' +
            '<button type="button" class="round later" data-act="later" title="Later (↓)" aria-label="Later: send to the back">' + SVG_LATER + '</button>' +
            '<button type="button" class="round yes" data-act="reach" title="Reach out (→)" aria-label="Reach out">' + SVG_TICK + '</button>';
    }
    renderWhy();
}

function shotsOf(p) {
    var shows = (SW.sourcing && SW.sourcing.card_shows) || ['screenshots'];
    if (shows.indexOf('screenshots') < 0) return [];
    return (p.screenshots || []).slice(0, 3).filter(function (x) { return x && SW.urls[x.path]; });
}

function scoreClass(n, hi, lo) { return n >= hi ? ' hi' : n < lo ? ' lo' : ''; }

function cardHtml(p) {
    var sc = scoreOf(p), v = sc.version, s = sc.s || {};
    var photo = p.photo_path && SW.urls[p.photo_path];
    var shots = shotsOf(p), k = Math.min(SW.shot, Math.max(0, shots.length - 1));
    var scoreMap = {};
    (s.scores || []).forEach(function (x) { scoreMap[x.key] = x; });

    return '<article class="pcard" data-p="' + esc(p.id) + '">' +
        '<div class="hero" data-hero>' +
            (shots.length
                ? '<img src="' + esc(SW.urls[shots[k].path]) + '" alt="' + esc(shots[k].caption || 'Their work') + '" draggable="false">' +
                  (shots.length > 1 ? '<div class="dots">' + shots.map(function (x, i) { return '<span' + (i === k ? ' class="on"' : '') + '></span>'; }).join('') + '</div>' : '')
                : '<div class="noshot">' + (photo ? '<img class="avatar big" src="' + esc(photo) + '" alt="" draggable="false">' : esc(initials(p.name))) + '</div>') +
            '<span class="stamp yes">Reach out</span><span class="stamp no">Pass</span>' +
        '</div>' +
        '<div class="pbody">' +
            '<div class="phead">' +
                (shots.length ? (photo ? '<img class="avatar" src="' + esc(photo) + '" alt="" draggable="false">' : '<div class="avatar" aria-hidden="true">' + esc(initials(p.name)) + '</div>') : '') +
                '<div class="who"><b>' + esc(p.name) + '</b>' +
                    '<span>' + esc([p.headline, p.company].filter(Boolean).join(' at ')) + '</span>' +
                    '<span>' + esc([p.location, p.years_experience != null ? p.years_experience + ' yrs' : ''].filter(Boolean).join(' · ')) + '</span>' +
                '</div>' +
                (sc.match != null ? '<div class="match' + scoreClass(sc.match, 80, 60) + '"><b>' + sc.match + '%</b><small>match</small></div>' : '') +
            '</div>' +
            (p.summary ? '<p class="summary">' + esc(p.summary) + '</p>' : '') +
            (v && (v.criteria || []).length
                ? '<button type="button" class="minibars" data-act="scores" aria-label="See how ' + esc(firstName(p.name)) + ' scored, with evidence">' +
                    v.criteria.map(function (c) {
                        var x = scoreMap[c.key] || {}, val = typeof x.score === 'number' ? x.score : 0;
                        return '<span class="minibar"><span>' + esc(c.label) + '</span>' +
                            '<span class="track"><span class="fill' + scoreClass(val, 7, 5) + '" style="width:' + val * 10 + '%"></span></span></span>';
                    }).join('') + '</button>'
                : '') +
            '<div class="pbtns">' +
                (safeHref(p.portfolio_url) ? '<button type="button" class="main" data-act="site">Open portfolio</button>' : '') +
                '<button type="button" data-act="info">More info</button>' +
            '</div>' +
        '</div>' +
    '</article>';
}

/* ---- the sheets: everything the card leaves out ---- */

function openSheet(title, html) {
    $('sheetTitle').textContent = title;
    $('sheetBody').innerHTML = html;
    $('dlgSheet').showModal();
    $('sheetBody').scrollTop = 0;
}

$('sheetClose').addEventListener('click', function () { $('dlgSheet').close(); });
/* A tap on the dimmed area outside closes it, as a sheet should. */
$('dlgSheet').addEventListener('click', function (e) { if (e.target === this) this.close(); });

function scoresSheet(p) {
    var sc = scoreOf(p), v = sc.version, s = sc.s || {};
    if (!v) return;
    var mustMap = {}, scoreMap = {};
    (s.must_haves || []).forEach(function (m) { mustMap[m.key] = m; });
    (s.scores || []).forEach(function (x) { scoreMap[x.key] = x; });
    openSheet(firstName(p.name) + ' · ' + (sc.match != null ? sc.match + '% match' : 'not scored'),
        (sc.old ? '<div class="note">Scored against an older version of the criteria.</div>' : '') +
        ((v.must_haves || []).length
            ? '<div class="sec"><div class="lbl">Must-haves</div><div class="musts">' + v.must_haves.map(function (m) {
                var r = mustMap[m.key];
                return '<div><span class="chip ' + (r ? (r.pass ? 'go' : 'no') : '') + '">' + (r ? (r.pass ? '✓' : '✗') : '?') + '</span>' +
                    '<span><b>' + esc(m.label) + '</b>' + (r && r.evidence ? '<small>' + esc(r.evidence) + '</small>' : '') + '</span></div>';
            }).join('') + '</div></div>'
            : '') +
        '<div class="sec"><div class="lbl">Scores</div><div class="bars">' + (v.criteria || []).map(function (c) {
            var x = scoreMap[c.key] || {}, val = typeof x.score === 'number' ? x.score : null, href = safeHref(x.source_url);
            return '<div class="bar"><div class="top"><span>' + esc(c.label) + '</span>' +
                '<div class="track"><div class="fill' + (val == null ? '' : scoreClass(val, 7, 5)) + '" style="width:' + (val == null ? 0 : val * 10) + '%"></div></div>' +
                '<b>' + (val == null ? '–' : val) + '</b></div>' +
                (x.evidence ? '<div class="ev">' + esc(x.evidence) + (href ? ' <a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">Source</a>' : '') + '</div>' : '') +
            '</div>';
        }).join('') + '</div></div>' +
        (s.weakest ? '<div class="weak">Weakest fit: ' + esc(s.weakest) + '</div>' : ''));
}

function infoSheet(p) {
    var shots = (p.screenshots || []).slice(0, 3).filter(function (x) { return x && SW.urls[x.path]; });
    var links = [['Portfolio', p.portfolio_url], ['LinkedIn', p.linkedin_url], ['GitHub', p.github_url], ['Live product', p.product_url]]
        .filter(function (l) { return safeHref(l[1]); });
    var src = (p.hiring_prospect_sources || [])[0];
    openSheet(p.name,
        (links.length ? '<div class="plinks" style="margin:0">' + links.map(function (l) {
            return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + l[0] + '</a>';
        }).join('') + '</div>' : '') +
        (p.summary || (p.experience || []).length
            ? '<div class="sec"><div class="lbl">Experience</div>' + (p.summary ? '<p>' + esc(p.summary) + '</p>' : '') +
                ((p.experience || []).length ? '<div class="roles">' + p.experience.map(function (x) {
                    return '<div><b style="font-weight:500">' + esc([x.title, x.company].filter(Boolean).join(' · ')) + '</b>' +
                        '<span>' + esc([x.start, x.end].filter(Boolean).join('–')) + '</span></div>';
                }).join('') + '</div>' : '') + '</div>'
            : '') +
        (shots.length ? '<div class="sec"><div class="lbl">Their work</div><div class="workshots">' + shots.map(function (x) {
            var href = safeHref(x.url);
            return '<figure><img src="' + esc(SW.urls[x.path]) + '" alt="' + esc(x.caption || 'Their work') + '" loading="lazy">' +
                (x.caption || href ? '<figcaption>' + esc(x.caption || '') + (href ? ' <a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">Open</a>' : '') + '</figcaption>' : '') +
                '</figure>';
        }).join('') + '</div></div>' : '') +
        ((p.tags || []).length ? '<div class="sec"><div class="lbl">Tools</div><div class="chips">' + p.tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div></div>' : '') +
        '<div class="sec"><div class="lbl">Details</div><p class="muted" style="font-size:13px">' +
            esc([p.location, p.timezone].filter(Boolean).join(', ')) +
            (src ? '<br>Found via ' + esc(HiringApi.SOURCE_LABELS[src.source] || src.source) + (src.query ? ': “' + esc(src.query) + '”' : '') : '') +
        '</p></div>');
}

/* ---- the portfolio sheet ---- */

/* The site itself, framed, so the first look happens without leaving the
 * stack. The frame is sandboxed and sends no referrer. A site that forbids
 * framing shows the browser's own blank page; the header links to it in a tab. */
function openSite(p) {
    var url = safeHref(p.portfolio_url);
    if (!url) return;
    if (p.portfolio_embeds === false) { window.open(url, '_blank', 'noopener'); return; }
    var host = '';
    try { host = new URL(url).host.replace(/^www\./, ''); } catch (x) { /* shown without it */ }
    $('siteName').textContent = p.name;
    $('siteHost').textContent = host;
    $('siteOpen').href = url;
    $('siteFrame').src = url;
    $('siteFoot').innerHTML =
        '<button type="button" class="round no" data-site="pass" title="Pass" aria-label="Pass">' + SVG_X + '</button>' +
        '<button type="button" class="round later" data-site="later" title="Later" aria-label="Later: send to the back">' + SVG_LATER + '</button>' +
        '<button type="button" class="round yes" data-site="reach" title="Reach out" aria-label="Reach out">' + SVG_TICK + '</button>';
    $('dlgSite').showModal();
}

/* Leaving the page stops whatever it was playing. */
$('dlgSite').addEventListener('close', function () { $('siteFrame').src = 'about:blank'; });
$('siteClose').addEventListener('click', function () { $('dlgSite').close(); });
$('siteFoot').addEventListener('click', function (e) {
    var b = e.target.closest('[data-site]');
    if (!b) return;
    $('dlgSite').close();
    animateOut({ pass: 'left', reach: 'right', later: 'down' }[b.getAttribute('data-site')]);
});

/* ---- swiping ---- */

/* Sends the top card off in a direction, then records it. The card leaves
 * first so the swipe feels instant; if saving fails it comes back. */
function animateOut(dir) {
    var p = current(), card = $('swipeDeck').querySelector('.pcard');
    if (!p || !card || SW.busy) return;
    SW.busy = true;
    var w = Math.max(window.innerWidth, 600);
    card.classList.remove('drag');
    card.classList.add('fly');
    card.style.transform = dir === 'right' ? 'translate(' + w + 'px, 30px) rotate(24deg)'
        : dir === 'left' ? 'translate(' + -w + 'px, 30px) rotate(-24deg)'
        : 'translateY(40px) scale(.92)';
    card.style.opacity = '0';
    setTimeout(function () {
        record(p, dir === 'right' ? 'reach_out' : dir === 'left' ? 'pass' : 'maybe');
    }, reducedMotion() ? 0 : 230);
}

function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

function record(p, decision) {
    var job = SW.job, st = SW.settings, from = p.stage;
    var msg = decision !== 'reach_out' ? Promise.resolve(null) : HiringApi.prospectTokens([p.id]).then(function (t) {
        var link = publicLink(job.slug) + '&ref=' + encodeURIComponent(t[p.id] || '');
        return HiringApi.fillMessage((SW.sourcing && SW.sourcing.message) || HiringApi.DEFAULT_MESSAGE, {
            first_name: firstName(p.name), name: p.name, personal_line: p.personal_line || '',
            role: job.title, company: st.company || '', apply_link: link, signature: st.signature || ''
        });
    });
    msg.then(function (m) {
        return HiringApi.decide(p.id, decision, [], null, m);
    }).then(function (d) {
        var to = decision === 'pass' ? 'passed' : decision === 'maybe' ? 'maybe' : 'reach_out';
        p.hiring_decisions = (p.hiring_decisions || []).concat([d]);
        p.stage = to;
        if (SW.front === p.id) SW.front = null;
        bumpCount(job.id, from, -1); bumpCount(job.id, to, 1);
        if (to !== 'maybe') SW.all = SW.all.filter(function (x) { return x !== p; });
        SW.last.push({ p: p, d: d });
        SW.why = to === 'passed' ? { p: p, d: d, picked: [] } : null;
        renderRoleTabs(job, 'swipe');
        if (to === 'reach_out') toast(firstName(p.name) + ' is ready in Outreach');
    }).catch(function (ex) {
        toast(friendly(ex), 'err');
    }).then(function () {
        SW.busy = false;
        renderSwipe();
    });
}

function undo() {
    var u = SW.last.pop();
    if (!u || SW.busy) { renderSwipe(); return; }
    SW.busy = true;
    SW.why = null;
    HiringApi.undoDecision(u.d, u.p.id).then(function () {
        SW.front = u.p.id;
        return openSwipe(SW.job.id, true);
    }).catch(function (ex) {
        SW.busy = false;
        toast('Could not undo: ' + friendly(ex), 'err');
        renderSwipe();
    });
}

/* ---- why pass: asked after the card has gone, never in the way ---- */

/* It goes by itself after a while, so it never sits over the buttons for long.
 * Picking a reason starts the wait again. */
var WHY_WAIT = 8000;

function renderWhy() {
    var w = SW.why, box = $('swipeWhy');
    clearTimeout(SW.whyTimer);
    if (!w) { box.innerHTML = ''; return; }
    SW.whyTimer = setTimeout(function () { if (SW.why === w) { SW.why = null; renderWhy(); } }, WHY_WAIT);
    var list = SW.settings.pass_reasons || [];
    box.innerHTML = '<div class="why"><div class="whyhead"><span>Passed on ' + esc(firstName(w.p.name)) + '. Why? <span class="muted">Optional</span></span>' +
        '<button type="button" class="iconbtn" data-act="why-close" aria-label="Close">' + ICON.x + '</button></div>' +
        '<div class="chips">' + list.map(function (r, k) {
            var on = w.picked.indexOf(r) >= 0;
            return '<button type="button" data-reason="' + esc(r) + '"' + (on ? ' class="on"' : '') + ' aria-pressed="' + on + '">' +
                esc(r) + (k < 9 ? '<kbd>' + (k + 1) + '</kbd>' : '') + '</button>';
        }).join('') + '</div></div>';
}

function toggleReason(r) {
    var w = SW.why;
    if (!w) return;
    var at = w.picked.indexOf(r);
    if (at >= 0) w.picked.splice(at, 1); else w.picked.push(r);
    renderWhy();
    w.d.reasons = w.picked.slice();
    HiringApi.updateDecision(w.d.id, { reasons: w.picked.slice() }).catch(function (ex) { toast(friendly(ex), 'err'); });
}

/* ---- dragging the card ---- */

var DRAG = null;

$('swipeDeck').addEventListener('pointerdown', function (e) {
    var card = e.target.closest('.pcard');
    if (!card || e.target.closest('a, button') || e.button > 0 || SW.busy) return;
    DRAG = { card: card, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, id: e.pointerId, moved: false, t0: Date.now(), onHero: !!e.target.closest('[data-hero]') };
});

window.addEventListener('pointermove', function (e) {
    var d = DRAG;
    if (!d || e.pointerId !== d.id) return;
    d.dx = e.clientX - d.x0; d.dy = e.clientY - d.y0;
    if (!d.moved) {
        if (Math.abs(d.dx) < 6 && Math.abs(d.dy) < 6) return;
        /* Mostly up or down: that is scrolling the page, not swiping. */
        if (Math.abs(d.dy) > Math.abs(d.dx)) { DRAG = null; return; }
        d.moved = true;
        d.card.classList.add('drag');
        try { d.card.setPointerCapture(d.id); } catch (x) { /* already released */ }
    }
    d.card.style.transform = 'translate(' + d.dx + 'px, ' + d.dy * 0.2 + 'px) rotate(' + d.dx / 18 + 'deg)';
    var yes = d.card.querySelector('.stamp.yes'), no = d.card.querySelector('.stamp.no');
    if (yes) yes.style.opacity = Math.max(0, Math.min(1, d.dx / 90));
    if (no) no.style.opacity = Math.max(0, Math.min(1, -d.dx / 90));
});

function endDrag(e, cancelled) {
    var d = DRAG;
    if (!d || e.pointerId !== d.id) return;
    DRAG = null;
    if (!d.moved) {
        /* A tap on the picture flips to the next (right half) or previous one. */
        if (!cancelled && d.onHero) {
            var r = d.card.querySelector('[data-hero]').getBoundingClientRect();
            flipShot(e.clientX > r.left + r.width / 2 ? 1 : -1);
        }
        return;
    }
    var speed = Math.abs(d.dx) / Math.max(1, Date.now() - d.t0);
    var far = Math.abs(d.dx) > 110 || (Math.abs(d.dx) > 50 && speed > 0.6);
    if (!cancelled && far) { animateOut(d.dx > 0 ? 'right' : 'left'); return; }
    d.card.classList.remove('drag');
    d.card.classList.add('settle');
    d.card.style.transform = '';
    Array.prototype.forEach.call(d.card.querySelectorAll('.stamp'), function (s) { s.style.opacity = ''; });
    setTimeout(function () { d.card.classList.remove('settle'); }, 260);
}

window.addEventListener('pointerup', function (e) { endDrag(e, false); });
window.addEventListener('pointercancel', function (e) { endDrag(e, true); });

function flipShot(step) {
    var p = current();
    if (!p) return;
    var shots = shotsOf(p);
    if (shots.length < 2) return;
    SW.shot = (SW.shot + step + shots.length) % shots.length;
    var img = $('swipeDeck').querySelector('[data-hero] img'), x = shots[SW.shot];
    if (img) { img.src = SW.urls[x.path]; img.alt = x.caption || 'Their work'; }
    Array.prototype.forEach.call($('swipeDeck').querySelectorAll('.dots span'), function (s, i) { s.classList.toggle('on', i === SW.shot); });
}

/* ---- buttons and keys ---- */

function swipeAction(act) {
    var p = current();
    switch (act) {
        case 'pass': animateOut('left'); break;
        case 'reach': animateOut('right'); break;
        case 'later': animateOut('down'); break;
        case 'undo': undo(); break;
        case 'scores': if (p) scoresSheet(p); break;
        case 'info': if (p) infoSheet(p); break;
        case 'site': if (p) openSite(p); break;
        case 'why-close': SW.why = null; renderWhy(); break;
        case 'to-sourcing': go('#/j/' + SW.job.id + '/sourcing'); break;
    }
}

['swipeBar', 'swipeDeck', 'swipeActs', 'swipeWhy'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
        var r = e.target.closest('[data-reason]');
        if (r) { toggleReason(r.getAttribute('data-reason')); return; }
        var b = e.target.closest('[data-act]');
        if (b) swipeAction(b.getAttribute('data-act'));
    });
});

/* Left pass, right reach out, down later, P the portfolio (in its sheet), I more
 * info, Z undo.
 * After a pass, 1 to 9 pick reasons. */
document.addEventListener('keydown', function (e) {
    if (!$('viewSwipe').classList.contains('on') || document.querySelector('dialog[open]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    var p = current();
    if (e.key === 'ArrowLeft' && p) { e.preventDefault(); animateOut('left'); }
    else if (e.key === 'ArrowRight' && p) { e.preventDefault(); animateOut('right'); }
    else if (e.key === 'ArrowDown' && p) { e.preventDefault(); animateOut('down'); }
    else if ((e.key === 'p' || e.key === 'P') && p && safeHref(p.portfolio_url)) { openSite(p); }
    else if ((e.key === 'i' || e.key === 'I') && p) { infoSheet(p); }
    else if (e.key === 'z' || e.key === 'Z') { if (SW.last.length) undo(); }
    else if (SW.why && /^[1-9]$/.test(e.key)) {
        var r = (SW.settings.pass_reasons || [])[+e.key - 1];
        if (r) { e.preventDefault(); toggleReason(r); }
    }
});

/* ================================================================= outreach */

var OUT = { job: null, settings: null, sourcing: null, list: [], tokens: {}, filter: 'reach_out', open: null };

var OUT_FILTERS = [
    { key: 'reach_out', label: 'To contact' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'replied', label: 'Replied' },
    { key: 'applied', label: 'Applied' },
    { key: 'declined', label: 'Declined' }
];

function openOutreach(jobId) {
    OUT.filter = 'reach_out'; OUT.open = null;
    $('outList').innerHTML = '<div class="blank">Loading…</div>';
    $('outFilters').innerHTML = '';
    Promise.all([
        HiringApi.getJob(jobId), HiringApi.listProspects(jobId, ['reach_out', 'contacted', 'replied', 'declined', 'applied']),
        HiringApi.getSettings(), HiringApi.getSourcing(jobId), HiringApi.prospectCounts()
    ]).then(function (r) {
        if (!r[0]) { toast('That role no longer exists.', 'err'); go('#/'); return; }
        OUT.job = r[0]; OUT.list = r[1]; OUT.settings = r[2] || {}; OUT.sourcing = r[3] || HiringApi.defaultSourcing(jobId);
        S.prospects = r[4];
        renderRoleTabs(OUT.job, 'outreach');
        return HiringApi.prospectTokens(OUT.list.map(function (p) { return p.id; })).then(function (t) {
            OUT.tokens = t;
            renderOutreach();
        });
    }).catch(function (ex) {
        $('outList').innerHTML = '<div class="blank">Could not load outreach:<br>' + esc(friendly(ex)) + '</div>';
    });
}

function personalLink(p) {
    return publicLink(OUT.job.slug) + '&ref=' + encodeURIComponent(OUT.tokens[p.id] || '');
}

/* The message to show: the one saved with them, or a fresh one from the role's
 * template when there is none yet. */
function messageFor(p) {
    var o = one(p.hiring_outreach);
    if (o && o.message) return o.message;
    var st = OUT.settings;
    return HiringApi.fillMessage(OUT.sourcing.message || HiringApi.DEFAULT_MESSAGE, {
        first_name: firstName(p.name), name: p.name, personal_line: p.personal_line || '',
        role: OUT.job.title, company: st.company || '', apply_link: personalLink(p), signature: st.signature || ''
    });
}

function renderOutreach() {
    var counts = {};
    OUT.list.forEach(function (p) { counts[p.stage] = (counts[p.stage] || 0) + 1; });
    $('outFilters').innerHTML = '<div class="seg" role="group" aria-label="Filter by status">' +
        OUT_FILTERS.map(function (f) {
            var on = OUT.filter === f.key;
            return '<button type="button" data-filter="' + f.key + '"' + (on ? ' class="on"' : '') + ' aria-pressed="' + on + '">' +
                esc(f.label) + '<span class="ct">' + (counts[f.key] || 0) + '</span></button>';
        }).join('') + '</div>';

    var rows = OUT.list.filter(function (p) { return p.stage === OUT.filter; });
    if (!rows.length) {
        $('outList').innerHTML = '<div class="blank">' + (OUT.filter === 'reach_out'
            ? 'Nobody to contact.<br>People you swipe right on show up here with their message ready.'
            : 'Nobody here yet.') + '</div>';
        return;
    }
    $('outList').innerHTML = '<div class="panel"><table class="tbl"><thead><tr>' +
        '<th>Person</th><th class="shrink">Status</th><th>Picked by</th><th>Updated</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (p) {
            var o = one(p.hiring_outreach) || {}, d = lastDecision(p);
            return '<tr data-out="' + esc(p.id) + '">' +
                '<td class="nm"><b>' + esc(p.name) + '</b><small>' + esc([p.headline, p.company].filter(Boolean).join(' at ')) + '</small></td>' +
                '<td class="shrink"><span class="chip ' + toneOf(HiringApi.PROSPECT_STAGES, p.stage) + '">' + esc(stageLabel(p.stage)) + '</span></td>' +
                '<td class="sm">' + esc(d.decided_by || '') + (d.note ? ' · “' + esc(d.note) + '”' : '') + '</td>' +
                '<td class="sm">' + UI.fmtDate(o.updated_at || p.updated_at) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>';
}

$('outFilters').addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (!b) return;
    OUT.filter = b.getAttribute('data-filter');
    renderOutreach();
});

$('outList').addEventListener('click', function (e) {
    var row = e.target.closest('[data-out]');
    if (!row) return;
    var p = OUT.list.filter(function (x) { return x.id === row.getAttribute('data-out'); })[0];
    if (p) openOutreachDialog(p);
});

function openOutreachDialog(p) {
    OUT.open = p;
    $('oName').textContent = p.name;
    $('oHeadline').textContent = [p.headline, p.company].filter(Boolean).join(' at ');
    $('oLinks').innerHTML = [['LinkedIn', p.linkedin_url], ['Portfolio', p.portfolio_url], ['GitHub', p.github_url]]
        .filter(function (l) { return safeHref(l[1]); })
        .map(function (l) { return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + l[0] + '</a>'; }).join('');
    $('oMessage').value = messageFor(p);
    $('oLink').value = personalLink(p);
    renderOutreachState(p);
    $('dlgOutreach').showModal();
}

function renderOutreachState(p) {
    var o = one(p.hiring_outreach) || {};
    var bits = ['<span class="chip ' + toneOf(HiringApi.PROSPECT_STAGES, p.stage) + '">' + esc(stageLabel(p.stage)) + '</span>'];
    var via = { linkedin: ' on LinkedIn', email: ' by email' }[o.channel] || '';
    if (o.sent_at) bits.push('<span class="muted" style="font-size:12.5px">Sent ' + UI.fmtDate(o.sent_at) + via +
        (o.sent_by ? ' by ' + esc(o.sent_by) : '') + '</span>');
    if (o.replied_at) bits.push('<span class="muted" style="font-size:12.5px">Replied ' + UI.fmtDate(o.replied_at) + '</span>');
    $('oStatus').innerHTML = bits.join('');

    var acts = [];
    if (p.stage === 'applied') {
        acts.push('<button type="button" class="primary" data-oact="applicant">Open in Applicants</button>');
    } else if (p.stage === 'reach_out') {
        acts.push('<button type="button" data-oact="sent:email">Sent by email</button>');
        acts.push('<button type="button" class="primary" data-oact="sent:linkedin">Sent on LinkedIn</button>');
    } else if (p.stage === 'contacted') {
        acts.push('<button type="button" data-oact="ready">Not sent after all</button>');
        acts.push('<button type="button" data-oact="declined">Declined</button>');
        acts.push('<button type="button" class="primary" data-oact="replied">Replied</button>');
    } else if (p.stage === 'replied') {
        acts.push('<button type="button" data-oact="declined">Declined</button>');
    } else if (p.stage === 'declined') {
        acts.push('<button type="button" data-oact="replied">Replied after all</button>');
    }
    $('oActs').innerHTML = acts.join('');
}

/* Saves the message as it stands, creating the outreach row first if the swipe
 * that should have made it did not. */
function saveOutreach(p, patch) {
    return HiringApi.ensureOutreach(p.id, $('oMessage').value).then(function () {
        return HiringApi.updateOutreach(p.id, Object.assign({ message: $('oMessage').value }, patch));
    }).then(function () {
        var o = one(p.hiring_outreach) || {};
        p.hiring_outreach = Object.assign({}, o, { message: $('oMessage').value, updated_at: new Date().toISOString() }, patch);
    });
}

$('oActs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-oact]'), p = OUT.open;
    if (!b || !p) return;
    var act = b.getAttribute('data-oact'), now = new Date().toISOString(), patch, stage;
    if (act === 'applicant') { $('dlgOutreach').close(); go('#/j/' + OUT.job.id + '/applicants'); return; }
    if (act.indexOf('sent:') === 0) {
        patch = { status: 'sent', channel: act.slice(5), sent_at: now, sent_by: Backend.currentEmail() }; stage = 'contacted';
    } else if (act === 'ready') {
        patch = { status: 'ready', sent_at: null, sent_by: null, channel: null }; stage = 'reach_out';
    } else if (act === 'replied') {
        patch = { status: 'replied', replied_at: now }; stage = 'replied';
    } else if (act === 'declined') {
        patch = { status: 'declined' }; stage = 'declined';
    } else return;
    b.disabled = true;
    saveOutreach(p, patch).then(function () {
        bumpCount(OUT.job.id, p.stage, -1); bumpCount(OUT.job.id, stage, 1);
        p.stage = stage;
        renderRoleTabs(OUT.job, 'outreach');
        renderOutreach();
        renderOutreachState(p);
        toast(stage === 'contacted' ? 'Marked as sent' : 'Marked as ' + stageLabel(stage).toLowerCase());
    }).catch(function (ex) {
        toast(friendly(ex), 'err');
        b.disabled = false;
    });
});

$('oSaveMsg').addEventListener('click', function () {
    var p = OUT.open, btn = this;
    if (!p) return;
    btn.disabled = true;
    saveOutreach(p, {}).then(function () { toast('Message saved'); })
        .catch(function (ex) { toast(friendly(ex), 'err'); })
        .then(function () { btn.disabled = false; });
});

$('oCopy').addEventListener('click', function () {
    UI.copyText($('oMessage').value).then(function () { toast('Message copied'); });
});
$('oCopyLink').addEventListener('click', function () {
    UI.copyText($('oLink').value).then(function () { toast('Link copied'); });
});
$('lblOLink').insertAdjacentHTML('beforeend', UI.tip(SRC_TIPS.link));
$('oClose').addEventListener('click', function () { $('dlgOutreach').close(); });
$('dlgOutreach').addEventListener('close', function () { OUT.open = null; });

/* ================================================================= settings */

var SET = { s: null };

function openSettings() {
    $('setEditor').innerHTML = '<div class="blank">Loading…</div>';
    HiringApi.getSettings().then(function (s) {
        if (!s) throw new Error('could not find the table hiring_settings');
        SET.s = s;
        renderSettings();
    }).catch(function (ex) {
        $('setEditor').innerHTML = '<div class="blank">Could not load settings:<br>' + esc(friendly(ex)) + '</div>';
    });
}

function renderSettings() {
    var s = SET.s;
    $('setEditor').innerHTML =
        '<div class="card"><h2>The company</h2>' +
            '<div class="field"><label for="setCompany">Name</label>' +
                '<input type="text" id="setCompany" maxlength="120" value="' + esc(s.company) + '" placeholder="eGovern"></div>' +
            '<div class="field"><label for="setAbout">About' + UI.tip(SRC_TIPS.about) + '</label>' +
                '<textarea id="setAbout" rows="6" maxlength="5000">' + esc(s.about) + '</textarea></div>' +
            '<div class="field"><label for="setSignature">Outreach signature</label>' +
                '<textarea id="setSignature" rows="3" maxlength="1000" placeholder="Your name&#10;Your title, Company">' + esc(s.signature) + '</textarea></div>' +
        '</div>' +
        '<div class="card"><h2>Swiping</h2>' +
            '<div class="field"><label for="setReasons">Pass reasons' + UI.tip(SRC_TIPS.reasons) + '</label>' +
                '<textarea id="setReasons" rows="8">' + esc((s.pass_reasons || []).join('\n')) + '</textarea></div>' +
        '</div>' +
        '<div class="card"><h2>Sourcing</h2>' +
            '<div class="field"><label for="setAdmins">Who can switch sourcing on' + UI.tip(SRC_TIPS.admins) + '</label>' +
                '<input type="text" id="setAdmins" value="' + esc((s.sourcing_admins || []).join(', ')) + '" placeholder="Anyone signed in"></div>' +
            '<div class="two">' +
                '<div class="field"><label for="setLimit">People checked a month, all roles' + UI.tip(SRC_TIPS.limit) + '</label>' +
                    '<input type="number" id="setLimit" min="0" max="10000" step="1" value="' + esc(s.monthly_limit) + '"></div>' +
                '<div class="field"><label for="setKeep">Keep passed candidates (days)' + UI.tip(SRC_TIPS.keep) + '</label>' +
                    '<input type="number" id="setKeep" min="30" max="730" step="1" value="' + esc(s.keep_passed_days) + '"></div>' +
            '</div>' +
            '<div><button type="button" id="setPurge">Clear old passed candidates now</button></div>' +
        '</div>';
}

$('btnSetSave').addEventListener('click', function () {
    if (!SET.s) return;
    var admins = commas($('setAdmins').value);
    var bad = admins.filter(function (m) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m); })[0];
    if (bad) { toast('That does not look like an email address: ' + bad, 'err'); return; }
    var limit = Number($('setLimit').value), keep = Number($('setKeep').value);
    if (!(Number.isInteger(limit) && limit >= 0 && limit <= 10000)) { toast('The monthly limit must be a whole number from 0 to 10,000.', 'err'); return; }
    if (!(Number.isInteger(keep) && keep >= 30 && keep <= 730)) { toast('Keep passed candidates for 30 to 730 days.', 'err'); return; }
    var next = {
        company: $('setCompany').value.trim(), about: $('setAbout').value.trim(), signature: $('setSignature').value.trim(),
        pass_reasons: lines($('setReasons').value), sourcing_admins: admins, monthly_limit: limit, keep_passed_days: keep
    };
    var btn = this;
    btn.disabled = true; btn.textContent = 'Saving…';
    HiringApi.saveSettings(next).then(function (row) {
        SET.s = row || Object.assign(SET.s, next);
        toast('Settings saved');
        renderSettings();
    }).catch(function (ex) {
        toast('Save failed: ' + friendly(ex), 'err');
    }).then(function () { btn.disabled = false; btn.textContent = 'Save'; });
});

$('setEditor').addEventListener('click', function (e) {
    if (!e.target.closest('#setPurge') || !SET.s) return;
    var days = SET.s.keep_passed_days, btn = e.target.closest('#setPurge');
    UI.ask({
        title: 'Clear old passed candidates?',
        body: 'Everyone passed on, across every role, and not touched for ' + days + ' days is deleted, with their pictures. This cannot be undone.',
        yes: 'Clear them', danger: true
    }).then(function (yes) {
        if (!yes) return;
        btn.disabled = true; btn.textContent = 'Clearing…';
        return HiringApi.purgeProspects(days).then(function (n) {
            toast(n ? 'Cleared ' + n + (n === 1 ? ' candidate' : ' candidates') : 'Nothing old enough to clear');
        }).catch(function (ex) { toast(friendly(ex), 'err'); })
          .then(function () { btn.disabled = false; btn.textContent = 'Clear old passed candidates now'; });
    });
});
