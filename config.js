/* Supabase connection for the email kit.
 *
 * The publishable key is meant to be public — it ships in the page source of
 * the shared link, and that is fine. It identifies the project; it grants
 * nothing on its own. What actually protects the data is the row-level
 * security in supabase/schema.sql: reading is open to everyone, writing
 * requires a signed-in user, and sign-ups are closed.
 *
 * Verified rejected with this key on 28 July 2026:
 *   - anonymous insert into email_templates  -> 401, RLS violation
 *   - anonymous upload to email-assets       -> 403, RLS violation
 *
 * Never put a `service_role` or `sb_secret_…` key in this file. Those bypass
 * every policy above, and this file is served to the browser.
 */

var SUPABASE = {
    url: 'https://lwyjxomeyymuqqargzhs.supabase.co',
    key: 'sb_publishable_RwzXnpE7wHB2bNEpK8-XOQ_AnDgp077',
    bucket: 'email-assets'
};
