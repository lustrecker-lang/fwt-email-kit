/* eGovern Email Kit — design tokens.
 *
 * The look is deliberately Airbnb-ish: a light grey canvas, one white card with
 * no border, generous whitespace, hairline rules instead of boxes, tight
 * heading tracking, and exactly one saturated colour on the page — the CTA.
 *
 * Everything that differs between products lives in THEMES. Blocks never
 * hardcode a colour, size or spacing value; they read from the theme object.
 * Values are plain strings because they are inlined into style="" attributes —
 * email clients strip <style>, so CSS variables are not available to us.
 */

/* ---------------------------------------------------------------- palette */
/* Every theme defines the same set of roles, so any block works under any
 * brand. Only `brand` is allowed to be saturated. */
var COLOR_ROLES = [
    { key: 'brand',     label: 'CTA / brand',    hint: 'Buttons, links, accents. The one saturated colour.' },
    { key: 'brandText', label: 'CTA text',       hint: 'Text sitting on the brand colour.' },
    { key: 'brandSoft', label: 'Brand tint',     hint: 'Washed brand colour for soft panels.' },
    { key: 'pageBg',    label: 'Page background', hint: 'The canvas behind the card.' },
    { key: 'cardBg',    label: 'Card background', hint: 'The email body itself.' },
    { key: 'text',      label: 'Text',           hint: 'Headings and body copy.' },
    { key: 'textMuted', label: 'Muted text',     hint: 'Secondary copy, labels, footers.' },
    { key: 'hairline',  label: 'Hairline',       hint: 'Dividers and row separators.' },
    { key: 'surface',   label: 'Surface',        hint: 'Neutral panels and cards-within-cards.' }
];

/* The neutral starting point, and the only branding written into the code.
 *
 * This is not a project. It is never listed, never has templates filed under it,
 * and cannot be opened or edited. It exists for two jobs: it is what a brand-new
 * project is cloned from, so a project renders correctly the moment it is created
 * and before anyone has chosen a colour; and it is what resolves when a key is
 * not recognised, so a template belonging to a deleted project still renders
 * instead of throwing.
 *
 * Greyscale on purpose. A new project should look unbranded rather than looking
 * like somebody else's brand. */
var BASE_THEME = {
    label: '',
    brandName: '',
    logoUrl: '',
    logoWidth: 130,
    font: 'system',
    color: {
        brand: '#222222', brandText: '#ffffff', brandSoft: '#f0f0f0',
        pageBg: '#f7f7f7', cardBg: '#ffffff',
        text: '#222222', textMuted: '#717171',
        hairline: '#ebebeb', surface: '#f7f7f7'
    }
};

/* Projects shipped in the code. Deliberately none.
 *
 * Every project is created in the app and exists only as a project_brands row,
 * which is what makes the list a true reflection of the database rather than a
 * set of hardcoded names nobody can remove. The machinery that reads this is
 * unchanged, so putting a project back in here would still work — it is empty by
 * choice, not by omission. */
var THEMES = {};

/* ------------------------------------------------------------- typography */
/* One scale, used everywhere. Sizes are generous — transactional mail is read
 * on phones and the old 13px habit reads as cramped next to modern senders. */
var TYPE = {
    display: { size: '30px', line: '38px', weight: '700', track: '-0.5px' },
    title:   { size: '22px', line: '30px', weight: '700', track: '-0.3px' },
    heading: { size: '17px', line: '24px', weight: '600', track: '-0.1px' },
    lead:    { size: '17px', line: '27px', weight: '400', track: '0' },
    body:    { size: '16px', line: '26px', weight: '400', track: '0' },
    small:   { size: '14px', line: '22px', weight: '400', track: '0' },
    micro:   { size: '12px', line: '19px', weight: '400', track: '0' },
    label:   { size: '11px', line: '16px', weight: '700', track: '0.8px' }
};

/* ------------------------------------------------------------ font stacks */
/* Deliberately no web fonts. Gmail ignores a @font-face declaration outright
 * and Outlook on Windows renders through the Word engine, which never loads
 * one — between them that is most of any government mailing list, so the
 * fallback is what most people would actually see. A stack of locally
 * installed faces renders identically everywhere instead.
 *
 * Every stack ends in a generic family, and contains only faces that ship with
 * both Windows and macOS, so nothing can drop to Times New Roman by surprise.
 * `sample` is the specimen shown next to the label in project settings. */
var FONT_STACKS = {
    system: {
        label: 'System (default)',
        stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif",
        note: 'Matches whatever the recipient is reading on, so it never looks dated. Segoe on Windows, San Francisco on Apple, Roboto on Android.'
    },
    helvetica: {
        label: 'Helvetica / Arial',
        stack: "Helvetica, Arial, sans-serif",
        note: 'The neutral grotesque. Identical almost everywhere, and the safest possible choice.'
    },
    verdana: {
        label: 'Verdana',
        stack: "Verdana, Geneva, sans-serif",
        note: 'Wide and open, designed for screens. The most legible option at small sizes — worth it where the audience skews older.'
    },
    tahoma: {
        label: 'Tahoma',
        stack: "Tahoma, Verdana, Geneva, sans-serif",
        note: 'Verdana’s narrower sibling. Fits more words per line without losing much clarity.'
    },
    trebuchet: {
        label: 'Trebuchet MS',
        stack: "'Trebuchet MS', 'Lucida Grande', 'Lucida Sans Unicode', sans-serif",
        note: 'Humanist and slightly warmer than the grotesques. Reads less institutional.'
    },
    georgia: {
        label: 'Georgia (serif)',
        stack: "Georgia, 'Times New Roman', Times, serif",
        note: 'A screen serif with real authority. Suits decisions, determinations and anything quasi-legal.'
    },
    times: {
        label: 'Times New Roman (serif)',
        stack: "'Times New Roman', Times, serif",
        note: 'Traditional and formal. Reads as a printed letter, which is occasionally the point.'
    }
};

var DEFAULT_FONT = 'system';

function fontStack(key) {
    return (FONT_STACKS[key] || FONT_STACKS[DEFAULT_FONT]).stack;
}

/* The same stack, with the tokens Outlook cannot read taken out.
 *
 * Outlook on Windows renders through the Word engine, which chokes on a
 * hyphen-led family name like -apple-system: it discards the whole declaration
 * and falls back to Times New Roman. Since `system` is the default on every
 * project, that put a serif in most of these emails on the single client least
 * able to cope. Dropping those tokens leaves a list Word does understand, and
 * every stack in FONT_STACKS still ends in a generic family. */
function msoFontStack(stack) {
    var kept = String(stack).split(',').map(function (part) {
        return part.trim();
    }).filter(function (part) {
        return part && part.charAt(0) !== '-' && part !== 'BlinkMacSystemFont';
    });
    return kept.length ? kept.join(', ') : 'Arial, Helvetica, sans-serif';
}

var LAYOUT = {
    width: 600,
    radius: 16,       /* the card */
    radiusSm: 18,     /* images and panels inside the card */
    radiusBtn: 8,
    pad: 40,          /* horizontal padding inside the card (24 on mobile) */
    font: FONT_STACKS[DEFAULT_FONT].stack
};

/* Social profiles belong to the organisation, not to one email, so they are
 * configured once per project instead of being merge fields every send has to
 * remember to pass. A network with no URL is simply not rendered. */
var SOCIAL_NETWORKS = [
    { key: 'facebook',  label: 'Facebook' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'linkedin',  label: 'LinkedIn' },
    { key: 'x',         label: 'X' },
    { key: 'youtube',   label: 'YouTube' }
];

/* Saved per-project branding, loaded from the project_brands table at boot.
 * THEMES above are the shipped defaults; anything here wins over them. Keeping
 * the two separate means "reset" is always possible and a project that has
 * never been configured still renders correctly. */
var BRAND_OVERRIDES = {};

function setBrandOverrides(rows) {
    BRAND_OVERRIDES = {};
    (rows || []).forEach(function (r) { BRAND_OVERRIDES[r.key] = r; });
}

/* Organisations that send a project's emails under their own identity, loaded
 * from project_orgs and grouped by project.
 *
 * A project with none behaves exactly as it did before organisations existed —
 * that is the whole reason this is a separate table rather than a column, and
 * why the shipped projects need no rows and no migration. */
var PROJECT_ORGS = {};

function setOrgs(rows) {
    PROJECT_ORGS = {};
    (rows || []).slice().sort(function (a, b) {
        var sa = a.sort || 0, sb = b.sort || 0;
        if (sa !== sb) return sa - sb;
        var na = orgLabel(a), nb = orgLabel(b);
        return na < nb ? -1 : (na > nb ? 1 : 0);
    }).forEach(function (r) {
        if (!r || !r.project) return;
        if (!PROJECT_ORGS[r.project]) PROJECT_ORGS[r.project] = [];
        PROJECT_ORGS[r.project].push(r);
    });
}

/* What to call an organisation on screen: its display name, then the name it
 * uses in email copy, then its stable key. */
function orgLabel(row) {
    if (!row) return '';
    return String(row.display_name || row.org_name || row.key || '').trim();
}

function orgsFor(projectKey) {
    return PROJECT_ORGS[projectKey] || [];
}

function orgByKey(projectKey, orgKey) {
    if (!orgKey) return null;
    var list = orgsFor(projectKey);
    for (var i = 0; i < list.length; i++) {
        if (list[i].key === orgKey) return list[i];
    }
    return null;
}

/* The organisation a project falls back to when nothing is chosen. Null for a
 * project with none, which is what keeps single-identity projects unchanged. */
function defaultOrg(projectKey) {
    return orgsFor(projectKey)[0] || null;
}

/* Flatten a theme into the single object blocks receive.
 *
 * `orgKey` picks which organisation's identity to render under. Left out, a
 * project that has organisations renders as its first one, because an email has
 * to go out under a real sender — a "Schools" project is a grouping, not
 * something that signs a letter. A project with no organisations ignores the
 * argument entirely and resolves exactly as it always has.
 *
 * `label` is deliberately never touched by an organisation. It names the project
 * in the app chrome — filters, cards, groups in the shared library — and those
 * group templates, which belong to the project rather than to one school. */
function makeTheme(key, orgKey) {
    var src = THEMES[key] || BASE_THEME;
    var t = {
        key: key,
        /* The key is the last resort so a project can never be listed as a blank
         * row — that would be worse than showing its slug. */
        label: src.label || key || '',
        brandName: src.brandName,
        orgAddress: '',
        orgCountry: '',
        /* Government sender. False for every project on its own — only an
         * organisation can be official, because a ministry belongs to the body
         * that sends, not to the product it sends from. */
        isOfficial: false,
        ministryName: '',
        ministryUrl: '',
        officialText: '',
        logoUrl: src.logoUrl,
        logoWidth: src.logoWidth,
        /* Both null until a logo has been measured. Blocks size by height when
         * the shape is known and fall back to the width-only setting when it is
         * not, so a logo uploaded before measuring existed still renders exactly
         * as it did. */
        logoHeight: null,
        logoAspect: null,
        /* One project website, available to footer blocks that need a stable
         * organisation link rather than a per-recipient merge field. */
        websiteUrl: src.websiteUrl || '',
        /* The official stamp or seal, like the logo: one asset per organisation,
         * not something re-uploaded on every letter that needs it. */
        stampUrl: src.stampUrl || '',
        fontKey: src.font || DEFAULT_FONT,
        type: TYPE,
        social: {}
    };
    for (var s in (src.social || {})) {
        if (Object.prototype.hasOwnProperty.call(src.social, s)) t.social[s] = src.social[s];
    }
    for (var c in src.color) {
        if (Object.prototype.hasOwnProperty.call(src.color, c)) t[c] = src.color[c];
    }
    for (var l in LAYOUT) {
        if (Object.prototype.hasOwnProperty.call(LAYOUT, l)) t[l] = LAYOUT[l];
    }

    var ov = BRAND_OVERRIDES[key];
    if (ov) {
        if (ov.brand_name) t.brandName = ov.brand_name;
        if (ov.logo_url != null) t.logoUrl = ov.logo_url;
        if (ov.website_url != null) t.websiteUrl = ov.website_url;
        if (ov.stamp_url != null) t.stampUrl = ov.stamp_url;
        if (ov.display_name != null && String(ov.display_name).trim()) {
            t.label = String(ov.display_name).trim();
        }
        if (ov.logo_width) t.logoWidth = ov.logo_width;
        if (ov.logo_height) t.logoHeight = ov.logo_height;
        if (ov.logo_aspect) t.logoAspect = ov.logo_aspect;
        if (ov.font) t.fontKey = ov.font;
        /* A project created in the app has no THEMES entry to take a label from,
         * so it falls back to its saved display name, then its organisation name,
         * then its stable key. */
        if (!THEMES[key] && !(ov.display_name && String(ov.display_name).trim())) {
            t.label = ov.brand_name || key;
        }
        for (var k in (ov.colors || {})) {
            if (Object.prototype.hasOwnProperty.call(ov.colors, k)) t[k] = ov.colors[k];
        }
        /* Merged rather than replaced, so clearing one network's field does not
         * wipe the others that were never touched. */
        for (var sk in (ov.social || {})) {
            if (Object.prototype.hasOwnProperty.call(ov.social, sk)) t.social[sk] = ov.social[sk];
        }
    }

    /* The organisation goes on last, over the project it belongs to. Each field
     * is only taken when the organisation actually set it, so a school that has
     * uploaded a logo but no stamp still gets the project's stamp rather than
     * losing it. Colours and the typeface are absent by design: they are shared,
     * so they stay resolved from the project above. */
    var orgs = orgsFor(key);
    /* `false` means "the project itself, no organisation" — what the settings
     * screen edits and what the project cards describe. Undefined means "pick
     * one for me", which is what rendering an email wants. */
    var org = orgKey === false ? null
        : (orgKey ? orgByKey(key, orgKey) : orgs[0] || null);
    t.orgCount = orgs.length;
    t.orgKey = org ? org.key : '';
    t.orgLabel = org ? orgLabel(org) : '';
    if (org) {
        if (org.org_name) t.brandName = org.org_name;
        if (org.org_address) t.orgAddress = org.org_address;
        if (org.country) t.orgCountry = org.country;
        /* The flag is taken as given rather than only when truthy: an
         * organisation that has been un-marked as official must stop rendering
         * as one. The three fields below are only read when it is on, so text
         * left over from before cannot leak into a non-official email. */
        t.isOfficial = !!org.is_official;
        if (t.isOfficial) {
            if (org.ministry_name) t.ministryName = org.ministry_name;
            if (org.ministry_website_url) t.ministryUrl = org.ministry_website_url;
            if (org.official_text) t.officialText = org.official_text;
        }
        if (org.logo_url) {
            t.logoUrl = org.logo_url;
            /* Taken together with the logo, never separately. Carrying a shape
             * over from the project would size this school's mark against
             * somebody else's proportions. */
            t.logoWidth = org.logo_width || t.logoWidth;
            t.logoHeight = org.logo_height || null;
            t.logoAspect = org.logo_aspect || null;
        }
        if (org.website_url) t.websiteUrl = org.website_url;
        if (org.stamp_url) t.stampUrl = org.stamp_url;
        for (var os in (org.social || {})) {
            if (!Object.prototype.hasOwnProperty.call(org.social, os)) continue;
            if (org.social[os]) t.social[os] = org.social[os];
        }
    }

    /* Resolved last, so it wins over the LAYOUT copy above and reflects a
     * saved override. An unknown key falls back rather than emitting an empty
     * font-family, which would leave the client to pick for us. */
    t.font = fontStack(t.fontKey);
    return t;
}

/* The project's own identity, with no organisation applied over it.
 *
 * This is what the project settings screen edits and what the project cards
 * describe. Using the organisation-aware version in those places would show one
 * school's logo as if it belonged to the whole project — and, on the settings
 * screen, save it there. */
function projectTheme(key) {
    return makeTheme(key, false);
}

/* Every project, defaults merged with whatever is saved. Drives the filter, the
 * project settings screen and the template switcher.
 *
 * THEMES is empty, so in practice every project here is one somebody added in
 * the app and exists only as a project_brands row. The THEMES pass is kept
 * because it costs nothing and putting a project back into the code would work
 * without touching this. */
function allProjects() {
    var out = [], seen = {};
    for (var k in THEMES) {
        if (!Object.prototype.hasOwnProperty.call(THEMES, k)) continue;
        seen[k] = true;
        out.push({ key: k, theme: projectTheme(k) });
    }
    for (var o in BRAND_OVERRIDES) {
        if (!Object.prototype.hasOwnProperty.call(BRAND_OVERRIDES, o) || seen[o]) continue;
        out.push({ key: o, theme: projectTheme(o), custom: true });
    }
    return out;
}

/* A project key has to survive being put in a URL hash and a Postgres primary
 * key, so it is slugged from the name rather than typed. */
function projectKey(name) {
    return String(name).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

/* Shorthand for a type style, so blocks stay readable. */
function font(t, styleName, color, extra) {
    var s = t.type[styleName];
    return 'font-family:' + t.font + ';' +
           'font-size:' + s.size + ';' +
           'line-height:' + s.line + ';' +
           /* Outlook on Windows treats line-height as a minimum, not a value, so
            * every paragraph and heading arrives with inflated leading unless it
            * is told to take the number exactly. */
           'mso-line-height-rule:exactly;' +
           'font-weight:' + s.weight + ';' +
           (s.track !== '0' ? 'letter-spacing:' + s.track + ';' : '') +
           'color:' + color + ';' +
           (extra || '');
}

/* Padded content cell. class="px" lets the mobile media query tighten the
 * gutter without touching any block. */
function pad(t, top, bottom) {
    return 'padding:' + top + 'px ' + t.pad + 'px ' + (bottom || 0) + 'px ' + t.pad + 'px;';
}

/* ------------------------------------------------------------------- copy */

/* Words typed into a block, on their way into the document.
 *
 * Escaped, so a stray < or & in someone's sentence cannot break the email or
 * the preview. {{ placeholders }} survive escaping untouched, because braces,
 * letters and underscores are not characters esc() touches — which is the whole
 * trick that lets one field hold fixed copy and variables at the same time:
 *
 *     Dear {{first_name}}, your application of {{applied_on}} was approved.
 *
 * An empty field falls back to the placeholder the block used to hardcode, so a
 * template saved before copy was editable renders exactly as it did before. */
function copy(value, fallback) {
    var s = (value === undefined || value === null || String(value) === '')
        ? fallback : String(value);
    return esc(s);
}

/* The same, for a field that can hold more than one line. A blank line starts a
 * new paragraph and a single newline is a line break, which is what anyone
 * typing into a textarea expects. Without this a two-paragraph field would
 * arrive as one run-on block. */
function copyParas(value, fallback, style, gap) {
    var s = (value === undefined || value === null || String(value) === '')
        ? fallback : String(value);
    return String(s).split(/\n[ \t]*\n/).map(function (para, i) {
        return '<p style="margin:' + (i ? (gap || 14) + 'px' : '0') + ' 0 0 0;' + style + '">' +
            esc(para).replace(/\n/g, '<br>') + '</p>';
    }).join('');
}

/* The project mark at footer scale. Every footer offers this, because a footer
 * with no mark at all reads as a leaked system email. Falls back to the brand
 * name set in type when a project has not been given a logo yet, so it is
 * never blank. */
/* Whether this logo's real shape is known, which decides whether it can be
 * sized by height. Null for anything uploaded before measuring existed, and for
 * a URL typed in by hand — we never fetch a pasted image to measure it. */
function logoMeasured(t) {
    return !!(t && t.logoUrl && t.logoAspect > 0);
}

/* The organisation's identity, as merge fields.
 *
 * Named in one place so the renderer, the preview filler and the handover table
 * cannot drift apart. The first two already existed — the delivered email never
 * carried a hardcoded organisation name — and the rest are what portable
 * rendering adds. */
var ORG_FIELDS = {
    name:     'org_name',
    address:  'org_address',
    country:  'org_country',
    logo:     'org_logo_url',
    website:  'org_website_url',
    stamp:    'org_stamp_url',
    /* Government senders. Only ever emitted by a block that has been told the
     * organisation is official, so a non-government email never asks
     * engineering for a ministry it does not have. */
    ministry:     'org_ministry_name',
    ministryUrl:  'org_ministry_url',
    officialText: 'org_official_text'
};

/* The same theme, rendering its organisation's identity as merge fields instead
 * of baking one organisation's values in.
 *
 * This is what lets a single stored template serve every school: the colours,
 * the typeface, the layout and the copy are all fixed, and the handful of things
 * that differ per organisation become {{ }} for the sender to fill. Everything
 * else about rendering is untouched, so the portable document is the same email
 * in every respect that is shared. */
function portableTheme(t) {
    var p = {};
    for (var k in t) {
        if (Object.prototype.hasOwnProperty.call(t, k)) p[k] = t[k];
    }
    p.portable = true;
    return p;
}

/* One logo <img>, and the only place one is built.
 *
 * Height is the thing worth controlling: a mark should sit at the same height in
 * a header whatever shape the file is. Width then falls out of the measured
 * aspect ratio, which is also why both numbers can be stated outright — Outlook
 * wants explicit dimensions and deals with height:auto badly, sizing the image
 * from its intrinsic pixels instead.
 *
 * With no measured shape it sizes by width and leaves the height automatic,
 * which is exactly what it did before. That is what keeps every logo uploaded
 * before this rendering byte-for-byte identical.
 *
 *   spec.height  what to make it tall, used when the shape is known
 *   spec.width   what to make it wide, used when it is not
 */
function logoImg(t, spec) {
    var align = spec.align === 'center' ? 'margin:0 auto;' : '';
    var common = 'display:block;border:0;outline:none;text-decoration:none;max-width:100%;';
    var alt = esc(t.brandName || '');

    /* Portable: the sender supplies one URL per organisation and nothing else.
     * The height stays literal, because it is a decision this email made — a
     * footer mark is smaller than a masthead whichever school is sending — and
     * only the width is left to follow the picture's own proportions. Asking the
     * sender for a width as well would mean a different number for every slot in
     * every template, which is not a thing any sending system should have to
     * know. */
    if (t.portable) {
        var ph = parseInt(spec.height, 10) || parseInt(spec.width, 10) || 40;
        return '<img src="{{' + ORG_FIELDS.logo + '}}" height="' + ph + '"' +
            ' alt="{{' + ORG_FIELDS.name + '}}" style="' + common +
            'height:' + ph + 'px;width:auto;' + align + '">';
    }

    if (logoMeasured(t) && spec.height) {
        var h = parseInt(spec.height, 10);
        var w = Math.max(1, Math.round(h * t.logoAspect));
        return '<img src="' + esc(t.logoUrl) + '" width="' + w + '" height="' + h + '"' +
            ' alt="' + alt + '" style="' + common + 'width:' + w + 'px;height:' + h + 'px;' +
            align + '">';
    }

    var fw = parseInt(spec.width, 10) || 44;
    return '<img src="' + esc(t.logoUrl) + '" width="' + fw + '" alt="' + alt + '"' +
        ' style="' + common + 'width:' + fw + 'px;height:auto;' + align + '">';
}

function footerMark(t, width, align, height) {
    if (!t.logoUrl) {
        /* The wordmark stands in for a missing logo. Portable, the name it shows
         * has to be the merge field too, or every school would be signed off with
         * whichever one happened to be selected when this was saved. */
        return '<span style="' + font(t, 'small', t.text, 'font-weight:700;letter-spacing:-0.1px;') + '">' +
            (t.portable ? '{{' + ORG_FIELDS.name + '}}' : esc(t.brandName)) + '</span>';
    }
    return logoImg(t, { width: width || 44, height: height, align: align });
}

function footerWebsiteUrl(t) {
    /* Portable, the website is per organisation by definition, so it goes out as
     * a merge field rather than one school's address. */
    if (t.portable) return '{{' + ORG_FIELDS.website + '}}';
    var url = String(t.websiteUrl || '').trim();
    return /^https?:\/\/[^\s<>"']+$/i.test(url) ? esc(url) : '{{help_url}}';
}

/* ------------------------------------------------------ government senders */

/* Whether this organisation renders as a government body: official, and with a
 * ministry actually named. Portable, the name arrives as a merge field, so the
 * flag alone is enough — asking for a literal name there would bake one
 * ministry into a template meant to serve several.
 *
 * Blocks call this rather than reading t.isOfficial directly, so "official but
 * nothing filled in" cannot render an empty separator or a bare link. */
function isOfficialSender(t) {
    if (!t || !t.isOfficial) return false;
    return t.portable ? true : !!String(t.ministryName || '').trim();
}

/* The ministry's URL, on the same terms as the organisation's own website. */
function ministryWebsiteUrl(t) {
    if (t.portable) return '{{' + ORG_FIELDS.ministryUrl + '}}';
    var url = String(t.ministryUrl || '').trim();
    return /^https?:\/\/[^\s<>"']+$/i.test(url) ? esc(url) : '';
}

/* The ministry's name as it appears in a footer. */
function ministryName(t) {
    if (t.portable) return '{{' + ORG_FIELDS.ministry + '}}';
    return esc(String(t.ministryName || '').trim());
}

/* "Website | Ministry of Health", the ministry half clickable.
 *
 * One helper because all three footers show the same pair, and a separator that
 * only appears when there is something on both sides of it is the sort of detail
 * that drifts if it is written out three times. With no ministry URL the name
 * still shows, as text — a named ministry with no site is better than dropping
 * the attribution entirely. */
function ministryFooterLink(t, colour) {
    if (!isOfficialSender(t)) return '';
    var name = ministryName(t);
    if (!name) return '';
    var url = ministryWebsiteUrl(t);
    if (!url) return name;
    return '<a href="' + url + '" style="color:' + colour +
        ';text-decoration:underline;">' + name + '</a>';
}

/* The official wording itself, per organisation. */
function officialNoticeText(t) {
    if (t.portable) return '{{' + ORG_FIELDS.officialText + '}}';
    return String(t.officialText || '').trim();
}

/* ------------------------------------------------------- uploaded assets */
/* An `image` option stores a bare URL string; a `file` option stores
 * { url, name, size } because a document row wants to show its real filename
 * and weight, not just link to it. Both are normalised through here so a block
 * can treat them the same, and so composition JSON saved by an older version
 * still opens. */
function asset(v) {
    if (!v) return null;
    if (typeof v === 'string') return { url: v, name: '', size: 0 };
    return v.url ? { url: v.url, name: v.name || '', size: v.size || 0 } : null;
}

/* Filenames are whatever the operating system allowed, so they are escaped
 * before going anywhere near the document. */
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* `{{placeholder}}` until something is actually uploaded, so one template can
 * still carry a different file per send. */
function assetUrl(v, placeholder) {
    var a = asset(v);
    return a ? a.url : placeholder;
}

/* "PDF · 1.2 MB" — the line under a document's name. */
function assetMeta(v, placeholder) {
    var a = asset(v);
    if (!a || !a.name) return placeholder;
    var ext = (a.name.split('.').pop() || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var size = !a.size ? ''
        : a.size < 1024 ? a.size + ' B'
        : a.size < 1048576 ? Math.round(a.size / 1024) + ' KB'
        : (a.size / 1048576).toFixed(1) + ' MB';
    return [ext, size].filter(Boolean).join(' · ') || placeholder;
}

function assetName(v, placeholder) {
    var a = asset(v);
    return (a && a.name) ? esc(a.name) : placeholder;
}
