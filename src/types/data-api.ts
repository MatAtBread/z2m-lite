interface DataQuery {
    series:{
        topic: string;
        fields: string[];
        start?: number; // timetsamp
        end?: number; // timetsamp
        interval: number; // minutes
    }
}

type DataResult = { time: number, [field:string]: number }[];