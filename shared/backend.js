/* Supabase access shared by every tool — plain fetch, no SDK.
 *
 * This file is the part of the old api.js that knows nothing about emails:
 * who is signed in, keeping that alive, and getting files into storage. Each
 * tool builds its own table access on top (apps/email/api.js, and later
 * apps/hiring/api.js) using `headers`, `authed` and `check`.
 *
 * Three REST APIs ship with Supabase:
 *   /auth/v1     sign in, refresh
 *   /rest/v1     tables (PostgREST)
 *   /storage/v1  buckets
 *
 * Keeping it dependency-free means the kit is still a handful of files you can
 * open from a static host with no build step — which was the point of the thing.
 *
 * One sign-in covers every tool: the session lives under a single key, so
 * moving between tools on the same origin does not ask again.
 */

var Backend = (function () {
    var SESSION_KEY = 'fwt-tools-session';
    /* Sessions were stored under this key before there was more than one tool.
     * Read once and moved, so nobody is signed out by the restructure. */
    var LEGACY_SESSION_KEY = 'egovern-email-kit-session';
    var session = null;      /* { access_token, refresh_token, email } */

    try {
        session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (!session) {
            session = JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY) || 'null');
            if (session) {
                localStorage.setItem(SESSION_KEY, JSON.stringify(session));
                localStorage.removeItem(LEGACY_SESSION_KEY);
            }
        }
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

    /* Always the anonymous role, even in a browser that happens to hold a staff
     * session. Public pages use this so what an applicant sees and can do never
     * depends on who else has used the browser. */
    function anonHeaders(extra) {
        var h = { 'apikey': SUPABASE.key, 'Authorization': 'Bearer ' + SUPABASE.key };
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

    /* ---------------------------------------------------------------- storage */

    /* What a bucket accepts, mirroring allowed_mime_types in the schema.
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
        },
        /* What an applicant may send: mirrors the hiring-uploads bucket, which is
         * narrower than the email one (no spreadsheets). */
        applicant: {
            label: 'file',
            mime: [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain', 'application/zip',
                'image/png', 'image/jpeg', 'image/gif', 'image/webp'
            ],
            ext: ['pdf', 'doc', 'docx', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'webp'],
            hint: 'PDF, Word, TXT, ZIP or an image.'
        },
        /* A video: an applicant's answer, or a brief a member of staff attaches to
         * a step. The limit is Supabase's free-plan ceiling for any one file; the
         * buckets in supabase/hiring.sql carry the same number. On a paid plan,
         * raise the project's own limit first, then this and the buckets. */
        video: {
            label: 'video',
            mime: ['video/mp4', 'video/quicktime', 'video/webm'],
            ext: ['mp4', 'mov', 'webm'],
            hint: 'MP4, MOV or WebM.',
            max: 50 * 1024 * 1024
        }
    };

    var MAX_BYTES = 10 * 1024 * 1024;   /* matches file_size_limit on the bucket */

    /* The biggest file of a kind, in megabytes, for sentences shown to people. */
    function maxMb(kind) {
        return Math.round(((ACCEPT[kind] && ACCEPT[kind].max) || MAX_BYTES) / 1048576);
    }

    /* Some browsers report no type for a file whose extension they do not know
     * (Firefox and .mov, often). The bucket judges by the Content-Type we send,
     * so an empty one would be refused even though the file is fine. */
    var EXT_MIME = {
        mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
        pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', zip: 'application/zip',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };

    function contentTypeOf(file) {
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        return file.type || EXT_MIME[ext] || 'application/octet-stream';
    }

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
        if (file.size > (a.max || MAX_BYTES)) {
            return 'That ' + a.label + ' is ' + (file.size / 1048576).toFixed(1) +
                   ' MB. The limit is ' + maxMb(kind) + ' MB.';
        }
        return null;
    }

    /* Returns the permanent public URL. Files are never overwritten or deleted:
     * emails already delivered still point at them.
     *
     * `bucket` defaults to SUPABASE.bucket, which is the email tool's. A tool
     * with its own bucket passes it explicitly. This only makes sense for
     * public buckets — the URL it returns is the public one. */
    function uploadFile(file, kind, bucket, onProgress) {
        if (!isSignedIn()) return Promise.reject(new Error('Sign in to upload'));

        var bad = checkFile(file, kind || 'image');
        if (bad) return Promise.reject(new Error(bad));

        var target = bucket || SUPABASE.bucket;
        var clean = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
        var path = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7) + '-' + clean;

        return authed(function () {
            var url = SUPABASE.url + '/storage/v1/object/' + target + '/' + path;
            var h = headers({ 'Content-Type': contentTypeOf(file) });
            /* Headers are built inside the request so a retry after a token
             * refresh sends the new token. Progress is only wired up when asked
             * for; everything that uploaded before still goes through fetch. */
            return onProgress ? postWithProgress(url, h, file, onProgress)
                              : fetch(url, { method: 'POST', headers: h, body: file });
        }).then(function (r) {
            if (!r.ok) {
                return r.text().then(function (txt) {
                    var msg = txt;
                    try { msg = JSON.parse(txt).message || txt; } catch (e) {}
                    throw new Error(msg || 'Upload failed');
                });
            }
            return SUPABASE.url + '/storage/v1/object/public/' + target + '/' + path;
        });
    }

    /* fetch cannot report how much of an upload has gone, and a video takes long
     * enough that watching a frozen button is not acceptable. This is the same
     * request through XMLHttpRequest, answering with a Response so everything
     * downstream treats it like any other. */
    function postWithProgress(url, hdrs, body, onProgress) {
        return new Promise(function (resolve, reject) {
            var x = new XMLHttpRequest();
            x.open('POST', url);
            for (var k in hdrs) if (Object.prototype.hasOwnProperty.call(hdrs, k)) x.setRequestHeader(k, hdrs[k]);
            if (onProgress && x.upload) {
                x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded, e.total); };
            }
            x.onload = function () {
                resolve(new Response(x.status === 204 ? null : x.responseText, { status: x.status }));
            };
            var broke = function () {
                reject(new Error('The upload was interrupted. Check your connection and try again.'));
            };
            x.onerror = broke; x.onabort = broke; x.ontimeout = broke;
            x.send(body);
        });
    }

    function storageError(r) {
        return r.text().then(function (txt) {
            var msg = txt;
            try { msg = JSON.parse(txt).message || txt; } catch (e) {}
            throw new Error(msg || 'Upload failed');
        });
    }

    /* Puts a file in a PRIVATE bucket as the anonymous role and returns its path
     * inside the bucket — not a URL, because there is no public one. The folder
     * is what the bucket's policy checks, so for applicants it must be their
     * token. */
    function uploadPrivate(bucket, folder, file, kind, onProgress) {
        var bad = checkFile(file, kind || 'applicant');
        if (bad) return Promise.reject(new Error(bad));

        var clean = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
        var path = folder + '/' + Date.now().toString(36) + '-' +
            Math.random().toString(36).slice(2, 7) + '-' + clean;

        return postWithProgress(
            SUPABASE.url + '/storage/v1/object/' + bucket + '/' + path,
            anonHeaders({ 'Content-Type': contentTypeOf(file) }), file, onProgress
        ).then(function (r) {
            if (!r.ok) return storageError(r);
            return path;
        });
    }

    /* A short-lived link to a file in a private bucket, for a signed-in user. */
    function signedUrl(bucket, path, seconds) {
        var enc = String(path).split('/').map(encodeURIComponent).join('/');
        return authed(function () {
            return fetch(SUPABASE.url + '/storage/v1/object/sign/' + bucket + '/' + enc, {
                method: 'POST',
                headers: headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ expiresIn: seconds || 300 })
            });
        }).then(check).then(function (d) {
            var u = d.signedURL || d.signedUrl || '';
            return u.indexOf('/storage/v1') === 0 ? SUPABASE.url + u : SUPABASE.url + '/storage/v1' + u;
        });
    }

    /* ------------------------------------------------------------------- rpc */

    /* Calls a Postgres function. `anon` sends the publishable key and nothing
     * else, which is how a public page talks to the functions that check a
     * token themselves. */
    function rpc(name, args, anon) {
        var send = function () {
            return fetch(SUPABASE.url + '/rest/v1/rpc/' + name, {
                method: 'POST',
                headers: (anon ? anonHeaders : headers)({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(args || {})
            });
        };
        return (anon ? send() : authed(send)).then(check);
    }

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
        headers: headers,
        anonHeaders: anonHeaders,
        authed: authed,
        check: check,
        rpc: rpc,
        uploadFile: uploadFile,
        uploadPrivate: uploadPrivate,
        maxMb: maxMb,
        signedUrl: signedUrl,
        acceptAttr: acceptAttr,
        checkFile: checkFile
    };
})();
