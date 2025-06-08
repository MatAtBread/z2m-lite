import { HistoryChart } from './HistoryChart.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
const { button, tr, td, div } = tag();
export const ClickOption = button.extended({
    override: {
        className: 'ClickOption',
        onclick() { this.disabled = true; }
    }
});
export const BaseDevice = tr.extended({
    iterable: {
        payload: {}
    },
    override: {
        className: 'BaseDevice'
    },
    styles: `.BaseDevice > td:nth-child(2) {
    white-space: normal;
  }`,
    declare: {
        device: undefined,
        mqtt: undefined,
        api(subCommand, payload) {
            this.mqtt.send(this.id + (subCommand ? '/' + subCommand : ''), payload);
        },
        details() {
            return undefined;
        },
        sortOrder() {
            return this.children[1]?.textContent || this.id.split('/').pop();
        },
        toggleDetails() {
            this.nextElementSibling?.className == 'details'
                ? this.nextElementSibling.remove()
                : this.after(td({ colSpan: 6, className: 'details' }, this.details()));
        }
    }
});
export const ZigbeeDevice = BaseDevice.extended({
    styles: `#friendly_name {
    white-space: break-spaces;
    max-height: 3em;
    overflow-y: hidden;
  }

  @keyframes flash {
    0% { opacity: 0.2; }
    40% { opacity: 0.2; }
    50% { opacity: 0.8; }
    60% { opacity: 0.2; }
    100% { opacity: 0.2; }
  }

  .flash {
    animation: flash 4s;
    animation-iteration-count: infinite;
  }`,
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
                onclick: () => this.toggleDetails(),
                style: {
                    opacity: this.payload.map(p => !maxLQ || p.battery_low ? "1" : String((p.linkquality || 0) / maxLQ))
                },
                className: this.payload.battery_low.map(p => p ? 'flash' : '')
            }, this.payload.battery_low.map(p => p ? '\uD83D\uDD0B' : '\uD83D\uDCF6')),
            td({
                onclick: () => this.toggleDetails(),
                id: 'friendly_name'
            }, this.device.friendly_name)
        ];
    }
});
const ZigbeeInfrastructure = ZigbeeDevice.extended({
    override: {
        //style: 'display: none;',
        sortOrder() {
            return "\xFF\xFF" + this.children[1]?.textContent || this.id.split('/').pop();
        }
    }
});
const ZigbeeCoordinator = ZigbeeInfrastructure.extended({
    override: {
        toggleDetails() {
            fetch("/z2mhost")
                .then(res => res.text() || window.location.host)
                .catch(_ => window.location.host)
                .then(host => window.open('http://' + host + '/', 'manager'));
        }
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
            return td(ClickOption({ disabled: state.map((p) => p === 'OFF') }, "OFF"), ClickOption({ disabled: state.map((p) => p === 'ON') }, "ON"));
        }
    }),
    TS0601_thermostat: ZigbeeDevice.extended({
        styles: `#local_temperature {
      width: 3em;
      text-align: right;
    }
    #current_heating_setpoint {
      width: 3em;
      color: rgb(135, 214, 135);
      text-align: right;
    }
    #position {
      width: 3em;
      text-align: right;
    }`,
        iterable: {
            payload: {}
        },
        override: {
            details() {
                return HistoryChart({
                    topic: this.id,
                    views: {
                        "6hr": {
                            metric: 'avg',
                            fields: ["local_temperature", "position"],
                            intervals: 360 / 10,
                            period: 360
                        },
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
            const system_mode = (this.payload.system_mode).multi();
            const color = this.payload.map(p => typeof p?.local_temperature?.valueOf() === 'number' && p?.system_mode !== 'off'
                && p?.local_temperature && p?.current_heating_setpoint
                ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
                : '#aaa').multi();
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
                        fontSize: '2em',
                        color: color
                    }
                }, this.payload.local_temperature, '°C'),
                td(div({
                    id: 'current_heating_setpoint',
                    style: {
                        color: color
                    }
                }, this.payload.current_heating_setpoint, '°C'), div({
                    id: 'position'
                }, this.payload.position, '%'))];
        }
    }),
    "Central Heating": ZigbeeDevice.extended({
        styles: `#state_l3 {
      margin-left: 0.5em;
      color: rgb(169, 126, 255);
      width: 8em;
      white-space: break-spaces;
      max-height: 3em;
      overflow: hidden;
    }`,
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
                td(ClickOption({ disabled: this.payload.map(p => p.state_l1 === 'ON' && p.state_l2 === 'OFF') }, "clock"), ClickOption({ disabled: this.payload.state_l2.map(p => p === 'ON') }, "on"), ClickOption({ disabled: this.payload.map(p => p.state_l1 === 'OFF' && p.state_l2 === 'OFF') }, "off")),
                td({ id: 'state_l3', colSpan: 3 }, this.payload.state_l3.map(p => p === 'ON' ? '' : 'Paused (no radiators are on)'))
            ];
        }
    }),
    "ti.router": ZigbeeInfrastructure,
    "Coordinator": ZigbeeCoordinator
};
