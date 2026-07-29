/* eGovern Email Kit — the block catalogue.
 *
 * Every block renders to a single <tr>, so any sequence of blocks stitches into
 * a valid email without the composer knowing anything about them.
 *
 * Authoring rules (email HTML is not web HTML):
 *   - tables for layout, never flex/grid
 *   - inline styles only
 *   - explicit widths, role="presentation" on layout tables
 *   - class="px" on padded content cells, so the mobile query can tighten the
 *     gutter from 40px to 24px in one place
 *   - content is {{ mustache }} placeholders — SendGrid reads these natively
 *   - colours, sizes and spacing come from the theme; never hardcode
 *
 * Signature: render(t, o) -> html   (t = theme, o = this block's options)
 */

/* Palette groups, in the order an email is actually assembled top to bottom.
 * Kept small on purpose — a group of fourteen is a list you read, a group of
 * four is a list you scan. renderPalette() uses this for ordering and appends
 * any group not named here, so adding a block cannot make it disappear.
 *
 * Each block also carries `icon` (a key into PALETTE_ICONS in index.html) and
 * `keywords` — extra search terms for the words people type but the block is
 * not called, e.g. "cta" for Button or "attachment" for Documents. */
var BLOCK_GROUPS = [
    'Header',
    'Text',
    'Buttons & links',
    'Status & data',
    'Media & panels',
    'Spacing',
    'Footer'
];

var BLOCKS = [

/* ================================================================= HEADER */
{
    id: 'header-logo',
    name: 'Logo',
    group: 'Header',
    icon: 'logo',
    keywords: 'brand mark masthead image wordmark',
    desc: 'The mark, small and quiet. Left-aligned by default — centred logos read as marketing. Uses the project logo unless you upload one here.',
    opts: {
        logo: { label: 'Logo', type: 'image', default: '' },
        align: { label: 'Alignment', type: 'select', choices: ['left', 'center'], default: 'left' },
        size: { label: 'Size', type: 'select', choices: ['small', 'medium', 'large'], default: 'medium' }
    },
    render: function (t, o) {
        var scale = { small: 0.72, medium: 1, large: 1.3 }[o.size] || 1;
        var w = Math.round((t.logoWidth || 140) * scale);
        /* An upload here overrides the project logo, for the one-off email that
         * carries a department mark or a campaign lockup. */
        var src = assetUrl(o.logo, '') || t.logoUrl;
        var mark = src
            ? '<img src="' + src + '" width="' + w + '" alt="' + esc(t.brandName) + '" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:' + w + 'px;max-width:100%;' + (o.align === 'center' ? 'margin:0 auto;' : '') + '">'
            : '<span style="' + font(t, 'heading', t.text, 'letter-spacing:-0.2px;') + '">' + esc(t.brandName) + '</span>';
        return '' +
'<tr><td class="px" align="' + o.align + '" style="' + pad(t, 40) + '">' + mark + '</td></tr>';
    }
},
{
    id: 'header-rule',
    name: 'Brand keyline',
    group: 'Header',
    icon: 'keyline',
    keywords: 'rule line bar top accent stripe',
    desc: 'A hairline of brand colour across the very top of the card. The lightest possible branding.',
    opts: {
        weight: { label: 'Weight', type: 'select', choices: ['2', '3', '4', '6'], default: '3' }
    },
    render: function (t, o) {
        return '<tr><td style="font-size:0;line-height:0;height:' + o.weight + 'px;background-color:' + t.brand + ';">&nbsp;</td></tr>';
    }
},

/* ================================================================ CONTENT */
/* These banners are the shape of the file, not the shape of the palette — the
 * body blocks below are spread across Text, Buttons & links, Status & data and
 * Media & panels. Each block's own `group` is what the palette reads. */
{
    id: 'hero-title',
    name: 'Title',
    group: 'Text',
    icon: 'title',
    keywords: 'headline heading h1 subject subtitle',
    desc: 'The headline. Large, tightly tracked, with room to breathe above it.',
    opts: {
        size: { label: 'Size', type: 'select', choices: ['display', 'title'], default: 'display' },
        align: { label: 'Alignment', type: 'select', choices: ['left', 'center'], default: 'left' },
        showSubtitle: { label: 'Subtitle', type: 'bool', default: true }
    },
    render: function (t, o) {
        var sub = o.showSubtitle
            ? '<p style="margin:12px 0 0 0;' + font(t, 'lead', t.textMuted) + '">{{email_subtitle}}</p>'
            : '';
        return '' +
'<tr><td class="px" align="' + o.align + '" style="' + pad(t, 32) + '">' +
    '<h1 style="margin:0;' + font(t, o.size, t.text) + '">{{email_title}}</h1>' + sub +
'</td></tr>';
    }
},
{
    id: 'hero-image',
    name: 'Image',
    group: 'Media & panels',
    icon: 'image',
    keywords: 'picture photo hero banner upload',
    desc: 'A single rounded image. Upload one, or leave it empty to fill from a merge field at send time.',
    opts: {
        src: { label: 'Image', type: 'image', default: '' },
        bleed: { label: 'Full bleed', type: 'bool', default: false },
        ratio: { label: 'Height', type: 'select', choices: ['short', 'medium', 'tall'], default: 'medium' }
    },
    render: function (t, o) {
        var h = { short: 160, medium: 220, tall: 300 }[o.ratio] || 220;
        var w = o.bleed ? t.width : t.width - (t.pad * 2);
        /* An uploaded image is baked in; without one the URL stays a merge field
         * so the same template can carry a different picture per send. */
        var src = assetUrl(o.src, '{{hero_image_url}}');
        var img = '<img src="' + src + '" width="' + w + '" height="' + h + '" alt="{{hero_image_alt}}" style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:' + w + 'px;height:' + h + 'px;object-fit:cover;' + (o.bleed ? '' : 'border-radius:' + t.radiusSm + 'px;') + '">';
        return o.bleed
            ? '<tr><td style="padding:32px 0 0 0;font-size:0;line-height:0;">' + img + '</td></tr>'
            : '<tr><td class="px" style="' + pad(t, 32) + 'font-size:0;line-height:0;">' + img + '</td></tr>';
    }
},
{
    id: 'greeting',
    name: 'Greeting',
    group: 'Text',
    icon: 'greeting',
    keywords: 'hello hi dear salutation first name',
    desc: 'Salutation. Keep the variable name identical across every project.',
    opts: {
        form: { label: 'Form', type: 'select', choices: ['Hi', 'Hello', 'Dear'], default: 'Hi' }
    },
    render: function (t, o) {
        return '' +
'<tr><td class="px" style="' + pad(t, 32) + '">' +
    '<p style="margin:0;' + font(t, 'body', t.text) + '">' + o.form + ' {{first_name}},</p>' +
'</td></tr>';
    }
},
{
    id: 'paragraph',
    name: 'Paragraph',
    group: 'Text',
    icon: 'paragraph',
    keywords: 'body copy text sentence message',
    desc: 'Body copy at a comfortable reading size. Stack several for longer messages.',
    opts: {
        size: { label: 'Size', type: 'select', choices: ['body', 'lead', 'small'], default: 'body' },
        muted: { label: 'Muted', type: 'bool', default: false }
    },
    render: function (t, o) {
        return '' +
'<tr><td class="px" style="' + pad(t, 20) + '">' +
    '<p style="margin:0;' + font(t, o.size, o.muted ? t.textMuted : t.text) + '">{{body_text}}</p>' +
'</td></tr>';
    }
},
{
    id: 'cta-button',
    name: 'Button',
    group: 'Buttons & links',
    icon: 'button',
    keywords: 'cta call to action link primary',
    desc: 'Table-based so Outlook honours the padding. One per email, ideally.',
    opts: {
        align: { label: 'Alignment', type: 'select', choices: ['left', 'center'], default: 'left' },
        variant: { label: 'Variant', type: 'select', choices: ['solid', 'outline'], default: 'solid' },
        full: { label: 'Full width', type: 'bool', default: false },
        pill: { label: 'Pill shape', type: 'bool', default: false }
    },
    render: function (t, o) {
        var solid = o.variant === 'solid';
        var bg = solid ? t.brand : t.cardBg;
        var fg = solid ? t.brandText : t.text;
        var bd = solid ? t.brand : t.hairline;
        var r = o.pill ? 100 : t.radiusBtn;
        return '' +
'<tr><td class="px" align="' + o.align + '" style="' + pad(t, 28) + '">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (o.full ? ' width="100%"' : '') + '>' +
        '<tr><td align="center" bgcolor="' + bg + '" style="border-radius:' + r + 'px;border:1px solid ' + bd + ';">' +
            '<a href="{{cta_url}}" style="' + (o.full ? 'display:block;' : 'display:inline-block;') + 'padding:15px 30px;font-family:' + t.font + ';font-size:16px;line-height:20px;font-weight:600;color:' + fg + ';text-decoration:none;border-radius:' + r + 'px;">{{cta_label}}</a>' +
        '</td></tr>' +
    '</table>' +
'</td></tr>';
    }
},
{
    id: 'details-list',
    name: 'Details',
    group: 'Status & data',
    icon: 'details',
    keywords: 'table rows label value summary reference number',
    desc: 'Label/value rows separated by hairlines. No box — the whitespace does the work.',
    opts: {
        rows: { label: 'Rows', type: 'select', choices: ['2', '3', '4', '5', '6'], default: '4' },
        layout: { label: 'Layout', type: 'select', choices: ['inline', 'stacked'], default: 'inline' },
        panel: { label: 'On a panel', type: 'bool', default: false }
    },
    render: function (t, o) {
        var n = parseInt(o.rows, 10);
        var rows = '';
        for (var i = 1; i <= n; i++) {
            var rule = i < n ? 'border-bottom:1px solid ' + t.hairline + ';' : '';
            if (o.layout === 'stacked') {
                rows += '' +
'<tr><td style="padding:14px 0;' + rule + '">' +
    '<div style="' + font(t, 'small', t.textMuted) + '">{{detail_' + i + '_label}}</div>' +
    '<div style="' + font(t, 'body', t.text, 'font-weight:600;padding-top:2px;') + '">{{detail_' + i + '_value}}</div>' +
'</td></tr>';
            } else {
                rows += '' +
'<tr>' +
    '<td width="46%" valign="top" style="padding:14px 0;' + rule + font(t, 'small', t.textMuted) + '">{{detail_' + i + '_label}}</td>' +
    '<td align="right" valign="top" style="padding:14px 0;' + rule + font(t, 'small', t.text, 'font-weight:600;') + '">{{detail_' + i + '_value}}</td>' +
'</tr>';
            }
        }
        var inner = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + '</table>';
        if (o.panel) {
            inner = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:' + t.surface + ';border-radius:' + t.radiusSm + 'px;">' +
                    '<tr><td style="padding:6px 20px;">' + inner + '</td></tr></table>';
        }
        return '<tr><td class="px" style="' + pad(t, 28) + '">' + inner + '</td></tr>';
    }
},
{
    id: 'receipt',
    name: 'Receipt',
    group: 'Status & data',
    icon: 'receipt',
    keywords: 'payment invoice total fee amount price line items',
    desc: 'Line items with a bold total. For payment confirmations and fee receipts.',
    opts: {
        items: { label: 'Line items', type: 'select', choices: ['1', '2', '3', '4'], default: '2' },
        showTotal: { label: 'Total row', type: 'bool', default: true }
    },
    render: function (t, o) {
        var n = parseInt(o.items, 10);
        var rows = '';
        for (var i = 1; i <= n; i++) {
            rows += '' +
'<tr>' +
    '<td valign="top" style="padding:10px 0;' + font(t, 'small', t.text) + '">{{item_' + i + '_name}}' +
        '<div style="' + font(t, 'micro', t.textMuted, 'padding-top:2px;') + '">{{item_' + i + '_detail}}</div>' +
    '</td>' +
    '<td align="right" valign="top" style="padding:10px 0;' + font(t, 'small', t.text) + '">{{item_' + i + '_amount}}</td>' +
'</tr>';
        }
        var total = o.showTotal
            ? '<tr>' +
                '<td style="padding:16px 0 0 0;border-top:1px solid ' + t.hairline + ';' + font(t, 'body', t.text, 'font-weight:700;') + '">{{total_label}}</td>' +
                '<td align="right" style="padding:16px 0 0 0;border-top:1px solid ' + t.hairline + ';' + font(t, 'body', t.text, 'font-weight:700;') + '">{{total_amount}}</td>' +
              '</tr>'
            : '';
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + total + '</table>' +
'</td></tr>';
    }
},
{
    id: 'status-callout',
    name: 'Status',
    group: 'Status & data',
    icon: 'status',
    keywords: 'approved rejected pending alert callout banner tone badge',
    desc: 'Flat tinted panel, no border. Tones map to Pending / Approved / Rejected / Changes Requested.',
    opts: {
        tone: { label: 'Tone', type: 'select', choices: ['success', 'warning', 'danger', 'info', 'neutral'], default: 'success' },
        showLabel: { label: 'Eyebrow label', type: 'bool', default: true },
        showBody: { label: 'Body text', type: 'bool', default: true }
    },
    render: function (t, o) {
        var tone = t.tones[o.tone] || t.tones.info;
        var eyebrow = o.showLabel
            ? '<p style="margin:0 0 6px 0;' + font(t, 'label', tone.fg, 'text-transform:uppercase;') + '">{{status_label}}</p>'
            : '';
        var body = o.showBody
            ? '<p style="margin:6px 0 0 0;' + font(t, 'small', tone.text) + '">{{status_message}}</p>'
            : '';
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:' + tone.bg + ';border-radius:' + t.radiusSm + 'px;">' +
        '<tr><td style="padding:20px 22px;">' + eyebrow +
            '<p style="margin:0;' + font(t, 'heading', tone.text) + '">{{status_headline}}</p>' + body +
        '</td></tr>' +
    '</table>' +
'</td></tr>';
    }
},
{
    id: 'steps',
    name: 'Next steps',
    group: 'Status & data',
    icon: 'steps',
    keywords: 'numbered list what happens next instructions ordered',
    desc: 'Numbered list with soft tinted numerals. For "what happens next".',
    opts: {
        count: { label: 'Steps', type: 'select', choices: ['2', '3', '4', '5'], default: '3' },
        showHeading: { label: 'Heading', type: 'bool', default: true }
    },
    render: function (t, o) {
        var n = parseInt(o.count, 10);
        var rows = '';
        for (var i = 1; i <= n; i++) {
            rows += '' +
'<tr>' +
    '<td width="28" valign="top" style="padding:0 14px 18px 0;">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
            '<td align="center" width="26" height="26" bgcolor="' + t.brandSoft + '" style="border-radius:13px;font-family:' + t.font + ';font-size:12px;font-weight:700;line-height:26px;color:' + t.brand + ';">' + i + '</td>' +
        '</tr></table>' +
    '</td>' +
    '<td valign="top" style="padding:1px 0 18px 0;' + font(t, 'small', t.text) + '">{{step_' + i + '_text}}</td>' +
'</tr>';
        }
        var heading = o.showHeading
            ? '<p style="margin:0 0 18px 0;' + font(t, 'heading', t.text) + '">{{steps_heading}}</p>'
            : '';
        return '' +
'<tr><td class="px" style="' + pad(t, 32) + '">' + heading +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + '</table>' +
'</td></tr>';
    }
},
{
    id: 'document-list',
    name: 'Documents',
    group: 'Status & data',
    icon: 'documents',
    keywords: 'files attachment download pdf certificate upload',
    desc: 'Downloadable documents as hairline rows with a trailing link. Upload a file per row, or leave it empty to fill from a merge field at send time.',
    opts: {
        count: { label: 'Documents', type: 'select', choices: ['1', '2', '3'], default: '2' },
        file1: { label: 'File 1', type: 'file', default: '' },
        file2: { label: 'File 2', type: 'file', default: '', showIf: function (o) { return parseInt(o.count, 10) >= 2; } },
        file3: { label: 'File 3', type: 'file', default: '', showIf: function (o) { return parseInt(o.count, 10) >= 3; } }
    },
    render: function (t, o) {
        var n = parseInt(o.count, 10);
        var rows = '';
        for (var i = 1; i <= n; i++) {
            /* Upload a file and the row is fixed: real name, real weight, a
             * permanent URL. Leave it empty and all three stay merge fields, so
             * engineering fills them per send. */
            var f = o['file' + i];
            var name = assetName(f, '{{document_' + i + '_name}}');
            var meta = assetMeta(f, '{{document_' + i + '_meta}}');
            var url = assetUrl(f, '{{document_' + i + '_url}}');
            rows += '' +
'<tr>' +
    '<td valign="middle" style="padding:16px 0;border-bottom:1px solid ' + t.hairline + ';' + font(t, 'small', t.text, 'font-weight:600;') + '">' + name +
        '<div style="' + font(t, 'micro', t.textMuted, 'padding-top:2px;') + '">' + meta + '</div>' +
    '</td>' +
    '<td align="right" valign="middle" style="padding:16px 0;border-bottom:1px solid ' + t.hairline + ';">' +
        '<a href="' + url + '" style="' + font(t, 'small', t.brand, 'font-weight:600;text-decoration:none;') + '">Download</a>' +
    '</td>' +
'</tr>';
        }
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + '</table>' +
'</td></tr>';
    }
},
{
    id: 'feature-panel',
    name: 'Panel',
    group: 'Media & panels',
    icon: 'panel',
    keywords: 'card box surface secondary tint promo',
    desc: 'A soft surface panel for a secondary message that should not compete with the CTA.',
    opts: {
        tinted: { label: 'Brand tint', type: 'bool', default: false },
        showLink: { label: 'Link', type: 'bool', default: true }
    },
    render: function (t, o) {
        var bg = o.tinted ? t.brandSoft : t.surface;
        var link = o.showLink
            ? '<div style="padding-top:10px;"><a href="{{panel_url}}" style="' + font(t, 'small', t.brand, 'font-weight:600;text-decoration:none;') + '">{{panel_link_label}} &rarr;</a></div>'
            : '';
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:' + bg + ';border-radius:' + t.radiusSm + 'px;">' +
        '<tr><td style="padding:22px 24px;">' +
            '<p style="margin:0;' + font(t, 'heading', t.text) + '">{{panel_title}}</p>' +
            '<p style="margin:6px 0 0 0;' + font(t, 'small', t.textMuted) + '">{{panel_text}}</p>' + link +
        '</td></tr>' +
    '</table>' +
'</td></tr>';
    }
},
{
    id: 'two-column',
    name: 'Two columns',
    group: 'Media & panels',
    icon: 'columns',
    keywords: 'side by side split grid pair',
    desc: 'Side-by-side pair that stacks on mobile.',
    opts: {
        showLinks: { label: 'Links', type: 'bool', default: false }
    },
    render: function (t, o) {
        function col(i) {
            var link = o.showLinks
                ? '<div style="padding-top:8px;"><a href="{{col_' + i + '_url}}" style="' + font(t, 'small', t.brand, 'font-weight:600;text-decoration:none;') + '">{{col_' + i + '_link_label}}</a></div>'
                : '';
            return '' +
'<td class="stack" width="50%" valign="top" style="padding:0 ' + (i === 1 ? '14px' : '0') + ' 0 ' + (i === 2 ? '14px' : '0') + ';">' +
    '<p style="margin:0;' + font(t, 'heading', t.text) + '">{{col_' + i + '_title}}</p>' +
    '<p style="margin:6px 0 0 0;' + font(t, 'small', t.textMuted) + '">{{col_' + i + '_text}}</p>' + link +
'</td>';
        }
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + col(1) + col(2) + '</tr></table>' +
'</td></tr>';
    }
},
{
    id: 'quote-note',
    name: 'Reviewer note',
    group: 'Media & panels',
    icon: 'quote',
    keywords: 'quote blockquote feedback comment reason rejection',
    desc: 'Left-ruled quote. Built for surfacing reviewer feedback on a Changes Requested decision.',
    opts: {
        showAuthor: { label: 'Author', type: 'bool', default: true }
    },
    render: function (t, o) {
        var author = o.showAuthor
            ? '<p style="margin:10px 0 0 0;' + font(t, 'micro', t.textMuted) + '">{{note_author}} · {{note_author_title}}</p>'
            : '';
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="2" style="background-color:' + t.brand + ';font-size:0;line-height:0;">&nbsp;</td>' +
        '<td style="padding:0 0 0 20px;">' +
            '<p style="margin:0;' + font(t, 'body', t.text) + '">{{note_text}}</p>' + author +
        '</td>' +
    '</tr></table>' +
'</td></tr>';
    }
},
{
    id: 'help-prompt',
    name: 'Help prompt',
    group: 'Buttons & links',
    icon: 'help',
    keywords: 'support contact question need a hand link',
    desc: 'A quiet "need a hand?" line above the footer. Reduces reply-to-sender traffic.',
    opts: {},
    render: function (t) {
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<p style="margin:0;' + font(t, 'small', t.textMuted) + '">Need help? <a href="{{help_url}}" style="color:' + t.brand + ';font-weight:600;text-decoration:none;">{{help_label}}</a></p>' +
'</td></tr>';
    }
},
{
    id: 'signature',
    name: 'Signature',
    group: 'Text',
    icon: 'signature',
    keywords: 'sign-off regards thanks sender closing name title',
    desc: 'Sign-off with sender name and title.',
    opts: {
        closing: { label: 'Closing', type: 'select', choices: ['Thanks', 'Kind regards', 'Sincerely', 'Best regards'], default: 'Thanks' }
    },
    render: function (t, o) {
        return '' +
'<tr><td class="px" style="' + pad(t, 32) + '">' +
    '<p style="margin:0;' + font(t, 'body', t.text) + '">' + o.closing + ',</p>' +
    '<p style="margin:2px 0 0 0;' + font(t, 'body', t.text, 'font-weight:600;') + '">{{sender_name}}</p>' +
    '<p style="margin:0;' + font(t, 'small', t.textMuted) + '">{{sender_title}}</p>' +
'</td></tr>';
    }
},

/* ================================================================ SPACING */
{
    id: 'divider',
    name: 'Divider',
    group: 'Spacing',
    icon: 'divider',
    keywords: 'rule hr line separator hairline break',
    desc: 'Hairline rule, inset to the gutter or full width.',
    opts: {
        bleed: { label: 'Full bleed', type: 'bool', default: false },
        space: { label: 'Space above', type: 'select', choices: ['16', '24', '32', '40'], default: '32' }
    },
    render: function (t, o) {
        var rule = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;font-size:0;line-height:0;background-color:' + t.hairline + ';">&nbsp;</td></tr></table>';
        return o.bleed
            ? '<tr><td style="padding:' + o.space + 'px 0 0 0;">' + rule + '</td></tr>'
            : '<tr><td class="px" style="padding:' + o.space + 'px ' + t.pad + 'px 0 ' + t.pad + 'px;">' + rule + '</td></tr>';
    }
},
{
    id: 'spacer',
    name: 'Spacer',
    group: 'Spacing',
    icon: 'spacer',
    keywords: 'gap whitespace padding height blank room',
    desc: 'Vertical whitespace. Use instead of empty paragraphs.',
    opts: {
        height: { label: 'Height', type: 'select', choices: ['8', '16', '24', '32', '48'], default: '24' }
    },
    render: function (t, o) {
        return '<tr><td style="font-size:0;line-height:0;height:' + o.height + 'px;">&nbsp;</td></tr>';
    }
},

/* ================================================================= FOOTER */
{
    id: 'footer-transactional',
    name: 'Transactional footer',
    group: 'Footer',
    icon: 'footer',
    keywords: 'system receipt decision no unsubscribe do not reply address',
    desc: 'For system mail: receipts, decisions, resets. Sender identity and a do-not-reply notice — deliberately NO unsubscribe link.',
    opts: {
        showAddress: { label: 'Postal address', type: 'bool', default: true },
        showHelp: { label: 'Help link', type: 'bool', default: true }
    },
    render: function (t, o) {
        var addr = o.showAddress
            ? '<p style="margin:8px 0 0 0;' + font(t, 'micro', t.textMuted) + '">{{org_address}}</p>'
            : '';
        var help = o.showHelp
            ? '<p style="margin:12px 0 0 0;' + font(t, 'micro', t.textMuted) + '">' +
              '<a href="{{help_url}}" style="color:' + t.textMuted + ';text-decoration:underline;">Help Centre</a>' +
              ' &nbsp;·&nbsp; <a href="{{privacy_url}}" style="color:' + t.textMuted + ';text-decoration:underline;">Privacy</a></p>'
            : '';
        return '' +
'<tr><td class="px" style="' + pad(t, 40, 40) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;font-size:0;line-height:0;background-color:' + t.hairline + ';">&nbsp;</td></tr></table>' +
    '<p style="margin:24px 0 0 0;' + font(t, 'small', t.text, 'font-weight:600;') + '">{{org_name}}</p>' +
    addr +
    '<p style="margin:12px 0 0 0;' + font(t, 'micro', t.textMuted) + '">This is an automated message about your account. Replies to this address are not monitored.</p>' +
    help +
'</td></tr>';
    }
},
{
    id: 'footer-marketing',
    name: 'Marketing footer',
    group: 'Footer',
    icon: 'footer',
    keywords: 'newsletter campaign unsubscribe preferences social legal bulk',
    desc: 'For newsletters and campaigns. Unsubscribe, preferences and a postal address — all legally required for bulk mail.',
    opts: {
        showSocial: { label: 'Social links', type: 'bool', default: true },
        showReason: { label: 'Why you got this', type: 'bool', default: true }
    },
    render: function (t, o) {
        var social = o.showSocial
            ? '<p style="margin:0 0 18px 0;' + font(t, 'small', t.textMuted) + '">' +
              '<a href="{{facebook_url}}" style="color:' + t.text + ';text-decoration:none;font-weight:600;">Facebook</a>' +
              ' &nbsp;&nbsp; <a href="{{instagram_url}}" style="color:' + t.text + ';text-decoration:none;font-weight:600;">Instagram</a>' +
              ' &nbsp;&nbsp; <a href="{{linkedin_url}}" style="color:' + t.text + ';text-decoration:none;font-weight:600;">LinkedIn</a></p>'
            : '';
        var reason = o.showReason
            ? '<p style="margin:12px 0 0 0;' + font(t, 'micro', t.textMuted) + '">{{legal_note}}</p>'
            : '';
        return '' +
'<tr><td class="px" align="center" style="' + pad(t, 40, 40) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;font-size:0;line-height:0;background-color:' + t.hairline + ';">&nbsp;</td></tr></table>' +
    '<div style="height:24px;font-size:0;line-height:0;">&nbsp;</div>' +
    social +
    '<p style="margin:0;' + font(t, 'small', t.text, 'font-weight:600;') + '">{{org_name}}</p>' +
    '<p style="margin:6px 0 0 0;' + font(t, 'micro', t.textMuted) + '">{{org_address}}</p>' +
    reason +
    '<p style="margin:14px 0 0 0;' + font(t, 'micro', t.textMuted) + '">' +
        '<a href="{{unsubscribe_url}}" style="color:' + t.textMuted + ';text-decoration:underline;">Unsubscribe</a>' +
        ' &nbsp;·&nbsp; <a href="{{preferences_url}}" style="color:' + t.textMuted + ';text-decoration:underline;">Email preferences</a>' +
        ' &nbsp;·&nbsp; <a href="{{privacy_url}}" style="color:' + t.textMuted + ';text-decoration:underline;">Privacy</a>' +
    '</p>' +
'</td></tr>';
    }
},
{
    id: 'footer-minimal',
    name: 'Minimal footer',
    group: 'Footer',
    icon: 'footer',
    keywords: 'short one line verification code quiet',
    desc: 'One quiet line. For short system mail like a verification code, where a full footer would outweigh the message.',
    opts: {},
    render: function (t) {
        return '' +
'<tr><td class="px" align="center" style="' + pad(t, 40, 40) + '">' +
    '<p style="margin:0;' + font(t, 'micro', t.textMuted) + '">{{org_name}} &nbsp;·&nbsp; {{org_address}}</p>' +
'</td></tr>';
    }
}

];

/* ------------------------------------------------------------------ shell */

/* Wraps a stitched run of block <tr>s into a complete, sendable document.
 * The <style> block is progressive enhancement only — every client that drops
 * it still gets a correct 600px layout from the table attributes. */
function renderDocument(t, blocksHtml) {
    return '' +
'<!DOCTYPE html>\n' +
'<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<meta name="x-apple-disable-message-reformatting">\n' +
'<meta name="color-scheme" content="light">\n' +
'<meta name="supported-color-schemes" content="light">\n' +
'<title>{{email_subject}}</title>\n' +
'<!--[if mso]>\n' +
'<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>\n' +
'<![endif]-->\n' +
'<style>\n' +
'  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; }\n' +
'  table { border-collapse:collapse; }\n' +
'  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }\n' +
'  a { text-decoration:none; }\n' +
'  @media only screen and (max-width:620px) {\n' +
'    .wrap { width:100% !important; max-width:100% !important; }\n' +
'    .card { border-radius:0 !important; }\n' +
'    .px { padding-left:24px !important; padding-right:24px !important; }\n' +
'    .stack { display:block !important; width:100% !important; padding:0 0 20px 0 !important; }\n' +
'    .gutter { padding-left:0 !important; padding-right:0 !important; }\n' +
'  }\n' +
'</style>\n' +
'</head>\n' +
'<body style="margin:0;padding:0;background-color:' + t.pageBg + ';">\n' +
'<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{{preheader}}</div>\n' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:' + t.pageBg + ';">\n' +
'<tr><td class="gutter" align="center" style="padding:32px 16px;">\n' +
'  <table role="presentation" class="wrap" width="' + t.width + '" cellpadding="0" cellspacing="0" border="0" style="width:' + t.width + 'px;max-width:' + t.width + 'px;">\n' +
'    <tr><td>\n' +
'      <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:' + t.cardBg + ';border-radius:' + t.radius + 'px;overflow:hidden;">\n' +
blocksHtml +
'      </table>\n' +
'    </td></tr>\n' +
'  </table>\n' +
'</td></tr>\n' +
'</table>\n' +
'</body>\n' +
'</html>';
}

/* Pull every {{ placeholder }} out of a rendered document, in order, deduped.
 * This is the list your devs pass as SendGrid dynamic_template_data. */
function extractVariables(html) {
    var re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    var seen = {};
    var out = [];
    var m;
    while ((m = re.exec(html)) !== null) {
        if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
    }
    return out;
}

/* ---------------------------------------------------------------- presets */
var PRESETS = {
    'approved': {
        label: 'Application approved',
        blocks: ['header-rule', 'header-logo', 'hero-title', 'greeting', 'paragraph', 'status-callout', 'details-list', 'cta-button', 'steps', 'signature', 'footer-transactional']
    },
    'changes-requested': {
        label: 'Changes requested',
        blocks: ['header-rule', 'header-logo', 'hero-title', 'greeting', 'paragraph', 'status-callout', 'quote-note', 'cta-button', 'help-prompt', 'signature', 'footer-transactional'],
        tone: 'warning'
    },
    'receipt': {
        label: 'Payment receipt',
        blocks: ['header-logo', 'hero-title', 'greeting', 'paragraph', 'receipt', 'details-list', 'document-list', 'help-prompt', 'footer-transactional']
    },
    'document-issued': {
        label: 'Document issued',
        blocks: ['header-rule', 'header-logo', 'hero-title', 'greeting', 'paragraph', 'document-list', 'cta-button', 'divider', 'feature-panel', 'signature', 'footer-transactional']
    },
    'verification': {
        label: 'Short system mail',
        blocks: ['header-logo', 'hero-title', 'paragraph', 'cta-button', 'paragraph', 'footer-minimal']
    },
    'newsletter': {
        label: 'Marketing / newsletter',
        blocks: ['header-logo', 'hero-image', 'hero-title', 'paragraph', 'cta-button', 'divider', 'two-column', 'feature-panel', 'footer-marketing']
    },
    'blank': {
        label: 'Blank canvas',
        blocks: []
    }
};
