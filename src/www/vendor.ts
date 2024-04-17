import type { Chart as ChartJS } from 'chart.js';

declare global {
    class Chart extends ChartJS {}
}

export {};


