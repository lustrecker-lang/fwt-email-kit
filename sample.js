/* Preview-only content.
 *
 * None of this ships in an email — it exists so previews read like a real
 * message instead of a wall of {{ handlebars }}. Shared by the composer and the
 * project settings preview so both show the same thing.
 *
 * Deliberately realistic rather than lorem ipsum. The preview's job is proving
 * the layout holds, and layout breaks on string *shape*: whether "BBD $150.00"
 * still fits the right-hand column once the item name runs long, whether
 * "REF-2026-04817" wraps under its own label, whether a four-word button label
 * pushes the pill past the gutter. Latin has no digits, no currency and no
 * dates, so it would hide every one of those. It also reads as texture rather
 * than language, which means you stop noticing that a title is two words too
 * long.
 *
 * Equally deliberately generic. This copy is shared by every project, so
 * nothing here belongs to one agency — a SmartFinance preview claiming to come
 * from the Nursing Council reads as a bug. The sender's identity is the one
 * thing that must differ per project, so those fields come from the theme
 * instead of from this file. See sampleIdentity() below.
 */

var PLACEHOLDER_IMG = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='300'%3E%3Crect width='600' height='300' fill='%23e8e5e1'/%3E%3Ccircle cx='476' cy='72' r='42' fill='%23d9d4cd'/%3E%3Cpath d='M0 232 L164 138 L302 232 L404 176 L600 300 L0 300 Z' fill='%23cec8c0'/%3E%3C/svg%3E";

var SAMPLE = {
    /* Emitted by the document shell rather than by any block. */
    email_subject: 'Your application has been approved',
    preheader: 'Reference REF-2026-04817 is now active.',

    email_title: 'Your application has been approved',
    email_subtitle: 'Reference REF-2026-04817 is now active.',
    hero_image_url: PLACEHOLDER_IMG, hero_image_alt: '',

    /* Fallbacks only. With a theme passed to fillSample these are replaced by
     * the project's own name — see sampleIdentity(). */
    org_name: 'Your Organisation',
    legal_note: 'You are receiving this because you hold an account with us.',

    /* Not on project_brands, so it stays a neutral government address rather
     * than any one agency's. Long enough to test the footer wrapping. */
    org_address: 'Warrens Office Complex, Warrens, St. Michael BB22026, Barbados',

    first_name: 'Amara',
    body_text: 'We have finished reviewing your application. Everything we needed was in order, and your record has now been updated.',
    cta_label: 'View your application', cta_url: '#',

    detail_1_label: 'Reference number', detail_1_value: 'REF-2026-04817',
    detail_2_label: 'Application type', detail_2_value: 'Standard renewal',
    detail_3_label: 'Approved on', detail_3_value: '28 July 2026',
    detail_4_label: 'Valid until', detail_4_value: '31 March 2027',
    detail_5_label: 'Fee paid', detail_5_value: 'BBD $150.00',
    detail_6_label: 'Payment reference', detail_6_value: 'PAY-99321',

    item_1_name: 'Annual renewal fee', item_1_detail: '1 April 2026 – 31 March 2027', item_1_amount: 'BBD $150.00',
    item_2_name: 'Duplicate certificate', item_2_detail: 'One copy, posted', item_2_amount: 'BBD $25.00',
    item_3_name: 'Additional assessment', item_3_detail: 'Expedited handling', item_3_amount: 'BBD $60.00',
    item_4_name: 'Late submission fee', item_4_detail: 'Waived', item_4_amount: 'BBD $0.00',
    total_label: 'Total paid', total_amount: 'BBD $175.00',

    steps_heading: 'What happens next',
    step_1_text: 'Download your certificate from the portal.',
    step_2_text: 'Keep your reference number for any correspondence with us.',
    step_3_text: 'Renew before 31 March 2027 to stay active.',
    step_4_text: 'Let us know if your address or contact details change.',
    step_5_text: 'Keep the certificate somewhere safe — replacements carry a fee.',

    document_1_name: 'Approval certificate', document_1_meta: 'PDF · 214 KB', document_1_url: '#',
    document_2_name: 'Confirmation letter', document_2_meta: 'PDF · 98 KB', document_2_url: '#',
    document_3_name: 'Payment receipt', document_3_meta: 'PDF · 41 KB', document_3_url: '#',

    panel_title: 'Keep your details up to date',
    panel_text: 'A change of address or contact details can be made from your profile at any time, and takes effect immediately.',
    panel_url: '#', panel_link_label: 'Update your profile',

    col_1_title: 'Keep details current', col_1_text: 'Update your address and contact details from your profile.',
    col_1_url: '#', col_1_link_label: 'Edit profile',
    col_2_title: 'Verify your status', col_2_text: 'Third parties can confirm your status using the public register.',
    col_2_url: '#', col_2_link_label: 'Public register',

    help_url: '#', help_label: 'Visit the Help Centre', privacy_url: '#',
    sender_name: 'Marcia Alleyne', sender_title: 'Director',
    unsubscribe_url: '#', preferences_url: '#'

    /* No social_* entries: those are real URLs from the project's brand record
     * now, not merge fields, so there is nothing here to stand in for them. */
};

/* The handful of fields that describe the sender rather than the message. Taken
 * from the project so the preview is signed by whoever is actually sending it.
 * Everything else in SAMPLE is message content and stays project-neutral. */
function sampleIdentity(theme) {
    if (!theme || !theme.brandName) return {};
    return {
        org_name: theme.brandName,
        legal_note: 'You are receiving this because you hold an account with ' +
            theme.brandName + '.'
    };
}

/* Is this placeholder inside a tag, or in text the recipient reads?
 *
 * Scanning back to the nearest angle bracket answers it: if the closest one is
 * an opening bracket we are still inside a tag, so the placeholder is an
 * attribute value — a link target or an image source. Copy is escaped long
 * before it reaches here, so no < or > from anyone's sentence can confuse this.
 *
 * It matters twice over. Visible text can be escaped and wrapped in a marker;
 * an attribute can be neither, because a <span> inside href="" would break the
 * document. */
function slotAt(html, offset) {
    var before = html.slice(0, offset);
    if (before.lastIndexOf('<') <= before.lastIndexOf('>')) return 'text';
    var attr = /([a-zA-Z-]+)\s*=\s*"[^"]*$/.exec(before);
    var name = attr ? attr[1].toLowerCase() : '';
    if (name === 'href') return 'link';
    if (name === 'src') return 'image';
    if (name === 'alt') return 'alt text';
    return 'attribute';
}

/* Styling for the labelled view. Inline, because it is injected into the email
 * document itself, and only ever seen in a browser preview. */
var MARK_STYLE = 'background:#fff6cc;box-shadow:0 0 0 1px #e0c25c;border-radius:2px;padding:0 1px;';
var MARK_TAG_STYLE = 'display:inline-block;margin-left:3px;font-family:ui-monospace,Menlo,Consolas,monospace;' +
    'font-size:9px;line-height:14px;vertical-align:2px;background:#382f19;color:#ffe6a3;' +
    'border-radius:3px;padding:0 4px;white-space:nowrap;font-weight:400;letter-spacing:0;';

/* Fills a rendered document with something readable, in order of authority:
 *
 *   1. `examples` — what whoever built this template said each field should look
 *      like. Specific to one email, and the reason the shared link can show the
 *      exact intended message rather than a guess.
 *   2. the project's identity, so the footer names the right organisation.
 *   3. the generic filler above, for anything nobody has got round to.
 *
 * Falls back to the unsuffixed field too, so a duplicated block previews with
 * readable text instead of a bare {{body_text_2}}.
 *
 * With `label` on, every visible placeholder is wrapped and tagged with its own
 * name, so the email can be read as a map of which parts are dynamic. That is
 * the difference between a table saying first_name is "Amara" and being able to
 * see which "Amara" on the page it means — which matters most exactly where a
 * table is least help, when two fields share a value. */
function fillWith(html, theme, examples, label) {
    var identity = sampleIdentity(theme);
    var given = examples || {};
    function lookup(k) {
        if (Object.prototype.hasOwnProperty.call(given, k) &&
            String(given[k]).trim() !== '') return given[k];
        if (Object.prototype.hasOwnProperty.call(identity, k)) return identity[k];
        if (Object.prototype.hasOwnProperty.call(SAMPLE, k)) return SAMPLE[k];
        return null;
    }
    function resolve(k) {
        var hit = lookup(k);
        return hit !== null ? hit : lookup(k.replace(/_\d+$/, ''));
    }
    return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (m, k, offset) {
        var v = resolve(k);
        if (v === null) return m;
        /* An attribute takes the raw value: it is a URL, and escaping the quotes
         * in one would be worse than leaving it. */
        if (slotAt(html, offset) !== 'text') return String(v);
        /* Visible copy is escaped. Examples are typed by a person, so a stray <
         * would otherwise land as markup in the preview. */
        var text = esc(String(v));
        if (!label) return text;
        return '<span style="' + MARK_STYLE + '">' + text +
            '<span style="' + MARK_TAG_STYLE + '">' + esc(k) + '</span></span>';
    });
}

function fillSample(html, theme, examples) {
    return fillWith(html, theme, examples, false);
}

/* The same email, with every merge field named where it sits. */
function fillSampleLabelled(html, theme, examples) {
    return fillWith(html, theme, examples, true);
}
