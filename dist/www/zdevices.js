import { HistoryChart } from './HistoryChart.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
const { button, tr, td } = tag();
const ClickOption = button.extended({
    override: {
        className: 'ClickOption',
        onclick() { this.disabled = true; }
    }
});
export const BaseDevice = tr.extended({
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
    }
});
export const ZigbeeDevice = BaseDevice.extended({
    iterable: {
        payload: {}
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
                className: this.payload.battery_low.map(p => p ? 'flash' : '')
            }, this.payload.battery_low.map(p => p ? '\uD83D\uDD0B' : '\uD83D\uDCF6')),
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
        iterable: {
            payload: {}
        },
        constructed() {
            this.when('click:.ClickOption').consume(x => {
                x
                    ? this.api('set', { state: x.target.textContent })
                    : null;
            });
            const state = this.payload.state.multi();
            state.consume((p) => console.log("state", p));
            return td(ClickOption({ disabled: state.map((p) => p === 'OFF') }, "OFF"), ClickOption({ disabled: state.map((p) => p === 'ON') }, "ON"));
        }
    }),
    TS0601_thermostat: ZigbeeDevice.extended({
        iterable: {
            payload: {}
        },
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
            const system_mode = this.payload.system_mode.multi();
            return [td(ClickOption({ disabled: system_mode.map(p => p === 'auto') }, "auto"), ClickOption({ disabled: system_mode.map(p => p === 'heat') }, "heat"), ClickOption({ disabled: system_mode.map(p => p === 'off') }, "off")),
                td({
                    id: 'local_temperature',
                    onclick: () => {
                        if (confirm("Get temperature of " + this.device.friendly_name + "?")) {
                            this.payload.local_temperature = '\u2026';
                            this.api("set", { 'preset': 'comfort' });
                            const currentCalibration = this.payload?.local_temperature_calibration?.valueOf();
                            if (typeof currentCalibration === 'number')
                                this.api("set/local_temperature_calibration", currentCalibration);
                        }
                    },
                    style: {
                        color: this.payload.map(p => typeof p?.local_temperature?.valueOf() === 'number' && p?.system_mode !== 'off'
                            ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
                            : '#aaa')
                    }
                }, this.payload.local_temperature, '°C'),
                td({
                    id: 'current_heating_setpoint',
                    style: {
                        color: this.payload.map(p => typeof p?.local_temperature_calibration === 'number' && p?.system_mode !== 'off'
                            ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
                            : '#aaa')
                    }
                }, this.payload.current_heating_setpoint, '°C'),
                td({
                    id: 'position'
                }, this.payload.position, '%'),];
        }
    }),
    "Central Heating": ZigbeeDevice.extended({
        iterable: {
            payload: {}
        },
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
                td(ClickOption({ disabled: this.payload.map(p => p?.state_l1 === 'ON' && p?.state_l2 === 'OFF') }, "clock"), ClickOption({ disabled: this.payload.state_l2.map(p => p === 'ON') }, "on"), ClickOption({ disabled: this.payload.map(p => p?.state_l1 === 'OFF' && p?.state_l2 === 'OFF') }, "off")),
                td({ id: 'state_l3', colSpan: 3 }, this.payload.state_l3.map(p => p === 'ON' ? '' : 'Paused (no radiators are on)'))
            ];
        }
    }),
    "ti.router": ZigbeeDevice.extended({
        override: {
            style: {
            //        display: 'none'
            }
        }
    }),
    "Coordinator": ZigbeeDevice.extended({
        override: {
            style: {
            //        display: 'none'
            }
        }
    })
};
