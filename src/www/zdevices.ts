import { HistoryChart } from './HistoryChart.js';
import type { WsMqttConnection } from './WsMqttConnection.js';
import { Device, LQIFeature } from './message-types.js';
import { ChildTags, tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';

const { button, tr, td } = tag();

const ClickOption = button.extended({
  override: {
    className: 'ClickOption',
    onclick() { this.disabled = true }
  }
});

export const BaseDevice = tr.extended({
  iterable: {
    payload: {}
  },
  declare: {
    device: undefined as unknown as Device,
    mqtt: undefined as unknown as WsMqttConnection,
    api(subCommand: `set` | `set/${string}`, payload: unknown) {
      this.mqtt.send(this.id + (subCommand ? '/' + subCommand : ''), payload);
    },
    details(): ChildTags {
      return undefined;
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
    payload: {} as {
      battery_low?: boolean
      linkquality?: number | typeof NaN
    }
  },
  constructed() {
    this.id = 'zigbee2mqtt/' + this.device.friendly_name;
    const maxLQ = (this.device.definition?.exposes.find(f => 'name' in f && f.name === 'linkquality') as LQIFeature | undefined)?.value_max;
    if (this.device.definition) {
      this.title = this.device.definition.description;
    }

    return [
      td({
        onclick: () => this.nextElementSibling?.className == 'details'
          ? this.nextElementSibling.remove()
          : this.after(td({ colSpan: 6, className: 'details' }, this.details())),
        style: {
          opacity: this.payload.map!(p => !maxLQ || p.battery_low ? "1" : String((p.linkquality || 0) / maxLQ))
        },
        className: this.payload.battery_low!.map!(p => p ? 'flash' : '')
      },
        this.payload.battery_low!.map!(p => p ? '\uD83D\uDD0B' : '\uD83D\uDCF6')
      ),
      td({
        onclick: () => this.nextElementSibling?.className == 'details'
          ? this.nextElementSibling.remove()
          : this.after(td({ colSpan: 6, className: 'details' }, this.details())),
        id: 'friendly_name'
      }, this.device.friendly_name)
    ]
  }
});

export const zigbeeDeviceModels: Record<string, ReturnType<typeof ZigbeeDevice.extended>> = {
  S26R2ZB: ZigbeeDevice.extended({
    iterable:{
      payload: {} as { state?: 'ON'|'OFF' }
    },
    constructed() {
      this.when('click:.ClickOption').consume(x => {
        x
          ? this.api('set', { state: (x.target! as HTMLElement).textContent })
          : null
      });

      const state = this.payload.state!.multi!();
      return td(
        ClickOption({ disabled: state!.map!((p) => p === 'OFF') }, "OFF"),
        ClickOption({ disabled: state!.map!((p) => p === 'ON') }, "ON")
      )
    }
  }),

  TS0601_thermostat: ZigbeeDevice.extended({
    styles:`#local_temperature {
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
    iterable:{
      payload: {} as { 
        system_mode?: 'auto'|'heat'|'off',
        local_temperature?: number,
        local_temperature_calibration?: number,
        current_heating_setpoint?: number,
        position?: number
     }
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
              fields: ["local_temperature", "position",/*"current_heating_setpoint"*/],
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
        })
      }
    },
    constructed() {
      this.when('click:.ClickOption').consume(x => {
        x
          ? this.api('set', { system_mode: (x.target! as HTMLElement).textContent })
          : null
      });

      const system_mode = (this.payload.system_mode!).multi!();

      return [td(
        ClickOption({ disabled: system_mode.map!(p => p === 'auto') }, "auto"),
        ClickOption({ disabled: system_mode.map!(p => p === 'heat') }, "heat"),
        ClickOption({ disabled: system_mode.map!(p => p === 'off') }, "off")
      ),
      td({
        id: 'local_temperature',
        onclick: () => {
          if (confirm("Get temperature of " + this.device.friendly_name + "?")) {
            this.payload.local_temperature = '\u2026' as unknown as number;
            this.api("set", { 'preset': 'comfort' });
            const currentCalibration = this.payload?.local_temperature_calibration?.valueOf();
            if (typeof currentCalibration === 'number')
              this.api("set/local_temperature_calibration", currentCalibration);
          }
        },
        style: {
          color: this.payload.map!(p =>
            typeof p?.local_temperature?.valueOf() === 'number' && p?.system_mode !== 'off'
              && p?.local_temperature && p?.current_heating_setpoint 
              ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
              : '#aaa')
        }
      }, this.payload.local_temperature, '°C'),
      td({
        id: 'current_heating_setpoint',
        style: {
          color: this.payload.map!(p =>
            typeof p?.local_temperature_calibration === 'number' && p?.system_mode !== 'off'
              && p?.local_temperature && p?.current_heating_setpoint 
              ? p.local_temperature >= p.current_heating_setpoint ? '#d88' : '#aaf'
              : '#aaa')
        }
      }, this.payload.current_heating_setpoint, '°C'),
      td({
        id: 'position'
      }, this.payload.position, '%'),
      ]
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
    iterable:{
      payload: {} as {
        state_l1?: 'ON' | 'OFF'
        state_l2?: 'ON' | 'OFF'
        state_l3?: 'ON' | 'OFF'
      }
    },
    constructed() {
      this.when('click:.ClickOption').consume(x => {
        const mode = (x.target! as HTMLElement).textContent
        x
          ? this.api('set', {
            state_l1: mode == 'clock' ? 'ON' : mode == 'off' ? 'OFF' : undefined,
            state_l2: mode == 'on' ? 'ON' : 'OFF'
          })
          : null
      });

      return [
        td(
          ClickOption({ disabled: this.payload.map!(p => p.state_l1 === 'ON' && p.state_l2 === 'OFF') }, "clock"),
          ClickOption({ disabled: this.payload.state_l2!.map!(p => p === 'ON') }, "on"),
          ClickOption({ disabled: this.payload.map!(p => p.state_l1 === 'OFF' && p.state_l2 === 'OFF') }, "off")
        ),
        td({ id: 'state_l3', colSpan: 3 },
          this.payload.state_l3!.map!(p => p === 'ON' ? '' : 'Paused (no radiators are on)')
        )
      ]
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
