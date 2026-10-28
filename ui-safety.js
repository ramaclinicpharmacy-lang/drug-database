/* Shared HTML rendering helpers. Database text must be escaped before interpolation. */
(function () {
    'use strict';
    const pendingActions = new Map();
    let nextAction = 0;
    let cleanupScheduled = false;

    function encodeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function textWithBreaks(value) {
        return encodeHTML(value).replace(/\r\n?|\n/g, '<br>');
    }

    function safeURL(value) {
        const text = String(value ?? '').trim();
        if (!text) return '';
        try {
            const url = new URL(text, window.location.href);
            return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
        } catch (_) { return ''; }
    }

    // Keep arguments in closures, never inside executable HTML attributes.
    // setHTML consumes the registrations synchronously after inserting the markup.
    function bindHTMLAction(type, callback) {
        if (!/^[a-z]+$/.test(type)) throw new Error('Invalid event type');
        const token = String(++nextAction);
        pendingActions.set(token, { type, callback });
        if (!cleanupScheduled) {
            cleanupScheduled = true;
            queueMicrotask(() => {
                pendingActions.clear(); // Release actions from fragments that were not inserted.
                cleanupScheduled = false;
            });
        }
        return `data-rama-bind-${type}="${token}"`;
    }

    function setHTML(element, markup) {
        element.innerHTML = markup;
        if (!pendingActions.size) return markup;
        const selectors = [...new Set([...pendingActions.values()].map(action =>
            `[data-rama-bind-${action.type}]`
        ))].join(',');
        for (const node of element.querySelectorAll(selectors)) {
            for (const attribute of [...node.attributes]) {
                if (!attribute.name.startsWith('data-rama-bind-')) continue;
                const action = pendingActions.get(attribute.value);
                node.removeAttribute(attribute.name);
                if (!action || attribute.name !== `data-rama-bind-${action.type}`) continue;
                pendingActions.delete(attribute.value);
                node.addEventListener(action.type, function (event) {
                    if (action.callback.call(this, event) === false) event.preventDefault();
                }, { once: action.type === 'error' });
            }
        }
        return markup;
    }

    // Changelog entries intentionally contain formatting. All other database text is plain text.
    function safeRichHTML(value) {
        if (!window.DOMPurify || !window.DOMPurify.isSupported) return textWithBreaks(value);
        return window.DOMPurify.sanitize(String(value ?? ''), {
            ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'span', 'div', 'a', 'code', 'pre', 'blockquote'],
            ALLOWED_ATTR: ['href', 'title', 'class', 'style', 'target', 'rel'],
            ALLOW_DATA_ATTR: false,
            ALLOW_ARIA_ATTR: false,
            SANITIZE_NAMED_PROPS: true
        });
    }

    Object.assign(window, { encodeHTML, textWithBreaks, safeURL, bindHTMLAction, setHTML, safeRichHTML });
})();
