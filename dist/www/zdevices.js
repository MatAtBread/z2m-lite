import { HistoryChart } from './HistoryChart.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
const { button, tr, td } = tag();
const ClickOption = button.extended({
    override: {
        className: 'ClickOption',
        onclick() { this.disabled = true; }
    }
});
export const ZigbeeDevice = tr.extended({
    iterable: {
        payload: {}
    },
    declare: {
        device: undefined,
        mqtt: undefined,
        api(subCommand, payload) {
            this.mqtt.send(this.id + (subCommand ? '/' + subCommand : ''), payload);
        },
        details() {
            return undefined;
        }
    },
    constructed() {
        this.id = 'zigbee2mqtt/' + this.device.friendly_name;
        const maxLQ = this.device.definition?.exposes.find(f => 'name' in f && f.name === 'linkquality')?.value_max;
        if (this.device.definition) {
            this.title = this.device.definition.description;
        }
        return [
            td({
                onclick: () => this.nextElementSibling?.className == 'details'
                    ? this.nextElementSibling.remove()
                    : this.after(td({ colSpan: 6, className: 'details' }, this.details())),
                style: {
                    opacity: this.payload.map(p => !maxLQ || p.battery_low ? "1" : String(p.linkquality / maxLQ))
                },
                className: this.payload.map(p => p.battery_low ? 'flash' : '')
            }, this.payload.map(p => p.battery_low ? '\uD83D\uDD0B' : '\uD83D\uDCF6')),
            td({
                onclick: () => this.nextElementSibling?.className == 'details'
                    ? this.nextElementSibling.remove()
                    : this.after(td({ colSpan: 6, className: 'details' }, this.details())),
                id: 'friendly_name'
            }, this.device.friendly_name)
        ];
    }
});
export const zigbeeDeviceModels = {
    S26R2ZB: ZigbeeDevice.extended({
        constructed() {
            this.when('click:.ClickOption').consume(x => {
                x
                    ? this.api('set', { state: x.target.textContent })
                    : null;
            });
            return td(ClickOption({ disabled: this.payload.map(p => p?.state === 'OFF') }, "OFF"), ClickOption({ disabled: this.payload.map(p => p?.state === 'ON') }, "ON"));
        }
    }),
    TS0601_thermostat: ZigbeeDevice.extended({
        override: {
            details() {
                return HistoryChart({
                    topic: this.id,
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
        },
        constructed() {
            this.when('click:.ClickOption').consume(x => {
                x
                    ? this.api('set', { system_mode: x.target.textContent })
                    : null;
            });
            return [td(ClickOption({ disabled: this.payload.map(p => p?.system_mode === 'auto') }, "auto"), ClickOption({ disabled: this.payload.map(p => p?.system_mode === 'heat') }, "heat"), ClickOption({ disabled: this.payload.map(p => p?.system_mode === 'off') }, "off")),
                td({
                    id: 'local_temperature',
                    onclick: () => {
                        if (confirm("Get temperature of " + this.device.friendly_name + "?")) {
                            this.payload.local_temperature = '\u2026';
                            this.api("set", { 'preset': 'comfort' });
                            if (typeof this.payload?.local_temperature_calibration?.valueOf() === 'number')
                                this.api("set/local_temperature_calibration", this.payload?.local_temperature_calibration.valueOf());
                        }
                    },
                    style: {
                        color: this.payload.map(p => typeof p?.local_temperature?.valueOf() === 'number' && p?.system_mode !== 'off'
                            ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
                            : '#aaa')
                    }
                }, this.payload.map(p => p?.local_temperature), '°C'),
                td({
                    id: 'current_heating_setpoint',
                    style: {
                        color: this.payload.map(p => typeof p?.local_temperature_calibration === 'number' && p?.system_mode !== 'off'
                            ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
                            : '#aaa')
                    }
                }, this.payload.map(p => p?.current_heating_setpoint), '°C'),
                td({
                    id: 'position'
                }, this.payload.map(p => p?.position), '%'),
            ];
        }
    }),
    "Central Heating": ZigbeeDevice.extended({
        constructed() {
            this.when('click:.ClickOption').consume(x => {
                const mode = x.target.textContent;
                x
                    ? this.api('set', {
                        state_l1: mode == 'clock' ? 'ON' : mode == 'off' ? 'OFF' : undefined,
                        state_l2: mode == 'on' ? 'ON' : 'OFF'
                    })
                    : null;
            });
            return [
                td(ClickOption({ disabled: this.payload.map(p => p?.state_l1 === 'ON' && p?.state_l2 === 'OFF') }, "clock"), ClickOption({ disabled: this.payload.map(p => p?.state_l2 === 'ON') }, "on"), ClickOption({ disabled: this.payload.map(p => p?.state_l1 === 'OFF' && p?.state_l2 === 'OFF') }, "off")),
                td({ id: 'state_l3', colSpan: 3 }, this.payload.map(p => p?.state_l3 === 'ON' ? '' : 'Paused (no radiators are on)'))
            ];
        }
    }),
    "ti.router": ZigbeeDevice.extended({
        override: {
            style: {
                display: 'none'
            }
        }
    }),
    "Coordinator": ZigbeeDevice.extended({
        override: {
            style: {
                display: 'none'
            }
        }
    })
};
