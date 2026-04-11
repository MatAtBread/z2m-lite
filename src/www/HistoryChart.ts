import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { DataQuery, DataResult, SeriesQuery } from "../data-api.js";
import { BaseDevice } from './BaseDevice.js';
import { BubbleDataPoint, ChartConfiguration, ChartType, Point } from 'chart.js';

type HistoryChartAttrs = Pick<ReturnType<typeof BaseDevice>, 'sortOrder'> & ThisType<ReturnType<typeof div>> & {
  topic: string,
  cumulative?: boolean,
  scaleFactor?: number,
  offset?: number,
  yText?: string,
  views: {
    [view: string]: {
      metric: SeriesQuery['metric'],
      fields: string[] | Record<string, string>[],
      type?: 'line' | 'bar',
      intervals: number,
      period: number,      // Minutes
      segments?: number
    } | {
      metric: SeriesQuery['metric'],
      fields: string[] | Record<string, string>[],
      type: 'scatter',
      intervals: number,
      period: number,      // Minutes
      segments?: 1
    }
  }
  chartOptions: (view: string | number, srcData: DataResult<SeriesQuery>, segments: number, start: number) => ChartConfiguration<ChartType, (number | Point | [number, number] | BubbleDataPoint | null)[], unknown>;
};

const { div, button, canvas } = tag();

function* descending(max: number) {
  for (let i = max - 1; i >= 0; i--)
    yield i;
}


export function dataApi<Q extends DataQuery>(query: Q) {
  return fetch("/data/" + query.q + "/?" + encodeURIComponent(JSON.stringify({ ...query, q: undefined }))).then(res => res.json() as Promise<DataResult<Q>>);
}


export const HistoryChart = div.extended({
  declare: {
    sortOrder() {
      return (this.previousElementSibling as null | ReturnType<typeof BaseDevice>)?.sortOrder() + '.' || '.';
    },
    chartOptions(view: string | number, srcData, segments, start) {
      const { views, cumulative, scaleFactor, offset, yText } = this as unknown as HistoryChartAttrs;
      const { fields, intervals, period } = views[view];
      const type = views[view].type || 'line';

      // Fill in any blanks in the series
      const data: typeof srcData = [];
      for (let i = 0; i < intervals * segments; i++) {
        const t = start + i * period * 60_000 / intervals;
        data[i] = srcData.find(d => d.time === t) || { time: t };
      }
      const segmentOffset = start + (segments - 1) * period * 60_000;
      const fieldNames = fields.map((f: string | Record<string, string>) => typeof f === 'string' ? f : Object.keys(f)[0]);
      const fieldDefintions = fields.map((f: string | Record<string, string>) => typeof f === 'string' ? f : Object.values(f)[0]);
      return {
        type,
        data: {
          datasets: segments > 1
            ? [...descending(segments)].map(seg => ({
              yAxisID: 'y' + fieldNames[0],
              label: new Date(start + seg * period * 60_000).toDateString().slice(0, 10),
              borderColor: `hsl(${((segments - 1) - seg) * 360 / segments},100%,50%)`,
              pointRadius: 0,
              pointHitRadius: 5,
              spanGaps: type === 'line',
              data: data.slice(seg * intervals, (seg + 1) * intervals).map((d, i) => ({
                x: segmentOffset + (d.time % (period * 60_000)),
                y: (cumulative ? (d[fieldNames[0]] - data[seg * intervals + i - 1]?.[fieldNames[0]] || NaN) : d[fieldNames[0]]) * (scaleFactor || 1) + (offset || 0)
              }))
            }))
            : fieldNames.map((k, i) => ({
              pointRadius: 0,
              pointHitRadius: 5,
              spanGaps: type === 'line',
              borderDash: i ? [3, 3] : undefined,
              label: k.split(".").pop(),
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
            ...Object.fromEntries(fieldNames.map((k) => ['y' + k, {
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
      } as ChartConfiguration<ChartType, (number | Point | [number, number] | BubbleDataPoint | null)[], unknown>;
    }
  } as HistoryChartAttrs,
  styles: `.zoom {
      background: transparent;
      float: right;
      margin-bottom: -1em;
      z-index: 2;
      position: relative;
    }
    .zoom > button.selected {
      background-color:goldenrod;
      color: black;
    }`,
  constructed() {
    const { views, topic } = this;
    let openChart: Chart;
    const keys = Object.keys(views);
    let zoom = 'Day' in views ? 'Day' : keys[0];
    const chartCanvas = canvas();

    const drawChart = async (view: string | number) => {
      const { fields, intervals, period, metric } = views[view];
      const segments = views[view].segments || 1;

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

        openChart = new Chart(chartCanvas as unknown as HTMLCanvasElement, this.chartOptions(view, srcData, segments, start));
      }
    };
    drawChart(zoom);
    const buttons = keys.map((key) =>
      button({
        id: key,
        className: key !== zoom ? '' : 'selected',
        onclick: async (e) => {
          (e.target as typeof zoomed)?.classList.add('selected');
          await drawChart(key);
          if (zoomed !== e.target) {
            zoomed?.classList.remove('selected');
            zoomed = e.target as typeof zoomed;
          }
        }
      }, key));
    let zoomed = buttons.find(b => b.id === zoom);
    return [div({ className: 'zoom' }, ...buttons), chartCanvas];
  }
});
