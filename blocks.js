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

/* showIf for the Nth row of a block whose row count is itself an option — the
 * fourth Details label is pointless on a three-row block. Defined once here
 * rather than inline, so six near-identical closures cannot drift apart. */
function upTo(countKey, n) {
    return function (o) { return parseInt(o[countKey], 10) >= n; };
}

var BLOCKS = [

/* ================================================================= HEADER */
{
    id: 'header-logo',
    name: 'Logo',
    group: 'Header',
    icon: 'logo',
    keywords: 'brand mark masthead image wordmark',
    desc: 'The mark, small and quiet. Left-aligned by default — centred logos read as marketing. Uses the project logo unless you upload one here. Size inherits from the organisation by default, so a mark keeps the height set in Projects.',
    opts: {
        logo: { label: 'Logo', type: 'image', default: '' },
        align: { label: 'Alignment', type: 'select', choices: ['left', 'center'], default: 'left' },
        /* "Inherit" is the default: use whatever height the organisation (or the
         * project) set for its logo, unscaled. The three t-shirt sizes remain for
         * a one-off email that wants the mark deliberately bigger or smaller than
         * the brand's own setting. */
        size: { label: 'Size', type: 'select', choices: ['inherit', 'small', 'medium', 'large'], default: 'inherit' }
    },
    render: function (t, o) {
        var scale = { inherit: 1, small: 0.72, medium: 1, large: 1.3 }[o.size];
        if (scale === undefined) scale = 1;
        /* An upload here overrides the project or organisation logo, for the
         * one-off email carrying a department mark or a campaign lockup. Its
         * shape is unknown, so it falls back to width sizing. */
        var own = assetUrl(o.logo, '');
        if (own) {
            var ow = Math.round((t.logoWidth || 140) * scale);
            return '<tr><td class="px" align="' + o.align + '" style="' + pad(t, 40) + '">' +
                '<img src="' + own + '" width="' + ow + '" alt="' + esc(t.brandName) + '"' +
                ' style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:' +
                ow + 'px;max-width:100%;' + (o.align === 'center' ? 'margin:0 auto;' : '') + '">' +
            '</td></tr>';
        }
        /* Gated on there being a logo at all, portable or not: a resolved theme
         * always has a real organisation behind it, so this correctly falls back
         * to the wordmark for a project where nobody has uploaded one. */
        var mark = t.logoUrl
            ? logoImg(t, {
                  /* The height set on the organisation, or the project, scaled by
                   * this email's choice. 40px is the fallback for a measured logo
                   * that has never had a height chosen for it. */
                  height: Math.round((t.logoHeight || 40) * scale),
                  width: Math.round((t.logoWidth || 140) * scale),
                  align: o.align
              })
            : '<span style="' + font(t, 'heading', t.text, 'letter-spacing:-0.2px;') + '">' + esc(t.brandName) + '</span>';
        return '' +
'<tr><td class="px" align="' + o.align + '" style="' + pad(t, 40) + '">' + mark + '</td></tr>';
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
    keywords: 'headline heading h1 subject subtitle copy',
    desc: 'The headline. Large, tightly tracked, with room to breathe above it. Type the words, or leave the placeholder to fill them at send time.',
    opts: {
        title: { label: 'Title', type: 'text', default: '{{email_title}}' },
        size: { label: 'Size', type: 'select', choices: ['display', 'title'], default: 'display' },
        align: { label: 'Alignment', type: 'select', choices: ['left', 'center'], default: 'left' },
        showSubtitle: { label: 'Subtitle', type: 'bool', default: true },
        subtitle: { label: 'Subtitle text', type: 'text', default: '{{email_subtitle}}', showIf: function (o) { return !!o.showSubtitle; } }
    },
    render: function (t, o) {
        var sub = o.showSubtitle
            ? '<p style="margin:12px 0 0 0;' + font(t, 'lead', t.textMuted) + '">' +
              copy(o.subtitle, '{{email_subtitle}}') + '</p>'
            : '';
        return '' +
'<tr><td class="px" align="' + o.align + '" style="' + pad(t, 32) + '">' +
    '<h1 style="margin:0;' + font(t, o.size, t.text) + '">' + copy(o.title, '{{email_title}}') + '</h1>' + sub +
'</td></tr>';
    }
},
{
    id: 'hero-image',
    name: 'Image',
    group: 'Media & panels',
    icon: 'image',
    keywords: 'picture photo hero banner upload',
    desc: 'A single rounded image. Upload one, or leave it empty to fill from a merge field at send time. Full bleed in the first slot runs edge to edge and takes the card\'s rounded top corners.',
    opts: {
        src: { label: 'Image', type: 'image', default: '' },
        alt: { label: 'Alt text', type: 'text', default: '{{hero_image_alt}}' },
        bleed: { label: 'Full bleed', type: 'bool', default: false },
        ratio: { label: 'Height', type: 'select', choices: ['short', 'medium', 'tall', 'very tall', 'extra tall'], default: 'medium' }
    },
    render: function (t, o, at) {
        /* Anything past "tall" is a portrait crop — a poster, a certificate, a
         * phone screenshot. object-fit:cover means the picture is cropped to
         * the box rather than squashed into it. */
        var h = { short: 160, medium: 220, tall: 300, 'very tall': 420, 'extra tall': 560 }[o.ratio] || 220;
        var w = o.bleed ? t.width : t.width - (t.pad * 2);
        /* An uploaded image is baked in; without one the URL stays a merge field
         * so the same template can carry a different picture per send. */
        var src = assetUrl(o.src, '{{hero_image_url}}');

        /* A full-bleed picture in the very first slot is the top of the email,
         * so it loses the 32px of air above it and rounds with the card instead
         * of sitting in a square notch inside it. The card also sets
         * overflow:hidden, which clips it in clients that honour either; the
         * radius here is what makes Gmail and Apple Mail do the right thing.
         * Outlook rounds nothing at all, including the card, so it degrades
         * consistently rather than oddly. */
        var atTop = o.bleed && at && at.first;
        var radius = atTop
            ? 'border-radius:' + t.radius + 'px ' + t.radius + 'px 0 0;'
            : (o.bleed ? '' : 'border-radius:' + t.radiusSm + 'px;');

        var img = '<img src="' + src + '" width="' + w + '" height="' + h + '" alt="' + copy(o.alt, '{{hero_image_alt}}') + '" style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:' + w + 'px;height:' + h + 'px;object-fit:cover;' + radius + '">';

        if (o.bleed) {
            return '<tr><td style="padding:' + (atTop ? '0' : '32px 0 0 0') + ';font-size:0;line-height:0;mso-line-height-rule:exactly;">' + img + '</td></tr>';
        }
        return '<tr><td class="px" style="' + pad(t, 32) + 'font-size:0;line-height:0;mso-line-height-rule:exactly;">' + img + '</td></tr>';
    }
},
{
    id: 'greeting',
    name: 'Greeting',
    group: 'Text',
    icon: 'greeting',
    keywords: 'hello hi dear salutation first name copy',
    desc: 'Salutation. The whole line is editable, so "Dear Ms {{last_name}}," works as well as the default.',
    opts: {
        line: { label: 'Greeting', type: 'text', default: 'Hi {{first_name}},' }
    },
    render: function (t, o) {
        /* Was a Hi / Hello / Dear dropdown. Free text covers those three and
         * every formal variant a department turns out to insist on. */
        return '' +
'<tr><td class="px" style="' + pad(t, 32) + '">' +
    '<p style="margin:0;' + font(t, 'body', t.text) + '">' + copy(o.line, 'Hi {{first_name}},') + '</p>' +
'</td></tr>';
    }
},
{
    id: 'paragraph',
    name: 'Paragraph',
    group: 'Text',
    icon: 'paragraph',
    keywords: 'body copy text sentence message',
    desc: 'Body copy at a comfortable reading size. Leave a blank line to start a new paragraph.',
    opts: {
        text: { label: 'Text', type: 'textarea', default: '{{body_text}}' },
        size: { label: 'Size', type: 'select', choices: ['body', 'lead', 'small'], default: 'body' },
        align: { label: 'Alignment', type: 'select', choices: ['left', 'center'], default: 'left' },
        muted: { label: 'Muted', type: 'bool', default: false }
    },
    render: function (t, o) {
        return '' +
'<tr><td class="px" align="' + o.align + '" style="' + pad(t, 20) + '">' +
    copyParas(o.text, '{{body_text}}', font(t, o.size, o.muted ? t.textMuted : t.text)) +
'</td></tr>';
    }
},
{
    id: 'cta-button',
    name: 'Button',
    group: 'Buttons & links',
    icon: 'button',
    keywords: 'cta call to action link primary copy label',
    desc: 'Padding sits on the cell, so Outlook gives it a real button shape. One per email, ideally.',
    opts: {
        label: { label: 'Button text', type: 'text', default: '{{cta_label}}' },
        url: { label: 'Link', type: 'text', default: '{{cta_url}}' },
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
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (o.full ? ' width="100%"' : '') + ' style="mso-table-lspace:0pt;mso-table-rspace:0pt;">' +
        /* The padding belongs to the cell, not to the <a>. Outlook on Windows has
         * no inline-block, so vertical padding on the anchor collapses there and
         * the button arrives as tightly-wrapped coloured text. On the cell every
         * client agrees, and the anchor is left carrying only type and colour. */
        '<tr><td align="center" bgcolor="' + bg + '" style="padding:15px 30px;border-radius:' + r + 'px;border:1px solid ' + bd + ';">' +
            '<a href="' + copy(o.url, '{{cta_url}}') + '" style="' + (o.full ? 'display:block;' : 'display:inline-block;') + 'font-family:' + t.font + ';font-size:16px;line-height:20px;mso-line-height-rule:exactly;font-weight:600;color:' + fg + ';text-decoration:none;">' + copy(o.label, '{{cta_label}}') + '</a>' +
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
    keywords: 'table rows label value summary reference number copy',
    desc: 'Label/value rows separated by hairlines. No box — the whitespace does the work. The labels are yours to write; the values stay merge fields, because that is the part that differs per recipient.',
    opts: {
        rows: { label: 'Rows', type: 'select', choices: ['2', '3', '4', '5', '6'], default: '4' },
        /* Labels only. "Reference number" is the same on every send and belongs
         * in the template; the number beside it never is and cannot be. */
        label1: { label: 'Label 1', type: 'text', default: '{{detail_1_label}}', showIf: upTo('rows', 1) },
        label2: { label: 'Label 2', type: 'text', default: '{{detail_2_label}}', showIf: upTo('rows', 2) },
        label3: { label: 'Label 3', type: 'text', default: '{{detail_3_label}}', showIf: upTo('rows', 3) },
        label4: { label: 'Label 4', type: 'text', default: '{{detail_4_label}}', showIf: upTo('rows', 4) },
        label5: { label: 'Label 5', type: 'text', default: '{{detail_5_label}}', showIf: upTo('rows', 5) },
        label6: { label: 'Label 6', type: 'text', default: '{{detail_6_label}}', showIf: upTo('rows', 6) },
        layout: { label: 'Layout', type: 'select', choices: ['inline', 'stacked'], default: 'inline' },
        panel: { label: 'On a panel', type: 'bool', default: false }
    },
    render: function (t, o) {
        var n = parseInt(o.rows, 10);
        var rows = '';
        for (var i = 1; i <= n; i++) {
            var rule = i < n ? 'border-bottom:1px solid ' + t.hairline + ';' : '';
            var lbl = copy(o['label' + i], '{{detail_' + i + '_label}}');
            if (o.layout === 'stacked') {
                rows += '' +
'<tr><td style="padding:14px 0;' + rule + '">' +
    '<div style="' + font(t, 'small', t.textMuted) + '">' + lbl + '</div>' +
    '<div style="' + font(t, 'body', t.text, 'font-weight:600;padding-top:2px;') + '">{{detail_' + i + '_value}}</div>' +
'</td></tr>';
            } else {
                rows += '' +
'<tr>' +
    '<td width="46%" valign="top" style="padding:14px 0;' + rule + font(t, 'small', t.textMuted) + '">' + lbl + '</td>' +
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
        showTotal: { label: 'Total row', type: 'bool', default: true },
        /* Line items are per-send data. The word "Total" is not. */
        totalLabel: { label: 'Total label', type: 'text', default: '{{total_label}}', showIf: function (o) { return !!o.showTotal; } }
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
                '<td style="padding:16px 0 0 0;border-top:1px solid ' + t.hairline + ';' + font(t, 'body', t.text, 'font-weight:700;') + '">' + copy(o.totalLabel, '{{total_label}}') + '</td>' +
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
    id: 'steps',
    name: 'Next steps',
    group: 'Status & data',
    icon: 'steps',
    keywords: 'numbered list what happens next instructions ordered',
    desc: 'Numbered list in soft tinted tiles. For "what happens next".',
    opts: {
        count: { label: 'Steps', type: 'select', choices: ['2', '3', '4', '5'], default: '3' },
        showHeading: { label: 'Heading', type: 'bool', default: true },
        heading: { label: 'Heading text', type: 'text', default: '{{steps_heading}}', showIf: function (o) { return !!o.showHeading; } },
        step1: { label: 'Step 1', type: 'text', default: '{{step_1_text}}', showIf: upTo('count', 1) },
        step2: { label: 'Step 2', type: 'text', default: '{{step_2_text}}', showIf: upTo('count', 2) },
        step3: { label: 'Step 3', type: 'text', default: '{{step_3_text}}', showIf: upTo('count', 3) },
        step4: { label: 'Step 4', type: 'text', default: '{{step_4_text}}', showIf: upTo('count', 4) },
        step5: { label: 'Step 5', type: 'text', default: '{{step_5_text}}', showIf: upTo('count', 5) }
    },
    render: function (t, o) {
        var n = parseInt(o.count, 10);
        var rows = '';
        /* Rounded-square tiles rather than circles, and big enough to read as
         * numerals instead of bullets: 34px at 17px type. A circle would be
         * border-radius:17px on the same box. */
        var box = 34, radius = 10;
        for (var i = 1; i <= n; i++) {
            rows += '' +
'<tr>' +
    '<td width="' + box + '" valign="top" style="padding:0 16px 20px 0;">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
            '<td align="center" width="' + box + '" height="' + box + '" bgcolor="' + t.brandSoft + '" style="width:' + box + 'px;height:' + box + 'px;border-radius:' + radius + 'px;font-family:' + t.font + ';font-size:17px;font-weight:700;line-height:' + box + 'px;mso-line-height-rule:exactly;color:' + t.brand + ';">' + i + '</td>' +
        '</tr></table>' +
    '</td>' +
    '<td valign="top" style="padding:5px 0 20px 0;' + font(t, 'small', t.text) + '">' +
        copy(o['step' + i], '{{step_' + i + '_text}}') + '</td>' +
'</tr>';
        }
        var heading = o.showHeading
            ? '<p style="margin:0 0 18px 0;' + font(t, 'heading', t.text) + '">' +
              copy(o.heading, '{{steps_heading}}') + '</p>'
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
        buttonLabel: { label: 'Button text', type: 'text', default: 'Download' },
        pill: { label: 'Pill buttons', type: 'bool', default: false },
        file1: { label: 'File 1', type: 'file', default: '' },
        file2: { label: 'File 2', type: 'file', default: '', showIf: function (o) { return parseInt(o.count, 10) >= 2; } },
        file3: { label: 'File 3', type: 'file', default: '', showIf: function (o) { return parseInt(o.count, 10) >= 3; } }
    },
    render: function (t, o) {
        var n = parseInt(o.count, 10);
        var btnRadius = o.pill ? 100 : t.radiusBtn;
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
    '<td align="right" valign="middle" style="padding:16px 0 16px 14px;border-bottom:1px solid ' + t.hairline + ';">' +
        /* A solid pill, not a text link. On a decision letter the download IS
         * the point of the email, and a 14px underlined word next to a filename
         * loses to the CTA further up the page. */
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="mso-table-lspace:0pt;mso-table-rspace:0pt;"><tr>' +
            '<td align="center" bgcolor="' + t.brand + '" style="padding:10px 20px;border-radius:' + btnRadius + 'px;">' +
                '<a href="' + url + '" style="display:inline-block;font-family:' + t.font + ';font-size:14px;line-height:18px;mso-line-height-rule:exactly;font-weight:600;color:' + t.brandText + ';text-decoration:none;white-space:nowrap;">' + copy(o.buttonLabel, 'Download') + '</a>' +
            '</td>' +
        '</tr></table>' +
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
    keywords: 'card box surface secondary tint promo thumbnail icon image',
    desc: 'A soft surface panel for a secondary message that should not compete with the CTA. Takes a small thumbnail above the title.',
    opts: {
        title: { label: 'Title', type: 'text', default: '{{panel_title}}' },
        text: { label: 'Text', type: 'textarea', default: '{{panel_text}}' },
        tinted: { label: 'Brand tint', type: 'bool', default: false },
        img: { label: 'Thumbnail', type: 'image', default: '' },
        imgSize: { label: 'Thumbnail size', type: 'select', choices: ['40', '56', '72', '88'], default: '56' },
        showLink: { label: 'Link', type: 'bool', default: true },
        linkLabel: { label: 'Link text', type: 'text', default: '{{panel_link_label}}', showIf: function (o) { return !!o.showLink; } },
        linkUrl: { label: 'Link URL', type: 'text', default: '{{panel_url}}', showIf: function (o) { return !!o.showLink; } }
    },
    render: function (t, o) {
        var bg = o.tinted ? t.brandSoft : t.surface;
        /* Sits top-left above the title, inside the panel's own padding, so the
         * panel still reads as one object. Only drawn once a file exists. */
        var thumbUrl = assetUrl(o.img, '');
        var thumbSize = parseInt(o.imgSize, 10) || 56;
        var thumb = thumbUrl
            ? '<img src="' + thumbUrl + '" width="' + thumbSize + '" height="' + thumbSize + '" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:' + thumbSize + 'px;height:' + thumbSize + 'px;object-fit:cover;border-radius:' + Math.round(thumbSize / 5) + 'px;margin:0 0 14px 0;">'
            : '';
        var link = o.showLink
            ? '<div style="padding-top:10px;"><a href="' + copy(o.linkUrl, '{{panel_url}}') + '" style="' + font(t, 'small', t.brand, 'font-weight:600;text-decoration:none;') + '">' + copy(o.linkLabel, '{{panel_link_label}}') + ' &rarr;</a></div>'
            : '';
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:' + bg + ';border-radius:' + t.radiusSm + 'px;">' +
        '<tr><td style="padding:22px 24px;">' + thumb +
            '<p style="margin:0;' + font(t, 'heading', t.text) + '">' + copy(o.title, '{{panel_title}}') + '</p>' +
            '<div style="padding-top:6px;">' +
                copyParas(o.text, '{{panel_text}}', font(t, 'small', t.textMuted), 10) +
            '</div>' + link +
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
    keywords: 'side by side split grid pair pictogram icon image',
    desc: 'Side-by-side pair that stacks on mobile. Each side takes a small pictogram above its title.',
    opts: {
        title1: { label: 'Left title', type: 'text', default: '{{col_1_title}}' },
        text1: { label: 'Left text', type: 'textarea', default: '{{col_1_text}}' },
        title2: { label: 'Right title', type: 'text', default: '{{col_2_title}}' },
        text2: { label: 'Right text', type: 'textarea', default: '{{col_2_text}}' },
        icon1: { label: 'Icon, left', type: 'image', default: '' },
        icon2: { label: 'Icon, right', type: 'image', default: '' },
        iconSize: { label: 'Icon size', type: 'select', choices: ['28', '36', '44', '56'], default: '36' },
        showLinks: { label: 'Links', type: 'bool', default: false },
        linkLabel1: { label: 'Left link text', type: 'text', default: '{{col_1_link_label}}', showIf: function (o) { return !!o.showLinks; } },
        linkUrl1: { label: 'Left link URL', type: 'text', default: '{{col_1_url}}', showIf: function (o) { return !!o.showLinks; } },
        linkLabel2: { label: 'Right link text', type: 'text', default: '{{col_2_link_label}}', showIf: function (o) { return !!o.showLinks; } },
        linkUrl2: { label: 'Right link URL', type: 'text', default: '{{col_2_url}}', showIf: function (o) { return !!o.showLinks; } }
    },
    render: function (t, o) {
        /* Deliberately not square-cropped and not rounded: these are pictograms,
         * usually a transparent PNG line drawing, and a radius on one of those
         * clips the artwork. Height is left to the aspect ratio. */
        var iconW = parseInt(o.iconSize, 10) || 36;
        function pictogram(i) {
            var url = assetUrl(o['icon' + i], '');
            return url
                ? '<img src="' + url + '" width="' + iconW + '" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:' + iconW + 'px;max-width:100%;height:auto;margin:0 0 12px 0;">'
                : '';
        }
        function col(i) {
            var link = o.showLinks
                ? '<div style="padding-top:8px;"><a href="' + copy(o['linkUrl' + i], '{{col_' + i + '_url}}') + '" style="' + font(t, 'small', t.brand, 'font-weight:600;text-decoration:none;') + '">' + copy(o['linkLabel' + i], '{{col_' + i + '_link_label}}') + '</a></div>'
                : '';
            return '' +
'<td class="stack" width="50%" valign="top" style="padding:0 ' + (i === 1 ? '14px' : '0') + ' 0 ' + (i === 2 ? '14px' : '0') + ';">' +
    pictogram(i) +
    '<p style="margin:0;' + font(t, 'heading', t.text) + '">' + copy(o['title' + i], '{{col_' + i + '_title}}') + '</p>' +
    '<div style="padding-top:6px;">' +
        copyParas(o['text' + i], '{{col_' + i + '_text}}', font(t, 'small', t.textMuted), 10) +
    '</div>' + link +
'</td>';
        }
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + col(1) + col(2) + '</tr></table>' +
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
    opts: {
        line: { label: 'Text', type: 'text', default: 'Need help?' },
        label: { label: 'Link text', type: 'text', default: '{{help_label}}' },
        url: { label: 'Link URL', type: 'text', default: '{{help_url}}' }
    },
    render: function (t, o) {
        return '' +
'<tr><td class="px" style="' + pad(t, 28) + '">' +
    '<p style="margin:0;' + font(t, 'small', t.textMuted) + '">' + copy(o.line, 'Need help?') +
        ' <a href="' + copy(o.url, '{{help_url}}') + '" style="color:' + t.brand + ';font-weight:600;text-decoration:none;">' +
        copy(o.label, '{{help_label}}') + '</a></p>' +
'</td></tr>';
    }
},
{
    id: 'signature',
    name: 'Signature',
    group: 'Text',
    icon: 'signature',
    keywords: 'sign-off regards thanks sender closing name title stamp seal handwritten scan',
    desc: 'Sign-off with sender name and title. Takes a scanned signature, and can show the project\'s official stamp beside it. Upload transparent PNGs so both sit on the card instead of in a white box.',
    opts: {
        closing: { label: 'Closing', type: 'text', default: 'Thanks' },
        name: { label: 'Sender name', type: 'text', default: '{{sender_name}}' },
        title: { label: 'Sender title', type: 'text', default: '{{sender_title}}' },
        align: { label: 'Alignment', type: 'select', choices: ['left', 'center'], default: 'left' },
        sig: { label: 'Signature', type: 'image', default: '' },
        sigWidth: { label: 'Signature width', type: 'select', choices: ['120', '160', '200', '240'], default: '160' },
        showStamp: { label: 'Project stamp', type: 'bool', default: false },
        stampWidth: { label: 'Stamp width', type: 'select', choices: ['80', '100', '120', '140'], default: '100', showIf: function (o) { return !!o.showStamp; } }
    },
    render: function (t, o) {
        /* The signature is per-email, because a letter is signed by whoever
         * decided it. The stamp is per-project — one organisation has one seal,
         * and re-uploading it on every template is how you end up with four
         * slightly different scans of it in circulation. Set it under Projects.
         *
         * Neither falls back to a merge field the way the hero image does, and
         * neither sets a background colour, so a transparent PNG shows the card
         * through it. That is the whole reason to prefer one: a JPEG signature
         * arrives as a white rectangle. */
        var sigUrl = assetUrl(o.sig, '');
        var sigW = parseInt(o.sigWidth, 10) || 160;
        var mark = sigUrl
            ? '<img src="' + sigUrl + '" width="' + sigW + '" alt="Signature" style="display:block;border:0;outline:none;text-decoration:none;width:' + sigW + 'px;max-width:100%;height:auto;margin:10px ' + (o.align === 'center' ? 'auto' : '0') + ' 4px ' + (o.align === 'center' ? 'auto' : '0') + ';">'
            : '';

        var body =
            '<p style="margin:0;' + font(t, 'body', t.text) + '">' + copy(o.closing, 'Thanks') + ',</p>' + mark +
            '<p style="margin:' + (mark ? '0' : '2px') + ' 0 0 0;' + font(t, 'body', t.text, 'font-weight:600;') + '">' + copy(o.name, '{{sender_name}}') + '</p>' +
            '<p style="margin:0;' + font(t, 'small', t.textMuted) + '">' + copy(o.title, '{{sender_title}}') + '</p>';

        /* Portable, the seal is the organisation's, so it becomes a merge field
         * like the logo — one template, each school's own stamp. */
        var stampUrl = !o.showStamp ? ''
            : (t.portable ? '{{' + ORG_FIELDS.stamp + '}}' : (t.stampUrl || ''));
        if (!stampUrl) {
            return '<tr><td class="px" align="' + o.align + '" style="' + pad(t, 32) + '">' + body + '</td></tr>';
        }

        /* Two cells so the seal sits to the right of the sign-off, baselines
         * aligned at the bottom. class="stack" drops it underneath on a phone,
         * where a 100px seal beside text leaves the name nowhere to go. */
        var stW = parseInt(o.stampWidth, 10) || 100;
        return '' +
'<tr><td class="px" style="' + pad(t, 32) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td class="stack" align="' + o.align + '" valign="bottom" style="padding:0;">' + body + '</td>' +
        '<td class="stack" width="' + stW + '" align="right" valign="bottom" style="padding:0 0 0 20px;">' +
            '<img src="' + stampUrl + '" width="' + stW + '" alt="Official stamp" style="display:block;border:0;outline:none;text-decoration:none;width:' + stW + 'px;max-width:100%;height:auto;">' +
        '</td>' +
    '</tr></table>' +
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
        var rule = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;font-size:0;line-height:0;mso-line-height-rule:exactly;background-color:' + t.hairline + ';">&nbsp;</td></tr></table>';
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
        return '<tr><td style="font-size:0;line-height:0;mso-line-height-rule:exactly;height:' + o.height + 'px;">&nbsp;</td></tr>';
    }
},

/* ================================================================= FOOTER */
{
    id: 'footer-transactional',
    name: 'Transactional footer',
    group: 'Footer',
    icon: 'footer',
    keywords: 'system receipt decision no unsubscribe do not reply address logo',
    desc: 'For system mail: receipts, decisions, resets. Sender identity and a do-not-reply notice — deliberately NO unsubscribe link.',
    opts: {
        showLogo: { label: 'Brand logo', type: 'bool', default: true },
        /* Footer scale, not header scale. A footer mark is there to reassure, not
         * to announce — the logo at the top of the card already did that.
         *
         * Two controls for one job, and only ever one of them on screen. A logo
         * whose shape has been measured is sized by height, so every shape sits
         * at the same visual weight. One that has not can only be sized by width,
         * which is what this always did. */
        logoHeight: {
            label: 'Logo height', type: 'select',
            choices: ['14', '18', '22', '28', '36'], default: '18',
            showIf: function (o, t) { return !!o.showLogo && logoMeasured(t); }
        },
        logoWidth: {
            label: 'Logo width', type: 'select',
            choices: ['32', '44', '56', '70'], default: '44',
            showIf: function (o, t) { return !!o.showLogo && !logoMeasured(t); }
        },
        showAddress: { label: 'Postal address', type: 'bool', default: true },
        notice: {
            label: 'Notice', type: 'textarea',
            default: 'This is an automated message about your account. Replies to this address are not monitored.'
        },
        showHelp: { label: 'Help link', type: 'bool', default: true },
        helpDestination: {
            label: 'Help link destination', type: 'select',
            choices: ['Help Centre', 'Project website'], default: 'Help Centre',
            showIf: function (o) { return !!o.showHelp; }
        },
        /* Only shown for a government sender — there is nothing to decide for
         * anyone else, and an option that never does anything is worse than no
         * option. Set the ministry on the organisation, under Projects. */
        showMinistry: {
            label: 'Ministry link', type: 'bool', default: true,
            showIf: function (o, t) { return isOfficialSender(t); }
        }
    },
    render: function (t, o) {
        var addr = o.showAddress
            ? '<p style="margin:8px 0 0 0;' + font(t, 'micro', t.textMuted) + '">{{org_address}}</p>'
            : '';
        var helpUrl = o.helpDestination === 'Project website'
            ? footerWebsiteUrl(t) : '{{help_url}}';
        var helpLabel = helpUrl === '{{help_url}}' ? 'Help Centre' : 'Website';
        /* A government sender is attributed to its ministry beside its own link:
         * "Website | Ministry of Health". Empty for everyone else, so a
         * non-official footer is byte-for-byte what it was. */
        var ministry = o.showMinistry === false ? '' : ministryFooterLink(t, t.textMuted);
        var links = [];
        if (o.showHelp) {
            links.push('<a href="' + helpUrl + '" style="color:' + t.textMuted +
                ';text-decoration:underline;">' + helpLabel + '</a>');
        }
        if (ministry) links.push(ministry);
        var help = links.length
            ? '<p style="margin:12px 0 0 0;' + font(t, 'micro', t.textMuted) + '">' +
              links.join(' &nbsp;|&nbsp; ') + '</p>'
            : '';
        var logo = o.showLogo
            ? '<div style="padding:24px 0 0 0;">' + footerMark(t, o.logoWidth, 'left', o.logoHeight) + '</div>'
            : '';
        return '' +
'<tr><td class="px" style="' + pad(t, 40, 40) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;font-size:0;line-height:0;mso-line-height-rule:exactly;background-color:' + t.hairline + ';">&nbsp;</td></tr></table>' +
    logo +
    '<p style="margin:' + (logo ? '14px' : '24px') + ' 0 0 0;' + font(t, 'small', t.text, 'font-weight:600;') + '">{{org_name}}</p>' +
    addr +
    '<div style="padding:12px 0 0 0;">' +
        copyParas(o.notice, 'This is an automated message about your account. Replies to this address are not monitored.', font(t, 'micro', t.textMuted), 8) +
    '</div>' +
    help +
'</td></tr>';
    }
},
{
    id: 'footer-marketing',
    name: 'Marketing footer',
    group: 'Footer',
    icon: 'footer',
    keywords: 'newsletter campaign unsubscribe preferences social legal bulk logo',
    desc: 'For newsletters and campaigns. Unsubscribe, preferences and a postal address — all legally required for bulk mail. Social links come from the project, not from this email.',
    opts: {
        showLogo: { label: 'Brand logo', type: 'bool', default: true },
        logoHeight: {
            label: 'Logo height', type: 'select',
            choices: ['14', '18', '22', '28', '36'], default: '18',
            showIf: function (o, t) { return !!o.showLogo && logoMeasured(t); }
        },
        logoWidth: {
            label: 'Logo width', type: 'select',
            choices: ['32', '44', '56', '70'], default: '44',
            showIf: function (o, t) { return !!o.showLogo && !logoMeasured(t); }
        },
        showSocial: { label: 'Social links', type: 'bool', default: true },
        showReason: { label: 'Why you got this', type: 'bool', default: true },
        reason: { label: 'Why-you-got-this text', type: 'textarea', default: '{{legal_note}}', showIf: function (o) { return !!o.showReason; } },
        showMinistry: {
            label: 'Ministry link', type: 'bool', default: true,
            showIf: function (o, t) { return isOfficialSender(t); }
        }
    },
    render: function (t, o) {
        /* Real URLs from the project's brand record, not merge fields. A network
         * with no URL configured is left out entirely rather than shipping a
         * dead link, and if none are set the whole row disappears. Set them
         * under Projects. */
        var links = [];
        if (o.showSocial) {
            SOCIAL_NETWORKS.forEach(function (n) {
                var url = t.social && t.social[n.key];
                if (!url) return;
                links.push('<a href="' + esc(url) + '" style="color:' + t.text +
                    ';text-decoration:none;font-weight:600;">' + esc(n.label) + '</a>');
            });
        }
        var social = links.length
            ? '<p style="margin:0 0 18px 0;' + font(t, 'small', t.textMuted) + '">' +
              links.join(' &nbsp;&nbsp; ') + '</p>'
            : '';
        var logo = o.showLogo
            ? '<div style="padding:0 0 18px 0;">' + footerMark(t, o.logoWidth, 'center', o.logoHeight) + '</div>'
            : '';
        var reason = o.showReason
            ? '<div style="padding:12px 0 0 0;">' +
              copyParas(o.reason, '{{legal_note}}', font(t, 'micro', t.textMuted), 8) +
              '</div>'
            : '';
        /* "Website | Ministry of Health" for a government sender, under the
         * address. Nothing at all for anyone else. */
        var ministry = o.showMinistry === false ? '' : ministryFooterLink(t, t.textMuted);
        var govLine = ministry
            ? '<p style="margin:6px 0 0 0;' + font(t, 'micro', t.textMuted) + '">' +
              '<a href="' + footerWebsiteUrl(t) + '" style="color:' + t.textMuted +
              ';text-decoration:underline;">Website</a>' +
              ' &nbsp;|&nbsp; ' + ministry + '</p>'
            : '';
        return '' +
'<tr><td class="px" align="center" style="' + pad(t, 40, 40) + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;font-size:0;line-height:0;mso-line-height-rule:exactly;background-color:' + t.hairline + ';">&nbsp;</td></tr></table>' +
    '<div style="height:24px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div>' +
    logo +
    social +
    '<p style="margin:0;' + font(t, 'small', t.text, 'font-weight:600;') + '">{{org_name}}</p>' +
    '<p style="margin:6px 0 0 0;' + font(t, 'micro', t.textMuted) + '">{{org_address}}</p>' +
    govLine +
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
    keywords: 'short one line verification code quiet logo',
    desc: 'One quiet line. For short system mail like a verification code, where a full footer would outweigh the message.',
    opts: {
        showLogo: { label: 'Brand logo', type: 'bool', default: true },
        logoHeight: {
            label: 'Logo height', type: 'select',
            choices: ['12', '16', '20', '26'], default: '16',
            showIf: function (o, t) { return !!o.showLogo && logoMeasured(t); }
        },
        logoWidth: {
            label: 'Logo width', type: 'select',
            choices: ['28', '36', '44', '56'], default: '36',
            showIf: function (o, t) { return !!o.showLogo && !logoMeasured(t); }
        },
        showMinistry: {
            label: 'Ministry link', type: 'bool', default: true,
            showIf: function (o, t) { return isOfficialSender(t); }
        }
    },
    render: function (t, o) {
        /* Even here. A verification code with no mark on it is the shape of a
         * phishing email, so the logo defaults on and just goes small. */
        var logo = o.showLogo
            ? '<div style="padding:0 0 14px 0;">' + footerMark(t, o.logoWidth, 'center', o.logoHeight) + '</div>'
            : '';
        /* On its own line here rather than a third item on the identity line —
         * the whole point of this footer is that it stays one short line, and a
         * ministry name is long enough to wrap it. */
        var ministry = o.showMinistry === false ? '' : ministryFooterLink(t, t.textMuted);
        var gov = ministry
            ? '<p style="margin:6px 0 0 0;' + font(t, 'micro', t.textMuted) + '">' + ministry + '</p>'
            : '';
        return '' +
'<tr><td class="px" align="center" style="' + pad(t, 40, 40) + '">' + logo +
    '<p style="margin:0;' + font(t, 'micro', t.textMuted) + '">{{org_name}} &nbsp;·&nbsp; {{org_address}}</p>' + gov +
'</td></tr>';
    }
},
{
    id: 'made-with-love',
    name: 'Made with love',
    group: 'Footer',
    icon: 'footer',
    keywords: 'made with love egovern tech credit country signature subfooter attribution',
    desc: 'A quiet last line: “Made with love by eGovern Tech in <country>”. The country follows the sending organisation; eGovern Tech links to egovern.com.',
    opts: {
        /* Centred by default, so an existing block keeps the position it had
         * before the choice existed. Left is there for a footer whose other
         * lines run left, so the credit sits under them rather than off on its
         * own axis. */
        align: { label: 'Alignment', type: 'select', choices: ['center', 'left'], default: 'center' },
        /* On by default. The country is what makes the line specific to the
         * sender, but a template that never sets one still reads correctly
         * without a trailing "in". */
        showCountry: { label: 'Show country', type: 'bool', default: true }
    },
    render: function (t, o) {
        /* Muted micro copy, one line — a credit, not an announcement. The link
         * colour matches the other footer links rather than the brand, so it
         * stays as quiet as the rest of the line. */
        var align = o.align === 'left' ? 'left' : 'center';
        var link = '<a href="https://egovern.com" style="color:' + t.textMuted +
            ';text-decoration:underline;">eGovern Tech</a>';
        /* A merge field, so it follows the sending organisation the same way the
         * name and address do. Left off when the block is set not to show it. */
        var where = o.showCountry ? ' in {{org_country}}' : '';
        return '' +
'<tr><td class="px" align="' + align + '" style="' + pad(t, 0, 28) + '">' +
    '<p style="margin:0;' + font(t, 'micro', t.textMuted) + '">Made with love by ' + link + where + '</p>' +
'</td></tr>';
    }
},
{
    id: 'official-notice',
    name: 'Official notice',
    group: 'Footer',
    icon: 'footer',
    keywords: 'official government ministry legal notice disclaimer confidential statement bottom',
    desc: 'The official wording for a government sender, below the footer. Written once per organisation under Projects, not per email — so every letter from that body carries the same notice.',
    opts: {
        /* Off the card by default. This is the small print underneath a letter,
         * not part of it, so it reads as a separate statement rather than a
         * final paragraph of the email. */
        onCanvas: { label: 'Outside the card', type: 'bool', default: true },
        align: { label: 'Alignment', type: 'select', choices: ['center', 'left'], default: 'center' }
    },
    /* Asked per instance, because "outside the card" is an option rather than a
     * property of the block. True moves this row out of the card table and into
     * the wrapper below it — the only way to sit under the card without taking
     * over its rounded bottom corners. */
    afterCard: function (o) { return !!o.onCanvas; },
    render: function (t, o) {
        var align = o.align === 'left' ? 'left' : 'center';
        /* Per organisation, so it arrives as a merge field on a portable
         * template and as the saved wording otherwise. */
        var text = officialNoticeText(t);
        /* Nothing written and nothing to stand in for it: render an empty cell
         * rather than a stray rule or padding, so a block left in place on a
         * non-official organisation costs nothing visually. */
        if (!text) return '<tr><td style="font-size:0;line-height:0;">&nbsp;</td></tr>';
        /* Outside the card there is already canvas behind this row, so it takes
         * no background of its own and the card above keeps its corners. Inside,
         * it follows the card like any other section. */
        var inCard = !o.onCanvas;
        var bg = inCard
            ? ' bgcolor="' + t.cardBg + '" style="' + pad(t, 8, 24) + 'background-color:' + t.cardBg + ';"'
            : ' style="' + pad(t, 20, 8) + '"';
        return '' +
'<tr><td class="px" align="' + align + '"' + bg + '>' +
    copyParas(text, '', font(t, 'micro', t.textMuted), 8) +
'</td></tr>';
    }
}

];

/* ------------------------------------------------------------------ shell */

/* Wraps a stitched run of block <tr>s into a complete, sendable document.
 * The <style> block is progressive enhancement only — every client that drops
 * it still gets a correct 600px layout from the table attributes. */
/* `afterHtml` is for blocks that belong under the card rather than in it — the
 * official notice is the one so far. See the note where it is emitted below. */
function renderDocument(t, blocksHtml, afterHtml) {
    /* Trails the preheader so the inbox preview line stops where the preheader
     * does. Without it every client pulls the first words of the email in after
     * it — usually the logo's alt text and then the headline again. These are
     * zero-width and non-breaking characters, so nothing is visible either in
     * the preview or in the body. */
    var previewPad = new Array(15).join('&#847;&zwnj;&nbsp;');
    return '' +
'<!DOCTYPE html>\n' +
'<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
/* The http-equiv twin is for the older clients that never learned to read the
 * short form — Lotus Notes and a handful of legacy webmail engines. */
'<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<meta name="x-apple-disable-message-reformatting">\n' +
'<meta name="color-scheme" content="light">\n' +
'<meta name="supported-color-schemes" content="light">\n' +
'<title>{{email_subject}}</title>\n' +
'<!--[if mso]>\n' +
'<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>\n' +
'<![endif]-->\n' +
/* Outlook only. It cannot parse the hyphen-led family names in the system stack
 * and would otherwise fall back to Times New Roman, so it is handed the same
 * stack with those tokens removed. !important because it has to beat the inline
 * font-family on every element. */
'<!--[if mso]>\n' +
'<style>\n' +
'  body, table, td, div, p, a, span, h1, h2, h3, li\n' +
'    { font-family:' + msoFontStack(t.font) + ' !important; }\n' +
'</style>\n' +
'<![endif]-->\n' +
'<style>\n' +
'  :root { color-scheme:light; supported-color-schemes:light; }\n' +
'  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }\n' +
'  /* separate, not collapse. In the collapsed border model border-radius is a\n' +
'     no-op, which is what drew a square stroke around every rounded button and\n' +
'     squared off the tinted panels. border-spacing:0 keeps the layout tight,\n' +
'     and cellspacing="0" on every table means Outlook never sees a gap.\n' +
'     mso-table-*space kills the ~1.5pt gutter Word puts either side of a table,\n' +
'     which is what knocked nested tables a couple of pixels out of line. */\n' +
'  table { border-collapse:separate; border-spacing:0; mso-table-lspace:0pt; mso-table-rspace:0pt; }\n' +
'  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }\n' +
'  a { text-decoration:none; }\n' +
'  @media only screen and (max-width:620px) {\n' +
'    .wrap { width:100% !important; max-width:100% !important; }\n' +
'    .card { border-radius:0 !important; }\n' +
'    .px { padding-left:24px !important; padding-right:24px !important; }\n' +
'    .stack { display:block !important; width:100% !important; padding:0 0 20px 0 !important; }\n' +
'    /* On a phone the card goes full-bleed, including its top and bottom, so\n' +
'     * the grey desktop canvas cannot peek through before the first section. */\n' +
'    .gutter { padding:0 !important; }\n' +
'  }\n' +
'</style>\n' +
'</head>\n' +
/* bgcolor as well as the inline style throughout: Outlook ignores a background
 * on <body> outright, and the older webmail engines and Lotus Notes trust the
 * attribute over the declaration. Belt and braces, and free. */
'<body style="margin:0;padding:0;background-color:' + t.pageBg + ';" bgcolor="' + t.pageBg + '">\n' +
'<div style="display:none;font-size:1px;line-height:1px;mso-line-height-rule:exactly;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{{preheader}}' + previewPad + '</div>\n' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + t.pageBg + '" style="background-color:' + t.pageBg + ';mso-table-lspace:0pt;mso-table-rspace:0pt;">\n' +
'<tr><td class="gutter" align="center" style="padding:32px 16px;">\n' +
'  <table role="presentation" class="wrap" width="' + t.width + '" cellpadding="0" cellspacing="0" border="0" style="width:' + t.width + 'px;max-width:' + t.width + 'px;mso-table-lspace:0pt;mso-table-rspace:0pt;">\n' +
'    <tr><td>\n' +
'      <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + t.cardBg + '" style="background-color:' + t.cardBg + ';border-radius:' + t.radius + 'px;overflow:hidden;mso-table-lspace:0pt;mso-table-rspace:0pt;">\n' +
blocksHtml +
'      </table>\n' +
'    </td></tr>\n' +
/* Rows below the card, on the page canvas. They are siblings of the card rather
 * than its last rows, which is the whole point: a row inside the card takes over
 * its rounded bottom corners and squares the white content off above it.
 *
 * Empty for almost every email, and then this emits nothing at all, so a
 * document with no after-card block is byte-for-byte what it was. */
(afterHtml || '') +
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
        blocks: ['header-logo', 'hero-title', 'greeting', 'paragraph', 'details-list', 'cta-button', 'steps', 'signature', 'footer-transactional']
    },
    'changes-requested': {
        label: 'Changes requested',
        blocks: ['header-logo', 'hero-title', 'greeting', 'paragraph', 'cta-button', 'help-prompt', 'signature', 'footer-transactional']
    },
    'receipt': {
        label: 'Payment receipt',
        blocks: ['header-logo', 'hero-title', 'greeting', 'paragraph', 'receipt', 'details-list', 'document-list', 'help-prompt', 'footer-transactional']
    },
    'document-issued': {
        label: 'Document issued',
        blocks: ['header-logo', 'hero-title', 'greeting', 'paragraph', 'document-list', 'cta-button', 'divider', 'feature-panel', 'signature', 'footer-transactional']
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
