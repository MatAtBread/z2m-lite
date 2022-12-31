"use strict";
const z2mHost = window.location.hostname + ":8080";
const POLLED_REFRESH_SECONDS = 180;
function ui(id) {
    return document.getElementById(id);
}
function notUndefined(x) { return typeof x !== 'undefined'; }
function e(tag, defaults) {
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
const [tr, td, a, div, input, span, block, button] = [e('tr'), e('td'), e('a'), e('div'), e('input'), e('span'), e('div', {
        style: 'display: inline-block'
    }), e('button')];
const featureElement = {
    linkquality: (attrs = {}) => (f, value) => {
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
    binary: (attrs = {}) => (f, value) => {
        let self = block({
            update(v) {
                if (v !== value) {
                    if (typeof value === 'string')
                        if (this.children.namedItem(value))
                            this.children.namedItem(value).disabled = false;
                    value = v;
                    if (this.children.namedItem(v))
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
                attrs.onvalue?.call(self, Object.assign(new Event('value'), { value: op }));
            }
        }, op)));
        return self;
    },
    enum: (attrs = {}) => (f, value) => {
        let self = block({
            update(v) {
                if (v !== value) {
                    if (value !== null)
                        this.children.namedItem(value).disabled = false;
                    value = v;
                    if (this.children.namedItem(v))
                        this.children.namedItem(v).disabled = true;
                }
                return this;
            },
            title: f.description,
            ...attrs
        }, ...f.values.sort() /*.filter(op => ['auto', 'off', value].includes(op))*/.map(op => button({
            id: op,
            disabled: value === op,
            onclick: function () {
                this.disabled = true;
                attrs.onvalue?.call(self, Object.assign(new Event('value'), { value: op }));
            }
        }, op)));
        return self;
    },
    numeric: (attrs = {}) => (f, value) => {
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
    },
    text: (attrs = {}) => (f, value) => {
        return span({
            update(v) {
                if (v !== value) {
                    value = v;
                    this.textContent = value;
                }
                return this;
            },
            ...attrs
        }, value || '');
    }
};
function logMessage(message) {
    const log = div(message);
    ui('log')?.append(log);
    setTimeout(() => log.remove(), 15000);
}
window.onload = () => {
    const propertyColumns = {
        linkquality: featureElement.linkquality(),
        friendly_name: (f, value, d) => featureElement.text({
            onclick: async () => {
                if (d.features.preset && d.features.system_mode && confirm("Reset " + d.device.friendly_name + "?")) {
                    d.api("set", { 'preset': 'comfort' });
                    d.api("set", { 'system_mode': "off" });
                    d.api("set", { 'system_mode': "auto" });
                }
            }
        })(f, value),
        state: (f, value, d) => featureElement.binary({
            onvalue(ev) { d.api("set", { 'state': ev.value }); }
        })(f, value),
        system_mode: (f, value, d) => featureElement.enum({
            onvalue(ev) {
                d.api("set", { 'system_mode': ev.value });
                if (ev.value !== 'off')
                    d.api("set", { 'preset': 'comfort' });
            }
        })(f, value),
        local_temperature: featureElement.numeric(),
        current_heating_setpoint: featureElement.numeric(),
        position: featureElement.numeric()
    };
    class UIDevice {
        constructor(device) {
            this.device = device;
            this.features = { friendly_name: { type: 'text', name: 'friendly_name', property: 'friendly_name', description: 'Device name' } };
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
            this.element = tr({ id: device.friendly_name }, device.friendly_name === "Coordinator"
                ? td({ colSpan: 6 }, button({
                    id: 'manage',
                    onclick() { window.open('http://' + z2mHost + '/', 'manager'); }
                }, 'Manage devices'))
                : undefined);
            devices.set(device.friendly_name, this);
        }
        update(payload) {
            for (const property of Object.keys(propertyColumns)) {
                const value = property === 'friendly_name' ? this.device.friendly_name : payload[property];
                const feature = this.features[property];
                if (value !== undefined && feature) {
                    let e = this.element.children.namedItem(property);
                    if (!e) {
                        e = propertyColumns[property](feature, (feature.access || 0) & 6 ? value : null, this) || null;
                        if (e) {
                            e = td({ id: property }, e);
                            this.element.append(e);
                        }
                    }
                    e?.firstElementChild?.update(value);
                }
            }
            return true;
        }
        api(subCommand, payload) {
            z2mApi.send(this.device.friendly_name + (subCommand ? '/' + subCommand : ''), payload);
        }
    }
    const devices = new Map();
    class Z2MConnection {
        constructor(onmessage) {
            this.onmessage = onmessage;
            this.socket = null;
            ui('reconnect').onclick = () => this.connect();
            this.connect();
        }
        connect() {
            ui('reconnect').style.display = 'none';
            this.socket = new WebSocket("ws://" + z2mHost + "/api");
            this.socket.onerror = () => this.promptReconnect();
            this.socket.onclose = () => this.promptReconnect();
            this.socket.onmessage = (ev) => this.onmessage(ev);
        }
        promptReconnect() {
            if (this.socket) {
                this.socket.onclose = this.socket.onerror = null;
                this.socket.close();
                this.socket = null;
            }
            ui('reconnect').style.display = 'inline-block';
        }
        send(topic, payload) {
            try {
                this.socket.send(JSON.stringify({ topic, payload }));
            }
            catch (ex) {
                this.promptReconnect();
            }
        }
    }
    const z2mApi = new Z2MConnection(m => {
        const { topic, payload } = JSON.parse(m.data);
        const subTopic = topic.split('/');
        if (topic === 'bridge/devices') {
            for (const device of devices.values()) {
                device.element.style.opacity = "0.5";
            }
            payload.sort((a, b) => {
                return a.friendly_name === "Coordinator" ? 1 :
                    b.friendly_name === "Coordinator" ? -1 :
                        a.friendly_name < b.friendly_name ? -1 :
                            a.friendly_name > b.friendly_name ? 1 : 0;
            });
            for (const device of payload) {
                const exists = devices.get(device.friendly_name);
                const elt = (exists || new UIDevice(device)).element;
                elt.style.opacity = "";
                ui('devices')?.append(elt);
            }
        }
        else if (topic === 'bridge/state') {
            switch (payload.state) {
                case 'offline':
                    z2mApi.promptReconnect();
                    break;
                case 'online':
                    ui('reconnect').style.display = 'none';
                    break;
                default:
                    console.log("BRIDGE MESSAGE", topic, payload);
                    break;
            }
        }
        else if (topic === 'bridge/logging') {
            if (payload.level === 'warn' || payload.level === 'error') {
                logMessage(payload.message);
            }
        }
        else if (topic === 'bridge/log') {
        }
        else if (topic === 'bridge/config') {
        }
        else if (topic === 'bridge/info') {
        }
        else if (devices.get(subTopic[0]) && subTopic[1] === 'availability') {
            devices.get(subTopic[0]).element.style.opacity = payload.state === 'online' ? "1" : "0.5";
        }
        else if (typeof payload === 'object' && payload && !devices.get(topic)?.update(payload)) {
            console.log("OTHER MESSAGE", topic, payload);
        }
    });
    // @ts-ignore
    window.z2mApi = z2mApi;
};
