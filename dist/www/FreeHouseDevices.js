import { HistoryChart } from './HistoryChart.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { BaseDevice, ClickOption } from './zdevices.js';
const { td, div } = tag();
function rssiScale(rssi) {
    if (rssi > -30)
        return "1";
    if (rssi < -100)
        return "0";
    return String((rssi + 100) / 70);
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
        details() {
            return HistoryChart({
                topic: this.id,
                views: {
                    "6hr": {
                        metric: 'avg',
                        fields: ["local_temperature", "battery_mv", "mcu_temperature", "position"],
                        intervals: 360 / 10,
                        period: 360
                    },
                    "Day": {
                        metric: 'avg',
                        fields: ["local_temperature", "battery_mv", "mcu_temperature", "position"],
                        intervals: 24 * 4,
                        period: 24 * 60,
                    },
                    "TWk": {
                        metric: 'avg',
                        fields: ["local_temperature", "battery_mv", "mcu_temperature"],
                        intervals: 24 * 4 * 7,
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
                    opacity: this.payload.map(p => p?.is_charging || p?.battery_percent < 10 ? "1" : rssiScale(p.meta.rssi))
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
export const FreeHouseModels = {
    TRV1
};
