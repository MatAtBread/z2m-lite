"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
function dataApi(query) {
    return fetch("/data?" + encodeURIComponent(JSON.stringify(query))).then(res => res.json());
}
window.onload = async () => {
    Chart.defaults.font.size = 20;
    Chart.defaults.color = '#fff';
    const propertyColumns = {
        linkquality: featureElement.linkquality(),
        friendly_name: (f, value, d) => featureElement.text({
            onclick: () => {
                d.toggleDeviceDetails();
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
            onclick: (e) => {
                if (d.features.preset && d.features.system_mode && confirm("Reset " + d.device.friendly_name + "?")) {
                    d.api("set", { 'preset': 'comfort' });
                    d.api("set", { 'system_mode': "off" });
                    d.api("set", { 'system_mode': "auto" });
                }
            }
        })(f, Number(value))
    };
    const devices = new Map();
    class UIDevice {
        constructor(id) {
            this.element = tr({ id });
            devices.set(id, this);
            const devs = ui('devices');
            devs.append(...[...devices.values()].sort(({ sortOrder: a }, { sortOrder: b }) => a == b ? 0 : a < b ? -1 : 1).map(d => d.element));
        }
        get sortOrder() { return this.element.id; }
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
        update(payload) { }
    }
    class UIZigbee2mqttDevice extends UIDevice {
        constructor(device) {
            super('zigbee2mqtt/' + device.friendly_name);
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
            z2mApi.send(this.element.id + (subCommand ? '/' + subCommand : ''), payload);
        }
    }
    function createHistoryChart({ topic, fields, cumulative, interval, metric, scaleFactor }, style = {}) {
        const chart = canvas(style);
        dataApi({
            q: 'series',
            metric,
            topic,
            interval: interval || 15,
            start: Date.now() - 2 * 24 * 60 * 60 * 1000,
            fields,
        }).then(data => {
            if (data?.length) {
                const series = Object.keys(data[0]).filter(k => k !== 'time');
                new Chart(chart, {
                    type: 'scatter',
                    data: {
                        datasets: series.map(k => ({
                            label: k,
                            //fill: 'origin',
                            showLine: true,
                            yAxisID: 'y' + k,
                            xAxisID: 'xAxis',
                            data: data.map((d, i) => ({
                                x: d.time,
                                y: cumulative ? (d[k] - data[i - 1]?.[k] || NaN) : d[k] * (scaleFactor || 1)
                            }))
                        }))
                    },
                    options: {
                        scales: {
                            xAxis: {
                                type: 'time',
                                /*time: {
                                  unit: ""
                                }*/
                            },
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
    const zigbeeDeviceModels = {
        TS0601_thermostat: class extends UIZigbee2mqttDevice {
            showDeviceDetails() {
                return createHistoryChart({
                    topic: this.element.id,
                    metric: 'avg',
                    interval: 15,
                    fields: ["local_temperature", "position", /*"current_heating_setpoint"*/]
                });
            }
        }
    };
    function price(period, { energy }) {
        return '\u00A3 ' + (energy.import[period] * energy.import.price.unitrate + energy.import.price.standingcharge).toFixed(2);
    }
    const Glow = {
        electricitymeter: class extends UIDevice {
            constructor(id) {
                super(id);
                this.element.onclick = () => this.toggleDeviceDetails();
                this.element.append(td("\u00A0"), td("\u26A1"), td({ id: 'day' }), td({ id: 'power' }));
            }
            update(payload) {
                this.element.children['day'].textContent = price('day', payload.electricitymeter);
                this.element.children['power'].textContent = payload.electricitymeter?.power?.value + ' ' + payload.electricitymeter?.power?.units;
                const hue = Math.max(Math.min(120, 120 - Math.floor(120 * ((payload.electricitymeter?.power?.value) / 1))), 0);
                this.element.children['power'].style.color = `hsl(${hue} 100% 60%)`;
            }
            showDeviceDetails() {
                return div({}, createHistoryChart({
                    topic: this.element.id,
                    cumulative: true,
                    interval: 5,
                    fields: ['electricitymeter.energy.import.cumulative'],
                    metric: 'avg'
                }));
            }
        },
        gasmeter: class extends UIDevice {
            constructor(id) {
                super(id);
                this.element.onclick = () => this.toggleDeviceDetails();
                this.element.append(td("\u00A0"), td("\u{1F525}"), td({ id: 'day' }));
            }
            update(payload) {
                this.element.children['day'].textContent = price('day', payload.gasmeter);
            }
            showDeviceDetails() {
                return createHistoryChart({
                    //topic: this.element.id, 
                    topic: this.element.id,
                    cumulative: true,
                    metric: 'avg',
                    interval: 30,
                    fields: ['gasmeter.energy.import.cumulative'],
                });
            }
        },
    };
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
    class ZigbeeCoordinator extends UIDevice {
        constructor() {
            super('zigbee2mqtt/Coordinator');
            this.element.append(td({ colSpan: 6 }, button({
                id: 'manage',
                async onclick() { window.open('http://' + await ZigbeeCoordinator.z2mHost + '/', 'manager'); }
            }, 'Manage devices')));
        }
        get sortOrder() { return '\uFFFF'; }
    }
    ZigbeeCoordinator.z2mHost = fetch("/z2mhost").then(res => res.text() || window.location.host).catch(_ => window.location.host);
    new ZigbeeCoordinator();
    const bridgeDevices = await dataApi({ q: 'latest', topic: 'zigbee2mqtt/bridge/devices' }).then(res => Object.fromEntries(((res?.payload).map(x => [x.friendly_name, x])) ?? {}));
    const retained = await dataApi({ q: 'stored_topics', since: Date.now() - 86400000 });
    if (retained) {
        for (const message of retained) {
            parseTopicMessage(message);
        }
    }
    const z2mApi = new Z2MConnection(window.location.host, async (m) => {
        parseTopicMessage(JSON.parse(m.data));
    });
    function parseTopicMessage({ topic, payload }) {
        const subTopic = topic.split('/'); //.map((s,i,a) => a.slice(0,i+1).join('/'));
        const devicePath = subTopic[0] + '/' + subTopic[1];
        if (topic === 'zigbee2mqtt/bridge/devices') {
            // Merge in the retained devices
            for (const d of payload) {
                if (d.friendly_name in bridgeDevices) {
                    // Deep merge?
                    Object.assign(bridgeDevices[d.friendly_name], d);
                }
                else {
                    bridgeDevices[d.friendly_name] = d;
                }
            }
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
        else if (subTopic[0] === 'zigbee2mqtt' && typeof payload === 'object' && payload) {
            const descriptor = bridgeDevices[subTopic[1]];
            if (descriptor) {
                let uiDev = devices.get('zigbee2mqtt/' + descriptor.friendly_name);
                if (!uiDev) {
                    const model = String(descriptor.definition?.model);
                    const uiClass = model in zigbeeDeviceModels ? zigbeeDeviceModels[model] : UIZigbee2mqttDevice;
                    uiDev = new uiClass(descriptor);
                }
                if (subTopic[2] === 'availability')
                    uiDev.element.style.opacity = payload.state === 'online' ? "1" : "0.5";
                if (!subTopic[2])
                    uiDev.update(payload);
            }
            else {
                console.warn("No device descriptor for", topic, payload);
            }
        }
        else if (subTopic[0] === 'glow') {
            if (subTopic[2] === 'SENSOR') {
                // Create the UIDevice for this meter
                const uiDev = devices.get(topic) ?? ((subTopic[3] in Glow) && new Glow[subTopic[3]](topic));
                if (uiDev)
                    uiDev.update(payload);
            }
        }
        else {
            console.log("Other message:", topic, payload);
        }
    }
    // @ts-ignore
    window.z2mApi = z2mApi;
};
