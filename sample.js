/* Preview-only content.
 *
 * None of this ships in an email — it exists so previews read like a real
 * message instead of a wall of {{ handlebars }}. Shared by the composer and
 * the library so both show the same thing.
 */

var PLACEHOLDER_IMG = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='300'%3E%3Crect width='600' height='300' fill='%23e8e5e1'/%3E%3Ccircle cx='476' cy='72' r='42' fill='%23d9d4cd'/%3E%3Cpath d='M0 232 L164 138 L302 232 L404 176 L600 300 L0 300 Z' fill='%23cec8c0'/%3E%3C/svg%3E";

var SAMPLE = {
    email_subject: 'Your application has been approved',
    preheader: 'Registration NRC-2026-04817 is now active.',
    email_title: 'Your application has been approved',
    email_subtitle: 'Registration NRC-2026-04817 is now active.',
    hero_image_url: PLACEHOLDER_IMG, hero_image_alt: '',
    org_name: 'Barbados Nursing Council',
    org_tagline: 'Professional registration and licensing',
    org_address: 'Jemmotts Lane, Bridgetown, St. Michael BB11115, Barbados',
    org_phone: '(246) 426-5416', org_email: 'registrar@nursingcouncil.gov.bb',
    org_website: 'https://nursingcouncil.gov.bb', org_website_label: 'nursingcouncil.gov.bb',
    first_name: 'Amara',
    body_text: 'We have finished reviewing your registration application. Everything we needed was in order, and your details are now on the register.',
    cta_label: 'View your registration', cta_url: '#',
    status_label: 'Approved',
    status_headline: 'You are registered until 31 March 2027',
    status_message: 'Your certificate is available in the portal and can be downloaded at any time.',
    detail_1_label: 'Registration number', detail_1_value: 'NRC-2026-04817',
    detail_2_label: 'Profession', detail_2_value: 'Registered Nurse',
    detail_3_label: 'Approved on', detail_3_value: '28 July 2026',
    detail_4_label: 'Valid until', detail_4_value: '31 March 2027',
    detail_5_label: 'Fee paid', detail_5_value: 'BBD $150.00',
    detail_6_label: 'Reference', detail_6_value: 'PAY-99321',
    item_1_name: 'Annual registration fee', item_1_detail: '1 April 2026 – 31 March 2027', item_1_amount: 'BBD $150.00',
    item_2_name: 'Certificate reprint', item_2_detail: 'One copy, posted', item_2_amount: 'BBD $25.00',
    item_3_name: 'Specialization assessment', item_3_detail: 'Critical care', item_3_amount: 'BBD $60.00',
    item_4_name: 'Late submission fee', item_4_detail: 'Waived', item_4_amount: 'BBD $0.00',
    total_label: 'Total paid', total_amount: 'BBD $175.00',
    steps_heading: 'What happens next',
    step_1_text: 'Download your registration certificate from the portal.',
    step_2_text: 'Log continuing education activities as you complete them.',
    step_3_text: 'Renew before 31 March 2027 to keep your registration active.',
    step_4_text: 'Let us know if your employer or contact details change.',
    step_5_text: 'Keep your certificate somewhere safe — reprints carry a fee.',
    document_1_name: 'Registration certificate', document_1_meta: 'PDF · 214 KB', document_1_url: '#',
    document_2_name: 'Letter of good standing', document_2_meta: 'PDF · 98 KB', document_2_url: '#',
    document_3_name: 'Payment receipt', document_3_meta: 'PDF · 41 KB', document_3_url: '#',
    panel_title: 'Continuing education starts now',
    panel_text: 'Your next cycle needs 30 credits. Log activities as you go rather than in a rush next March.',
    panel_url: '#', panel_link_label: 'Log an activity',
    col_1_title: 'Keep details current', col_1_text: 'Update your employer and contact details from your profile.',
    col_1_url: '#', col_1_link_label: 'Edit profile',
    col_2_title: 'Verify your status', col_2_text: 'Employers can confirm your registration using the public register.',
    col_2_url: '#', col_2_link_label: 'Public register',
    note_text: 'The qualification certificate you uploaded was not legible. Please upload a clear scan of the original document.',
    note_author: 'J. Belgrave', note_author_title: 'Registration Officer',
    help_url: '#', help_label: 'Visit the Help Centre', privacy_url: '#',
    sender_name: 'Marcia Alleyne', sender_title: 'Registrar',
    legal_note: 'You are receiving this because you hold an account with the Barbados Nursing Council.',
    unsubscribe_url: '#', preferences_url: '#'
    /* No social_* entries: those are real URLs from the project's brand record
     * now, not merge fields, so there is nothing here to stand in for them. */
};

/* Sample copy falls back to the unsuffixed field, so a duplicated block still
 * previews with readable text instead of a bare {{body_text_2}}. */
function fillSample(html) {
    return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (m, k) {
        if (Object.prototype.hasOwnProperty.call(SAMPLE, k)) return SAMPLE[k];
        var base = k.replace(/_\d+$/, '');
        return Object.prototype.hasOwnProperty.call(SAMPLE, base) ? SAMPLE[base] : m;
    });
}
