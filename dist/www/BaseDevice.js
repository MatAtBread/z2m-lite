import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
const { tr, td } = tag();
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
        deleteDevice() {
            this.mqtt.send(this.id, null);
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
