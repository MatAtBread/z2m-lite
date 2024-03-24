/// <reference path="./vendor.ts"/>

import type { DataQuery, DataResult, SeriesQuery } from "../data-api.js";
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';

console.log(tag);

declare global {
  interface Element {
    update<T>(this: T, value: unknown): T;
  }
  interface HTMLCollection {
    //@ts-ignore
    readonly [n: string | number]: HTMLElement | null;
    //@ts-ignore
    namedItem(name: string): HTMLElement | null;
  }
}

interface OtherZ2Message {
  topic: '';
  payload: { [key: string]: unknown };
}

interface DeviceAvailability {
  topic: `zigbee2mqtt/${string}/availability`;
  payload: { state: "online" | "offline" };
}

function isDeviceAvailability (topic:string, payload: any): payload is DeviceAvailability["payload"] {
  return !!topic.match(/zigbee2mqtt\/.*\/availability/) && payload;
}

interface BridgeDevices {
  topic: 'zigbee2mqtt/bridge/devices',
  payload: Device[]
}

interface BridgeState {
  topic: 'zigbee2mqtt/bridge/state',
  payload: { state: 'offline' | 'online' };
}

type EnergyImport = {
  cumulative: number;
  day: number;
  month: number;
  week: number;
}

type Price = {
  unitrate: number;
  standingcharge: number;
};

type Energy = {
  energy:{
    import: EnergyImport & {
      units: string;
      price: Price
    }
  }
};

interface GlowSensorGas {
  topic: `glow/${string}/SENSOR/gasmeter`;
  payload:{
    gasmeter: Energy;
  }
}

interface GlowSensorElectricity {
  topic: `glow/${string}/SENSOR/electricitymeter`;
  payload:{
    electricitymeter: Energy & {
      power: {
        value: number;
        units: string;
      }
    };
  }
}

function isGlowSensor(topic: string, payload: any): payload is GlowSensorGas["payload"] | GlowSensorElectricity["payload"] {
  return !!topic.match(/glow\/.*\/SENSOR\/(gasmeter|electricitymeter)/) && payload;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface BridgeInfo {
  topic: "zigbee2mqtt/bridge/info",
  payload: {
    "version": string;
    "commit": string;
    "coordinator": {
      "ieee_address": string;
      "type": string;
      "meta": object;
    },
    "network": { "channel": number, "pan_id": number, "extended_pan_id": number[] },
    "log_level": LogLevel,
    "permit_join": boolean,
    "permit_join_timeout"?: number, // Time in seconds till permit join is disabled, `undefined` in case of no timeout
    "config": object;
    "config_schema": object;
    "restart_required": boolean // Indicates whether Zigbee2MQTT needs to be restarted to apply options set through zigbee2mqtt/request/bridge/options
  }
}

interface BridgeConfig {
  topic: "zigbee2mqtt/bridge/config"
  payload?: never;
  // ...more fields here
}

interface BridgeLogging {
  topic: 'zigbee2mqtt/bridge/logging',
  payload: {
    level: LogLevel;
    message: string;
  };
}

interface BridgeLog {
  topic: 'zigbee2mqtt/bridge/log',
  message: string;
  meta?: {
    friendly_name?: string;
  }
  type: string;
  payload?: never;
}

type Z2Message = GlowSensorElectricity | GlowSensorGas | DeviceAvailability | BridgeDevices | BridgeState | BridgeLogging | BridgeLog | BridgeInfo | BridgeConfig | OtherZ2Message;

interface CommonFeature {
  // Bit 1: The property can be found in the published state of this device.
  // Bit 2: The property can be set with a /set command
  // Bit 3: The property can be retrieved with a /get command (when this bit is true, bit 1 will also be true)
  access?: 0|1|2|3|4|5|6|7;
  description: string;
  name: string;
  property: string;
}

interface BinaryFeature extends CommonFeature {
  type: "binary"
  value_off: string;
  value_on: string;
  value_toggle: string;
}

interface NumericFeature extends CommonFeature {
  type: "numeric"
  unit: string;
}

interface TextFeature extends CommonFeature {
  type: "text"
}

interface EnumFeature extends CommonFeature {
  type: 'enum';
  values: string[];
}

interface LQIFeature extends NumericFeature {
  unit: 'lqi';
  value_max: number;
  value_min: number;
}

type Feature = BinaryFeature | NumericFeature | EnumFeature | LQIFeature | TextFeature;

interface Device {
  friendly_name: string;
  ieee_address: string;
  definition?: {
    model: string;
    description: string;
    exposes: Array<{
      features: Feature[]
    } | Feature>;
  }
}

const POLLED_REFRESH_SECONDS = 180;

function ui(id: string) {
  return document.getElementById(id);
}

function log<T>(x:T) { console.log(x); return x };
  
type HTMLElementAttrs<E extends keyof HTMLElementTagNameMap> = {
  [A in keyof HTMLElementTagNameMap[E]]: Exclude<HTMLElementTagNameMap[E][A], null> extends Function
  ? HTMLElementTagNameMap[E][A]
  : HTMLElementTagNameMap[E][A] | string
};

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends {} ? DeepPartial<T[P]> : T[P];
}

function notUndefined<T>(x: T | undefined): x is T { return typeof x !== 'undefined' }

function e<K extends keyof HTMLElementTagNameMap>(tag: K, defaults?: DeepPartial<HTMLElementAttrs<K>>) {
  return (attrs: DeepPartial<HTMLElementAttrs<K>> | string | Node | undefined, ...children: (string | Node | undefined)[]) => {
    const e = document.createElement(tag);
    if (defaults)
      Object.assign(e, defaults);

    if (typeof attrs === 'object' && !(attrs instanceof Node)) {
      Object.assign(e, attrs);
      if (children)
        e.append(...children.filter(notUndefined));
    } else {
      if (children)
        e.append(...[attrs, ...children].filter(notUndefined));
      else if (typeof attrs !== 'undefined')
        e.append(attrs);
    }
    return e;
  }
}

const [div, span, inlineBlock, button, canvas] = [e('div'), e('span'), e('div', {
  style: 'display: inline-block'
}), e('button'), e('canvas')];

const row = e('div',{className: 'row'});
const block = e('div',{className: 'cell'});

type FeatureElementAttrs = Partial<{
  onvalue?: ((this: HTMLElement, ev: Event & { value: string | number | null, state?: unknown }) => void);
} & Omit<HTMLElement, 'onchange'>>;

const featureElement = {
  linkquality: (attrs: Partial<HTMLElement> = {}) => (f: LQIFeature, value: number | null) => {
    return span({
      update(this: HTMLSpanElement, v: number) {
        if (v !== value) {
          value = v;
          this.style.opacity = `${value / f.value_max}`;
        }
        return this;
      },
      ...attrs
    }, '\uD83D\uDCF6');
  },
  binary: (attrs: FeatureElementAttrs = {}) => (f: BinaryFeature, value: string | null) => {
    let self = inlineBlock({
      update(this: HTMLElement, v: string) {
        if (v !== value) {
          if (typeof value === 'string')
            if (this.children[value])
              (this.children[value] as HTMLButtonElement)!.disabled = false;
          value = v;
          if (this.children[v])
            (this.children[v] as HTMLButtonElement)!.disabled = true;
        }
        return this;
      },
      title: f.description,
      ...attrs
    }, ...[f.value_off, f.value_on].map(op => button({
      id: op,
      disabled: value === op,
      onclick: function (this: HTMLButtonElement) {
        this.disabled = true;
        attrs.onvalue?.call(self, Object.assign(new Event('value'), { value: op }));
      } as unknown as HTMLButtonElement['onclick']
    }, op)));
    return self;
  },
  combo: <PayloadStates extends { 
    [state_name: string]: { 
      [state:string]: string | number 
    }
  }>(states: PayloadStates,attrs: FeatureElementAttrs = {}) => {
      return (f: CommonFeature, value: unknown) => {
        let self = inlineBlock({
          update(this: HTMLElement, state: PayloadStates[keyof PayloadStates]) {
            // @ts-ignore
            const v = Object.entries(states).find(
            // @ts-ignore
            stateEntries => Object.entries(stateEntries[1]).every(e => e[1] === state[e[0]])
            )?.[0];

            if (v !== value) {
              if (typeof value === 'string')
                if (this.children[value])
                  (this.children[value] as HTMLButtonElement)!.disabled = false;
              value = v;
              if (typeof v==='string') {
                if (this.children[v])
                  (this.children[v] as HTMLButtonElement)!.disabled = true;
              }
            }
            return this;
          },
          title: f?.description,
          ...attrs
        }, ...Object.keys(states).map(op => button({
          id: op,
          disabled: value === op,
          onclick: function (this: HTMLButtonElement) {
            this.disabled = true;
            attrs.onvalue?.call(self, Object.assign(new Event('value'), { value: op, state: states[op] }));
          } as unknown as HTMLButtonElement['onclick']
        }, op)));
        return self;
      };
    },
  enum: (attrs: FeatureElementAttrs = {}) => (f: EnumFeature, value: string | null) => {
    let self = inlineBlock({
      update(this: HTMLElement, v: string) {
        if (v !== value) {
          if (value !== null)
            (this.children[value] as HTMLButtonElement)!.disabled = false;
          value = v;
          if (this.children[v])
            (this.children[v] as HTMLButtonElement)!.disabled = true;
        }
        return this;
      },
      title: f.description,
      ...attrs
    }, ...f.values.sort()/*.filter(op => ['auto', 'off', value].includes(op))*/.map(op => button({
      id: op,
      disabled: value === op,
      onclick: function (this: HTMLButtonElement) {
        this.disabled = true;
        attrs.onvalue?.call(self, Object.assign(new Event('value'), { value: op }));
      } as unknown as HTMLButtonElement['onclick']
    }, op)));
    return self;
  },
  numeric: (attrs: Partial<HTMLElement> = {}) => (f: NumericFeature, value: number | null) => {
    return span({
      update(this: HTMLSpanElement, v: number) {
        if (v !== value) {
          value = v;
          this.textContent = String(value)/*.replace(/\.5$/,'\u00BD')*/ + f.unit;
        }
        return this;
      },
      ...attrs
    }, value + f.unit);
  },
  text: (attrs: Partial<HTMLElement> = {}, labels?: { [l: string]: string }) => (f: TextFeature, value: string | null) => {
    return span({
      update(this: HTMLSpanElement, v: string) {
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

function logMessage(message: string) {
  const log = div(message);
  ui('log')?.append(log);
  setTimeout(()=>log.remove(), 15000);
}

function dataApi<Q extends DataQuery>(query: Q) {
  return fetch("/data/"+query.q+"/?"+encodeURIComponent(JSON.stringify({...query, q: undefined}))).then(res => res.json() as Promise<DataResult<Q>>);
}

window.onload = async () => {
  Chart.defaults.font.size = 20;
  Chart.defaults.color = '#fff';

  const devices = new Map<string, UIDevice>();
  class UIDevice<Payload = unknown> {
    readonly element: HTMLElement;

    constructor(id: string) {
      this.element = row({ id });
      devices.set(id, this);
      const devs = ui('devices')!;
      devs.append(
        ...[...devices.values()].sort(({ sortOrder: a},{sortOrder: b})=>a==b ? 0 : a < b ? -1 : 1).map(d => d.element)
      );
    }

    get sortOrder() { return this.element.id }

    toggleDeviceDetails(){
      if (this.element.nextElementSibling) {
        if (!this.element.nextElementSibling.id) {
          this.element.nextElementSibling.remove();
        } else {
          const details = this.showDeviceDetails();
          if (details) {
            this.element.parentElement?.insertBefore(div({ style: 'width: 100%' },...details), this.element.nextSibling)
          }
        }
      }
    }

    protected showDeviceDetails():HTMLElement[] { return [] }
    update(payload: Payload) {}
  }

  class UIZigbee2mqttDevice<DevicePayload = { [property: string]: unknown }> extends UIDevice<DevicePayload> {
    readonly features: { [name: string]: Feature };
    lastState?: DevicePayload;

    constructor(readonly device: Device) {
      super('zigbee2mqtt/' + device.friendly_name);
      this.features = { friendly_name: { type: 'text', name: 'friendly_name', property: 'friendly_name', description: 'Device name' } };
      if (device.definition?.exposes?.length) for (const f of device.definition.exposes) {
        const assignFeature = (f: Feature) => this.features[f.property] = f;
        if ('features' in f) {
          f.features.forEach(assignFeature);
        } else {
          assignFeature(f);
        }
      }
    }

    propertyColumns() {
      return {
        linkquality: featureElement.linkquality(),
        friendly_name: (f: TextFeature, value: string | null) => featureElement.text({
          onclick: () => {
            this.toggleDeviceDetails()
          }
        })(f, value)
      }
    }

    update(payload: DevicePayload) {
      this.lastState = payload;
      const columns = this.propertyColumns();
      for (const property of (Object.keys(columns) as Exclude<(keyof typeof columns), number>[])) {
        const value = property === 'friendly_name'
          ? this.device.friendly_name
          : payload[property as keyof DevicePayload];
        const feature = this.features[property];
        let e = this.element.children[property];
        if (!e) {
          e = columns[property](feature as any, (feature?.access || 0) & 6 ? value as any : null) || null;
          if (e) {
            e = block({ id: property }, e);
            this.element.append(e);
          }
        }
        if (value !== undefined) e?.firstElementChild?.update(value);
      }
      return true;
    }

    api(subCommand: string, payload: unknown) {
      mqtt.send(this.element.id + (subCommand ? '/' + subCommand : ''), payload)
    }
  }

  interface HistoryChart<Periods extends string> {
    topic: string, 
    cumulative?: boolean,
    scaleFactor?: number, 
    offset?: number,
    yText?: string,
    views: {
      [view in Periods]: {
        metric: SeriesQuery['metric'],
        fields: string[], 
        type?: 'line'|'bar',
        intervals: number,
        period: number,      // Minutes
        segments?: number
      }
    }
  }

  function*ascending(max: number) {
    for (let i=0; i<max; i++)
      yield i;
  }
  
  function*descending(max: number) {
    for (let i=max-1; i>=0; i--)
      yield i;
  }
  
  function createHistoryChart<P extends string>(
    {topic, cumulative, views, scaleFactor, offset, yText }: HistoryChart<P>, 
    style?: DeepPartial<HTMLElementAttrs<"canvas">>)
  {
    const elt = canvas(style);
    let openChart:Chart ;
    const keys = Object.keys(views) as (keyof typeof views)[];
    let zoom = keys[0];

    const drawChart = async (view: keyof HistoryChart<P>["views"]) => {
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

        openChart = new Chart(elt, {
          data: {
            datasets: segments > 1
              ? [...descending(segments)].map(seg => ({
                type,
                yAxisID: 'y' + fields[0],
                label: new Date(start + seg * period * 60_000).toDateString().slice(0,10),
                borderColor: `hsl(${((segments-1)-seg)*360/segments},100%,50%)`,
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
    const controls = [div({className: 'zoom'},
      ...keys.map((zoom,idx) => 
      button({ 
        id: 'zoomOut',
        className: idx ? '':'selected',
        onclick: async (e) => {
          (e.target as HTMLButtonElement).classList.add('selected');
          await drawChart(zoom);
          if (zoomed !== e.target) {
            zoomed.classList.remove('selected');
            zoomed = e.target as HTMLButtonElement;
          }
        }
      },zoom))),elt];
      let zoomed: HTMLButtonElement = controls[0].firstElementChild as HTMLButtonElement;
      return controls;
  }

  type BoilerStates = {
    state_l1: 'ON'|'OFF'; // Clock enable (ON: use clock, OFF: clock setting ignored)
    state_l2: 'ON'|'OFF'; // Clock bypass (ON: ignore clock, CHr on, OFF: use clock setting from _l1)
    state_l3: 'ON'|'OFF'; // Boiler off (ON: use _l1 & _l2, OFF: CH disabled)
  };
  const zigbeeDeviceModels = {
    "Central Heating": class extends UIZigbee2mqttDevice<BoilerStates> {
      update(payload: BoilerStates) {
        super.update(payload);
        this.element.children.boilerControls?.firstElementChild?.update(payload);
        return true;
       }

      propertyColumns() {
        return {
          ...super.propertyColumns(), 
          boilerControls: (f: CommonFeature, value: BoilerStates) => featureElement.combo({
            clock: { state_l1: 'ON', state_l2: 'OFF' },
            on: { state_l2: 'ON' },
            off: { state_l1: 'OFF', state_l2: 'OFF' }
          },{
            onvalue:(ev) => { 
              if (ev.state)
                this.api("set", ev.state);
            }
          })(f, value),
          state_l3: featureElement.text({},{
            ON: '',
            OFF: 'Paused (no radiators are on)'
          })
        }
      }
    },

    S26R2ZB: class extends UIZigbee2mqttDevice {
      propertyColumns() {
        return {
          ...super.propertyColumns(), 
          state: (f: BinaryFeature, value: string | null) => featureElement.binary({
            onvalue:(ev) => { this.api("set", { 'state': ev.value }) }
          })(f, value),
        }
      }
    },

    TS0601_thermostat: class extends UIZigbee2mqttDevice {
      update(payload: any) {
        super.update(payload);
        const color = 
          typeof payload.local_temperature_calibration === 'number' && payload.system_mode !== 'off'
          ? payload.local_temperature >= payload.current_heating_setpoint ? '#d88' : '#aaf'
          : '#aaa';
        (this.element.children.local_temperature!.firstElementChild as HTMLElement).style.color = color;
        (this.element.children.current_heating_setpoint!.firstElementChild as HTMLElement).style.color = color;

        if (payload.battery_low) {
          const lq = (this.element.children.linkquality!.firstElementChild as HTMLElement);
          lq.classList.add('flash');
          lq.textContent = '\uD83D\uDD0B';
        }
        return true;
      }

       propertyColumns() {
        return {
          ...super.propertyColumns(), 
          system_mode: (f: EnumFeature, value: string | null) => featureElement.enum({
            onvalue:(ev) => {
              this.api("set", { 'system_mode': ev.value });
              if (ev.value !== 'off') this.api("set", { 'preset': 'comfort' });
            }
          })(f, value),
          local_temperature: (f: NumericFeature, value: string | null) => featureElement.numeric({
            onclick: (e) => {
              if (this.features.preset && this.features.system_mode && confirm("Get temperature of " + this.device.friendly_name + "?")) {
                (e.target! as HTMLElement)!.update('\u2026');
                this.api("set", { 'preset': 'comfort' });
                this.lastState && this.api("set/local_temperature_calibration", this.lastState.local_temperature_calibration);
              }
            }
          })(f, Number(value)),
          current_heating_setpoint: featureElement.numeric(),
          position: featureElement.numeric()
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
        });
      }
    }
  }

  class Smets2Device extends UIDevice {
    price(period: keyof EnergyImport, {energy}: Energy) {
      return '\u00A3'+(energy.import[period] * energy.import.price.unitrate + energy.import.price.standingcharge).toFixed(2)
    }
  }

  const Glow = {
    electricitymeter: class extends Smets2Device {
      cost: HTMLElement;
      power: HTMLElement;
      unitrate: number;
      standingcharge: number;

      constructor(id: string) {
        super(id);
        this.unitrate = 1;
        this.standingcharge = 0;
        this.element.onclick = () => this.toggleDeviceDetails();
        this.element.append(
          block("\u26A1"),
          block({id: 'day' }),
          block({id: 'spotvalue' }, this.power = span({id: 'kWh'}), this.cost = span({ id: 'cost' })),
        );
      }

      update(payload: GlowSensorElectricity["payload"]) {
        this.unitrate = payload.electricitymeter.energy.import.price.unitrate;
        this.standingcharge = payload.electricitymeter.energy.import.price.standingcharge;

        this.element.children.day!.textContent = this.price('day', payload.electricitymeter);
        this.power.textContent = 
          `${payload.electricitymeter?.power?.value} ${payload.electricitymeter?.power?.units}`;
        this.cost.textContent = 
          `\u00A3${(payload.electricitymeter?.power?.value * payload.electricitymeter.energy.import.price.unitrate).toFixed(2)}/h`;

        const hue = Math.max(Math.min(120,120 - Math.floor(120 * (payload.electricitymeter?.power?.value / 2))),0);
        this.element.children.spotvalue!.style.backgroundColor = `hsl(${hue} 100% 44%)`;
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
    
    gasmeter: class extends Smets2Device {
      unitrate: number;
      standingcharge: number;
      constructor(id: string) {
        super(id);
        this.unitrate = 1;
        this.standingcharge = 0;
        this.element.onclick = () => this.toggleDeviceDetails();
        this.element.append(
          block("\u{1F525}"),
          block({id: 'day' }),
          block("\u00A0"),
        );
      }

      update(payload: GlowSensorGas["payload"]) {
        this.unitrate = payload.gasmeter.energy.import.price.unitrate;
        this.standingcharge = payload.gasmeter.energy.import.price.standingcharge;
        this.element.children['day']!.textContent = this.price('day', payload.gasmeter);
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
    }
  }

  class WsMqttConnection {
    private socket: WebSocket | null = null;
    constructor(wsHost: string, readonly onmessage: (p: MessageEvent<any>) => void) {
      ui('reconnect')!.onclick = () => this.connect(wsHost);
      this.connect(wsHost);
    }

    private connect(z2mHost: string) {
      ui('reconnect')!.style.display = 'none';
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
      ui('reconnect')!.style.display = 'inline-block';
    }
    send(topic: string, payload: unknown) {
      try {
        this.socket!.send(JSON.stringify({ topic, payload }));
      } catch (ex) {
        this.promptReconnect();
      }
    }
  }

  class ZigbeeCoordinator extends UIDevice {
    constructor(z2mHost: string) {
      super('zigbee2mqtt/Coordinator');
      this.element.append(
        button({
          id: 'manage',
          async onclick() { window.open('http://' + z2mHost + '/', 'manager') }
        }, 'Manage devices'));
    }
    get sortOrder() { return '\uFFFF' }
  }

  fetch("/z2mhost")
    .then(res => res.text() ||  window.location.host)
    .catch(_ => window.location.host)
    .then(host => new ZigbeeCoordinator(host));

  const bridgeDevices = await dataApi({q:'latest', topic: 'zigbee2mqtt/bridge/devices' }).then(
    res => Object.fromEntries(((res?.payload as BridgeDevices["payload"]).map(x => [x.friendly_name, x])) ?? {}) 
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
        if (d.friendly_name in bridgeDevices) {
          // Deep merge?
          Object.assign(bridgeDevices[d.friendly_name], d);
        } else {
          bridgeDevices[d.friendly_name] = d;
        }
      }
    } else if (topic === 'zigbee2mqtt/bridge/state') {
      switch (payload.state) {
        case 'offline':
          mqtt.promptReconnect();
          break;
        case 'online':
          ui('reconnect')!.style.display = 'none';
          break;
        default:
          console.log("BRIDGE MESSAGE", topic, payload);
          break;
      }
    } else if (topic === 'zigbee2mqtt/bridge/logging') {
      if (payload.level === 'warn' || payload.level === 'error') {
        logMessage(payload.message);
      }
    } else if (topic === 'zigbee2mqtt/bridge/log') {
    } else if (topic === 'zigbee2mqtt/bridge/config') {
    } else if (topic === 'zigbee2mqtt/bridge/info') {
    } else if (subTopic[0] === 'zigbee2mqtt' && typeof payload === 'object' && payload) {
      const descriptor = bridgeDevices[subTopic[1]];
      if (descriptor) {
        let uiDev = devices.get('zigbee2mqtt/' + descriptor.friendly_name);
        if (!uiDev) {
          const model = String(descriptor.definition?.model) as keyof typeof zigbeeDeviceModels;
          const uiClass = 
            descriptor.friendly_name in zigbeeDeviceModels 
              ? zigbeeDeviceModels[descriptor.friendly_name as keyof typeof zigbeeDeviceModels] 
              : model in zigbeeDeviceModels 
                ? zigbeeDeviceModels[model] 
                : UIZigbee2mqttDevice;
          uiDev = new uiClass(descriptor);
        }
        if (isDeviceAvailability(topic,payload)) 
          uiDev.element.style.opacity = payload.state === 'online' ? "1":"0.5";
        if (!subTopic[2])
          uiDev.update(payload);
    } else {
        console.warn("No device descriptor for", topic, payload);
      }
    } else if (isGlowSensor(topic,payload)) {
      const uiDev = devices.get(topic) ?? ((subTopic[3] in Glow) && new Glow[subTopic[3] as keyof typeof Glow](topic));
      if (uiDev)
        uiDev.update(payload);
    } else {
      console.log("Other message:",topic, payload);
    }
  }
  (window as any).mqtt = mqtt;
}


