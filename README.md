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
| `apps/email/index.html` | **You.** Sign in, then a workspace of your templates. Build, upload images, save as many as you like. |
| `apps/email/library.html` | **Everyone else.** Browse every saved template, preview it, copy the HTML. Read-only, no sign-in. |

The repository is laid out as a set of internal tools that share one sign-in and
one Supabase project. This README documents the email tool, which is the only
one so far; see [Files](#files) for how the pieces are split.

### The app, in three screens

1. **Login** — the whole editor sits behind it. No account, no access.
2. **Your templates** — a table, one row per template, with a segmented control
   at the top to filter by project. Duplicate or delete from the row;
   **New template** starts a fresh one.
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
python3 -m http.server 4180 --directory ~/Projects/EG/fwt-email-kit
```

Then open <http://localhost:4180> for the composer (the root forwards to
`apps/email/`), or <http://localhost:4180/apps/email/library.html> for the
library.

(Opening the files straight off disk mostly works — the scripts are deliberately
classic, not ES modules — but serve them so the Supabase calls behave.)

---

## Saving, images, and the shared link

**Saving.** First save asks for a project and name; after that **Save** just
saves. Click the name in the header to rename or move it to another project.
Names are unique per project, so saving over an existing name replaces it
rather than piling up duplicates — the templates list warns you before deleting
anything.

**Duplicate** asks where to put the copy, so the same email can be forked into
another project. Copying across projects re-renders the HTML with the
destination's logo, typeface and colours rather than copying it byte for byte,
which would otherwise carry the source branding until somebody hit **Re-render
templates**. The copy always arrives as a draft, and a name that already exists
in the destination is refused rather than saved — because saving upserts on
(project, name), so a clash would overwrite the template you were copying
alongside instead of adding one.

Reopening a template gives you the real thing back, not just its HTML: the block
composition is stored alongside the rendered output, so everything stays
editable.

**Pictures and files.** Expand a section and hit **Upload**, or drag the file
straight onto the slot. It goes to Supabase Storage and comes back as a
permanent public URL, already filled in. Eight places take an upload:

| Where | Takes | Notes |
| --- | --- | --- |
| **Image** section | PNG, JPG, GIF, WebP | The hero picture. |
| **Logo** section | PNG, JPG, GIF, WebP | Overrides the project logo for this one template — a department mark or a campaign lockup. Leave it empty and the project logo is used. |
| **Documents** section | PDF, Word, Excel, CSV, TXT, ZIP, or an image | One file per row. Upload slots appear and disappear with the row count. |
| **Signature** section | PNG, JPG, GIF, WebP | The scanned signature, per email — a letter is signed by whoever decided it. Use a **transparent PNG**; a JPEG arrives as a white rectangle sitting on the card. |
| Stamp in **Projects** | PNG, JPG, GIF, WebP | The official seal, once per organisation. Transparent PNG again. Signature has a toggle to show it beside the sign-off. |
| **Panel** section | PNG, JPG, GIF, WebP | A small square thumbnail above the title, 40–88px. Cropped to a square with a rounded corner. |
| **Two columns** section | PNG, JPG, GIF, WebP | A pictogram above each column's title, 28–56px. Not cropped and not rounded, so line art survives — transparent PNG again. |
| Logo in **Colours** | PNG, JPG, GIF, WebP | Sets the project logo, for every template on that project. |

Upload a document and the row is fixed: it shows the real filename, the real
type and weight (`PDF · 249 KB`), and links to the permanent URL. Leave a slot
empty and all its fields stay merge fields — `{{document_1_name}}`,
`{{document_1_url}}` and so on — so engineering fills them per send. Same with
the Image section: no upload means `{{hero_image_url}}` survives, and one
template can carry a different picture each time.

The **Variables** panel follows this automatically. Bake a file in and its
placeholders drop off the list, because there is nothing left for engineering to
supply.

Limits are 10 MB a file, and the type must be on the list above — both are
enforced by the bucket and checked before upload so you get a sentence rather
than a mime error. **SVG is rejected on purpose**, for pictures at least:
Outlook and several Android clients will not render it. Export a PNG at twice
the display width.

> **Never delete an uploaded file.** Emails already delivered still point at
> that URL — deleting it puts a broken picture in someone's inbox months later,
> or a dead download link on a decision letter. The storage policy deliberately
> grants no delete permission for this reason.
>
> It also means the bucket is public: anyone with the URL can read it. Do not
> upload anything holding one person's data — a named certificate, a statement,
> an ID scan. Those belong behind the app's own authentication, linked from
> `{{document_1_url}}` as a merge field. Upload only what every recipient of the
> template may see: blank forms, guidance notes, logos, pictures.

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

   > **Re-run it on an existing project** to pick up later additions:
   > document upload (the bucket originally allowed images only, at 5 MB, so a
   > PDF came back as a mime error), the `font` column on `project_brands`, and
   > the `status` column on `email_templates` that provides the Draft, Approved
   > and Live workflow (while retaining `is_live` as the legacy Live marker),
   > and the `social` and `stamp_url` columns on `project_brands`. The script is
   > idempotent — `on conflict do update` widens the bucket in place, `add column
   > if not exists` adds the columns, and existing Live / Draft values are carried
   > forward as Live / Draft status without altering the template content.
   >
   > Until `status` exists the template list retains the earlier Live / Draft
   > switch. The first `400` from PostgREST latches the missing column off and
   > re-fetches the list without it, rather than the whole screen failing.
3. **Authentication → Sign In / Providers → Email → turn off "Allow new users to
   sign up".** The policies grant write access to any signed-in user, so leaving
   sign-ups open would let anyone register and edit your templates.
4. **Authentication → Users → Add user** to create your own account.
5. Put the Project URL and the publishable (anon) key in `shared/config.js`.

The publishable key ships in the page source and that is fine — it grants
nothing on its own. Verified: anonymous inserts return `401` and anonymous
uploads return `403`, both blocked by RLS.

Never put a `service_role` or `sb_secret_…` key in `shared/config.js`. Those bypass
every policy, and that file is served to the browser.

---

## Using it

1. **New template** asks which project first, because the project decides the
   logo, typeface and colours every section renders with. Nothing is saved until
   you hit **Save**. It starts from the standard decision-letter layout; delete
   what you do not want.
2. **The dropdown in the editor header** switches to any other saved template,
   grouped by project and marking which ones are live. It asks first if you have
   unsaved changes.
3. **Click a section** on the left to add it to the bottom of the email. Groups
   start folded, so the column opens as a list of headings — click one to open
   it. The search box matches a section's name, its description and a set of
   extra keywords, so `cta`, `hr`, `table` and `attachment` all find the right
   one, and searching looks inside folded groups.
4. **Drag a section by its header row** to move it up or down. A line shows where
   it will land.
5. **Click a section's name** to open its options. They stay closed otherwise —
   most of the time you do not need them. Options are per-instance, so two
   Paragraph blocks can differ. Upload slots live here: click **Upload**, or
   drag a picture or document onto the slot.
6. **Real text / Placeholders** switches between seeing it as a recipient would
   and seeing the raw `{{ }}` template you are about to ship. The filler comes
   from `sample.js` and never ships — see below for why it is not lorem ipsum.
7. **Export** opens both outputs: the **HTML** to paste into SendGrid, and the
   **Merge fields** JSON to pass as `dynamic_template_data`.

Your composition is saved to `localStorage`, so a reload does not lose work.
Access tokens last an hour, but every request refreshes and retries on its own,
so you should never see an expiry. If the refresh token has gone too, the app
signs you out and shows the login form rather than printing `JWT expired` at you.
Saves, upload failures and anything else transient appear as a toast at the
bottom of the screen. Branding is edited from **Projects**, not from inside the
editor — it applies to every template on the project, which is not a thing to
change while you have one open.

Every question the app asks is its own dialog, never `window.confirm`. The one
exception is the browser's own "leave site?" prompt on a hard reload with unsaved
work, which no web page is allowed to restyle.

### Projects

**Add project** creates one from the neutral eGovern palette. A project is just a
row in `project_brands` — the four shipped ones have defaults in `theme.js` and
need no row, anything you add exists only as that row. Which is why deleting an
added project is the same button as resetting a shipped one, and why the button
renames itself to **Delete project** when there are no defaults to fall back to.
Templates filed under a deleted project are not themselves deleted.

The **stamp or seal** is set here, alongside the logo, for the same reason the
social links are: one organisation has one seal, and re-uploading it per template
is how four slightly different scans of it end up in circulation. The Signature
section then has a toggle to show it.

### Live / Draft

Each row in the template list carries a **Live / Draft** switch. Click it to
flip; there is no confirmation because it is one click back.

It is a label, not a deploy. Nothing is sent, synced or published — it records
which templates are the ones in production, so the list stays readable once
there are three near-identical drafts of the same letter. Editing and saving a
live template leaves it live; the flag only moves when you click the switch. The
[shared library](apps/email/library.html) shows it as a read-only badge and counts them in
the header, which is the useful half for anyone you send the link to.

---

## Colour roles

Every theme defines the same nine roles, so any block works under any brand. All
nine are on the project settings screen and edit live; **Reset to defaults**
restores the shipped ones.

Each is a **hex field with the colour shown beside it**, not an
`<input type="color">`. The operating system's colour wheel is the wrong tool for
entering a brand value you already have written down. Type or paste it however
it comes: `#98593e`, `98593e`, `#ABC`, `985` — the hash is optional, three-digit
shorthand is expanded, case and whitespace are cleaned up on blur. A half-typed
value is outlined but changes nothing, so `#98` on its way to `#98593e` never
repaints the email black.

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

## Typeface

Each project picks a font in **Projects → (a project) → Typeface**. The choice
applies to every template in that project; there is no per-email font, for the
same reason there is no per-email colour.

Seven stacks ship, all made of faces already installed on Windows and macOS:

| Choice | Why you'd pick it |
| --- | --- |
| **System** (default) | Matches whatever the recipient is reading on — Segoe on Windows, San Francisco on Apple, Roboto on Android. Never looks dated. |
| **Helvetica / Arial** | The neutral grotesque. Near-identical everywhere, and the safest possible choice. |
| **Verdana** | Wide and open, designed for screens. The most legible at small sizes — worth it where the audience skews older. |
| **Tahoma** | Verdana's narrower sibling. More words per line, nearly as clear. |
| **Trebuchet MS** | Humanist and slightly warmer. Reads less institutional. |
| **Georgia** | A screen serif with real authority. Suits decisions, determinations, anything quasi-legal. |
| **Times New Roman** | Traditional and formal. Reads as a printed letter, which is occasionally the point. |

The settings screen shows a specimen in the actual face and re-renders the live
preview, so you can judge it before saving.

**There is deliberately no option to load a brand web font.** It is not an
oversight, and adding one would make things worse rather than better:

- Gmail ignores a custom font declaration in its web interface, so for most of
  any government mailing list the font would always be the fallback.
- Outlook on Windows renders through the Word engine and never loads a web font
  at all. Given a stack it does not understand, it historically dropped to Times
  New Roman.
- Apple Mail on macOS and iOS renders them properly. Most other major clients —
  Gmail, Outlook, Yahoo — do not.

So a brand font buys you the Apple Mail slice and a second, visually different
email for everyone else. The failure mode is not "unbranded but fine", it is a
serif where you designed a sans. A local stack renders the same everywhere,
which for transactional mail is worth more than the exact typeface.

If a council ever insists, the groundwork is here: the stacks live in one place
and every block already reads the resolved value, so adding a web font means
adding a `url` alongside a stack and emitting a `<link>` in the shell — see
option B in the commit history. Sources:
[Gmail and custom fonts](https://scalero.io/company/blog/email-typography-what-renders-esp-limitations),
[the 2026 support matrix](https://min8t.hashnode.dev/web-safe-fonts-for-email-the-real-support-matrix-in-2026),
[which clients honour web fonts](https://support.omnisend.com/en/articles/1061830-email-safe-fonts).
*Content rephrased for compliance with licensing restrictions.*

### Changing a project's font

Saved templates keep a rendered copy of their HTML alongside the composition, so
the stored copy goes stale when you switch font. Hit **Re-render templates** on
the project settings screen afterwards — same as for a colour change.

### Adding a stack

Append to `FONT_STACKS` in `theme.js` and it appears in project settings with no
further wiring:

```js
palatino: {
    label: 'Palatino (serif)',
    stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
    note: 'Shown under the label on the settings screen.'
}
```

Two rules. **End every stack in a generic family** (`sans-serif` or `serif`), or
a client with none of your faces picks one for you. And **quote any multi-word
family name**, because an unquoted one is invalid in the inline `style`
attribute every block emits.

---

## Logos

Each project sets its own `logoUrl` and `logoWidth` in `theme.js`. Both are
empty by default and fall back to a text wordmark, because **a logo must be an
absolute, publicly reachable `https://` URL** — mail clients cannot resolve
`/images/logo.png`, and most block `data:` URIs in `<img>`.

Uploading through **Colours** or the **Logo** section satisfies that
automatically, since Supabase hands back exactly that kind of URL. Editing the
field by hand is still there if the asset already lives on a CDN.

Three levels, most specific wins: an upload on the **Logo** section beats the
project logo saved in **Colours**, which beats the `logoUrl` shipped in
`theme.js`.

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

All three carry the project's logo, on by default, at footer scale — 44px by
default and as small as 28px. It is there to reassure, not to announce; the logo
at the top of the card already did that. A footer with no mark on it is the shape
of a phishing email, which is exactly the wrong signal on a verification code. If
the project has no logo set, the mark falls back to its name in type rather than
rendering nothing.

**Social links are set per project**, under **Projects → Social links**, not per
email. They are a property of the organisation and the same on every send, so
making them merge fields only created five more things for engineering to pass
correctly. A network with no URL is left out of the footer rather than shipping a
dead link; leave them all blank and the row disappears.

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

### Writing the copy, and handing it over

**edit copy**, on the *This email* column header, is the one place words are
written. Every text slot in the email, grouped by section, in reading order —
followed by the fields that have no slot because they differ per recipient: the
subject line, the preheader, reference numbers, amounts.

The section options panel deliberately has no text fields in it. It is for how a
section is *built* — sizes, alignment, uploads, how many rows. Offering the same
sentence in two places is how two versions of it end up in circulation.

Each slot has one box and, where it makes sense, one choice:

- **Left clear** (the default) — the email still ships `{{email_subtitle}}` and
  your words are recorded as the copy that belongs there. The dev gets both: the
  placeholder to paste, and your sentence to understand what it means.
- **Ships as written** — the words are baked into the template and the merge field
  disappears. For anything that never varies: "What happens next", the
  do-not-reply notice, a button label.

Flipping the tick moves the words between the two rather than losing them, so you
can change your mind freely. Slots with no merge field behind them — the Download
button's label, "Need help?" — say **always shipped** and have no choice to make.

Copy and variables mix in one box, which is the point: `Dear {{first_name}}, your
application of {{applied_on}} was approved.` Typed copy is escaped so a stray `<`
or `&` cannot break the email, and `{{ }}` survives escaping untouched. A blank
line starts a new paragraph.

All of it is saved inside the template's `composition`, which is already `jsonb`,
so none of this needed a migration.

### What the engineer receives

Send them a link to one template: `apps/email/library.html#<template-id>`. Selecting a
template updates the URL, so the address bar is the link.

That page shows three things. **Preview** is the email as intended — the fixed
copy as written and every remaining field standing in for its example value.
**HTML** is the literal template with the handlebars still in it, ready to paste
into SendGrid. **Merge fields** is a table of every variable, the section it
appears in, and its example. Live / Draft says which version is approved.

The **tag button** beside the width toggle turns the preview into a map: every
merge field is highlighted and named where it sits. Without it the table only
reads one way — name to value — and the dev has to find `Amara` in the email and
work out that it means `first_name`. That is tedious across forty-odd fields and
outright impossible where two fields hold the same value, which already happens
by default: `email_subject` and `email_title` are both "Your application has been
approved". The composer has the same view as the middle of its three preview
modes, so whoever writes the copy can check the map before handing it over.

Ten or so fields are link targets and image URLs rather than visible text. A
marker cannot be put inside `href=""` without breaking the document, so those are
not highlighted — the table tags them `link`, `image` or `alt text` instead, which
is also how you know not to go looking for them in the preview.

The section names come from a map built while rendering, saved beside the
examples. Only the composer knows which section produced which fragment; the
shared page has the finished HTML and nothing else, so it has to be told. It is
built on save rather than on every keystroke, and templates saved before it
existed show a dash in that column rather than breaking.

Nothing to interpret, and no second place to go looking for the wording.

### Why the preview copy is not lorem ipsum

The preview exists to prove the layout holds, and layout breaks on the *shape* of
a string, not its meaning. Whether `BBD $150.00` still fits the right-hand column
once the item name runs long. Whether `REF-2026-04817` wraps under its own label
in a Details row. Whether a four-word button label pushes the pill past the
gutter. Latin has no digits, no currency and no dates, so it would hide every one
of those. It also reads as texture rather than language, which means you stop
noticing that a title is two words too long.

So `sample.js` is realistic, but deliberately generic — the copy is shared by
every project and none of it belongs to one agency. The exception is the sender's
identity: `{{org_name}}` and the marketing footer's legal line come from the
project's own brand record via `sampleIdentity()`, so a SmartFinance preview is
signed by SmartFinance. Pass a theme as the second argument to `fillSample()` and
you get that; omit it and you get neutral fallbacks.

**Repeated sections get numbered fields.** Two Paragraph blocks emit
`{{body_text}}` and `{{body_text_2}}`, not the same field twice — otherwise
SendGrid would fill both with identical copy. The Variables panel always shows
the real, suffixed names, so copy from there rather than guessing.

---

## Hiring Kit

A custom application funnel per role, behind one public link, so a hundred
applicants are filtered before anyone is interviewed. Open `apps/hiring/`.

**A role** has a title, a job description and an ordered list of steps. **A step**
is some text, an optional uploaded video, an optional time limit, and any number
of questions. A questionnaire is a step with questions only; a case study is a
step with a brief, a video, a time limit and questions. Applicants must finish each
step before the next unlocks. Drag a step or a question by its grip (≡) to reorder
it; the arrow keys do the same on a focused grip.

**Question types:** short answer, long answer, pick one, link, **GitHub
repository**, **video upload**, and file upload. Every question can carry a line
of help text under it, such as "make the repository public, or invite us".

**Links.** An applicant can write `google.com`, `www.google.com/work` or a full
`https://google.com`; they do not need a scheme. What is checked is that it looks
like a web address, and anything else (`javascript:`, `ftp:`, plain words) is
refused, on the page and again in the database. Links are saved with `https://`
added, so they open as written wherever you see them. A GitHub question must point
at a repository (`github.com/name/project`), not a profile.

**Video.** There is no Loom or other embed any more; videos are uploaded files.
Applicants answer a *Video upload* question by choosing an MP4, MOV or WebM from
their device, with a progress readout. You attach a brief to a step by switching
*Video* on in the step and uploading; switching it off hides the button and drops
the video from the step (switch it back on before saving and it returns). Applicant videos open
from **Applicants** in a player that works from a link good for an hour; an iPhone
`.mov` in a format only Safari plays has an *open or download* fallback.

**File size.** Videos are capped at **50 MB**, because that is the most Supabase
allows a single file on a free project (the project-wide limit applies on top of
each bucket's own, and the smaller wins). That is roughly a minute or two of
phone video. On a paid plan, raise the limit under Storage > Settings first, then
the bucket numbers in `supabase/hiring.sql` and `video.max` in `shared/backend.js`.
Documents are capped at 10 MB. Anything over the limit is refused before the upload
starts, with a sentence naming the limit.

**Timed steps.** Switch *Time limit* on in a step (it starts at 48 hours; 1 to 720)
and the step becomes a one-shot. The applicant first sees a start screen saying how
long they will have and that the clock cannot be paused; nothing about the step is
shown until they press **Start**. Write what goes on that screen in *Before they
start*, under the time limit: what is coming, what to have ready, how to plan the
time. Unlike the step's text, that message is public as soon as the role is open,
so do not put the brief itself in it. From then on the page counts down against
the server's clock, and the step cannot be submitted once the deadline passes.
The deadline is fixed when the clock starts, so editing the limit later does not
move a clock that is already running. An applicant who runs out of time sees a
"time is up" screen. In **Applicants** the row is marked *Clock running* or
*Timed out*, and opening them lets you **give 24 more hours** (from now, if the
clock had already run out). Once a timed step is sent, the applicant cannot go
back to it.

The deadline is enforced by the database, not the page, with two minutes of
grace so that an upload that was in flight when time ran out is not thrown away.
A page that is mid-upload when the clock reaches zero stays open until the upload
finishes; applicants are told on a timed step to start a video with time to spare.
The brief of a timed step is also kept out of what the public can download, so it
cannot be read before the clock starts.

Setting a role to **Open** turns its link on: `apps/hiring/apply.html?job=<link
name>`. **Preview** on the role walks the funnel as an applicant would, including
while it is still a draft, and saves nothing.

An applicant gives a name and email and gets a private link to their own
progress (the address carries a token). They can close the page and return to it.
Finishing the last step marks them **Submitted**. From **Applicants** you read
their answers, open uploaded files, move them through Shortlisted, Interview,
Hired or Rejected, set an interview time, and keep private notes. Scheduling the
interview itself is manual.

Setup: run `supabase/hiring.sql` in the SQL Editor of the same Supabase project as
the email tool. **Run it again whenever it changes**: it is safe to re-run and
brings an older database up to date. The timed steps need the latest version; the
public page will not load a role's steps until it has been run.

**Applicant emails.** An applicant gets two emails on their own, with nobody on
staff pressing anything: one when they start (with their personal link to come
back later) and one when they submit. They are sent by the `hiring-notify` Edge
Function through Resend, at most once each per applicant. Setup:

1. **SQL:** run `supabase/hiring.sql` again (allows the two new kinds in the send
   log, and the index that stops either being sent twice).
2. **Function:** Edge Functions > Deploy a new function > Via editor. Name it
   `hiring-notify`, paste `supabase/functions/hiring-notify/index.ts`, and turn
   **Verify JWT off** (the apply page calls it as an anonymous visitor; the
   function checks the applicant's token itself).
3. **Secrets:** `RESEND_API_KEY` and `HIRING_FROM` as below, plus
   `HIRING_APPLY_URL`, the public `https://` address of `apps/hiring/apply.html`,
   so the first email can link back. Optional: `HIRING_REPLY_TO` (without it the
   emails say the address is not monitored) and `HIRING_COMPANY` (defaults to
   Flying Whale).

**Rejection emails are turned off for now.** Setting someone to **Rejected** just
saves their status — no email, no dialog. The wording lives in one shared
`hiring_templates` row (`{{first_name}}`, `{{name}}` and `{{role}}` filled in per
applicant), not per role, because it is the same letter whichever role it is for.
There is no screen to edit it yet; `HiringApi.getTemplate`/`saveTemplate`/
`sendEmail` and the Edge Function below are in place, but nothing in the UI calls
them until this is switched back on.

Re-enabling it needs: a settings screen (or similar) to edit the one shared
template, and the reject flow wired back up to open a confirmation/send dialog
before saving the status. The pieces to pick that back up are still in
`apps/hiring/api.js` (`getTemplate`, `saveTemplate`, `sendEmail`, `emailLog`) and
`supabase/functions/hiring-email`.

Sending, once wired up again, goes through Resend from a Supabase Edge Function,
because the Resend key is a secret and nothing in this app's own files is.
One-time setup:

1. **Resend:** add and verify your domain (Domains > Add domain, then the DNS
   records it shows). Until then Resend only delivers to your own account address.
2. **SQL:** run `supabase/hiring.sql` again (adds the templates and the send log).
3. **Function:** Supabase Dashboard > Edge Functions > Deploy a new function > Via
   editor. Name it `hiring-email`, paste `supabase/functions/hiring-email/index.ts`,
   keep JWT verification on, and deploy.
4. **Secrets:** Edge Functions > Secrets. Add `RESEND_API_KEY` (your `re_…` key),
   `HIRING_FROM` (e.g. `FWT Hiring <hiring@your-domain.com>`, on the verified
   domain) and, optionally, `HIRING_REPLY_TO`.

The function only emails the applicant's address as stored in the database, never
an address sent from the browser, and only for signed-in staff.

**Privacy.** Unlike the email tool, nothing about applicants is public. They have
no table access at all. The public can read an open role, and reach its steps
only through functions that hand out an outline (timed steps without their
content) or, with the applicant's token, a step they have started. Applicant
documents and videos go to private buckets and are opened through signed links
(five minutes for documents, an hour for video). A step's brief video sits in a
public bucket under a random name, with no way to list it, and its address is only
handed out once the clock has started. The database also checks that an uploaded
file named in an answer lives in that applicant's own folder. Deleting an
applicant deletes their answers and their files. Deleting a role asks first and
says how many applicants go with it; confirming removes the role, its steps and
every applicant with all their answers, files, videos, timers, notes and email
history. To keep the applicants, set the role to Closed instead. A step's brief
video is not removed, as noted under Limits. A step that has answers cannot be
removed from a role.

**Limits.** Documents are up to 10 MB (PDF, Word, TXT, ZIP or an image) and videos
up to 50 MB. A role stops taking applications at 1,000. There is no CAPTCHA, so add
one before sharing a link widely. Video takes storage: delete applicants you no
longer need, which removes their files too. Replacing or removing a step's brief
video does not delete the old file, so clear those out of the `hiring-media` bucket
in the Supabase dashboard from time to time. The time limit starts when
an applicant presses the button, not when you open the role, so someone can look
at a timed step's title and duration and come back to it days later.

---

## Files

Each tool lives in its own folder under `apps/` and loads what it needs from
`shared/` with classic script tags. Still no build step.

| File | What it is |
| --- | --- |
| `index.html` | The launcher: one tile per tool, drawn from `shared/apps.js`. A URL carrying a `#/…` route is forwarded to `apps/email/`, so old bookmarks land on the same template. |
| `shared/apps.js` | The list of tools. Adding one is an entry here plus a folder under `apps/`. |
| `shared/config.js` | Project URL and publishable key. Safe to commit. One Supabase project serves every tool. |
| `shared/backend.js` | Sign-in, token refresh and file upload. Knows nothing about emails; every tool builds on it. Defines `Backend`. |
| `shared/tokens.css` | The colour tokens and dark mode for every tool's own interface. |
| `public/` | Static images. |
| `shared/ui.css`, `shared/ui.js` | Interface primitives for new tools: form controls, app bar, tables, dialogs, toasts, and the `UI` helpers (`toast`, `ask`, `esc`, `paras`, `slugify`). The email page still carries its own inline copy of the CSS. |
| `apps/hiring/index.html`, `app.js` | The hiring tool, staff side: roles, the funnel editor, and the applicant list. See [Hiring Kit](#hiring-kit). |
| `apps/hiring/apply.html` | The public page an applicant uses. Needs no account. |
| `apps/hiring/api.js` | The hiring tool's tables and applicant functions. Defines `HiringApi`. |
| `supabase/functions/hiring-email/index.ts` | The Edge Function that sends staff-triggered applicant emails (rejection) through Resend. Holds no key itself; reads `RESEND_API_KEY` from Supabase secrets. |
| `supabase/functions/hiring-notify/index.ts` | The Edge Function that sends the applicant's own "started" and "submitted" emails, once each. Called from the apply page with the applicant's token. |
| `apps/email/index.html` | The composer. Build, theme, upload, save, export. Nothing brand-specific lives here. |
| `apps/email/library.html` | The shared read-only link. Browse, preview, copy HTML, read merge fields. |
| `apps/email/blocks.js` | **The catalogue.** Every section, plus the document shell and the variable extractor. Edit this to add a section. |
| `apps/email/theme.js` | Colour roles, font stacks, per-project themes, the type scale, layout constants, the social network list, and the block-authoring helpers. |
| `apps/email/sample.js` | Preview filler, and the example values for every merge field. |
| `apps/email/api.js` | The email tool's tables: templates, brands, organisations. Built on `Backend`. Defines `Api`. |
| `supabase/schema.sql` | The email tool's backend: its tables, policies and bucket. |
| `supabase/hiring.sql` | The hiring tool's backend: jobs, steps, applicants, responses, step clocks, the applicant functions and three buckets (documents, applicant videos, brief videos). Run it in the same Supabase project. Unlike the email tables, nothing here is publicly readable except open jobs and their steps. |

The signed-in session is stored under `fwt-tools-session`. A session saved under
the old `egovern-email-kit-session` key is moved across on first load.

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
        showTax:  { label: 'Tax line', type: 'bool', default: true },
        receipt:  { label: 'Attach receipt', type: 'file', default: '',
                    showIf: function (o) { return o.showTax; } }
    },
    render: function (t, o) {
        return '<tr><td class="px" style="' + pad(t, 28) + '">' +
            '<p style="margin:0;' + font(t, 'body', t.text) + '">{{summary_text}}</p>' +
        '</td></tr>';
    }
}
```

Four option types, and one way to hide an option that does not apply:

| `type` | Control | Stored as |
| --- | --- | --- |
| `select` | Dropdown, from `choices` | string |
| `bool` | Checkbox | boolean |
| `image` | Thumbnail + Upload / Replace / clear, and a drop target | URL string |
| `file` | Filename + weight + Upload / Replace / clear, and a drop target | `{ url, name, size }` |

`showIf: function (o) { … }` on any option hides it when it returns false. `o`
is the block's current options, so one control can gate another — that is how
the third file slot on Documents disappears on a two-row list. The value is kept
while hidden, so turning the row back on brings the file back with it.

Helpers that keep blocks consistent:

- `font(t, style, colour, extra)` — emits a full inline font declaration from
  the shared type scale. Styles: `display`, `title`, `heading`, `lead`, `body`,
  `small`, `micro`, `label`.
- `pad(t, top, bottom)` — the standard gutter, so every section lines up.
- `assetUrl(v, placeholder)`, `assetName(v, placeholder)`,
  `assetMeta(v, placeholder)` — read an `image` or `file` option, falling back
  to the placeholder when nothing has been uploaded. Use these rather than
  reading the option directly: they normalise both storage shapes, so a
  composition saved by an older version still opens, and they escape filenames.
- `esc(s)` — HTML-escape anything that came from a filename or a text field.

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

New sample copy for the preview goes in `SAMPLE` in `apps/email/sample.js`.

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
- **No web fonts.** Locally installed faces only — see
  [Typeface](#typeface) below. Custom fonts fail silently in Outlook and Gmail,
  and the fallback is what most people would see anyway.

---

## Scope

This kit produces **HTML for app-triggered mail sent through SendGrid**.

Supabase Auth mail — confirm signup, magic link, password reset — is configured
in the Supabase dashboard and uses Go template syntax (`{{ .ConfirmationURL }}`),
not Handlebars. The sections here still work as a starting point, but the
placeholders need converting by hand.
# fwt-email-kit
