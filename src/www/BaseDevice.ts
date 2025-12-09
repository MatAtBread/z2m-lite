import { ChildTags, Iterators, tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { Device } from './message-types.js';
import type { WsMqttConnection } from './WsMqttConnection.js';

const { tr, td } = tag();

export const BaseDevice = tr.extended({
  iterable: {
    payload: {} as object
  },
  override: {
    className: 'BaseDevice'
  },
  styles: `.BaseDevice > td:nth-child(2) {
    white-space: normal;
  }`,
  declare: {
    device: undefined as unknown as Device,
    mqtt: undefined as unknown as WsMqttConnection,
    api(subCommand: `set` | `set/${string}`, payload: unknown) {
      this.mqtt.send(this.id + (subCommand ? '/' + subCommand : ''), payload);
    },
    deleteDevice() {
      this.mqtt.send(this.id, null);
    },
    details(): ChildTags {
      return undefined;
    },
    sortOrder(): string {
      return this.children[1]?.textContent || this.id.split('/').pop()!;
    },
    toggleDetails() {
      this.nextElementSibling?.className == 'details'
        ? this.nextElementSibling.remove()
        : this.after(td({ colSpan: 6, className: 'details' }, this.details()));
    }
  },
  constructed() {
    // this.payload.filterMap!((o,_p) => {
    //   const p = _p as any;
    //   const shallowEqual = Object.entries(o).filter(([k,v]) => !(typeof v !=='object' && p[k] === v));
    //   console.log(this.id, shallowEqual);
    //   return o === p || shallowEqual.length === 0 ? Iterators.Ignore : o;
    // }).consume(() => this.lastElementChild?.classList.add('updating'));
  }
});
