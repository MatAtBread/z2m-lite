"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function isDeviceAvailability(topic, payload) {
    return !!topic.match(/zigbee2mqtt\/.*\/availability/) && payload;
}
function isGlowSensor(topic, payload) {
    return !!topic.match(/glow\/.*\/SENSOR\/(gasmeter|electricitymeter)/) && payload;
}
const POLLED_REFRESH_SECONDS = 180;
function ui(id) {
    return document.getElementById(id);
}
function log(x) { console.log(x); return x; }
;
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
const [div, span, inlineBlock, button, canvas] = [e('div'), e('span'), e('div', {
        style: 'display: inline-block'
    }), e('button'), e('canvas')];
const row = e('div', { className: 'row' });
const block = e('div', { className: 'cell' });
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
        let self = inlineBlock({
            update(v) {
                if (v !== value) {
                    if (typeof value === 'string')
                        if (this.children[value])
                            this.children[value].disabled = false;
                    value = v;
                    if (this.children[v])
                        this.children[v].disabled = true;
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
    combo: (states, attrs = {}) => {
        return (f, value) => {
            let self = inlineBlock({
                update(state) {
                    // @ts-ignore
                    const v = Object.entries(states).find(
                    // @ts-ignore
                    stateEntries => Object.entries(stateEntries[1]).every(e => e[1] === state[e[0]]))?.[0];
                    if (v !== value) {
                        if (typeof value === 'string')
                            if (this.children[value])
                                this.children[value].disabled = false;
                        value = v;
                        if (typeof v === 'string') {
                            if (this.children[v])
                                this.children[v].disabled = true;
                        }
                    }
                    return this;
                },
                title: f?.description,
                ...attrs
            }, ...Object.keys(states).map(op => button({
                id: op,
                disabled: value === op,
                onclick: function () {
                    this.disabled = true;
                    attrs.onvalue?.call(self, Object.assign(new Event('value'), { value: op, state: states[op] }));
                }
            }, op)));
            return self;
        };
    },
    enum: (attrs = {}) => (f, value) => {
        let self = inlineBlock({
            update(v) {
                if (v !== value) {
                    if (value !== null)
                        this.children[value].disabled = false;
                    value = v;
                    if (this.children[v])
                        this.children[v].disabled = true;
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
                    this.textContent = String(value) /*.replace(/\.5$/,'\u00BD')*/ + f.unit;
                }
                return this;
            },
            ...attrs
        }, value + f.unit);
    },
    text: (attrs = {}, labels) => (f, value) => {
        return span({
            update(v) {
                if (v !== value) {
                    value = v;
                    this.textContent = labels?.[value] ?? value;
                }
                return this;
            },
            ...attrs
        }, typeof value === 'string' ? (labels?.[value] ?? value) : '');
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
    const devices = new Map();
    class UIDevice {
        constructor(id) {
            this.element = row({ id });
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
                        this.element.parentElement?.insertBefore(div({ style: 'width: 100%' }, ...details), this.element.nextSibling);
                    }
                }
            }
        }
        showDeviceDetails() { return []; }
        update(payload) { }
    }
    class UIZigbee2mqttDevice extends UIDevice {
        static createDevice(friendly_name, definition) {
            let uiDev = devices.get('zigbee2mqtt/' + friendly_name);
            if (!uiDev) {
                const model = String(definition?.model);
                const uiClass = friendly_name in zigbeeDeviceModels
                    ? zigbeeDeviceModels[friendly_name]
                    : model in zigbeeDeviceModels
                        ? zigbeeDeviceModels[model]
                        : UIZigbee2mqttDevice;
                uiDev = new uiClass({ definition: definition, friendly_name });
            }
            return uiDev;
        }
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
        propertyColumns() {
            return {
                linkquality: featureElement.linkquality(),
                friendly_name: (f, value) => featureElement.text({
                    onclick: () => {
                        this.toggleDeviceDetails();
                    }
                })(f, value)
            };
        }
        update(payload) {
            const columns = this.propertyColumns();
            for (const property of Object.keys(columns)) {
                const value = property === 'friendly_name'
                    ? this.device.friendly_name
                    : payload[property];
                const feature = this.features[property];
                //if (value !== undefined && feature) {
                let e = this.element.children[property];
                if (!e) {
                    e = columns[property](feature, (feature?.access || 0) & 6 ? value : null) || null;
                    if (e) {
                        e = block({ id: property }, e);
                        this.element.append(e);
                    }
                }
                if (value !== undefined)
                    e?.firstElementChild?.update(value);
            }
            //}
            return true;
        }
        api(subCommand, payload) {
            mqtt.send(this.element.id + (subCommand ? '/' + subCommand : ''), payload);
        }
    }
    function* ascending(max) {
        for (let i = 0; i < max; i++)
            yield i;
    }
    function* descending(max) {
        for (let i = max - 1; i >= 0; i--)
            yield i;
    }
    function createHistoryChart({ topic, cumulative, views, scaleFactor, offset, yText }, style) {
        const elt = canvas(style);
        let openChart;
        const keys = Object.keys(views);
        let zoom = keys[0];
        const drawChart = async (view) => {
            const { fields, intervals, period, metric } = views[view];
            const segments = views[view].segments || 1;
            const type = views[view].type || 'line';
            if (segments !== 1 && fields.length !== 1)
                throw new Error("Multiple segments and fields. Only one of segments & fields can be multi-valued");
            const step = period / intervals * 60000;
            const start = segments > 1
                ? (Math.floor(Date.now() / (period * 60000)) - (segments - 1)) * (period * 60000)
                : Math.floor((Date.now() - period * 60000) / step + 1) * step;
            const srcData = await dataApi({
                q: 'series',
                metric,
                topic,
                interval: period / intervals,
                start,
                end: start + segments * period * 60000,
                fields,
            });
            if (srcData?.length) {
                if (openChart)
                    openChart.destroy();
                // Fill in any blanks in the series
                const data = [];
                for (let i = 0; i < intervals * segments; i++) {
                    const t = start + i * period * 60000 / intervals;
                    data[i] = srcData.find(d => d.time === t) || { time: t };
                }
                const segmentOffset = start + (segments - 1) * period * 60000;
                openChart = new Chart(elt, {
                    data: {
                        datasets: segments > 1
                            ? [...descending(segments)].map(seg => ({
                                type,
                                yAxisID: 'y' + fields[0],
                                label: new Date(start + seg * period * 60000).toDateString().slice(0, 10),
                                borderColor: `hsl(${((segments - 1) - seg) * 360 / segments},100%,50%)`,
                                pointRadius: 1,
                                pointHitRadius: 5,
                                data: data.slice(seg * intervals, (seg + 1) * intervals).map((d, i) => ({
                                    x: segmentOffset + (d.time % (period * 60000)),
                                    y: (cumulative ? (d[fields[0]] - data[seg * intervals + i - 1]?.[fields[0]] || NaN) : d[fields[0]]) * (scaleFactor || 1) + (offset || 0)
                                }))
                            }))
                            : fields.map((k, i) => ({
                                type,
                                borderDash: i ? [3, 3] : undefined,
                                label: k,
                                yAxisID: 'y' + k,
                                data: data.map((d, i) => ({
                                    x: d.time,
                                    y: (cumulative ? (d[k] - data[i - 1]?.[k] || NaN) : d[k]) * (scaleFactor || 1) + (offset || 0)
                                }))
                            }))
                    },
                    options: {
                        //events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
                        plugins: {
                            legend: {
                                display: segments < 2 && fields.length > 1
                            }
                        },
                        scales: {
                            xAxis: {
                                type: 'time'
                            },
                            ...Object.fromEntries(fields.map((k) => ['y' + k, {
                                    beginAtZero: false,
                                    title: {
                                        text: yText,
                                        display: true
                                    },
                                    position: k === 'position' ? 'right' : 'left',
                                    min: k === 'position' ? 0 : undefined,
                                    max: k === 'position' ? 100 : undefined,
                                }]))
                        }
                    }
                });
            }
        };
        const resetChart = () => drawChart(zoom);
        resetChart();
        const controls = [div({ className: 'zoom' }, ...keys.map((zoom, idx) => button({
                id: 'zoomOut',
                className: idx ? '' : 'selected',
                onclick: async (e) => {
                    e.target.classList.add('selected');
                    await drawChart(zoom);
                    if (zoomed !== e.target) {
                        zoomed.classList.remove('selected');
                        zoomed = e.target;
                    }
                }
            }, zoom))), elt];
        let zoomed = controls[0].firstElementChild;
        return controls;
    }
    const zigbeeDeviceModels = {
        "Central Heating": class extends UIZigbee2mqttDevice {
            update(payload) {
                super.update(payload);
                this.element.children.boilerControls?.firstElementChild?.update(payload);
                return true;
            }
            propertyColumns() {
                return {
                    ...super.propertyColumns(),
                    boilerControls: (f, value) => featureElement.combo({
                        clock: { state_l1: 'ON', state_l2: 'OFF' },
                        on: { state_l2: 'ON' },
                        off: { state_l1: 'OFF', state_l2: 'OFF' }
                    }, {
                        onvalue: (ev) => {
                            if (ev.state)
                                this.api("set", ev.state);
                        }
                    })(f, value),
                    state_l3: featureElement.text({}, {
                        ON: '',
                        OFF: 'Paused (no radiators are on)'
                    })
                };
            }
        },
        S26R2ZB: class extends UIZigbee2mqttDevice {
            propertyColumns() {
                return {
                    ...super.propertyColumns(),
                    state: (f, value) => featureElement.binary({
                        onvalue: (ev) => { this.api("set", { 'state': ev.value }); }
                    })(f, value),
                };
            }
        },
        TS0601_thermostat: class extends UIZigbee2mqttDevice {
            propertyColumns() {
                return {
                    ...super.propertyColumns(),
                    system_mode: (f, value) => featureElement.enum({
                        onvalue: (ev) => {
                            this.api("set", { 'system_mode': ev.value });
                            if (ev.value !== 'off')
                                this.api("set", { 'preset': 'comfort' });
                        }
                    })(f, value),
                    local_temperature: featureElement.numeric(),
                    current_heating_setpoint: featureElement.numeric(),
                    position: (f, value) => featureElement.numeric({
                        onclick: (e) => {
                            if (this.features.preset && this.features.system_mode && confirm("Reset " + this.device.friendly_name + "?")) {
                                this.api("set", { 'preset': 'comfort' });
                                this.api("set", { 'system_mode': "off" });
                                this.api("set", { 'system_mode': "auto" });
                            }
                        }
                    })(f, Number(value))
                };
            }
            showDeviceDetails() {
                return createHistoryChart({
                    topic: this.element.id,
                    views: {
                        /*"4hr": {
                          fields: ["local_temperature", "position"],
                          intervals: 240/15,
                          period: 240
                        },*/
                        "Day": {
                            metric: 'avg',
                            fields: ["local_temperature", "position", /*"current_heating_setpoint"*/],
                            intervals: 24 * 4,
                            period: 24 * 60,
                        },
                        "Wk": {
                            metric: 'avg',
                            fields: ["local_temperature"],
                            intervals: 24 * 4,
                            period: 24 * 60,
                            segments: 7
                        },
                        "28d": {
                            metric: 'avg',
                            type: 'bar',
                            fields: ["local_temperature"],
                            intervals: 28,
                            period: 28 * 24 * 60,
                        }
                    }
                });
            }
        }
    };
    function price(period, { energy }) {
        return '\u00A3' + (energy.import[period] * energy.import.price.unitrate + energy.import.price.standingcharge).toFixed(2);
    }
    const Glow = {
        electricitymeter: class extends UIDevice {
            constructor(id) {
                super(id);
                this.unitrate = 1;
                this.standingcharge = 0;
                this.element.onclick = () => this.toggleDeviceDetails();
                this.element.append(block("\u26A1"), block({ id: 'day' }), block({ id: 'spotvalue' }, this.power = span({ id: 'kWh' }), this.cost = span({ id: 'cost' })));
            }
            update(payload) {
                this.unitrate = payload.electricitymeter.energy.import.price.unitrate;
                this.standingcharge = payload.electricitymeter.energy.import.price.standingcharge;
                this.element.children.day.textContent = price('day', payload.electricitymeter);
                this.power.textContent =
                    `${payload.electricitymeter?.power?.value} ${payload.electricitymeter?.power?.units}`;
                this.cost.textContent =
                    `\u00A3${(payload.electricitymeter?.power?.value * payload.electricitymeter.energy.import.price.unitrate).toFixed(2)}/h`;
                const hue = Math.max(Math.min(120, 120 - Math.floor(120 * (payload.electricitymeter?.power?.value / 2))), 0);
                this.element.children.spotvalue.style.backgroundColor = `hsl(${hue} 100% 44%)`;
            }
            showDeviceDetails() {
                return createHistoryChart({
                    topic: this.element.id,
                    yText: 'kW',
                    cumulative: true,
                    //scaleFactor: this.unitrate,
                    //offset: this.standingcharge,
                    views: {
                        "15m": {
                            metric: 'avg',
                            fields: ['electricitymeter.energy.import.cumulative'],
                            intervals: 30,
                            period: 15
                        },
                        "4hr": {
                            metric: 'avg',
                            fields: ['electricitymeter.energy.import.cumulative'],
                            intervals: 240,
                            period: 240
                        },
                        "Day": {
                            metric: 'avg',
                            fields: ['electricitymeter.energy.import.cumulative'],
                            intervals: 24 * 4,
                            period: 24 * 60,
                        },
                        "Wk": {
                            metric: 'avg',
                            fields: ['electricitymeter.energy.import.cumulative'],
                            intervals: 4 * 24,
                            period: 24 * 60,
                            segments: 7
                        },
                        "28d": {
                            metric: 'max',
                            type: 'bar',
                            fields: ['electricitymeter.energy.import.cumulative'],
                            intervals: 28,
                            period: 28 * 24 * 60,
                        }
                    }
                });
            }
        },
        gasmeter: class extends UIDevice {
            constructor(id) {
                super(id);
                this.unitrate = 1;
                this.standingcharge = 0;
                this.element.onclick = () => this.toggleDeviceDetails();
                this.element.append(block("\u{1F525}"), block({ id: 'day' }), block("\u00A0"));
            }
            update(payload) {
                this.unitrate = payload.gasmeter.energy.import.price.unitrate;
                this.standingcharge = payload.gasmeter.energy.import.price.standingcharge;
                this.element.children['day'].textContent = price('day', payload.gasmeter);
            }
            showDeviceDetails() {
                return createHistoryChart({
                    topic: this.element.id,
                    yText: 'kW',
                    cumulative: true,
                    //scaleFactor: this.unitrate,
                    //offset: this.standingcharge,
                    views: {
                        /*"4hr": {
                          fields: ['gasmeter.energy.import.cumulative'],
                          intervals: 240/30,
                          period: 240
                        },*/
                        "Day": {
                            metric: 'avg',
                            fields: ['gasmeter.energy.import.cumulative'],
                            intervals: 24 * (60 / 30),
                            period: 24 * 60,
                        },
                        "Wk": {
                            metric: 'avg',
                            fields: ['gasmeter.energy.import.cumulative'],
                            intervals: 24 * (60 / 30),
                            period: 24 * 60,
                            segments: 7
                        },
                        "28d": {
                            metric: 'max',
                            type: 'bar',
                            fields: ['gasmeter.energy.import.cumulative'],
                            intervals: 28,
                            period: 28 * 24 * 60,
                        }
                    }
                });
            }
        },
    };
    class WsMqttConnection {
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
        constructor(z2mHost) {
            super('zigbee2mqtt/Coordinator');
            this.element.append(button({
                id: 'manage',
                async onclick() { window.open('http://' + z2mHost + '/', 'manager'); }
            }, 'Manage devices'));
        }
        get sortOrder() { return '\uFFFF'; }
    }
    fetch("/z2mhost")
        .then(res => res.text() || window.location.host)
        .catch(_ => window.location.host)
        .then(host => new ZigbeeCoordinator(host));
    const bridgeDevices = {};
    /*
    const bridgeDevices = await dataApi({q:'latest', topic: 'zigbee2mqtt/bridge/devices' }).then(
      res => Object.fromEntries(((res?.payload as BridgeDevices["payload"]).map(x => [x.friendly_name, x])) ?? {})
    );
  
    const retained = await dataApi({q:'stored_topics', since: Date.now() - 86400000});
    if (retained) {
      for (const message of retained) {
        parseTopicMessage(message as Z2Message)
      }
    }
    */
    const mqtt = new WsMqttConnection(window.location.host, async (m) => {
        parseTopicMessage(JSON.parse(m.data));
    });
    function parseTopicMessage({ topic, payload }) {
        const subTopic = topic.split('/'); //.map((s,i,a) => a.slice(0,i+1).join('/'));
        const devicePath = subTopic[0] + '/' + subTopic[1];
        /*if (topic === 'zigbee2mqtt/bridge/devices') {
          // Merge in the retained devices
          for (const d of payload) {
            if (d.friendly_name in bridgeDevices) {
              // Deep merge?
              Object.assign(bridgeDevices[d.friendly_name], d);
            } else {
              bridgeDevices[d.friendly_name] = d;
            }
          }
        }*/
        if (topic === 'zigbee2mqtt/bridge/query/devices') {
            for (const [name, d] of Object.entries(payload)) {
                if (!(name in bridgeDevices)) {
                    bridgeDevices[name] = d;
                }
                const uiDev = UIZigbee2mqttDevice.createDevice(name, d.definition);
                if (d.state)
                    uiDev.update(d.state);
            }
        }
        else if (topic === 'zigbee2mqtt/bridge/state') {
            switch (payload.state) {
                case 'offline':
                    mqtt.promptReconnect();
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
            const friendly_name = subTopic[1];
            const descriptor = bridgeDevices[friendly_name];
            if (descriptor?.definition) {
                const uiDev = UIZigbee2mqttDevice.createDevice(friendly_name, descriptor.definition);
                if (isDeviceAvailability(topic, payload))
                    uiDev.element.style.opacity = payload.state === 'online' ? "1" : "0.5";
                if (!subTopic[2])
                    uiDev.update(payload);
            }
            else {
                console.warn("No device descriptor for", topic, payload);
            }
        }
        else if (isGlowSensor(topic, payload)) {
            const uiDev = devices.get(topic) ?? ((subTopic[3] in Glow) && new Glow[subTopic[3]](topic));
            if (uiDev)
                uiDev.update(payload);
        }
        else {
            console.log("Other message:", topic, payload);
        }
    }
    // @ts-ignore
    window.mqtt = mqtt;
};
