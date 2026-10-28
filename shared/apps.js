/* The tools that live in this repository.
 *
 * This is the only list of them. The launcher reads it to draw its tiles; a tool
 * that wants an "all tools" switcher can read it too. Adding a tool is one entry
 * here plus a folder under apps/ — nothing else has to know it exists.
 *
 *   id    stable slug, matches the folder name under apps/
 *   name  what the tile says
 *   desc  one sentence on what it is for
 *   href  where it lives, relative to the repository root
 *   icon  optional image, relative to the repository root. Without one the tile
 *         shows the first letter of the name.
 *   soon  true while the folder does not exist yet, so the tile is shown but
 *         does not link anywhere
 */
var APPS = [
    {
        id: 'email',
        name: 'Email Kit',
        desc: 'Design transactional email templates and hand them to engineering.',
        href: 'apps/email/',
        icon: 'public/icon_email.png'
    },
    {
        id: 'hiring',
        name: 'Hiring Kit',
        desc: 'Build a custom application funnel for a role and share one public link.',
        href: 'apps/hiring/',
        icon: 'public/icon_hiring.png'
    }
];
