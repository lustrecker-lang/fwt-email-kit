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

/* Sample copy falls back to the unsuffixed field, so a duplicated block still
 * previews with readable text instead of a bare {{body_text_2}}. `theme` is
 * optional — without it the neutral fallbacks in SAMPLE are used. */
function fillSample(html, theme) {
    var identity = sampleIdentity(theme);
    function lookup(k) {
        if (Object.prototype.hasOwnProperty.call(identity, k)) return identity[k];
        if (Object.prototype.hasOwnProperty.call(SAMPLE, k)) return SAMPLE[k];
        return null;
    }
    return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (m, k) {
        var hit = lookup(k);
        if (hit !== null) return hit;
        hit = lookup(k.replace(/_\d+$/, ''));
        return hit !== null ? hit : m;
    });
}
