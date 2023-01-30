import type { BinaryFeature, Device, EnumFeature, Feature, LQIFeature, NumericFeature, TextFeature } from "./Features";
import { createHistoryChart } from "./history.js";
import { UIDevice } from "./UIDevice.js";
import { e } from "./utils.js";
import type { WsMqttConnection } from "./wsmqtt.js";

const [span, inlineBlock, button] = [e('span'), e('div', {
    style: 'display: inline-block'
  }), e('button')];
const block = e('div', { className: 'cell' });

type FeatureElementAttrs = Partial<{
    onvalue?: ((this: HTMLElement, ev: Event & { value: string | number | null }) => void);
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
    text: (attrs: Partial<HTMLElement> = {}) => (f: TextFeature, value: string | null) => {
      return span({
        update(this: HTMLSpanElement, v: string) {
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
  
export  class ZigbeeCoordinator extends UIDevice {
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
  
export class UIZigbee2mqttDevice extends UIDevice {
    readonly features: { [name: string]: Feature };

    constructor(readonly mqtt: WsMqttConnection ,readonly device: Device) {
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

    update(payload: { [property: string]: unknown }) {
      const columns = this.propertyColumns();
      for (const property of (Object.keys(columns) as Exclude<(keyof typeof columns), number>[])) {
        const value = property === 'friendly_name' ? this.device.friendly_name : payload[property];
        const feature = this.features[property];
        if (value !== undefined && feature) {
          let e = this.element.children[property];
          if (!e) {
            e = columns[property](feature as any, (feature.access || 0) & 6 ? value as any : null) || null;
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

    api(subCommand: string, payload: unknown) {
      this.mqtt.send(this.element.id + (subCommand ? '/' + subCommand : ''), payload)
    }
  }

  export const zigbeeDeviceModels = {
    S26R2ZB: class extends UIZigbee2mqttDevice {
      propertyColumns() {
        return {
          ...super.propertyColumns(),
          state: (f: BinaryFeature, value: string | null) => featureElement.binary({
            onvalue: (ev) => { this.api("set", { 'state': ev.value }) }
          })(f, value),
        }
      }
    },

    TS0601_thermostat: class extends UIZigbee2mqttDevice {
      propertyColumns() {
        return {
          ...super.propertyColumns(),
          system_mode: (f: EnumFeature, value: string | null) => featureElement.enum({
            onvalue: (ev) => {
              this.api("set", { 'system_mode': ev.value });
              if (ev.value !== 'off') this.api("set", { 'preset': 'comfort' });
            }
          })(f, value),
          local_temperature: featureElement.numeric(),
          current_heating_setpoint: featureElement.numeric(),
          position: (f: NumericFeature, value: string | null) => featureElement.numeric({
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
              fields: ["local_temperature", "position",/*"current_heating_setpoint"*/],
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
  }
