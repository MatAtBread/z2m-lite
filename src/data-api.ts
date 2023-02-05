export type SeriesQuery = {
    q:'series';
    metric: 'sum'|'avg'|'max'|'min';
    topic: string;
    fields: string[];
    start?: number; // timetsamp
    end?: number; // timetsamp
    interval: number; // minutes
}

export type DeltasQuery = {
    q: 'deltas',
    topic: string;
    fields: string[];
    start?: number; // timetsamp
    end?: number; // timetsamp
}

export type SeriesResult<T> = ({ msts: number } & { [field:string]: T })[];

export type TopicsQuery = {
    q:'topics';
    match?: string;
}

export type StoredTopicsQuery = {
    q:'stored_topics';
}

export type LatestTopicQuery = {
    q: 'latest';
    topic: string;
}

export type InsertRecord = {
    q: 'insert';
    msts: number;
    topic: string;
    payload: unknown;
}

export type DataQuery = SeriesQuery | TopicsQuery | StoredTopicsQuery | LatestTopicQuery | InsertRecord | DeltasQuery;

export type DataResult<D extends DataQuery> =
    D extends SeriesQuery ? SeriesResult<number>
    : D extends DeltasQuery ? SeriesResult<string>
    : D extends TopicsQuery ? { topic: string }[]
    : D extends StoredTopicsQuery ? { msts: number, topic: string, payload: unknown }[]
    : D extends LatestTopicQuery ? { msts: number, topic: string, payload: unknown }
    : D extends InsertRecord ? void
    : never;
