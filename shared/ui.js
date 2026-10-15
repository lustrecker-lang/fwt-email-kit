/* Small interface helpers shared by the tools. Needs shared/ui.css.
 *
 * Everything lives on one global, `UI`, because the tools are classic scripts
 * and loose function names would collide. Nothing here expects markup on the
 * page: toasts and the confirm dialog build their own elements the first time
 * they are used.
 */

var UI = (function () {

    /* Anything that came from a person goes through this before it touches
     * innerHTML. */
    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* Plain text to paragraphs: a blank line starts a new one, a single newline
     * is a line break. Escaped, so it is safe for text typed by an applicant. */
    function paras(text) {
        var s = String(text === undefined || text === null ? '' : text).trim();
        if (!s) return '';
        return s.split(/\n[ \t]*\n/).map(function (p) {
            return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
        }).join('');
    }

    function fmtDate(s) {
        if (!s) return '';
        var d = new Date(s), days = Math.floor((new Date() - d) / 86400000);
        if (days <= 0) return 'today';
        if (days === 1) return 'yesterday';
        if (days < 30) return days + ' days ago';
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    /* A URL-safe slug: lower-case words and hyphens. */
    function slugify(s, max) {
        return String(s || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            .slice(0, max || 60).replace(/-+$/g, '');
    }

    /* ---------------------------------------------------------------- toasts */

    function toast(msg, kind) {
        if (!msg) return;
        var box = document.getElementById('toasts');
        if (!box) {
            box = document.createElement('div');
            box.id = 'toasts';
            box.className = 'toasts';
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            document.body.appendChild(box);
        }
        /* Three at once is already more than anyone reads; drop the oldest. */
        while (box.children.length >= 3) box.removeChild(box.firstChild);

        var el = document.createElement('div');
        el.className = 'toast' + (kind ? ' ' + kind : '');
        el.textContent = msg;

        var gone = false;
        function dismiss() {
            if (gone) return;
            gone = true;
            el.classList.add('out');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
        }
        el.addEventListener('click', dismiss);
        box.appendChild(el);
        setTimeout(dismiss, kind === 'err' ? 6000 : 2400);
    }

    /* --------------------------------------------------------------- confirm */

    /* Never window.confirm: a browser dialog cannot be styled and looks like the
     * page has been hijacked. Resolves true or false, so callers chain on it.
     *
     *   UI.ask({ title: 'Delete this job?', body: '…', yes: 'Delete' }).then(...)
     */
    var dlg = null, pending = null;

    function settle(answer) {
        if (dlg && dlg.open) dlg.close();
        var r = pending;
        pending = null;
        if (r) r(answer);
    }

    function build() {
        dlg = document.createElement('dialog');
        dlg.className = 'narrow';
        dlg.innerHTML =
            '<form class="dlg-form">' +
                '<strong data-t></strong>' +
                '<p data-b></p>' +
                '<div class="dlg-actions">' +
                    '<button type="button" data-no>Cancel</button>' +
                    '<button type="submit" class="primary" data-yes>OK</button>' +
                '</div>' +
            '</form>';
        document.body.appendChild(dlg);
        dlg.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            settle(true);
        });
        dlg.querySelector('[data-no]').addEventListener('click', function () { settle(false); });
        /* Escape closes a <dialog> natively, which would leave the promise
         * hanging and the caller wondering why nothing happened. */
        dlg.addEventListener('cancel', function (e) { e.preventDefault(); settle(false); });
        dlg.addEventListener('close', function () { settle(false); });
    }

    function ask(opts) {
        if (!dlg) build();
        if (pending) settle(false);
        dlg.querySelector('[data-t]').textContent = opts.title || 'Are you sure?';
        dlg.querySelector('[data-b]').textContent = opts.body || '';
        dlg.querySelector('[data-yes]').textContent = opts.yes || 'OK';
        return new Promise(function (resolve) {
            pending = resolve;
            dlg.showModal();
            /* Focus lands on Cancel, so a stray Return does not confirm a delete. */
            dlg.querySelector('[data-no]').focus();
        });
    }

    /* ------------------------------------------------------------- clipboard */

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve) {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            document.body.removeChild(ta);
            resolve();
        });
    }

    /* ------------------------------------------------------------- tooltips */

    /* The small i that explains whatever it sits beside. The text is also its
     * accessible name, so a screen reader gets it without hovering. */
    function tip(text) {
        return '<span class="tip" tabindex="0" role="note" data-tip="' + esc(text) +
            '" aria-label="' + esc(text) + '">i</span>';
    }

    /* Keeps the bubble on screen: centred when there is room, otherwise pinned to
     * whichever edge is close. */
    function placeTip(t) {
        var r = t.getBoundingClientRect(), half = Math.min(260, window.innerWidth - 24) / 2;
        var cx = r.left + r.width / 2;
        t.setAttribute('data-side', cx - half < 12 ? 'left' : cx + half > window.innerWidth - 12 ? 'right' : 'center');
    }

    function tipOf(e) { return e.target && e.target.closest ? e.target.closest('.tip') : null; }

    document.addEventListener('mouseover', function (e) { var t = tipOf(e); if (t) placeTip(t); });
    document.addEventListener('focusin', function (e) { var t = tipOf(e); if (t) placeTip(t); });
    document.addEventListener('click', function (e) {
        var t = tipOf(e);
        Array.prototype.forEach.call(document.querySelectorAll('.tip.open'), function (o) {
            if (o !== t) o.classList.remove('open');
        });
        if (!t) return;
        /* A tip can sit inside a label; tapping it must not tick the box. */
        e.preventDefault();
        placeTip(t);
        t.classList.toggle('open');
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        Array.prototype.forEach.call(document.querySelectorAll('.tip.open'), function (o) { o.classList.remove('open'); });
    });

    /* ------------------------------------------------------------- sortable */

    /* Drag to reorder, the way iOS lists do it: press the grip and the item lifts
     * and follows the pointer, the others slide out of its way, and on release it
     * settles into the gap. Mouse, touch and pen all arrive as Pointer Events.
     * The grip is a button, so the arrow keys move an item one place as well.
     *
     * Delegated from `root`, a container that survives re-rendering. Items are
     * looked up from the grip at the moment it is pressed, so the list can be
     * redrawn freely in between. Nothing is moved in the DOM here: the move is
     * reported through onMove(from, to, item, byKeyboard) and the caller redraws
     * from its own data, which keeps a single source of truth.
     *
     *   opts.items   selector for a reorderable item (siblings of each other)
     *   opts.handle  selector for its grip
     *   opts.onMove  called once, after the item has settled */
    function sortable(root, opts) {
        var drag = null;

        function siblings(item) {
            return Array.prototype.filter.call(item.parentElement.children, function (el) {
                return el.matches(opts.items);
            });
        }

        function scrollerOf(el) {
            for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
                var oy = getComputedStyle(n).overflowY;
                if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
            }
            return document.scrollingElement || document.documentElement;
        }

        function reducedMotion() {
            return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        }

        /* Everything is measured once, at the press, and positions are worked out
         * in that frame of reference. Scrolling during the drag is folded in by
         * how far the scroller has moved since. */
        function layout() {
            var d = drag;
            var dy = d.lastY - d.startY + (d.scroller.scrollTop - d.startScroll);
            var r = d.rects[d.from], room = r.height + d.gap;
            var centre = r.top + r.height / 2 + dy;
            var to = d.from;
            d.list.forEach(function (el, i) {
                if (i === d.from) return;
                var c = d.rects[i].top + d.rects[i].height / 2, shift = 0;
                if (i < d.from && centre < c) { shift = room; to = Math.min(to, i); }
                else if (i > d.from && centre > c) { shift = -room; to = Math.max(to, i); }
                el.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
            });
            d.to = to;
            d.item.style.transform = 'translateY(' + dy + 'px) scale(1.015)';
        }

        /* Near the top or bottom edge the list scrolls by itself, faster the
         * closer the pointer gets, so a long list can be crossed in one drag. */
        function autoScroll() {
            if (!drag) return;
            var s = drag.scroller, top = 0, bottom = window.innerHeight;
            if (s !== document.scrollingElement && s !== document.documentElement) {
                var b = s.getBoundingClientRect(); top = b.top; bottom = b.bottom;
            }
            var edge = 64, y = drag.lastY, v = 0;
            if (y < top + edge) v = -Math.ceil((top + edge - y) / 4);
            else if (y > bottom - edge) v = Math.ceil((y - (bottom - edge)) / 4);
            if (v) {
                var before = s.scrollTop;
                s.scrollTop += Math.max(-16, Math.min(16, v));
                if (s.scrollTop !== before) layout();
            }
            drag.raf = requestAnimationFrame(autoScroll);
        }

        function onPointerMove(e) {
            if (!drag || e.pointerId !== drag.pointerId) return;
            drag.lastY = e.clientY;
            layout();
        }
        function onPointerUp(e) { if (drag && e.pointerId === drag.pointerId) finish(true); }
        function onPointerCancel(e) { if (drag && e.pointerId === drag.pointerId) finish(false); }
        function onEscape(e) { if (drag && e.key === 'Escape') { e.preventDefault(); finish(false); } }

        function finish(commit) {
            var d = drag;
            if (!d) return;
            drag = null;
            cancelAnimationFrame(d.raf);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
            window.removeEventListener('keydown', onEscape, true);

            var to = commit ? d.to : d.from;
            /* Where the gap is, measured in the same frame as the drag. */
            var offset = 0, i;
            if (to > d.from) for (i = d.from + 1; i <= to; i++) offset += d.rects[i].height + d.gap;
            else for (i = to; i < d.from; i++) offset -= d.rects[i].height + d.gap;

            function done() {
                if (d.item.parentElement) d.item.parentElement.classList.remove('sorting');
                d.list.forEach(function (el) { el.style.transform = ''; });
                d.item.classList.remove('sort-lift', 'sort-settle');
                document.body.classList.remove('is-sorting');
                if (to !== d.from) opts.onMove(d.from, to, d.item, false);
            }
            if (reducedMotion()) { done(); return; }
            if (!commit) d.list.forEach(function (el, k) { if (k !== d.from) el.style.transform = ''; });
            d.item.classList.add('sort-settle');
            d.item.style.transform = 'translateY(' + offset + 'px)';
            setTimeout(done, 200);
        }

        root.addEventListener('pointerdown', function (e) {
            var grip = e.target.closest ? e.target.closest(opts.handle) : null;
            if (!grip || !root.contains(grip) || e.button > 0 || drag) return;
            var item = grip.closest(opts.items);
            if (!item) return;
            var list = siblings(item);
            if (list.length < 2) return;
            e.preventDefault();

            var rects = list.map(function (el) { return el.getBoundingClientRect(); });
            var scroller = scrollerOf(item);
            drag = {
                item: item, list: list, rects: rects, from: list.indexOf(item), to: list.indexOf(item),
                gap: Math.max(0, rects[1].top - rects[0].bottom),
                startY: e.clientY, lastY: e.clientY,
                scroller: scroller, startScroll: scroller.scrollTop,
                pointerId: e.pointerId, raf: 0
            };
            try { grip.setPointerCapture(e.pointerId); } catch (x) { /* synthetic or already released */ }
            item.parentElement.classList.add('sorting');
            item.classList.add('sort-lift');
            document.body.classList.add('is-sorting');
            item.style.transform = 'scale(1.015)';
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
            window.addEventListener('keydown', onEscape, true);
            drag.raf = requestAnimationFrame(autoScroll);
        });

        /* The keyboard route: focus a grip, press up or down. */
        root.addEventListener('keydown', function (e) {
            if (drag || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            var grip = e.target.closest ? e.target.closest(opts.handle) : null;
            if (!grip || !root.contains(grip)) return;
            var item = grip.closest(opts.items);
            if (!item) return;
            var list = siblings(item), from = list.indexOf(item);
            var to = from + (e.key === 'ArrowUp' ? -1 : 1);
            e.preventDefault();
            if (to < 0 || to >= list.length) return;
            opts.onMove(from, to, item, true);
        });
    }

    /* A grip, as markup. `label` says what it moves, for screen readers. */
    function grip(kind, label) {
        return '<button type="button" class="grip" data-grip="' + esc(kind) + '" title="Drag to reorder" ' +
            'aria-label="' + esc(label + '. Drag, or use the up and down arrow keys, to reorder.') + '">' +
            '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h10M3 8h10M3 11h10"/></svg></button>';
    }

    /* An on/off switch, as markup: a real checkbox with role="switch" underneath,
     * so it is keyboard- and screen-reader-friendly. `attrs` goes on the input. */
    function toggle(on, label, attrs) {
        return '<span class="switch"><input type="checkbox" role="switch"' + (on ? ' checked' : '') +
            ' aria-label="' + esc(label) + '" ' + (attrs || '') + '><span class="track" aria-hidden="true"></span></span>';
    }

    return {
        esc: esc, paras: paras, fmtDate: fmtDate, slugify: slugify,
        toast: toast, ask: ask, copyText: copyText, tip: tip,
        sortable: sortable, grip: grip, toggle: toggle
    };
})();
