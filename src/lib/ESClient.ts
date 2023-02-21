import { IndicesStatsResponse } from "@elastic/elasticsearch/api/types";

export type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

export type ExclusiveUnion<T, U = T> =
  T extends any
    ? T & Partial<Record<Exclude<U extends any ? keyof U : never, keyof T>, never>>
    : never;


export interface ES6ClientConfig {
  "requestTimeout": number
  "apiVersion": string
  "hosts": string[]
}

export const asc: 'asc' = 'asc';
export const desc: 'desc' = 'desc';

/* Same very basic helper functions */
/* A thing that changes `A | B` to `A? & B?`. This is useful for coecring (f ? agg1 : agg2) so that both sets of results
 are in the result type, even conditionally */
export function conditionalAggs<T extends Aggregations.NamedSubAggregations>(a:T) { 
  return a as unknown as Partial<UnionToIntersection<T>>
}

export declare namespace Filters {
  type MatchAll = {
    match_all: {}
  };

  type Ids = {
    ids: {
      values: string[]
    }
  };

  type Range<T extends (number | string | Date | unknown) = (number | string | Date | unknown)> = {
    range: {
      [field: string]: {
        gte?: T
        lt?: T
      }
    }
  }
  type Nested = {
    nested: {
      path: string;
      query: Filter;
    }
  }
  type Exists = {
    exists: {
      field: string
    }
  }
  type MoreLikeThis = {
    more_like_this:{
      fields: string[];
      like: string[]; // There are other formats
      min_term_freq?: number|undefined;
    }
  };

  type Term<FieldType extends (string|number|boolean) = string|number|boolean> = {
    term: {
      [field: string]: FieldType
    }
  }
  type Terms<FieldType extends (string|number|boolean) = string|number|boolean> = {
    terms: {
      [field: string]: FieldType[]
    }
  }
  type Bool = {
    bool: {
      filter?: Filter[] | Filter | undefined
      must_not?: Filter[] | Filter | undefined
      must?: Filter[] | Filter | undefined
      should?: Filter[] | Filter | undefined
      minimum_should_match? : number | string
    }
  };
  type Overlapping = Range | Term | Terms | Bool | Exists | MoreLikeThis | MatchAll | Ids | Nested;
  type Filter = ExclusiveUnion<Overlapping>;
}

export declare namespace Aggregations {
  /* Single value aggregations & results */
  interface ValueCount {
    value_count: {
      field: string
    }
  }

  interface ValueResult {
    value: number;
  }

  interface Missing {
    missing: {
      field: string
    }
  }

  interface MissingResult {
    doc_count: number;
  }

  interface Cardinality {
    cardinality: {
      field: string
    }
  }

  interface Sum {
    sum: {
      field: string,
      missing?: number // Could be a date/time & therefore string
    }
  }

  interface Avg {
    avg: {
      field: string;
      missing?: number;
    }
  }

  interface Min {
    min: {
      field: string;
      missing?: number;
    } | {
      script: {
        source: string
      }
    }
  } 

  interface Max {
    max: {
      field: string;
      missing?: number;
    } | {
      script: {
        source: string
      }
    }
  } 

  interface Percentiles {
    percentiles: {
      field: string;
      percents: number[];
      missing?: number;
    }
  }
  interface PercentilesResult {
    values:{ [p:string]: number }
  }

  interface Stats {
    stats: {
      field: string;
    } | {
      script: { source: string }
    }
  }
  interface StatsResult {
    count: number,
    min: number,
    max: number,
    avg: number,
    sum: number  
  }

  interface TopHits<Doc> {
    top_hits: {
      size: number,
      _source?: {
        includes: (keyof Doc)[]
      }
    }
  }

  interface TopHitsResult<Doc extends {}> {
    hits: {
      total: number;
      max_score: number;
      hits: Document<Doc>[]
    }
  }

  /* Multi-value aggregations with buckets that can be nested */
  type NamedSubAggregations<Keys extends string = string> = {
    [name in Keys]?: Aggregation
  }
  export interface NestedAggregation {
    aggs?: NamedSubAggregations
  }

  type NestedAggregationResult<SubAggs> = 
    SubAggs extends NamedSubAggregations 
      ? { [P in keyof SubAggs]: AggregationResult<SubAggs[P]> }
      : unknown;

  export interface GenericBucket<Key = string> {
    key: Key;
    doc_count: number;
  }
  
  export interface GenericBucketResult<SubAggs> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs>>
  }
  
  interface ReverseNested extends NestedAggregation {
    reverse_nested: {};
  }

  interface Filter extends NestedAggregation {
    filter: Filters.Filter
   }
 
   type FilterResult<SubAggs> = NestedAggregationResult<SubAggs> & {
     doc_count: number;
   }
 
   interface NestedDoc extends NestedAggregation {
    nested:{
      path: string
    }
   }
 
   type NestedDocResult<SubAggs> = NestedAggregationResult<SubAggs> & {
     doc_count: number;
   }
  
  interface NamedFilters<Keys extends string> extends NestedAggregation {
    filters: {
      filters: {[k in Keys]: Filters.Filter}
    }
  }
  interface NamedFiltersResult<Keys extends string, SubAggs> {
    buckets: { [K in Keys]: GenericBucket & NestedAggregationResult<SubAggs> }
  }
  interface OrderedFilters extends NestedAggregation {
    filters: {
      filters: Filters.Filter[]
    }
  }
  interface OrderedFiltersResult<SubAggs> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs>>
  }
  
  interface Terms<Type extends string | number = string | number> extends NestedAggregation {
    terms: {
      field: string;
      min_doc_count?: number;
      size?: number;
      include?: Type[]
      missing?: Type,
      order?: ({ [k:string] : 'asc'|'desc'}) | ({ [k:string] : 'asc'|'desc'}[])
    }
  }

  interface TermsResult<SubAggs> {
    doc_count_error_upper_bound: number,
    sum_other_doc_count: number,
    buckets: Array<NestedAggregationResult<SubAggs> & GenericBucket>
  }

  interface Histogram extends NestedAggregation {
    histogram:{
      field: string,
      interval: string | number,
      min_doc_count: number,
      extended_bounds?:{
        min: number
        max: number
      }
    }
  }
  interface HistogramResult<SubAggs> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs>>;
  }

  interface DateHistogram extends NestedAggregation {
    date_histogram: {
      field: string,
      interval: string | number,
      min_doc_count?: number,
      offset?: number | string,
      extended_bounds?: {
        min: number | string,
        max: number | string
      }
    }
  }

  interface DateHistogramResult<SubAggs> {
    buckets: Array<{
      key_as_string: string;
    } & GenericBucket<number> & NestedAggregationResult<SubAggs>>
  }

  interface GenericRange<Keyed> extends NestedAggregation {
    range:{
      field: string;
      keyed?: Keyed
      ranges: Array<{
        // Ideally we'd generate this from the source aggregation passed as a Generic
        name?: Keyed extends true ? string : never
      } & ({
        from?: number | string,
        to?: number | string
      } | {
        gte?: number | string,
        lt?: number | string
      })>
    }
  }

  interface Range extends GenericRange<false | undefined> {}
  interface KeyedRange extends GenericRange<true> {}

  interface RangeBucket {
    doc_count: number;
    from: number | string,
    to: number | string
  }
  interface RangeResult<SubAggs> {
    buckets: Array<GenericBucket & RangeBucket & NestedAggregationResult<SubAggs>>
  }
  interface KeyedRangeResult<SubAggs> {
    buckets: { [k:string]: RangeBucket & NestedAggregationResult<SubAggs> }
  }

  export type SingleValueAggregation = ExclusiveUnion<ValueCount | Missing | Cardinality 
    | Sum | Avg | Min | Max
    | TopHits<any> | Percentiles | Stats> 
    | ReverseNested | Filter | NamedFilters<string>;
  export type MultiBucketAggregation = ExclusiveUnion<OrderedFilters | Terms 
    | Histogram | DateHistogram | Range 
    | NestedDoc
    | NestedAggregation // This fails at runtime. It's included as it's the "abstract base" of MultiBucketAggregation
    > ; 
}

export type AggregationResult<T> =
  // Terminal results which cannot have inner aggs
  T extends Aggregations.ValueCount ? Aggregations.ValueResult : never |
  T extends Aggregations.Missing ? Aggregations.MissingResult : never |
  T extends Aggregations.Cardinality ? Aggregations.ValueResult : never |
  T extends Aggregations.Avg ? Aggregations.ValueResult : never |
  T extends Aggregations.Min ? Aggregations.ValueResult : never |
  T extends Aggregations.Max ? Aggregations.ValueResult : never |
  T extends Aggregations.Sum ? Aggregations.ValueResult : never |
  T extends Aggregations.TopHits<infer D> ? (D extends {} ? Aggregations.TopHitsResult<D> : never) : never |
  T extends Aggregations.Percentiles ? Aggregations.PercentilesResult : never |
  T extends Aggregations.Stats ? Aggregations.StatsResult : never |
  // Non-terminal aggs that _might_ have sub aggs
  T extends Aggregations.Filter ? Aggregations.FilterResult<T["aggs"]> : never |
  T extends Aggregations.NestedDoc ? Aggregations.NestedDocResult<T["aggs"]> : never |
  T extends Aggregations.Terms ? Aggregations.TermsResult<T["aggs"]> : never |
  T extends Aggregations.NamedFilters<infer Keys> ? Aggregations.NamedFiltersResult<Keys, T["aggs"]> : never |
  T extends Aggregations.OrderedFilters ? Aggregations.OrderedFiltersResult<T["aggs"]> : never |
  T extends Aggregations.Histogram ? Aggregations.HistogramResult<T["aggs"]> : never |
  T extends Aggregations.DateHistogram ? Aggregations.DateHistogramResult<T["aggs"]> : never |
  T extends Aggregations.Range ? Aggregations.RangeResult<T["aggs"]> : never |
  T extends Aggregations.ReverseNested ? Aggregations.NestedAggregationResult<T["aggs"]> : never |
  // Generic nested aggregation
  // T extends Aggregations.NestedAggregation ? Aggregations.GenericBucketResult<T["aggs"]> : never |
  never;

export type Aggregation = ExclusiveUnion<Aggregations.SingleValueAggregation | Aggregations.MultiBucketAggregation>
export type Filter = Filters.Filter

export interface Document<Source extends {}> {
	//_type: string; // Deprecated in ES7
  _index: string;
  _id: string;
  _source: Source;
}

export interface GetParams {
  index: string;
  type?: never; // Deprecated in ES7
  id: string;
  refresh?: boolean;
}
export interface GetResult<T extends {}> extends Document<T> { };

export interface DeleteByQueryParams {
  index: string | string[];
  type?: never; // Deprecated in ES7
  refresh?: boolean;
  ignore_unavailable?: boolean,
  body: {
    conflicts?: 'proceed';
    query?: Filter;
    sort?: ({ [k:string] : 'asc'|'desc'}) | ({ [k:string] : 'asc'|'desc'}[]);
  }
}

export interface DeleteByQueryResult {
  "took": number,
  "deleted": number,
  "batches": number,
  "version_conflicts": number,
  "noops": number,
  "total": number,
  "failures" : unknown[]
}

export interface CountParams {
  index?: string | string[];
  allow_no_indices?: boolean
  ignore_unavailable?: boolean
  body?: {
    query?: Filter
  }

}
export interface CountResult {
  count: number;
  //_shards: ShardStatistics
}

export interface SearchParams {
  index: string | string[];
  type?: never; // Deprecated in ES7
  ignore_unavailable?: boolean,
  body: {
    track_total_hits?: boolean, // ES7 only
    _source?: string[], // At this top level, these are UNCHECKED BY TS (should be `(keyof Doc)[]`)
    size?: number;
    query?: Filter;
    profile?: boolean,
    sort?: ({ [k:string] : 'asc'|'desc'}) | ({ [k:string] : 'asc'|'desc'}[]);
  } & Aggregations.NestedAggregation,
}

export interface VSearchParams extends SearchParams {
  _log?: string;
}

type ProfileComponent = {
  time_in_nanos: number
}[]

interface SearchProfile {
  shards: {
    aggregations: ProfileComponent,
    searches: {
      rewrite_time: number;
      query?: ProfileComponent
      collector?: ProfileComponent
    }[]
  }[];
}

export type SearchAggregations<T extends SearchParams> = keyof T["body"]["aggs"];

export interface SearchResult<T extends SearchParams, Doc extends {}> {
  took: number;
  profile?: SearchProfile // Profiling result, if requested by the SearchParams
  timed_out: boolean;
  hits: {
    total: number;
    max_score?: number; // Not sure if this is present in all results(!)
    hits: Document<Doc>[]
  },
  aggregations: T["body"]["aggs"] extends {} 
    ? { [name in SearchAggregations<T>]: AggregationResult<T["body"]["aggs"][name]> }
    : undefined ;
}

interface NotEnabledFieldMapping {
  enabled: false;
}

interface ObjectFieldProperties {
  type?: 'object',
  enabled?: boolean,
  dynamic?: true | false | "strict";
  properties?: FieldMappings
}

interface NestedFieldProperties {
  type: 'nested',
  properties?: FieldMappings
}

interface TextPrimitiveFieldMapping {
  type: 'keyword' | 'text'
  ignore_above?: number;
}

interface ScalarPrimitiveFieldMapping {
  type: 'long' | 'boolean' | 'float' | 'double' | 'date'
}

type PrimitiveFieldMapping = ScalarPrimitiveFieldMapping | TextPrimitiveFieldMapping;

export type FieldMapping = ExclusiveUnion<PrimitiveFieldMapping | ObjectFieldProperties | NestedFieldProperties | NotEnabledFieldMapping>
  & {
    doc_values?: boolean
    fields?: {
      [fieldName: string] : FieldMapping
    }
  }

type DynamicMapping = unknown; // TBC
export type FieldMappings = {
  [field: string]: FieldMapping
};
export interface Mappings {
  dynamic_templates?: Array<DynamicMapping>;
  dynamic?: true | false | "strict";
  properties: FieldMappings
}

type DocTypeMappings = Mappings;

export interface PutMappingParams {
  index: string;
  type?: never; // Deprecated in ES6, removed in ES7
  body: Mappings;
}
export interface PutMappingResult { }

export interface GetMappingParams {
  index: string | string[];
  type?: never; // Deprecated in ES6, removed in ES7
  ignore_unavailable?: boolean
}
export interface GetMappingResult { 
  [indexName: string]:{
    mappings: Mappings
  }
}

export interface PutTemplateParams {
  name: string;
  body: {
    index_patterns: string[];
    settings?: {
      number_of_shards?: number,
      number_of_replicas?: number
    },
    mappings: DocTypeMappings
  }
}
export interface PutTemplateResult { }

export interface IndexParams<B> {
  index: string;
  type?: undefined; // Deprecated in ES6, removed in ES7
  id?: string;
  refresh?: boolean | 'wait_for';
  body: B;
}

export interface IndexResult {
  _id: string;
}

export interface CreateParams {
  index: string;
}
export interface CreateResult { }

export interface DeleteParams { 
  id: string; 
  index: string; 
  type?: never; // Deprecated in ES6, removed in ES7
  refresh?: 'wait_for'; 
}
export interface DeleteResult { }

export interface UpdateParams {
  index: string; 
  type?: never; // Deprecated in ES6, removed in ES7
  id: string; 
  body: { 
    scripted_upsert?: boolean; 
    upsert?: unknown;
    doc_as_upsert?: boolean;
    doc?: unknown; 
    script?: unknown;
  }
}
export interface UpdateResult { }

export interface GetStatsParams { 
  index: string | string[]
}

// Exporeted so _unused_doc_type_inference_ can be supplied, as in:
//   es6client.search(_trace_,query, SearchDoc as Document)
export const SourceDoc = undefined as unknown;
export interface ESAPI {
  toString():string;
  // client: underlying es7 client type
  update(params: UpdateParams): Promise<UpdateResult>;
  delete(params: DeleteParams): Promise<DeleteResult>;
  ping(): Promise<void>;
  get<T extends {}>(params: GetParams): Promise<GetResult<T>>;
  get<T extends {}>(params: GetParams, _unused_doc_type_inference_: T): Promise<GetResult<T>>;
  index<B extends {}>(params: IndexParams<B>): Promise<IndexResult>;
//  vsearch<T extends VSearchParams, Doc extends {}>(trace: unknown, params: T, _unused_doc_type_inference_: Doc): Promise<SearchResult<T, Doc>>;
//  vsearch<T extends VSearchParams, Doc extends {} = {}>(trace: unknown, params: T): Promise<SearchResult<T, Doc>>;
//  vsearch<T extends VSearchParams, Doc extends {} = {}>(params: T): Promise<SearchResult<T, Doc>>;
search<T extends SearchParams, Doc extends {} = {}>(params: T): Promise<SearchResult<T, Doc>>;
search<T extends SearchParams, Doc extends {} = {}>(params: T, _: Doc): Promise<SearchResult<T, Doc>>;
count(params: CountParams): Promise<CountResult>;
  deleteByQuery(search: DeleteByQueryParams):Promise<DeleteByQueryResult>;
  indices: {
    create(params: CreateParams): Promise<CreateResult>;
    putTemplate(params: PutTemplateParams): Promise<PutTemplateResult>;
    putMapping(params: PutMappingParams): Promise<PutMappingResult>;
    getMapping(params: GetMappingParams): Promise<GetMappingResult>;
    stats(params: GetStatsParams): Promise<IndicesStatsResponse>;
    refresh():Promise<unknown>;
  }
}

// Additional (actually legacy) filter clauses supported by the API
// These get mapped to ES 6 filters by `bogus`
export type RtaApiFilter = ExclusiveUnion<Filter | {
  not?: RtaApiFilter;
  and?: RtaApiFilter[];
  or?: RtaApiFilter[];
}>
