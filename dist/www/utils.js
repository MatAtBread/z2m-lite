export function ui(id) {
    return document.getElementById(id);
}
export function log(x) { console.log(x); return x; }
export function notUndefined(x) { return typeof x !== 'undefined'; }
export function e(tag, defaults) {
    return (attrs, ...children) => {
        const e = document.createElement(tag);
        if (defaults)
            Object.assign(e, defaults);
        if (typeof attrs === 'object' && !(attrs instanceof Node)) {
            Object.assign(e, attrs);
            if (children)
                e.append(...children.filter(notUndefined));
        }
        else {
            if (children)
                e.append(...[attrs, ...children].filter(notUndefined));
            else if (typeof attrs !== 'undefined')
                e.append(attrs);
        }
        return e;
    };
}
export function dataApi(query) {
    return fetch("/data?" + encodeURIComponent(JSON.stringify(query))).then(res => res.json());
}
