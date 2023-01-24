"use strict";
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
const [tr, td, a, div, input, span, block, button, canvas] = [e('tr'), e('td'), e('a'), e('div'), e('input'), e('span'), e('div', {
        style: 'display: inline-block'
    }), e('button'), e('canvas')];
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
window.onload = async () => {
    const z2mHost = (await fetch("/z2mhost").then(res => res.text()).catch(_ => null)) || window.location.host;
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
        position: (f, value, d) => featureElement.numeric({
            onclick: async (e) => {
                d.toggleDeviceDetails();
            }
        })(f, Number(value))
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
            ui('devices')?.append(this.element);
        }
        toggleDeviceDetails() {
            if (this.element.nextElementSibling) {
                if (!this.element.nextElementSibling.id) {
                    this.element.nextElementSibling.remove();
                }
                else {
                    const details = this.showDeviceDetails();
                    if (details) {
                        this.element.parentElement?.insertBefore(tr(td({ colSpan: "6" }, details)), this.element.nextSibling);
                    }
                }
            }
        }
        showDeviceDetails() { }
        get topic() { return "zigbee2mqtt/" + this.device.friendly_name; }
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
            z2mApi.send(this.topic + (subCommand ? '/' + subCommand : ''), payload);
        }
    }
    Chart.defaults.font.size = 20;
    Chart.defaults.color = '#fff';
    const deviceDetails = {
        TS0601_thermostat: class extends UIDevice {
            showDeviceDetails() {
                const chart = canvas({
                    style: {
                        height: '10em'
                    }
                });
                dataApi({
                    q: 'series',
                    topic: this.topic,
                    interval: 15,
                    start: Date.now() - 3 * 24 * 60 * 60 * 1000,
                    "fields": ["local_temperature", "position", /*"current_heating_setpoint"*/]
                }).then(data => {
                    if (data?.length) {
                        const series = Object.keys(data[0]).filter(k => k !== 'time');
                        new Chart(chart, {
                            type: 'line',
                            data: {
                                labels: data.map(d => new Date(d.time).toString().slice(16, 21)),
                                datasets: series.map(k => ({
                                    label: k,
                                    yAxisID: 'y' + k,
                                    data: data.map(d => d[k])
                                }))
                            },
                            options: {
                                scales: {
                                    /*xAxis:{
                                      type: 'time'
                                    },*/
                                    ...Object.fromEntries(series.map((k, idx) => ['y' + k, {
                                            position: k === 'position' ? 'right' : 'left',
                                            min: k === 'position' ? 0 : undefined,
                                            max: k === 'position' ? 100 : undefined,
                                        }]))
                                }
                            }
                        });
                    }
                });
                return chart;
            }
        },
        /*electricitymeter: class extends UIDevice {
          constructor(topic: string) {
            super({
              friendly_name: 'Electrcity',
              ieee_address: '0x00'
            })
          }
        },
        gasmeter: class extends UIDevice {},*/
    };
    const devices = new Map();
    class Z2MConnection {
        constructor(wsHost, onmessage) {
            this.onmessage = onmessage;
            this.socket = null;
            ui('reconnect').onclick = () => this.connect(wsHost);
            this.connect(wsHost);
        }
        connect(z2mHost) {
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
    const z2mApi = new Z2MConnection(window.location.host, async (m) => {
        const { topic, payload } = JSON.parse(m.data);
        const subTopic = topic.split('/');
        if (topic === 'zigbee2mqtt/bridge/devices') {
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
                const elt = (exists || new (deviceDetails[device.definition?.model] || UIDevice)(device)).element;
                elt.style.opacity = "";
            }
            const retained = await dataApi({ q: 'stored_topics', since: Date.now() - 86400000 });
            if (retained)
                for (const { topic, payload } of retained)
                    devices.get(topic.replace("zigbee2mqtt/", ""))?.update(payload);
        }
        else if (topic === 'zigbee2mqtt/bridge/state') {
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
        else if (topic === 'zigbee2mqtt/bridge/logging') {
            if (payload.level === 'warn' || payload.level === 'error') {
                logMessage(payload.message);
            }
        }
        else if (topic === 'zigbee2mqtt/bridge/log') {
        }
        else if (topic === 'zigbee2mqtt/bridge/config') {
        }
        else if (topic === 'zigbee2mqtt/bridge/info') {
        }
        else if (devices.get(subTopic[1]) && subTopic[2] === 'availability') {
            devices.get(subTopic[1]).element.style.opacity = payload.state === 'online' ? "1" : "0.5";
        }
        else if (typeof payload === 'object' && payload && !devices.get(topic.replace("zigbee2mqtt/", ""))?.update(payload)) {
            console.log("OTHER MESSAGE", topic, payload);
        }
    });
    /*
    dataApi({q: 'topics', match: 'glow/%/SENSOR/%'}).then(data => data?.forEach(d => {
      if (d.topic) {
        const glow = d.topic.split("/") as ['glow',string,'SENSOR','electricitymeter'|'gasmeter']
        new deviceDetails[glow[3]](d.topic);
      }
    }));
  
    new Electricity();
    new Gas();
    */
    // @ts-ignore
    window.z2mApi = z2mApi;
};
function dataApi(query) {
    return fetch("/data?" + encodeURIComponent(JSON.stringify(query))).then(res => res.json());
}
