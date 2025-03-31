import { HistoryChart } from './HistoryChart.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { BaseDevice, ClickOption } from './zdevices.js';
const { td, span } = tag();
function rssiScale(rssi) {
    if (rssi > -30)
        return "1";
    if (rssi < -100)
        return "0";
    return String((rssi + 100) / 70);
}
const TRV1 = BaseDevice.extended({
    styles: `#temperature {
      width: 3em;
      text-align: right;
    }
    #heatingSetpoint {
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
                        fields: ["payload.temperature", "payload.batteryPercent", "payload.valve_position"],
                        intervals: 360 / 10,
                        period: 360
                    },
                    "Day": {
                        metric: 'avg',
                        fields: ["payload.temperature", "payload.batteryPercent", "payload.valve_position"],
                        intervals: 24 * 4,
                        period: 24 * 60,
                    },
                    "Wk": {
                        metric: 'avg',
                        fields: ["payload.temperature"],
                        intervals: 24 * 4,
                        period: 24 * 60,
                        segments: 7
                    },
                    "28d": {
                        metric: 'avg',
                        type: 'bar',
                        fields: ["payload.temperature"],
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
                this.api('set', { systemMode: mode });
                if (this.payload.payload.systemMode.valueOf() !== mode) {
                    this.payload.payload.systemMode = mode;
                }
            }
        });
        const systemMode = (this.payload.payload.systemMode).multi();
        return [
            td({
                onclick: () => this.toggleDetails(),
                style: {
                    opacity: this.payload.map(p => p.payload?.isCharging || p.payload?.batteryPercent < 10 ? "1" : rssiScale(p.rssi))
                },
                className: this.payload.payload.batteryPercent.map(p => p < 10 ? 'flash' : '')
            }, this.payload.payload.map(p => p?.isCharging ? '\uD83D\uDD0C' : p?.batteryPercent < 10 ? '\uD83D\uDD0B' : '\uD83D\uDCF6')),
            td({
                onclick: () => this.toggleDetails()
            }, this.id.split('/')[1]),
            td(ClickOption({ disabled: systemMode.map(p => p === 'AUTO') }, "auto"), ClickOption({ disabled: systemMode.map(p => p === 'HEAT') }, "heat"), ClickOption({ disabled: systemMode.map(p => p === 'OFF') }, "off"), ClickOption({ disabled: systemMode.map(p => p === 'SLEEP') }, "sleep")),
            td({
                id: 'temperature',
                style: {
                    color: this.payload.payload.map(p => typeof p?.temperature?.valueOf() === 'number' && p?.systemMode !== 'OFF'
                        && p?.temperature && p?.heatingSetpoint
                        ? p?.temperature >= p?.heatingSetpoint ? '#d88' : '#aaf'
                        : '#aaa')
                }
            }, this.payload.payload.temperature.map(t => t?.toFixed(1)), '°C'),
            td({
                id: 'heatingSetpoint',
                onclick: () => {
                    const t = Number(prompt("Enter desired temperature for" + this.payload.name));
                    if (t && t > 10 && t < 30) {
                        this.api("set", { heatingSetpoint: t });
                    }
                },
                style: {
                    color: this.payload.payload.map(p => typeof p?.temperatureCalibration === 'number' && p?.systemMode !== 'OFF'
                        && p?.temperature && p?.heatingSetpoint
                        ? p.temperature >= p.heatingSetpoint ? '#d88' : '#aaf'
                        : '#aaa')
                }
            }, this.payload.payload.heatingSetpoint, '°C'),
            td({
                id: 'position'
            }, this.payload.payload.valve_position, '%'),
        ];
    }
});
export const FreeHouseModels = {
    TRV1
};
