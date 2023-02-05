export type SeriesQuery = {
    q:'series';
    metric: 'sum'|'avg'|'max'|'min';
    topic: string;
    fields: string[];
    start?: number; // timetsamp
    end?: number; // timetsamp
    interval: number; // minutes
}

export type SeriesResult = { time: number, [field:string]: number }[];

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

export type DataQuery = SeriesQuery | TopicsQuery | StoredTopicsQuery | LatestTopicQuery | InsertRecord;

export type DataResult<D extends DataQuery> =
    D extends SeriesQuery ? SeriesResult
    : D extends TopicsQuery ? { topic: string }[]
    : D extends StoredTopicsQuery ? { msts: number, topic: string, payload: unknown }[]
    : D extends LatestTopicQuery ? { msts: number, topic: string, payload: unknown }
    : D extends InsertRecord ? void
    : never;
