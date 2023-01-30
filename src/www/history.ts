import type { SeriesQuery } from "../data-api";
import { dataApi, DeepPartial, e, HTMLElementAttrs } from "./utils.js";

interface HistoryChart<Periods extends string> {
    topic: string,
    cumulative?: boolean,
    hourlyRate?: number,
    metric: SeriesQuery['metric'],
    views: {
        [view in Periods]: {
            fields: string[],
            type?: 'line' | 'bar',
            intervals: number,
            period: number,      // Minutes
            segments?: number
        }
    }
}


function* descending(max: number) {
    for (let i = max - 1; i >= 0; i--)
        yield i;
}

const canvas = e('canvas');
const div = e('div');
const button = e('button');

export function createHistoryChart<P extends string>(
    { topic, cumulative, metric, views, hourlyRate }: HistoryChart<P>,
    style?: DeepPartial<HTMLElementAttrs<"canvas">>) {
    const elt = canvas(style);
    let openChart: Chart;
    const keys = Object.keys(views) as (keyof typeof views)[];
    let zoom = keys[0];

    const drawChart = async (view: keyof HistoryChart<P>["views"]) => {
        const { fields, intervals, period } = views[view];
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

            const scaleFactor = hourlyRate ? hourlyRate * intervals / period * 60 : 1;
            const segmentOffset = start + (segments - 1) * period * 60_000;

            openChart = new Chart(elt, {
                data: {
                    datasets: segments > 1
                        ? [...descending(segments)].map(seg => ({
                            type,
                            yAxisID: 'y' + fields[0],
                            label: new Date(start + seg * period * 60_000).toDateString().slice(0, 10),
                            borderColor: `hsl(${(segments - 1) - seg * 360 / (segments - 1)},100%,50%)`,
                            pointRadius: 1,
                            pointHitRadius: 5,
                            data: data.slice(seg * intervals, (seg + 1) * intervals).map((d, i) => ({
                                x: segmentOffset + (d.time % (period * 60_000)),
                                y: (cumulative ? (d[fields[0]] - data[seg * intervals + i - 1]?.[fields[0]] || NaN) : d[fields[0]]) * scaleFactor
                            }))
                        }))
                        : fields.map((k, i) => ({
                            type,
                            borderDash: i ? [3, 3] : undefined,
                            label: k,
                            yAxisID: 'y' + k,
                            data: data.map((d, i) => ({
                                x: d.time,
                                y: (cumulative ? (d[k] - data[i - 1]?.[k] || NaN) : d[k]) * scaleFactor
                            }))
                        }))
                },
                options: {
                    //events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
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
            }, zoom))), elt];
    let zoomed: HTMLButtonElement = controls[0].firstElementChild as HTMLButtonElement;
    return controls;
}
