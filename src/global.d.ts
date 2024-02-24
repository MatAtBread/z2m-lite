import type { Chart as ChartJS } from 'chart.js';

declare global {
    interface Element {
        update<T>(this: T, value: unknown):T;
    }
    interface HTMLCollection {
        // @ ts-ignore
        readonly [n: string]: HTMLElement | null;
    }
    class Chart extends ChartJS {}
}

export {};


