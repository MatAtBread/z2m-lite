import { createHistoryChart } from "./history.js";
import { UIDevice } from "./UIDevice.js";
import { e } from "./utils.js";
const [span, inlineBlock, button] = [e('span'), e('div', {
        style: 'display: inline-block'
    }), e('button')];
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
export class ZigbeeCoordinator extends UIDevice {
    constructor(z2mHost) {
        super('zigbee2mqtt/Coordinator');
        this.element.append(button({
            id: 'manage',
            async onclick() { window.open('http://' + z2mHost + '/', 'manager'); }
        }, 'Manage devices'));
    }
    get sortOrder() { return '\uFFFF'; }
}
export class UIZigbee2mqttDevice extends UIDevice {
    mqtt;
    device;
    features;
    constructor(mqtt, device) {
        super('zigbee2mqtt/' + device.friendly_name);
        this.mqtt = mqtt;
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
            const value = property === 'friendly_name' ? this.device.friendly_name : payload[property];
            const feature = this.features[property];
            if (value !== undefined && feature) {
                let e = this.element.children[property];
                if (!e) {
                    e = columns[property](feature, (feature.access || 0) & 6 ? value : null) || null;
                    if (e) {
                        e = block({ id: property }, e);
                        this.element.append(e);
                    }
                }
                e?.firstElementChild?.update(value);
            }
        }
        return true;
    }
    api(subCommand, payload) {
        this.mqtt.send(this.element.id + (subCommand ? '/' + subCommand : ''), payload);
    }
}
export const zigbeeDeviceModels = {
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
                metric: 'avg',
                views: {
                    /*"4hr": {
                      fields: ["local_temperature", "position"],
                      intervals: 240/15,
                      period: 240
                    },*/
                    "Day": {
                        fields: ["local_temperature", "position", /*"current_heating_setpoint"*/],
                        intervals: 24 * 4,
                        period: 24 * 60,
                    },
                    "Wk": {
                        fields: ["local_temperature"],
                        intervals: 24 * 4,
                        period: 24 * 60,
                        segments: 7
                    },
                    "28d": {
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
