/* Supabase access for the email kit — plain fetch, no SDK.
 *
 * Everything here is three REST APIs that ship with Supabase:
 *   /auth/v1     sign in, refresh
 *   /rest/v1     the email_templates table (PostgREST)
 *   /storage/v1  the email-assets bucket
 *
 * Keeping it dependency-free means the kit is still three files you can open
 * from a static host with no build step — which was the point of the thing.
 */

var Api = (function () {
    var SESSION_KEY = 'egovern-email-kit-session';
    var session = null;      /* { access_token, refresh_token, email } */

    try {
        session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (e) { session = null; }

    function persist() {
        try {
            if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            else localStorage.removeItem(SESSION_KEY);
        } catch (e) { /* private mode: session lasts for this tab only */ }
    }

    /* Anonymous requests still need the publishable key as the bearer token —
     * that is what PostgREST reads to decide you are the `anon` role. */
    function headers(extra) {
        var h = {
            'apikey': SUPABASE.key,
            'Authorization': 'Bearer ' + (session ? session.access_token : SUPABASE.key)
        };
        for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
        return h;
    }

    function isSignedIn() { return !!(session && session.access_token); }
    function currentEmail() { return session ? session.email : null; }

    /* ------------------------------------------------------------------ auth */

    function signIn(email, password) {
        return fetch(SUPABASE.url + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: { 'apikey': SUPABASE.key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        }).then(function (r) {
            return r.json().then(function (d) {
                if (!r.ok) throw new Error(d.error_description || d.msg || d.message || 'Sign-in failed');
                session = {
                    access_token: d.access_token,
                    refresh_token: d.refresh_token,
                    email: (d.user && d.user.email) || email
                };
                persist();
                return session;
            });
        });
    }

    function signOut() {
        var had = session;
        session = null;
        persist();
        if (had) {
            /* Best-effort server-side revoke; the local session is already gone. */
            fetch(SUPABASE.url + '/auth/v1/logout', {
                method: 'POST',
                headers: { 'apikey': SUPABASE.key, 'Authorization': 'Bearer ' + had.access_token }
            }).catch(function () {});
        }
        return Promise.resolve();
    }

    /* Losing the session involuntarily is different from signing out: there is
     * a half-finished screen behind it and nobody asked. Subscribers get told so
     * the UI can drop to the login form instead of leaving a raw "JWT expired"
     * on screen. Fires once — the first failure clears the session, and the
     * guard stops three concurrent requests raising three notifications. */
    var authLost = [];

    function onAuthLost(fn) { authLost.push(fn); }

    function loseSession() {
        if (!session) return;
        session = null;
        persist();
        authLost.forEach(function (fn) {
            try { fn(); } catch (e) { /* a bad subscriber must not break the rest */ }
        });
    }

    /* Access tokens expire after an hour. Rather than track expiry, retry once
     * on the 401 — simpler, and wrong-clock-proof. */
    function refresh() {
        if (!session || !session.refresh_token) {
            loseSession();
            return Promise.reject(new Error('Not signed in'));
        }
        return fetch(SUPABASE.url + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'apikey': SUPABASE.key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: session.refresh_token })
        }).then(function (r) {
            /* The refresh token is gone too, so there is nothing left to try. */
            if (!r.ok) { loseSession(); throw new Error('Session expired — sign in again'); }
            return r.json();
        }).then(function (d) {
            session = {
                access_token: d.access_token,
                refresh_token: d.refresh_token,
                email: (d.user && d.user.email) || session.email
            };
            persist();
            return session;
        });
    }

    /* Wraps a request so an expired access token is refreshed and the request
     * retried once, transparently.
     *
     * `doRequest` must build its own headers each call rather than closing over
     * them, or the retry would send the same dead token again.
     *
     * Reads go through this as well as writes. They did not use to, which is why
     * an hour-old tab could save a template happily and then fail to list them
     * with "JWT expired": the write path refreshed and the read path did not. */
    function authed(doRequest) {
        return doRequest().then(function (r) {
            if (r.status !== 401 || !session) return r;
            return refresh().then(doRequest);
        });
    }

    /* -------------------------------------------------------------- templates */

    /* `is_live` arrived after the first databases were created, and the schema
     * has to be re-run by hand in the Supabase SQL editor. Selecting a column
     * that does not exist is a 400 from PostgREST, which would take the whole
     * template list down — so the first miss latches this off, the request is
     * retried without it, and the UI degrades to hiding the toggle. */
    var liveColumn = true;

    var TPL_COLS = 'id,project,name,description,variables,sendgrid_template_id,updated_at';

    function hasLiveColumn() { return liveColumn; }

    function listTemplates() {
        var wanted = liveColumn;
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates' +
                '?select=' + TPL_COLS + (wanted ? ',is_live' : '') +
                '&order=project.asc,name.asc', { headers: headers() });
        }).then(function (r) {
            if (!r.ok && wanted && r.status === 400) {
                liveColumn = false;
                return listTemplates();
            }
            return check(r);
        });
    }

    /* Publish / unpublish. Deliberately a targeted PATCH rather than part of
     * saveTemplate, so flipping the switch cannot also overwrite the HTML. */
    function setLive(id, live) {
        if (!liveColumn) {
            return Promise.reject(new Error(
                'This database has no is_live column yet. Re-run supabase/schema.sql ' +
                'in the Supabase SQL editor to add it.'));
        }
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates?id=eq.' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: headers({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
                body: JSON.stringify({ is_live: !!live })
            });
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error(t || 'Update failed'); });
            return !!live;
        });
    }

    function getTemplate(id) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates?select=*&id=eq.' + encodeURIComponent(id),
                { headers: headers() });
        }).then(check).then(function (rows) { return rows[0] || null; });
    }

    /* Upserts on the (project, name) unique index, so saving the same name
     * twice updates in place rather than piling up duplicates.
     *
     * `is_live` is intentionally absent: merge-duplicates only assigns the
     * columns present in the body, so editing a live template leaves it live,
     * and only setLive() ever moves that flag. */
    function saveTemplate(t) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates?on_conflict=project,name', {
                method: 'POST',
                headers: headers({
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                }),
                body: JSON.stringify({
                    project: t.project,
                    name: t.name,
                    description: t.description || null,
                    composition: t.composition,
                    html: t.html,
                    variables: t.variables || []
                })
            });
        }).then(check).then(function (rows) { return rows[0]; });
    }

    function deleteTemplate(id) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates?id=eq.' + encodeURIComponent(id), {
                method: 'DELETE',
                headers: headers({ 'Prefer': 'return=minimal' })
            });
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error(t || 'Delete failed'); });
            return true;
        });
    }

    /* ----------------------------------------------------------------- brands */

    function listBrands() {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/project_brands?select=*', { headers: headers() });
        }).then(check);
    }

    function saveBrand(b) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/project_brands?on_conflict=key', {
                method: 'POST',
                headers: headers({
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                }),
                body: JSON.stringify({
                    key: b.key,
                    brand_name: b.brand_name || null,
                    logo_url: b.logo_url || null,
                    stamp_url: b.stamp_url || null,
                    logo_width: b.logo_width || null,
                    font: b.font || null,
                    colors: b.colors || {},
                    social: b.social || {}
                })
            });
        }).then(check).then(function (rows) { return rows[0]; });
    }

    function resetBrand(key) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/project_brands?key=eq.' + encodeURIComponent(key), {
                method: 'DELETE',
                headers: headers({ 'Prefer': 'return=minimal' })
            });
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error(t || 'Reset failed'); });
            return true;
        });
    }

    /* The library renders from `composition`, so it always reflects current
     * branding. The stored `html` is a denormalisation for the eventual SendGrid
     * sync, and goes stale when a brand changes — this refreshes it in bulk. */
    function updateHtml(id, html, variables) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates?id=eq.' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: headers({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
                body: JSON.stringify({ html: html, variables: variables })
            });
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error(t || 'Update failed'); });
            return true;
        });
    }

    function listByProject(key) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates?select=id,composition' +
                '&project=eq.' + encodeURIComponent(key), { headers: headers() });
        }).then(check);
    }

    /* ---------------------------------------------------------------- storage */

    /* What the bucket accepts, mirroring allowed_mime_types in schema.sql.
     * Checked here as well so a wrong file gets a sentence a human can act on
     * instead of the storage API's raw mime error. */
    var ACCEPT = {
        image: {
            label: 'image',
            mime: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
            ext: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
            hint: 'PNG, JPG, GIF or WebP.'
        },
        /* A document row is just a link, so the recipient's browser decides what
         * to do with it — images belong here too, for the scanned certificate. */
        file: {
            label: 'file',
            mime: [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/csv', 'text/plain', 'application/zip',
                'image/png', 'image/jpeg', 'image/gif', 'image/webp'
            ],
            ext: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip',
                  'png', 'jpg', 'jpeg', 'gif', 'webp'],
            hint: 'PDF, Word, Excel, CSV, TXT, ZIP or an image.'
        }
    };

    var MAX_BYTES = 10 * 1024 * 1024;   /* matches file_size_limit on the bucket */

    function acceptAttr(kind) {
        var a = ACCEPT[kind] || ACCEPT.image;
        return a.mime.concat(a.ext.map(function (e) { return '.' + e; })).join(',');
    }

    /* Browsers disagree about file.type — Windows reports '' for .csv often
     * enough that extension is the more reliable signal of the two. */
    function checkFile(file, kind) {
        var a = ACCEPT[kind] || ACCEPT.image;
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        var okExt = a.ext.indexOf(ext) >= 0;
        var okMime = !!file.type && a.mime.indexOf(file.type) >= 0;

        if (!okExt && !okMime) {
            /* SVG is the one people reach for and are surprised by, so it gets
             * the reason rather than just the allow-list. */
            if (ext === 'svg') {
                return 'SVG will not render in Outlook or several Android mail ' +
                       'clients. Export it as a PNG at twice the display width.';
            }
            return 'That is not a supported ' + a.label + '. ' + a.hint;
        }
        if (file.size > MAX_BYTES) {
            return 'That ' + a.label + ' is ' + (file.size / 1048576).toFixed(1) +
                   ' MB. The limit is 10 MB.';
        }
        return null;
    }

    /* Returns the permanent public URL. Files are never overwritten or deleted:
     * emails already delivered still point at them. */
    function uploadFile(file, kind) {
        if (!isSignedIn()) return Promise.reject(new Error('Sign in to upload'));

        var bad = checkFile(file, kind || 'image');
        if (bad) return Promise.reject(new Error(bad));

        var clean = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
        var path = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7) + '-' + clean;

        return authed(function () {
            return fetch(SUPABASE.url + '/storage/v1/object/' + SUPABASE.bucket + '/' + path, {
                method: 'POST',
                headers: headers({ 'Content-Type': file.type || 'application/octet-stream' }),
                body: file
            });
        }).then(function (r) {
            if (!r.ok) {
                return r.text().then(function (txt) {
                    var msg = txt;
                    try { msg = JSON.parse(txt).message || txt; } catch (e) {}
                    throw new Error(msg || 'Upload failed');
                });
            }
            return SUPABASE.url + '/storage/v1/object/public/' + SUPABASE.bucket + '/' + path;
        });
    }

    function uploadImage(file) { return uploadFile(file, 'image'); }

    /* ------------------------------------------------------------------ util */

    function check(r) {
        if (!r.ok) {
            return r.text().then(function (txt) {
                var msg = txt;
                try { msg = JSON.parse(txt).message || txt; } catch (e) {}
                throw new Error(msg || ('Request failed (' + r.status + ')'));
            });
        }
        return r.status === 204 ? null : r.json();
    }

    return {
        isSignedIn: isSignedIn,
        currentEmail: currentEmail,
        onAuthLost: onAuthLost,
        signIn: signIn,
        signOut: signOut,
        listTemplates: listTemplates,
        getTemplate: getTemplate,
        saveTemplate: saveTemplate,
        deleteTemplate: deleteTemplate,
        setLive: setLive,
        hasLiveColumn: hasLiveColumn,
        listBrands: listBrands,
        saveBrand: saveBrand,
        resetBrand: resetBrand,
        listByProject: listByProject,
        updateHtml: updateHtml,
        uploadImage: uploadImage,
        uploadFile: uploadFile,
        acceptAttr: acceptAttr,
        checkFile: checkFile
    };
})();
