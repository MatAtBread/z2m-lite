"use strict";
const z2mHost = window.location.hostname + ":8080";
const POLLED_REFRESH_SECONDS = 180;
function ui(id) {
    return document.getElementById(id);
}
function e(tag, defaults) {
    return (attrs, ...children) => {
        const e = document.createElement(tag);
        if (defaults)
            Object.assign(e, defaults);
        if (typeof attrs === 'object' && !(attrs instanceof Node)) {
            Object.assign(e, attrs);
            if (children)
                e.append(...children);
        }
        else {
            if (children)
                e.append(attrs, ...children);
            else
                e.append(attrs);
        }
        return e;
    };
}
const [tr, td, a, div, input, span, block, button] = [e('tr'), e('td'), e('a'), e('div'), e('input'), e('span'), e('div', {
        style: 'display: inline-block'
    }), e('button')];
const featureElement = {
    linkquality: (f, d, value, attrs = {}) => {
        return span({
            update(v) {
                if (v !== value) {
                    value = v;
                    this.style.opacity = `${value / f.value_max}`;
                }
                return this;
            },
            ...attrs
        }, '\uD83D\uDCF6');
    },
    binary(f, d, value, attrs = {}) {
        return block({
            update(v) {
                if (v !== value) {
                    if (typeof value === 'string')
                        this.children.namedItem(value).disabled = false;
                    value = v;
                    this.children.namedItem(v).disabled = true;
                }
                return this;
            },
            title: f.description,
            ...attrs
        }, ...[f.value_off, f.value_on].map(op => button({
            id: op,
            disabled: value === op,
            onclick: function () {
                this.disabled = true;
                d.api("set", { 'state': op });
            }
        }, op)));
    },
    enum(f, d, value, attrs = {}) {
        return block({
            update(v) {
                if (v !== value) {
                    if (value !== null)
                        this.children.namedItem(value).disabled = false;
                    value = v;
                    this.children.namedItem(v).disabled = true;
                }
                return this;
            },
            title: f.description,
            ...attrs
        }, ...f.values.sort().filter(op => ['comfort', 'eco', value].includes(op)).map(op => button({
            id: op,
            disabled: value === op,
            onclick: function () {
                this.disabled = true;
                d.api("set", { 'preset': op });
            }
        }, op)));
    },
    numeric(f, d, value, attrs = {}) {
        return span({
            update(v) {
                if (v !== value) {
                    value = v;
                    this.textContent = value + f.unit;
                }
                return this;
            },
            ...attrs
        }, value + f.unit);
    }
};
const propertyColumns = {
    linkquality: featureElement.linkquality,
    state: featureElement.binary,
    preset: featureElement.enum,
    local_temperature: featureElement.numeric,
    current_heating_setpoint: (f, d, value) => featureElement.numeric(f, d, value, { style: "color: #4f4" }),
    position: featureElement.numeric
};
class UIDevice {
    constructor(device) {
        this.device = device;
        this.delayedRefresh = 0;
        this.features = {};
        if (device.definition?.exposes?.length)
            for (const f of device.definition.exposes) {
                const assignFeature = (f) => this.features[f.property] = f;
                if ('features' in f) {
                    f.features.forEach(assignFeature);
                }
                else {
                    assignFeature(f);
                }
            }
        this.element = tr({ id: device.friendly_name }, td({ id: 'name' /*, style: 'white-space: nowrap;'*/ }, device.friendly_name), td({ id: 'value', style: 'white-space: nowrap;' }, device.friendly_name === "Coordinator"
            ? button({
                id: 'manage',
                onclick() { window.open('http://' + z2mHost + '/', 'manager'); }
            }, 'Manage...')
            : ''));
        devices.set(device.friendly_name, this);
    }
    update(payload) {
        for (const property of Object.keys(propertyColumns)) {
            const value = payload[property];
            const feature = this.features[property];
            if (value !== undefined && feature) {
                let e = this.element.children.namedItem('value').children.namedItem(property);
                if (!e) {
                    e = propertyColumns[property](feature, this, (feature.access || 0) & 6 ? value : null) || null;
                    if (e) {
                        e.id = property;
                        this.element.children.namedItem('value').append(e);
                    }
                }
                e?.update(value);
            }
        }
        return true;
    }
    api(subCommand, payload) {
        z2mApi.send(this.device.friendly_name + (subCommand ? '/' + subCommand : ''), payload);
    }
}
const devices = new Map();
function promptReconnect() {
    document.getElementById('reconnect')?.remove();
    document.body.append(a({ id: 'reconnect', onclick() { window.location.reload(); } }, 'Bridge offline. Click to re-connect'));
}
class Z2MConnection {
    constructor(onmessage) {
        this.socket = new WebSocket("ws://" + z2mHost + "/api");
        this.socket.onerror = () => { promptReconnect(); };
        this.socket.onopen = () => this.socket.onmessage = onmessage;
    }
    send(topic, payload) {
        try {
            this.socket.send(JSON.stringify({ topic, payload }));
        }
        catch (ex) {
            promptReconnect();
        }
    }
}
const z2mApi = new Z2MConnection(m => {
    const { topic, payload } = JSON.parse(m.data);
    const subTopic = topic.split('/');
    if (topic === 'bridge/devices') {
        ui('devices').innerHTML = '';
        devices.clear();
        payload.sort((a, b) => {
            return a.friendly_name === "Coordinator" ? 1 :
                b.friendly_name === "Coordinator" ? -1 :
                    a.friendly_name < b.friendly_name ? -1 :
                        a.friendly_name > b.friendly_name ? 1 : 0;
        });
        for (const device of payload) {
            ui('devices')?.append(new UIDevice(device).element);
        }
    }
    else if (topic === 'bridge/state') {
        if (payload === 'offline') {
            promptReconnect();
        }
        else if (payload === 'online') {
            document.getElementById('reconnect')?.remove();
        }
        else if (payload === 'logging') {
        }
        else
            console.log("BRIDGE MESSAGE", topic, payload);
    }
    else if (topic === 'bridge/logging') {
        // 
    }
    else {
        if (typeof payload === 'object' && payload && !devices.get(topic)?.update(payload))
            console.log("OTHER MESSAGE", topic, payload);
    }
});
