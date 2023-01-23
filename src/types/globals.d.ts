import type { Chart as ChartJS } from 'chart.js';

declare global {
    interface Element {
        update<T>(this: T, value: unknown):T;
    }
    class Chart extends ChartJS {}
}

export {};


