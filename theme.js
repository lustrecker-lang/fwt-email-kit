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

var THEMES = {
    'egovern': {
        label: 'eGovern (neutral)',
        brandName: 'eGovern',
        logoUrl: '',
        logoWidth: 130,
        color: {
            brand: '#222222', brandText: '#ffffff', brandSoft: '#f0f0f0',
            pageBg: '#f7f7f7', cardBg: '#ffffff',
            text: '#222222', textMuted: '#717171',
            hairline: '#ebebeb', surface: '#f7f7f7'
        }
    },
    'nursing': {
        label: 'Nursing Council',
        brandName: 'Barbados Nursing Council',
        /* nursing/public/images/NursePortalLogo.svg — must be re-hosted at an
         * absolute https URL before it will render in a mail client. */
        logoUrl: '',
        logoWidth: 150,
        color: {
            /* Brand coral is #d3b0a1 — far too pale to carry white button text,
             * so the CTA uses a deepened version of the same hue and the pale
             * original becomes the tint. */
            brand: '#98593e', brandText: '#ffffff', brandSoft: '#f7ece7',
            pageBg: '#f6f5f4', cardBg: '#ffffff',
            text: '#26211e', textMuted: '#7a716c',
            hairline: '#ece7e4', surface: '#faf8f7'
        }
    },
    'onegov': {
        label: 'OneGov',
        brandName: 'OneGov',
        /* one-gov/public/transparentlogo.png */
        logoUrl: '',
        logoWidth: 140,
        color: {
            brand: '#23395d', brandText: '#ffffff', brandSoft: '#eaeff7',
            pageBg: '#f5f6f8', cardBg: '#ffffff',
            text: '#1b2434', textMuted: '#6b7688',
            hairline: '#e7eaef', surface: '#f7f8fa'
        }
    },
    'smartfinance': {
        label: 'SmartFinance',
        brandName: 'Barbados SmartFinance',
        logoUrl: '',
        logoWidth: 150,
        color: {
            brand: '#00267f', brandText: '#ffffff', brandSoft: '#e8ecf9',
            pageBg: '#f5f6f9', cardBg: '#ffffff',
            text: '#12172b', textMuted: '#6a7086',
            hairline: '#e6e8f0', surface: '#f7f8fb'
        }
    }
};

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

var LAYOUT = {
    width: 600,
    radius: 16,       /* the card */
    radiusSm: 12,     /* panels inside the card */
    radiusBtn: 8,
    pad: 40,          /* horizontal padding inside the card (24 on mobile) */
    font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif"
};

/* Status tones. Flat tints, no borders — the border is what made the old set
 * look like a bootstrap alert. */
var TONES = {
    success: { bg: '#eef7f0', fg: '#1a7f43', text: '#14532d', label: 'Approved' },
    warning: { bg: '#fdf5e8', fg: '#a06a12', text: '#733f0e', label: 'Action needed' },
    danger:  { bg: '#fdf0ef', fg: '#b3261e', text: '#7f1d1b', label: 'Not approved' },
    info:    { bg: '#eef2f8', fg: '#2b5c9b', text: '#1c3c68', label: 'Information' },
    neutral: { bg: '#f4f4f5', fg: '#5f6368', text: '#33363b', label: 'Note' }
};

/* Saved per-project branding, loaded from the project_brands table at boot.
 * THEMES above are the shipped defaults; anything here wins over them. Keeping
 * the two separate means "reset" is always possible and a project that has
 * never been configured still renders correctly. */
var BRAND_OVERRIDES = {};

function setBrandOverrides(rows) {
    BRAND_OVERRIDES = {};
    (rows || []).forEach(function (r) { BRAND_OVERRIDES[r.key] = r; });
}

/* Flatten a theme into the single object blocks receive. */
function makeTheme(key) {
    var src = THEMES[key] || THEMES.egovern;
    var t = {
        key: key,
        label: src.label,
        brandName: src.brandName,
        logoUrl: src.logoUrl,
        logoWidth: src.logoWidth,
        type: TYPE,
        tones: TONES
    };
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
        if (ov.logo_width) t.logoWidth = ov.logo_width;
        for (var k in (ov.colors || {})) {
            if (Object.prototype.hasOwnProperty.call(ov.colors, k)) t[k] = ov.colors[k];
        }
    }
    return t;
}

/* Every project, defaults merged with whatever is saved. Drives the filter and
 * the project settings screen. */
function allProjects() {
    var out = [];
    for (var k in THEMES) {
        if (Object.prototype.hasOwnProperty.call(THEMES, k)) out.push({ key: k, theme: makeTheme(k) });
    }
    return out;
}

/* Shorthand for a type style, so blocks stay readable. */
function font(t, styleName, color, extra) {
    var s = t.type[styleName];
    return 'font-family:' + t.font + ';' +
           'font-size:' + s.size + ';' +
           'line-height:' + s.line + ';' +
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
