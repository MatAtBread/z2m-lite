declare global {
    interface Element {
        update<T>(this: T, value: unknown):T;
    }
    interface HTMLCollection {
        namedItem(n: string): HTMLElement | null;
    }
}

export {};