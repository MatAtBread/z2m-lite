type SeriesQuery = {
    q:'series';
    topic: string;
    fields: string[];
    start?: number; // timetsamp
    end?: number; // timetsamp
    interval: number; // minutes
}

type TopicsQuery = {
    q:'topics';
    match?: string;
}

type StoredTopicsQuery = {
    q:'stored_topics';
    since: number;
}

type LatestTopicQuery = {
    q: 'latest';
    topic: string;
}

export type DataQuery = SeriesQuery | TopicsQuery | StoredTopicsQuery | LatestTopicQuery;

export type DataResult<D extends DataQuery> =
    D extends SeriesQuery ? { time: number, [field:string]: number }[]
    : D extends TopicsQuery ? { topic: string }[]
    : D extends StoredTopicsQuery ? { msts: number, topic: string, payload: unknown }[]
    : D extends LatestTopicQuery ? { msts: number, topic: string, payload: unknown }
    : never;
