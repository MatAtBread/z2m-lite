
import { HistoryChart } from './HistoryChart.js';
import { FreeHouseDeviceMessage, FreeHouseDeviceStatus, FreeHouseHubMessage } from './message-types.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { DataSet, EdgeOptions, Network, NodeOptions } from './node_modules/vis-network/standalone/esm/vis-network.js';
import { BaseDevice, ClickOption } from './zdevices.js';

const { td, div, button, table, tr, input } = tag();

function rssiScale(rssi: number) {
  if (rssi > -30) return 1;
  if (rssi < -100) return  0;
  return (rssi + 100) / 70;
}

const TRV1 = BaseDevice.extended({
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
    }

    .popupThing {
      position: fixed;
      left: 0;
      top: 20%;
      background: black;
      border-radius: 0.5em;
      margin: 1em;
      padding: 1em;
      border: 3px solid #80f;
      font-size: 1.2em;
      z-index: 9;
      right: 0;
      width: auto;
    }

    .popupThing input {
      color: yellow;
      border-radius: 0.5em;
      border: 3px solid yellow;
      background-color: #334;
      margin: 0.5em;
      width: 4em;
      padding: 0.3em;
    }

    .popupThing table {
      width: 100%;
    }

    .popupThing td:nth-child(1) {
      text-align: right;
    }
`,
    iterable:{
      payload: {} as FreeHouseDeviceMessage<"TRV1">["payload"]
    },
    override: {
      api(subCommand: `set`, payload: Partial<FreeHouseDeviceMessage<"TRV1">["payload"]>) {
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
            intervals: 360/10,
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
            period: 24 * 60 *7
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
        if (x) {
          const mode = (x.target! as HTMLElement).textContent?.toUpperCase();
          this.api('set', { system_mode: mode });
          if (this.payload.system_mode.valueOf() !== mode) {
            this.payload.system_mode = mode as FreeHouseDeviceMessage<"TRV1">['payload']['system_mode'];
          }
        }
      });

      const system_mode = (this.payload.system_mode!).multi!();
      const color = this.payload.map!(p =>
        typeof p?.local_temperature?.valueOf() === 'number' && p?.system_mode !== 'off'
          && p?.local_temperature && p?.current_heating_setpoint
          ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
          : '#aaa').multi();

      return [
        td({
          onclick: () => this.toggleDetails(),
          style: {
              opacity: this.payload.map!(p => p?.is_charging || p?.battery_percent < 10 ? "1" : rssiScale(p.meta.rssi).toString())
          },
          className: this.payload.battery_percent.map!(p => p < 10 ? 'flash' : '')
      }, this.payload.map!(p => p?.is_charging ? '\uD83D\uDD0C' : p?.battery_percent < 10 ? '\uD83D\uDD0B' : '\uD83D\uDCF6')),
      td({
        onclick: () => this.toggleDetails()
      },this.id.split('/')[1]),
      td(
        ClickOption({ disabled: system_mode.map!(p => p === 'auto') }, "auto"),
        ClickOption({ disabled: system_mode.map!(p => p === 'heat') }, "heat"),
        ClickOption({ disabled: system_mode.map!(p => p === 'off') }, "off"),
        ClickOption({ disabled: system_mode.map!(p => p === 'sleep') }, "sleep"),
      ),
      td({
        id: 'local_temperature',
        style: {
          fontSize: '2em',
          color: color
        }
      }, this.payload.local_temperature.map!(t => t?.toFixed(1)), '°C'),
        td({
          onclick: ((src) => (function (this: ReturnType<typeof td>, e) {
              if (!this.querySelector('.popupThing')) {
                const payload = src.payload.valueOf();
                const popup = div({ className: 'popupThing' },
                  div({ style:{ fontWeight: "700", textAlign: "center", fontSize: "120%" }}, src.id.split('/')[1]),
                  table(
                    payload.meta.info.writeable.map(f =>
                      tr(
                        td(f.replaceAll(/_/g, ' ')),
                        td(
                          input({
                            name: f,
                            type: typeof payload[f] === 'number' ? 'number' : 'text',
                            value: String(payload[f])
                          })
                        )
                      )
                    )
                  ),
                  div(button({
                    onclick: (e) => {
                      src.api("set", Object.fromEntries([...popup.querySelectorAll('input')].map(input => [input.name, input.type === 'number' ? Number(input.value) : input.value])));
                      popup.remove();
                      e.stopPropagation();
                    }
                  }, "set"),
                    button({
                      onclick: (e) => {
                        popup.remove();
                        e.stopPropagation();
                      }
                    }, "❌"))
                )
                this.append(popup);
              }
              e.stopPropagation();
            })
          )(this)
        },
          div({
            id: 'current_heating_setpoint',
            style: {
              color: color
            }
          }, this.payload.current_heating_setpoint, '°C'),
          div({
            id: 'position'
          }, this.payload.position, '%')
        )
      ]
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
    payload: undefined as unknown as FreeHouseHubMessage["payload"]
  },
  override: {
    api(subCommand: `set` | `set/${string}`, payload: unknown) {
      throw new Error("Hub does not support API calls");
    },
    sortOrder(): string {
      return "\xFF\xFF";
    },
    async details() {
      const nodes = new DataSet<{ id: string, label: string } & NodeOptions>();
      nodes.add({ id: '.', label: 'FreeHouse', color: '#cc0', shape: 'diamond', font: { color: 'white' } });
      const edges = new DataSet<{ from: string, to: string, id: string } & EdgeOptions>();

      const net = div({ className: 'Hub' });
      net.focus();
      const network = new Network(net, { nodes, edges }, {
        physics: {
          minVelocity: 0.04
        }
      });

      network.on('click', (params:{ nodes: string[]}) => {
        for (const id of params.nodes)
          if (id.startsWith('hub:')) {
            window.open('http://'+id.slice(4), id);
          }
      })

      const previousHub: Record<string, Set<string>> = {};
      this.payload.consume!(p => {
        if (!net.isConnected) {
          network.destroy();
          throw new Error("FreeHouse hub no longer in DOM");
        }

        nodes.update({
          id: 'hub:'+p.hub,
          label: p.name,
          color: '#c0c',
          shape: 'box',
          font: { color: 'white' }
        });
        nodes.update({
          id: 'ssid:'+p.ssid,
          label: p.ssid,
          color: '#080',
          shape: 'box',
          font: { color: 'white' }
        });
        edges.update({
          id: '.' + p.hub,
          from : '.',
          to: 'ssid:'+p.ssid,
          width: 2
        });
        edges.update({
          id: p.ssid + p.hub,
          from : 'ssid:'+p.ssid,
          to: 'hub:'+p.hub,
          width: 2
        });

        const thisHub = p.hub;
        if (previousHub[thisHub]?.size) previousHub[thisHub].forEach(mac => {
          if (!p.devices.some(dev => dev.hub === thisHub && dev.mac === mac)) {
            edges.remove(thisHub + mac);
            previousHub[thisHub].delete(mac);
          }
        });

        p.devices.sort((a,b) => a.lastSeen - b.lastSeen).forEach((dev,idx) => {
          previousHub[dev.hub] ??= new Set();
          previousHub[dev.hub].add(dev.mac);
          nodes.update({
            id: 'dev:'+dev.mac,
            label: dev.name,
            color: '#0cc',
            shape: 'dot',
            font: { color: 'white' }
          });

          const edge = {
            id: dev.hub + dev.mac,
            from : 'hub:'+dev.hub,
            to: 'dev:'+dev.mac,
            width: 8 * rssiScale(dev.rssi) + 1,
            label: String(dev.rssi),
            color: '#cc0'
          };

          edges.update(idx ? edge : {...edge, width: 12, color: '#fff' });
          if (idx === 0) setTimeout(() => edges.update(edge), 250)
        });
      }).catch(e => console.log(e));

      return [
        div({ className: 'controls' },
          button({
            id: 'zoom',
            onclick: ()=> this.nextElementSibling?.classList.toggle('zoomed')
          }, "\u26F6"
          ),
          button({
            id: 'close',
            onclick: ()=> this.toggleDetails()
          }, "❌"
          )
        ),
         net
      ];
    },
    toggleDetails() {
      this.nextElementSibling?.classList.contains('details')
        ? this.nextElementSibling.remove()
        : this.after(td({ colSpan: 6, className: 'details' }, this.details()))
    }
  },
  async constructed() {
    return [
      td('\uD83D\uDD0C'),
      td({
        onclick: () => this.toggleDetails()
      },"FreeHouse Network"),
      td(),
      td(),
      td()
    ]
  }
});

export const FreeHouseModels = {
  TRV1
};