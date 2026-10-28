/* Light/dark control, shared by every page in the repo.
 *
 * Three states: Light, Dark, and Auto (the system's own preference, which is
 * what every page did before this existed). The choice is saved once and
 * read back on every page, so switching tools does not reset it.
 *
 * Applying the attribute happens the moment this file runs — before the body
 * is parsed — so the page never paints in the wrong theme and then flips.
 * The footer itself, which needs somewhere to attach to, waits for the DOM.
 */
(function () {
    var KEY = 'fwt-tools-theme';
    var root = document.documentElement;

    function stored() {
        try {
            var v = localStorage.getItem(KEY);
            return (v === 'light' || v === 'dark') ? v : 'auto';
        } catch (e) { return 'auto'; }
    }

    function apply(theme) {
        if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
        else root.removeAttribute('data-theme');
    }

    function set(theme) {
        try {
            if (theme === 'auto') localStorage.removeItem(KEY);
            else localStorage.setItem(KEY, theme);
        } catch (e) { /* private browsing, etc. — the choice just will not persist */ }
        apply(theme);
        paint();
    }

    apply(stored());

    /* --------------------------------------------------------------- icon */
    /* One button, one icon, no label: Light -> Dark -> Auto -> Light on each
     * click. The icon shows the mode that is currently active (what Auto
     * resolves to counts as itself, since that is what the screen looks
     * like), and the title names the mode and what clicking does next. */
    var ICONS = {
        light: '<circle cx="8" cy="8" r="3.2"/><path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M3.5 12.5l1.2-1.2M11.3 4.7l1.2-1.2"/>',
        dark: '<path d="M13.8 9.3A5.6 5.6 0 016.7 2.2a5.6 5.6 0 107.1 7.1z"/>',
        auto: '<circle cx="8" cy="8" r="6.2"/><path d="M8 1.8a6.2 6.2 0 000 12.4z" fill="currentColor" stroke="none"/>'
    };
    var NEXT = { light: 'dark', dark: 'auto', auto: 'light' };
    var LABEL = { light: 'Light', dark: 'Dark', auto: 'Auto (follows system)' };

    var btn = null;

    function paint() {
        if (!btn) return;
        var current = stored();
        btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + ICONS[current] + '</svg>';
        btn.title = 'Theme: ' + LABEL[current] + '. Click for ' + LABEL[NEXT[current]] + '.';
        btn.setAttribute('aria-label', btn.title);
    }

    function build() {
        if (document.getElementById('fwtTheme')) return;
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'fwtTheme';
        btn.addEventListener('click', function () { set(NEXT[stored()]); });
        document.body.appendChild(btn);
        paint();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();
