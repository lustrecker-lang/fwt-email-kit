# eGovern Email Kit

A shared transactional-email design system for every eGovern product — `nursing`,
`one-gov`, `smart-finance`, `smart-finance-admin` and `concessions-frontend`.

One layout, one set of sections. You compose an email by stitching sections
together in the browser, then paste the result into a SendGrid dynamic template.

Deliberately **no build step and no dependencies** — plain files that run
anywhere, so it does not drag a toolchain into five repos that share nothing.
Templates and uploaded images live in a small Supabase project; even that is
reached with plain `fetch`, not an SDK.

Two pages:

| Page | Who it's for |
| --- | --- |
| `index.html` | **You.** Sign in, then a workspace of your templates. Build, upload images, save as many as you like. |
| `library.html` | **Everyone else.** Browse every saved template, preview it, copy the HTML. Read-only, no sign-in. |

### The app, in three screens

1. **Login** — the whole editor sits behind it. No account, no access.
2. **Your templates** — everything you've saved, grouped by project, searchable.
   Duplicate or delete from the row; **New template** starts a fresh one.
3. **Editor** — the composer. Back arrow returns to the list; the template name
   sits in the header and opens rename/project when clicked.

The URL tracks where you are (`#/`, `#/new`, `#/t/<id>`), so a template is
bookmarkable and a refresh puts you back where you were. Unsaved work is held in
`localStorage` as a crash-guard and the tab warns before you close it dirty.

---

## The design language

Modern transactional mail, in the Airbnb mould:

- **A light grey canvas with one white card**, no border, 16px corners. On
  mobile the card goes full-bleed and square.
- **Generous whitespace.** 40px gutters on desktop, 24px on mobile, and real
  vertical rhythm between sections.
- **Hairlines, not boxes.** Details and document rows are separated by 1px
  rules. Nothing gets a border unless it earns one.
- **One saturated colour per email** — the CTA. Everything else is text,
  muted text, or a wash.
- **Large, tightly tracked headings** (30px display) over 16px body copy.
  The old 13px transactional habit reads as cramped next to modern senders.
- **Flat status tints** with no border, so a callout reads as part of the page
  rather than a bootstrap alert.

---

## Running it

```bash
python3 -m http.server 4180 --directory ~/Projects/egovern-email-kit
```

Then open <http://localhost:4180> for the composer, or
<http://localhost:4180/library.html> for the library.

(Opening the files straight off disk mostly works — the scripts are deliberately
classic, not ES modules — but serve them so the Supabase calls behave.)

---

## Saving, images, and the shared link

**Saving.** First save asks for a project and name; after that **Save** just
saves. Click the name in the header to rename or move it to another project.
Names are unique per project, so saving over an existing name replaces it
rather than piling up duplicates — the templates list warns you before deleting
anything.

Reopening a template gives you the real thing back, not just its HTML: the block
composition is stored alongside the rendered output, so everything stays
editable.

**Images.** Add an Image section, expand it, hit **Upload**. The file goes to
Supabase Storage and comes back as a permanent public URL, already filled in.
The logo field in **Colours** has the same upload button.

Leave an Image section's upload empty and it keeps `{{hero_image_url}}` as a
merge field instead, so one template can carry a different picture per send.

> **Never delete an uploaded image.** Emails already delivered still point at
> that URL — deleting it puts a broken picture in someone's inbox months later.
> The storage policy deliberately grants no delete permission for this reason.

**Signing in.** Reading is open to everyone. You are only asked to sign in the
first moment you try to save or upload, and the session persists after that.

**The shared link.** `library.html` needs no sign-in and cannot write anything —
the security policy allows anonymous `SELECT` and nothing else. Deploy the
folder to any static host (Vercel, Netlify, Cloudflare Pages) and share the URL.
Anyone can browse, preview and copy HTML; nobody but you can change it.

Bear in mind "open link" means genuinely open — every piece of transactional
copy across all four services, publicly reachable. Both Vercel and Netlify have
one-toggle password protection if you would rather it were not.

---

## Supabase setup

Already done for this project, but for the record — or to stand up a second one:

1. Create a Supabase project.
2. Paste [supabase/schema.sql](supabase/schema.sql) into the SQL Editor and run
   it. That creates the `email_templates` table, the row-level security
   policies, and the public `email-assets` bucket.
3. **Authentication → Sign In / Providers → Email → turn off "Allow new users to
   sign up".** The policies grant write access to any signed-in user, so leaving
   sign-ups open would let anyone register and edit your templates.
4. **Authentication → Users → Add user** to create your own account.
5. Put the Project URL and the publishable (anon) key in `config.js`.

The publishable key ships in the page source and that is fine — it grants
nothing on its own. Verified: anonymous inserts return `401` and anonymous
uploads return `403`, both blocked by RLS.

Never put a `service_role` or `sb_secret_…` key in `config.js`. Those bypass
every policy, and that file is served to the browser.

---

## Using it

1. **Pick a project** in the toolbar. Colours and logo swap; the layout does not.
2. **Start from** a preset, or build from nothing.
3. **Click a section** on the left to add it to the bottom of the email.
4. **Drag the ⠿ handle** to move a section up or down. A blue line shows where
   it will land.
5. **Click a section's name** to open its options. They stay closed otherwise —
   most of the time you do not need them. Options are per-instance, so two
   Paragraph blocks can differ.
6. **Real text / Placeholders** switches between seeing it as a recipient would
   and seeing the raw `{{ }}` template you are about to ship.
7. **Export** opens both outputs: the **HTML** to paste into SendGrid, and the
   **Merge fields** JSON to pass as `dynamic_template_data`.

Your composition is saved to `localStorage`, so a reload does not lose work.

---

## Colour roles

Every theme defines the same nine roles, so any block works under any brand.
Open **Colours** to edit them live; **reset** restores the project defaults.

Three are shown up front — **CTA / brand**, **Page background** and **Text** —
because those are the ones anyone actually changes. The remaining six sit behind
**More colours**.

| Role | What it drives |
| --- | --- |
| `brand` | **The CTA.** Buttons, links, accents. The only saturated colour. |
| `brandText` | Text sitting on the brand colour |
| `brandSoft` | Washed brand tint for soft panels and step numerals |
| `pageBg` | The canvas behind the card |
| `cardBg` | The email body itself |
| `text` | Headings and body copy |
| `textMuted` | Secondary copy, labels, footers |
| `hairline` | Dividers and row separators |
| `surface` | Neutral panels and cards-within-cards |

Project defaults are taken from each app's real brand tokens:

| Project | Source | CTA colour |
| --- | --- | --- |
| one-gov | `--brand-primary` (navy) | `#23395d` |
| smart-finance / admin | `--primary` oklch | `#00267f` |
| nursing | `--brand-primary` (coral `#d3b0a1`) | `#98593e` |
| eGovern neutral | — | `#222222` |

> Nursing's brand coral is far too pale to carry white button text, so the CTA
> uses a deepened version of the same hue and the pale original becomes
> `brandSoft`. If the council insists on the literal coral, change `brandText`
> to a dark ink rather than shipping white-on-pale.

---

## Logos

Each project sets its own `logoUrl` and `logoWidth` in `theme.js`. Both are
empty by default and fall back to a text wordmark, because **a logo must be an
absolute, publicly reachable `https://` URL** — mail clients cannot resolve
`/images/logo.png`, and most block `data:` URIs in `<img>`.

The assets exist in the repos already and need re-hosting on a public bucket or
CDN before they will render:

| Project | Asset in repo |
| --- | --- |
| nursing | `nursing/public/images/NursePortalLogo.svg` |
| one-gov | `one-gov/public/transparentlogo.png`, `public/assets/crest.svg` |
| smart-finance-admin | `smart-finance-admin/public/transparentlogo.png` |

Prefer PNG over SVG — Outlook and several Android clients will not render SVG.
Export at 2× the display width for retina.

---

## Footers: pick the right one

This is a legal distinction, not a style one.

| Block | Use for | Includes |
| --- | --- | --- |
| **Transactional footer** | Receipts, decisions, resets, verifications — mail triggered by something the recipient did | Sender identity, postal address, do-not-reply notice, help/privacy links. **No unsubscribe.** |
| **Marketing footer** | Newsletters, campaigns, anything bulk | Social links, postal address, why-you-got-this line, **unsubscribe + preferences + privacy** |
| **Minimal footer** | Very short system mail, like a verification code, where a full footer would outweigh the message | One line: org name and address |

Putting an unsubscribe link on genuinely transactional mail invites people to
opt out of messages they need. Putting bulk mail out *without* one breaches
CAN-SPAM and most equivalents.

---

## Handing off to engineering

SendGrid dynamic templates use Handlebars, so the `{{ variable }}` placeholders
work natively — no conversion step.

1. SendGrid → **Email API → Dynamic Templates → Create Template → Code Editor**.
2. Paste the output of **Copy for SendGrid**.
3. Send with the merge fields from the **Variables** panel:

```js
await sgMail.send({
  to: nurse.email,
  from: { email: 'noreply@nursingcouncil.gov.bb', name: 'Barbados Nursing Council' },
  templateId: 'd-xxxxxxxxxxxxxxxx',
  dynamicTemplateData: {
    first_name: nurse.first_name,
    email_title: 'Your application has been approved',
    detail_1_label: 'Registration number',
    detail_1_value: nurse.registration_number,
    // …everything the Variables panel listed
  },
});
```

Any placeholder you do not supply renders as literal `{{ }}` text in the
delivered email, so treat the Variables list as a required checklist.

**Repeated sections get numbered fields.** Two Paragraph blocks emit
`{{body_text}}` and `{{body_text_2}}`, not the same field twice — otherwise
SendGrid would fill both with identical copy. The Variables panel always shows
the real, suffixed names, so copy from there rather than guessing.

---

## Files

| File | What it is |
| --- | --- |
| `index.html` | The composer. Build, theme, upload, save, export. Nothing brand-specific lives here. |
| `library.html` | The shared read-only link. Browse, preview, copy HTML, read merge fields. |
| `blocks.js` | **The catalogue.** Every section, plus the document shell and the variable extractor. Edit this to add a section. |
| `theme.js` | Colour roles, per-project themes, the type scale, layout constants and status tones. |
| `api.js` | Supabase access — auth, templates, image upload. Plain `fetch`, no SDK. |
| `config.js` | Project URL and publishable key. Safe to commit. |
| `supabase/schema.sql` | The whole backend: one table, its policies, one bucket. |

---

## Adding a section

Append an entry to `BLOCKS` in `blocks.js`. It appears in the palette
automatically — there is no registry to update.

```js
{
    id: 'payment-summary',
    name: 'Payment summary',
    group: 'Content',
    desc: 'Shown in the palette under the name.',
    opts: {
        currency: { label: 'Currency', type: 'select', choices: ['BBD', 'USD'], default: 'BBD' },
        showTax:  { label: 'Tax line', type: 'bool', default: true }
    },
    render: function (t, o) {
        return '<tr><td class="px" style="' + pad(t, 28) + '">' +
            '<p style="margin:0;' + font(t, 'body', t.text) + '">{{summary_text}}</p>' +
        '</td></tr>';
    }
}
```

Two helpers keep blocks consistent:

- `font(t, style, colour, extra)` — emits a full inline font declaration from
  the shared type scale. Styles: `display`, `title`, `heading`, `lead`, `body`,
  `small`, `micro`, `label`.
- `pad(t, top, bottom)` — the standard gutter, so every section lines up.

Four rules, and the system holds together:

- **Return exactly one `<tr>`.** That contract is what lets any sequence of
  sections stitch into a valid document without the composer knowing anything
  about them.
- **Put `class="px"` on padded content cells.** The mobile media query tightens
  every gutter through that one hook.
- **Never hardcode a colour, size or spacing value** — read from `t`. A
  hardcoded value is a section that breaks the moment someone switches project.
- **Content is `{{ placeholders }}`,** never literal copy. The variable list is
  derived from the rendered HTML by regex, so a new placeholder shows up in the
  Variables panel with no extra wiring.

New sample copy for the preview goes in `SAMPLE` in `index.html`.

---

## Why the HTML looks dated

Email HTML is not web HTML, and the constraints are not optional:

- **Tables for layout.** Outlook renders through Word's engine; flex and grid do
  not exist there.
- **Inline styles.** Gmail strips `<style>` blocks in several contexts. The one
  in the shell carries the mobile media query only, and every layout is correct
  without it.
- **Bulletproof buttons.** The CTA is a table with a background colour and a
  padded `<a>` inside, because Outlook ignores padding on an anchor.
- **600px.** The long-standing safe width; the shell goes fluid under 620px.
- **102 KB.** Gmail clips past roughly this, hiding your footer behind a "View
  entire message" link. The composer shows live document size and warns before
  you cross it. A typical composition lands near 10 KB.
- **No web fonts.** The stack is system-native. Custom fonts fail silently in
  Outlook and Gmail's app, and the fallback is what most people will see anyway.

---

## Scope

This kit produces **HTML for app-triggered mail sent through SendGrid**.

Supabase Auth mail — confirm signup, magic link, password reset — is configured
in the Supabase dashboard and uses Go template syntax (`{{ .ConfirmationURL }}`),
not Handlebars. The sections here still work as a starting point, but the
placeholders need converting by hand.
# fwt-email-kit
