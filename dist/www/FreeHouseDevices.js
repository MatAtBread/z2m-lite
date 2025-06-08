import { HistoryChart } from './HistoryChart.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { DataSet, Network } from './node_modules/vis-network/standalone/esm/vis-network.js';
import { BaseDevice, ClickOption } from './zdevices.js';
const { td, div, span, button } = tag();
function rssiScale(rssi) {
    if (rssi > -30)
        return 1;
    if (rssi < -100)
        return 0;
    return (rssi + 100) / 70;
}
const TRV1 = BaseDevice.extended({
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
        api(subCommand, payload) {
            this.mqtt.send(this.id + (subCommand ? '/' + subCommand : ''), payload, true);
        },
        details() {
            return HistoryChart({
                topic: this.id,
                views: {
                    "1hr": {
                        metric: 'avg',
                        fields: ["local_temperature", "position", "battery_percent"],
                        intervals: 60,
                        period: 60
                    },
                    "6hr": {
                        metric: 'avg',
                        fields: ["local_temperature", "position", "battery_percent"],
                        intervals: 360 / 10,
                        period: 360
                    },
                    "Day": {
                        metric: 'avg',
                        fields: ["local_temperature", "position", "battery_percent"],
                        intervals: 24 * 4,
                        period: 24 * 60,
                    },
                    "TWk": {
                        metric: 'avg',
                        fields: ["local_temperature", "position", "battery_percent", "battery_mv"],
                        intervals: 24 * 7,
                        period: 24 * 60 * 7
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
            if (x) {
                const mode = x.target.textContent?.toUpperCase();
                this.api('set', { system_mode: mode });
                if (this.payload.system_mode.valueOf() !== mode) {
                    this.payload.system_mode = mode;
                }
            }
        });
        const system_mode = (this.payload.system_mode).multi();
        const color = this.payload.map(p => typeof p?.local_temperature?.valueOf() === 'number' && p?.system_mode !== 'off'
            && p?.local_temperature && p?.current_heating_setpoint
            ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
            : '#aaa').multi();
        return [
            td({
                onclick: () => this.toggleDetails(),
                style: {
                    opacity: this.payload.map(p => p?.is_charging || p?.battery_percent < 10 ? "1" : rssiScale(p.meta.rssi).toString())
                },
                className: this.payload.battery_percent.map(p => p < 10 ? 'flash' : '')
            }, this.payload.map(p => p?.is_charging ? '\uD83D\uDD0C' : p?.battery_percent < 10 ? '\uD83D\uDD0B' : '\uD83D\uDCF6')),
            td({
                onclick: () => this.toggleDetails()
            }, this.id.split('/')[1]),
            td(ClickOption({ disabled: system_mode.map(p => p === 'auto') }, "auto"), ClickOption({ disabled: system_mode.map(p => p === 'heat') }, "heat"), ClickOption({ disabled: system_mode.map(p => p === 'off') }, "off"), ClickOption({ disabled: system_mode.map(p => p === 'sleep') }, "sleep")),
            td({
                id: 'local_temperature',
                style: {
                    fontSize: '2em',
                    color: color
                }
            }, this.payload.local_temperature.map(t => t?.toFixed(1)), '°C'),
            td(div({
                id: 'current_heating_setpoint',
                onclick: () => {
                    const t = Number(prompt("Enter desired local_temperature for " + this.payload.meta.name));
                    if (t && t > 10 && t < 30) {
                        this.api("set", { current_heating_setpoint: t });
                    }
                },
                style: {
                    color: color
                }
            }, this.payload.current_heating_setpoint, '°C'), div({
                id: 'position'
            }, this.payload.position, '%'))
        ];
    }
});
export const Hub = BaseDevice.extended({
    styles: `.details > .Hub {
  border-radius: 0.5em;
  background: #222;
  color: #fff;
  border: 3px solid #880;
  height: 16em;
  }

  .details.zoomed > .Hub {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  height: initial;
  }

  .details > .controls #close {
    display: none;
  }

  .details.zoomed > .controls #close {
    display: initial;
  }

  .details > .controls {
    margin-top: 0.5em;
    position: absolute;
    left: 0.5em;
    z-index: 6;
  }

  .details.zoomed > .controls {
    display: block;
    position: fixed;
    top: 0.5em;
  }
  `,
    iterable: {
        payload: undefined
    },
    override: {
        api(subCommand, payload) {
            throw new Error("Hub does not support API calls");
        },
        sortOrder() {
            return "\xFF\xFF";
        },
        async details() {
            const net = div({ className: 'Hub' });
            const nodes = new DataSet();
            nodes.add({ id: '.', label: 'FreeHouse', color: '#cc0', shape: 'diamond', font: { color: 'white' } });
            // create an array with edges
            const edges = new DataSet();
            // create a network
            const options = {};
            const network = new Network(net, { nodes, edges }, options);
            function ageColor(age) {
                const hex = (n) => (n | 0).toString(16).padStart(2, '0');
                const n = Math.min(256, Math.max(0, age * 256 / 20000));
                return '#00' + hex(n) + hex(n);
            }
            const previousHub = {};
            this.payload.consume(p => {
                if (!net.isConnected) {
                    throw new Error("FreeHouse hub no longer in DOM");
                }
                for (const dev of p) {
                    previousHub[dev.mac] ??= new Set();
                    for (const prevHub of previousHub[dev.mac].values()) {
                        if (prevHub !== dev.hub) {
                            previousHub[dev.mac].delete(prevHub);
                            edges.remove(prevHub + dev.mac);
                        }
                    }
                    previousHub[dev.mac].add(dev.hub);
                    nodes.update({
                        id: dev.hub,
                        label: dev.hub,
                        color: '#c0c',
                        shape: 'box',
                        font: { color: 'white' }
                    });
                    edges.update({
                        id: '.' + dev.hub,
                        from: '.',
                        to: dev.hub,
                        width: 2
                    });
                    nodes.update({
                        id: dev.mac,
                        label: dev.name,
                        color: ageColor(dev.lastSeen),
                        shape: 'dot',
                        font: { color: 'white' }
                    });
                    edges.update({
                        id: dev.hub + dev.mac,
                        from: dev.hub,
                        to: dev.mac,
                        width: 12,
                        label: String(dev.rssi),
                        color: 'white'
                    });
                    setTimeout(() => {
                        edges.update({
                            id: dev.hub + dev.mac,
                            width: 8 * rssiScale(dev.rssi) + 1,
                            color: ''
                        });
                    }, 200);
                }
            });
            return [
                div({ className: 'controls' }, button({
                    id: 'zoom',
                    onclick: () => this.nextElementSibling?.classList.toggle('zoomed')
                }, "\u26F6"), button({
                    id: 'close',
                    onclick: () => this.toggleDetails()
                }, "❌")),
                net
            ];
        },
        toggleDetails() {
            this.nextElementSibling?.classList.contains('details')
                ? this.nextElementSibling.remove()
                : this.after(td({ colSpan: 6, className: 'details' }, this.details()));
        }
    },
    async constructed() {
        return [
            td('\uD83D\uDD0C'),
            td({
                onclick: () => this.toggleDetails()
            }, "FreeHouse Hub"),
            td(),
            td(),
            td()
        ];
    }
});
export const FreeHouseModels = {
    TRV1
};
