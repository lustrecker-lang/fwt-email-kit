/* Supabase access for the email tool: templates, brands and organisations.
 *
 * Sign-in, token refresh and file upload are not email concerns, so they live
 * in shared/backend.js and every tool uses the same ones. This file is only the
 * tables this tool owns, spoken to over PostgREST with plain fetch.
 *
 *   /rest/v1  email_templates, project_brands, project_orgs
 *
 * `Api` keeps the surface it always had, so the composer and the library did not
 * need to change when the shared half moved out.
 */

var Api = (function () {
    var headers = Backend.headers;
    var authed = Backend.authed;
    var check = Backend.check;

    /* -------------------------------------------------------------- templates */

    /* `status` arrived after the first databases were created, so both the
     * status and legacy `is_live` columns are requested defensively. A missing
     * column is a PostgREST 400; latch only that column off and retry so older
     * projects can still list templates. `is_live` remains mirrored for links
     * and integrations that already use it. */
    var liveColumn = true;
    var statusColumn = true;

    var TPL_COLS = 'id,project,name,description,variables,sendgrid_template_id,updated_at';

    function hasLiveColumn() { return liveColumn; }
    function hasStatusColumn() { return statusColumn; }

    function listTemplates() {
        var wantedStatus = statusColumn;
        var wantedLive = liveColumn;
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates' +
                '?select=' + TPL_COLS + (wantedStatus ? ',status' : '') +
                (wantedLive ? ',is_live' : '') + '&order=project.asc,name.asc',
                { headers: headers() });
        }).then(function (r) {
            if (!r.ok && r.status === 400 && wantedStatus) {
                statusColumn = false;
                return listTemplates();
            }
            if (!r.ok && r.status === 400 && wantedLive) {
                liveColumn = false;
                return listTemplates();
            }
            return check(r);
        });
    }

    /* Deliberately a targeted PATCH rather than part of saveTemplate, so
     * changing workflow state cannot also overwrite the rendered HTML. */
    function setStatus(id, status) {
        if (['draft', 'approved', 'live'].indexOf(status) === -1) {
            return Promise.reject(new Error('Unknown template status.'));
        }
        if (!statusColumn) {
            if (status === 'approved') {
                return Promise.reject(new Error(
                    'This database has no status column yet. Re-run supabase/schema.sql ' +
                    'in the Supabase SQL editor to add Approved.'));
            }
            return setLive(id, status === 'live').then(function () { return status; });
        }
        var patch = { status: status };
        if (liveColumn) patch.is_live = status === 'live';
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/email_templates?id=eq.' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: headers({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
                body: JSON.stringify(patch)
            });
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error(t || 'Update failed'); });
            return status;
        });
    }

    /* Kept for a database that has the earlier Live/Draft column but has not
     * yet had the status migration applied. */
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
     * `status` and `is_live` are intentionally absent: merge-duplicates only
     * assigns the columns present in the body, so editing a template preserves
     * its workflow state. Only setStatus() — or legacy setLive() before the
     * migration — changes it. */
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
                    display_name: b.display_name || null,
                    brand_name: b.brand_name || null,
                    logo_url: b.logo_url || null,
                    website_url: b.website_url || null,
                    stamp_url: b.stamp_url || null,
                    logo_width: b.logo_width || null,
                    logo_height: b.logo_height || null,
                    logo_aspect: b.logo_aspect || null,
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

    /* ---------------------------------------------------------- organisations */

    /* Every organisation for every project, in one read. There are only ever a
     * few per project and the whole app needs them resolved up front — the
     * filter, the preview and the shared library all render through makeTheme —
     * so paging or per-project fetches would buy nothing. */
    function listOrgs() {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/project_orgs?select=*&order=project.asc,sort.asc',
                { headers: headers() });
        }).then(check);
    }

    /* Upserts on (project, key), so saving an organisation twice updates it in
     * place. The key is slugged from the name by the caller and never changes
     * afterwards, which is what lets a name be corrected without orphaning
     * anything that referred to it. */
    function saveOrg(o) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/project_orgs?on_conflict=project,key', {
                method: 'POST',
                headers: headers({
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                }),
                body: JSON.stringify({
                    project: o.project,
                    key: o.key,
                    display_name: o.display_name || null,
                    org_name: o.org_name || null,
                    org_address: o.org_address || null,
                    logo_url: o.logo_url || null,
                    logo_width: o.logo_width || null,
                    logo_height: o.logo_height || null,
                    logo_aspect: o.logo_aspect || null,
                    website_url: o.website_url || null,
                    stamp_url: o.stamp_url || null,
                    social: o.social || {},
                    sort: o.sort || 0
                })
            });
        }).then(check).then(function (rows) { return rows[0]; });
    }

    /* Deleting an organisation leaves the project's templates alone — they were
     * never attached to it. They simply render under whichever organisation is
     * left, or under the project's own branding if it was the last one. */
    function deleteOrg(project, key) {
        return authed(function () {
            return fetch(SUPABASE.url + '/rest/v1/project_orgs' +
                '?project=eq.' + encodeURIComponent(project) +
                '&key=eq.' + encodeURIComponent(key), {
                method: 'DELETE',
                headers: headers({ 'Prefer': 'return=minimal' })
            });
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error(t || 'Delete failed'); });
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

    /* Uploads go to the email tool's bucket (SUPABASE.bucket), which is what
     * Backend.uploadFile defaults to. */
    function uploadFile(file, kind) { return Backend.uploadFile(file, kind); }
    function uploadImage(file) { return uploadFile(file, 'image'); }

    return {
        isSignedIn: Backend.isSignedIn,
        currentEmail: Backend.currentEmail,
        onAuthLost: Backend.onAuthLost,
        signIn: Backend.signIn,
        signOut: Backend.signOut,
        listTemplates: listTemplates,
        getTemplate: getTemplate,
        saveTemplate: saveTemplate,
        deleteTemplate: deleteTemplate,
        setStatus: setStatus,
        hasStatusColumn: hasStatusColumn,
        setLive: setLive,
        hasLiveColumn: hasLiveColumn,
        listBrands: listBrands,
        saveBrand: saveBrand,
        resetBrand: resetBrand,
        listOrgs: listOrgs,
        saveOrg: saveOrg,
        deleteOrg: deleteOrg,
        listByProject: listByProject,
        updateHtml: updateHtml,
        uploadImage: uploadImage,
        uploadFile: uploadFile,
        acceptAttr: Backend.acceptAttr,
        checkFile: Backend.checkFile
    };
})();
