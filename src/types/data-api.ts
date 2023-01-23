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

type DataQuery = SeriesQuery | TopicsQuery;

type DataResult<D extends DataQuery> =
    D extends SeriesQuery ? { time: number, [field:string]: number }[]
    : D extends TopicsQuery ? { topic: string }[]
    : never;