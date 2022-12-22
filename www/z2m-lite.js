"use strict";
const z2mHost = window.location.hostname + ":8080";
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
const [tr, td, a, div, input, span, block] = [e('tr'), e('td'), e('a'), e('div'), e('input'), e('span'), e('div', {
        style: 'display: inline-block'
    })];
const control = {
    linkquality(value, f, d) {
        if (typeof value === 'number')
            return span({
                update(v) {
                    //if (v !== value) {
                    value = v;
                    this.style.opacity = `${value / f.value_max}`;
                    //}
                    return this;
                },
            }, '\uD83D\uDCF6').update(value);
    },
    local_temperature(value, f, d) {
        return span({
            update(v) {
                if (v !== value) {
                    value = v;
                    this.textContent = `${value}+${f.unit}`;
                }
                return this;
            },
        }, value + f.unit);
    },
    state(value, f, d) {
        return span({
            update(v) {
                if (v !== value) {
                    value = v;
                    this.children[0].checked = Boolean(value === f.value_on);
                }
                return this;
            }
        }, input({
            type: 'checkbox',
            checked: Boolean(value === f.value_on),
            onclick: function () {
                this.disabled = true;
                api.send(JSON.stringify({ topic: d.friendly_name + "/set", payload: { 'state': this.checked ? f.value_on : f.value_off } }));
            }
        }), f.description);
    },
    preset(value, f, d) {
        return block({
            update(v) {
                if (v !== value) {
                    value = v;
                    const radio = this.children.namedItem(v)?.firstElementChild;
                    radio.checked = true;
                    radio.disabled = false;
                }
                return this;
            },
            title: f.description
        }, ...f.values.filter(op => ['comfort', 'eco'].includes(op)).map(op => span({ id: op }, input({
            type: 'radio',
            checked: value === op,
            name: d.ieee_address,
            onclick: function () {
                this.disabled = true;
                api.send(JSON.stringify({ topic: d.friendly_name + "/set", payload: { 'preset': op } }));
            }
        }), op)));
    }
};
class UIDevice {
    constructor(device) {
        this.device = device;
        this.features = {};
        if (device.definition?.exposes?.length)
            for (const f of device.definition.exposes) {
                const assignFeature = (f) => { if (f.property in f)
                    debugger; this.features[f.property] = f; };
                if ('features' in f) {
                    f.features.forEach(assignFeature);
                }
                else {
                    assignFeature(f);
                }
            }
        this.element = tr({ id: device.friendly_name }, td({ id: 'name', style: 'white-space: nowrap;' }, device.friendly_name), td({ id: 'value', style: 'white-space: nowrap;' }, device.friendly_name === "Coordinator" ? a({
            href: 'http://' + z2mHost + '/'
        }, 'Manage...') : ''));
        devices.set(device.friendly_name, this);
    }
    update(payload) {
        for (const [property, value] of Object.entries(payload)) {
            const feature = this.features[property];
            if (feature) {
                if (property in control) {
                    let e = this.element.children.namedItem('value')?.children.namedItem(property);
                    if (!e) {
                        // @ts-ignore
                        const f = control[property](value, feature, this.device);
                        if (f) {
                            f.id = property;
                            this.element.children.namedItem('value')?.append(f);
                        }
                    }
                    else {
                        e.update(value);
                    }
                }
                else {
                    //state.push(div({ title: feature.description}, property, ' ', JSON.stringify(value)));
                    console.log("FEATURE", this.device.friendly_name, property, value, feature);
                }
            }
            else {
                //console.log("NO FEATURE",this.device.friendly_name, property,value,this.features)
            }
        }
        return true;
    }
}
const devices = new Map();
const api = new WebSocket("ws://" + z2mHost + "/api");
api.onerror = () => { if (confirm("WebSocket error. Press OK to re-connect"))
    window.location.reload(); };
api.onopen = () => api.onmessage = (m => {
    const { topic, payload } = JSON.parse(m.data);
    if (topic === 'bridge/devices') {
        ui('devices').innerHTML = '';
        devices.clear();
        for (const device of payload) {
            ui('devices')?.append(new UIDevice(device).element);
        }
    }
    else {
        if (!devices.get(topic)?.update(payload))
            console.log("OTHER MESSAGE", topic, payload);
    }
});
