/// <reference path="./vendor.ts"/>

import type { DataQuery, DataResult, SeriesQuery } from "../data-api.js";
import type { GlowSensorGas, GlowSensorElectricity, DeviceAvailability, LQIFeature, Device, EnergyImport, Energy, BridgeDevices, Z2Message } from "./message-types.js";
import { ChildTags, tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';

function isGlowSensor(topic: string, payload: any): payload is GlowSensorGas["payload"] | GlowSensorElectricity["payload"] {
  return !!topic.match(/glow\/.*\/SENSOR\/(gasmeter|electricitymeter)/) && payload;
}

function isDeviceAvailability (topic:string, payload: any): payload is DeviceAvailability["payload"] {
  return !!topic.match(/zigbee2mqtt\/.*\/availability/) && payload;
}

function dataApi<Q extends DataQuery>(query: Q) {
  return fetch("/data/"+query.q+"/?"+encodeURIComponent(JSON.stringify({...query, q: undefined}))).then(res => res.json() as Promise<DataResult<Q>>);
}

const { div, button, table, tr, td, span, canvas } = tag();

window.onload = async () => {
  Chart.defaults.font.size = 20;
  Chart.defaults.color = '#fff';

  const reconnect = document.getElementById('reconnect');
  class WsMqttConnection {
    private socket: WebSocket | null = null;
    constructor(wsHost: string, readonly onmessage: (p: MessageEvent<any>) => void) {
      reconnect!.onclick = () => this.connect(wsHost);
      this.connect(wsHost);
    }

    private connect(z2mHost: string) {
      reconnect!.style.display = 'none';
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
      reconnect!.style.display = 'inline-block';
    }
    send(topic: string, payload: unknown) {
      try {
        this.socket!.send(JSON.stringify({ topic, payload }));
      } catch (ex) {
        this.promptReconnect();
      }
    }
  }

  interface HistoryChartAttrs {
    topic: string, 
    cumulative?: boolean,
    scaleFactor?: number, 
    offset?: number,
    yText?: string,
    views: {
      [view : string]: {
        metric: SeriesQuery['metric'],
        fields: string[], 
        type?: 'line'|'bar',
        intervals: number,
        period: number,      // Minutes
        segments?: number
      }
    }
  }

  function*descending(max: number) {
    for (let i=max-1; i>=0; i--)
      yield i;
  }


  const HistoryChart = div.extended({
    declare: {} as HistoryChartAttrs,
    constructed() {
      const { views, topic, cumulative, scaleFactor, offset, yText } = this;
      let openChart: Chart;
      const keys = Object.keys(views);
      let zoom = keys[0];
      const chartCanvas = canvas();
 
      const drawChart = async (view: string | number) => {
        const { fields, intervals, period, metric } = views[view];
        const segments = views[view].segments || 1;
        const type = views[view].type || 'line';

        if (segments !== 1 && fields.length !== 1)
          throw new Error("Multiple segments and fields. Only one of segments & fields can be multi-valued");

        const step = period / intervals * 60_000;
        const start = segments > 1
          ? (Math.floor(Date.now() / (period * 60_000)) - (segments - 1)) * (period * 60_000)
          : Math.floor((Date.now() - period * 60_000) / step + 1) * step;

        const srcData = await dataApi({
          q: 'series',
          metric,
          topic,
          interval: period / intervals,
          start,
          end: start + segments * period * 60_000,
          fields,
        });
        if (srcData?.length) {
          if (openChart)
            openChart.destroy();

          // Fill in any blanks in the series
          const data: typeof srcData = [];
          for (let i = 0; i < intervals * segments; i++) {
            const t = start + i * period * 60_000 / intervals;
            data[i] = srcData.find(d => d.time === t) || { time: t };
          }

          const segmentOffset = start + (segments - 1) * period * 60_000;

          openChart = new Chart(chartCanvas as HTMLCanvasElement, {
            data: {
              datasets: segments > 1
                ? [...descending(segments)].map(seg => ({
                  type,
                  yAxisID: 'y' + fields[0],
                  label: new Date(start + seg * period * 60_000).toDateString().slice(0, 10),
                  borderColor: `hsl(${((segments - 1) - seg) * 360 / segments},100%,50%)`,
                  pointRadius: 0,
                  pointHitRadius: 5,
                  spanGaps: type === 'line',
                  data: data.slice(seg * intervals, (seg + 1) * intervals).map((d, i) => ({
                    x: segmentOffset + (d.time % (period * 60_000)),
                    y: (cumulative ? (d[fields[0]] - data[seg * intervals + i - 1]?.[fields[0]] || NaN) : d[fields[0]]) * (scaleFactor || 1) + (offset || 0)
                  }))
                }))
                : fields.map((k, i) => ({
                  type,
                  pointRadius: 0,
                  pointHitRadius: 5,
                  spanGaps: type === 'line',
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
      const controls = [div({ className: 'zoom' },
        ...keys.map((zoom, idx) =>
          button({
            id: 'zoomOut',
            className: idx ? '' : 'selected',
            onclick: async (e) => {
              (e.target as HTMLButtonElement).classList.add('selected');
              await drawChart(zoom);
              if (zoomed !== e.target) {
                zoomed.classList.remove('selected');
                zoomed = e.target as HTMLButtonElement;
              }
            }
          }, zoom))), chartCanvas];
      let zoomed: HTMLButtonElement = controls[0].firstElementChild as HTMLButtonElement;
      return controls;
    }
  });

  const ZigbeeCoordinator = div.extended({
    styles:`.ZigbeeCoordinator {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      text-align: center;
    }
    .ZigbeeCoordinator button {
      width: 60%;
    }`,
    override:{
      className: 'ZigbeeCoordinator',
    },
    constructed() {
      return fetch("/z2mhost")
        .then(res => res.text() ||  window.location.host)
        .catch(_ => window.location.host)
        .then(host => button({
          onclick:() => window.open('http://' + host + '/', 'manager')
        },'Manage devices'))
    }
  });

  const ClickOption = button.extended({
    override: {
      className: 'ClickOption',
      onclick(){ this.disabled = true }
    }
  });

  const DevUI = tr.extended({
    iterable: {
      payload: {} as Record<string,any>
    },
    declare:{
      device: undefined as unknown as Device,
      api(subCommand: `set` | `set/${string}`, payload: Record<string,unknown>) {
        mqtt.send(this.id + (subCommand ? '/' + subCommand : ''), payload);
     },
     details():ChildTags {
      return undefined;
     }
    },
    constructed() {
      this.id = 'zigbee2mqtt/'+this.device.friendly_name;
      const maxLQ = (this.device.definition?.exposes.find(f => 'name' in f && f.name === 'linkquality' ) as LQIFeature | undefined)?.value_max;
      if (this.device.definition) {
        this.title = this.device.definition.description;
      }

      return [
        td({
          onclick: () => this.nextElementSibling?.className == 'details' 
            ? this.nextElementSibling.remove() 
            : this.after(td({colSpan: 6, className: 'details'}, this.details())), 
          style: { 
            opacity: this.payload.map!(p => !maxLQ || p.battery_low ? "1" : String(p.linkquality / maxLQ) ) 
          },
          className: this.payload.map!(p => p.battery_low ? 'flash' : '') 
        }, 
          this.payload.map!(p => p.battery_low ? '\uD83D\uDD0B' : '\uD83D\uDCF6')
        ),
        td({ 
          onclick: () => this.nextElementSibling?.className == 'details' 
            ? this.nextElementSibling.remove() 
            : this.after(td({colSpan: 6, className: 'details'}, this.details())), 
          id: 'friendly_name' 
        }, this.device.friendly_name)
      ]
    }
  });

  const zigbeeDeviceModels = {
    S26R2ZB: DevUI.extended({
      constructed() {
        this.when('click:.ClickOption').consume(x => { 
          x 
          ? this.api('set', { state: (x.target! as HTMLElement).textContent }) 
          : null 
        });
        
        return td(
          ClickOption({ disabled: this.payload.map!(p => p?.state === 'OFF')}, "OFF"),
          ClickOption({ disabled: this.payload.map!(p => p?.state === 'ON')}, "ON")    
        )
      }
    }),

    TS0601_thermostat: DevUI.extended({
      override:{
        details(){
          return HistoryChart({
            topic: this.id, 
            views: {
              /*"4hr": {
                fields: ["local_temperature", "position"],
                intervals: 240/15,
                period: 240
              },*/
              "Day":{
                metric: 'avg',
                fields: ["local_temperature", "position",/*"current_heating_setpoint"*/],
                intervals: 24 * 4,
                period: 24 * 60,
              },
              "Wk":{
                metric: 'avg',
                fields: ["local_temperature"],
                intervals: 24 * 4,
                period: 24 * 60,
                segments: 7
              },
              "28d":{
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
        
        return [td(
          ClickOption({ disabled: this.payload.map!(p => p?.system_mode === 'auto')}, "auto"),
          ClickOption({ disabled: this.payload.map!(p => p?.system_mode === 'heat')}, "heat"),
          ClickOption({ disabled: this.payload.map!(p => p?.system_mode === 'off')}, "off")
        ),
        td({ 
          id: 'local_temperature',
          onclick: (e) => {
            if (confirm("Get temperature of " + this.device.friendly_name + "?")) {
              this.payload.local_temperature = '\u2026';
              this.api("set", { 'preset': 'comfort' });
              if (typeof this.payload?.local_temperature_calibration?.valueOf() === 'number') 
                this.api("set/local_temperature_calibration", 
                  this.payload?.local_temperature_calibration.valueOf());
            }
          },
          style: {
            color: this.payload.map!(p => 
              typeof p?.local_temperature?.valueOf() === 'number' && p?.system_mode !== 'off'
                ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
                : '#aaa')
          }
        }, this.payload.map!(p => p?.local_temperature),'°C'),
        td({ 
          id: 'current_heating_setpoint', 
          style: {
            color: this.payload.map!(p => 
              typeof p?.local_temperature_calibration === 'number' && p?.system_mode !== 'off'
                ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
                : '#aaa')
          }
        }, this.payload.map!(p => p?.current_heating_setpoint),'°C'),
        td({ 
          id: 'position'
        },this.payload.map!(p => p?.position), '%'),
      ]
      }
    }),

    "Central Heating":  DevUI.extended({
      constructed() {
        this.when('click:.ClickOption').consume(x => {
          const mode = (x.target! as HTMLElement).textContent 
          x 
          ? this.api('set', { 
            state_l1: mode == 'clock' ? 'ON' : mode == 'off' ? 'OFF' : undefined,
            state_l2: mode == 'on'? 'ON' : 'OFF'
          }) 
          : null 
        });

       return [
          td(
            ClickOption({ disabled: this.payload.map!(p => p?.state_l1 === 'ON' &&  p?.state_l2 === 'OFF')}, "clock"),
            ClickOption({ disabled: this.payload.map!(p => p?.state_l2 === 'ON')}, "on"),
            ClickOption({ disabled: this.payload.map!(p => p?.state_l1 === 'OFF' &&  p?.state_l2 === 'OFF')}, "off")
          ),
          td({ id: 'state_l3', colSpan: 3 },
            this.payload.map!(p => p?.state_l3 === 'ON' ? '' : 'Paused (no radiators are on)')
          )
        ]
      }
    }),

    "ti.router": DevUI.extended({
      override:{
        style:{
          display: 'none'
        }
      }
    }),

    "Coordinator": DevUI.extended({
      override:{
        style:{
          display: 'none'
        }
      }
    })
  };


  function addDevice(device: Device) {
    const controls = zigbeeDeviceModels[device.friendly_name as keyof typeof zigbeeDeviceModels]
    ?? zigbeeDeviceModels[device.definition?.model as keyof typeof zigbeeDeviceModels]
    ?? DevUI;
    devices.append(controls({ device }));
    devices.sort();
  }

  const Smets2Device = tr.extended({
    declare: {
      price(period: keyof EnergyImport, {energy}: Energy) {
        return '\u00A3'+(energy.import[period] * energy.import.price.unitrate + energy.import.price.standingcharge).toFixed(2)
      },
      showHistory() {
        this.nextElementSibling?.className == 'details' 
        ? this.nextElementSibling.remove() 
        : this.after(td({colSpan: 6, className: 'details'}, this.details()))        
      },
      details():ChildTags {
        return undefined;
      }
  }
  });

  const Glow = {
    electricitymeter: Smets2Device.extended({
      iterable: {
        payload: {} as unknown as GlowSensorElectricity["payload"]
      },
      declare:{
        get unitrate():number { return this.payload?.electricitymeter.energy.import.price.unitrate },
        get standingcharge():number { return this.payload?.electricitymeter.energy.import.price.standingcharge }
      },
      override:{
        details(){
          return HistoryChart({
            topic: this.id,
            yText: 'kW',
            cumulative: true,
            //scaleFactor: this.unitrate,
            //offset: this.standingcharge,
            views: {
              "15m": {
                metric: 'avg',
                fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                intervals: 30,
                period: 15
              },
              "4hr": {
                metric: 'avg',
                fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                intervals: 240,
                period: 240
              },
              "Day":{
                metric: 'avg',
                fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                intervals: 24 * 4,
                period: 24 * 60,
              },
              "Wk":{
                metric: 'avg',
                fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                intervals: 4 * 24,
                period: 24 * 60,
                segments: 7
              },
              "28d":{
                metric: 'max',
                type: 'bar',
                fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                intervals: 28,
                period: 28 * 24 * 60,
              }
            }
        });
        }
      },
      constructed() {
        return [
          td({ onclick: this.showHistory.bind(this) }, "\u26A1"),
          td({ onclick: this.showHistory.bind(this) }, this.payload.map!(p => this.price('day', p.electricitymeter))),
          td({ 
            colSpan: 3, 
            id: 'spotvalue', 
            style: { backgroundColor: this.payload.map!(p => `hsl(${Math.max(Math.min(120,120 - Math.floor(120 * (p.electricitymeter?.power?.value / 2))),0)} 100% 44%)`) } 
          }, 
            span({ id: 'kWh' }, this.payload.map!(p => `${p.electricitymeter?.power?.value} ${p.electricitymeter?.power?.units}`)), 
            span({ id: 'cost' }, this.payload.map!(p => `\u00A3${(p.electricitymeter?.power?.value * p.electricitymeter.energy.import.price.unitrate).toFixed(2)}/h`))
          )
        ]
      }
    }),
    
    gasmeter: Smets2Device.extended({
      iterable: {
        payload: {} as unknown as GlowSensorGas["payload"]
      },
      declare:{
        get unitrate():number { return this.payload?.gasmeter.energy.import.price.unitrate },
        get standingcharge():number { return this.payload?.gasmeter.energy.import.price.standingcharge }
      },  
      override:{
        details(){
          return HistoryChart({
            topic: this.id,
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
              "Day":{
                metric: 'avg',
                fields: ['gasmeter.energy.import.cumulative'],
                intervals: 24 * (60/30),
                period: 24 * 60,
              },
              "Wk":{
                metric: 'avg',
                fields: ['gasmeter.energy.import.cumulative'],
                intervals: 24 * (60/30),
                period: 24 * 60,
                segments: 7
              },
              "28d":{
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
      constructed() {
        return [
          td({ onclick: this.showHistory.bind(this) }, "\u{1F525}"),
          td({ onclick: this.showHistory.bind(this) }, this.payload.map!(p => this.price('day', p.gasmeter))),
          td("\u00A0"),
        ]
      }
    })
  }

  const devices = table.extended({
    styles: `.Devices {
      margin-bottom: 3em;
      width: 100%;
    }`,
    ids: {} as { [friendly_name: string]: typeof DevUI },
    override:{
      className: 'Devices'
    },
    declare:{
      sort() {
        this.append(...[...this.children].sort((a, b) => a.id.localeCompare(b.id)));
      }
    }
  })();
  
  dataApi({ q: 'latest', topic: 'zigbee2mqtt/bridge/devices' }).then(
    res => (res.payload as BridgeDevices["payload"])
      .map(x => addDevice(x)));

  document.body.append(
    ZigbeeCoordinator(),
    devices
  );

  const retained = await dataApi({q:'stored_topics', since: Date.now() - 86400000});
  if (retained) {
    for (const message of retained) {
      parseTopicMessage(message as Z2Message)
    }
  }

  const mqtt = new WsMqttConnection(window.location.host,async m => {
    parseTopicMessage(JSON.parse(m.data));
  });

  function parseTopicMessage({topic,payload}:Z2Message) {
    const subTopic = topic.split('/');
    if (topic === 'zigbee2mqtt/bridge/devices') {
      // Merge in the retained devices
      for (const d of payload) {
        const devID = 'zigbee2mqtt/' + d.friendly_name;
        if (devices.ids[devID]) {
          devices.ids[devID].device = d;
        } else {
          addDevice(d);
        }
      }
    } else if (topic === 'zigbee2mqtt/bridge/state') {
      switch (payload.state) {
        case 'offline':
          mqtt.promptReconnect();
          break;
        case 'online':
          reconnect!.style.display = 'none';
          break;
        default:
          console.log("BRIDGE MESSAGE", topic, payload);
          break;
      }
    } else if (topic === 'zigbee2mqtt/bridge/logging') {
      if (payload.level === 'warn' || payload.level === 'error') {
        // logMessage(payload.message);
      }
    } else if (topic === 'zigbee2mqtt/bridge/log') {
    } else if (topic === 'zigbee2mqtt/bridge/config') {
    } else if (topic === 'zigbee2mqtt/bridge/info') {
    } else if (subTopic[0] === 'zigbee2mqtt' && typeof payload === 'object' && payload) {
      const devID = subTopic[0] + '/' + subTopic[1];
      if (devices.ids[devID]) {
        if (isDeviceAvailability(topic,payload)) 
        devices.ids[devID].style.opacity = payload.state === 'online' ? "":"0.5";
      else {
        devices.ids[devID].payload = Object.fromEntries([
          ...Object.entries(devices.ids[devID].payload.valueOf()),
          ...Object.entries(payload)
        ]);
      }
      }
    } else if (isGlowSensor(topic,payload)) {
      if (!devices.ids[topic] && (subTopic[3] in Glow)) {
        devices.append(Glow[subTopic[3] as keyof typeof Glow]({ id: topic, payload: payload as any }));
        devices.sort();
      } else {
        devices.ids[topic].payload = payload;
      }
    } else {
      console.log("Other message:",topic, payload);
    }
  }
//  (window as any).mqtt = mqtt;
}


