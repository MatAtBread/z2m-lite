declare global {
    interface Element {
        update<T>(this: T, value: unknown):T;
    }
}

export {};