/* A thunk to implement the older RTA ES6API on top of an ES7 client connection */

import { Client, ClientOptions } from '@elastic/elasticsearch';
import type { CountResponse, IndicesStatsResponse } from '@elastic/elasticsearch/api/types';

import type { CountParams, CountResult, CreateParams, CreateResult, DeleteByQueryParams, DeleteByQueryResult, DeleteParams, DeleteResult, ESAPI, ES6ClientConfig, GetMappingParams, GetMappingResult, GetParams, GetResult, IndexParams, IndexResult, Mappings, PutMappingParams, PutMappingResult, PutTemplateParams, PutTemplateResult, SearchParams, SearchResult, UpdateParams, UpdateResult } from './ESClient';

export function ESClient(c: ClientOptions): ESAPI {
  const es7 = new Client(c);

  const wrap7: ESAPI = {
    toString(): string {
      return "[object {es7 "+es7.connectionPool?.connections?.[0]?.url+"}]"
    },
    ping(): Promise<void> { return es7.ping().then(r => undefined) },
    update(params: UpdateParams): Promise<UpdateResult> {
      return es7.update<UpdateResult>(params).then(r => r.body)
    },
    delete(params: DeleteParams): Promise<DeleteResult> {
      return es7.delete<DeleteResult>(params).then(r => r.body)
    },
    get<T extends {}>(params: GetParams, _unused_doc_type_inference_?: T): Promise<GetResult<T>> {
      return es7.get<GetResult<T>>(params).then(r => r.body)
    },
    index<Doc extends {}>(params: IndexParams<Doc>): Promise<IndexResult> {
      return es7.index<IndexResult>(params).then(r => r.body)
    },
    deleteByQuery(search: DeleteByQueryParams): Promise<DeleteByQueryResult> {
      return es7.deleteByQuery<DeleteByQueryResult>(search).then(r => r.body);
    },
    indices: {
      create(params: CreateParams): Promise<CreateResult> {
        return es7.indices.create<CreateResult>(params).then(r => r.body);
      },
      putTemplate(params: PutTemplateParams): Promise<PutTemplateResult> {
        return es7.indices.putTemplate<PutTemplateResult>(params).then(r => r.body);
      },
      putMapping(params: PutMappingParams): Promise<PutMappingResult> {
        return es7.indices.putMapping<PutMappingResult>(params).then(r => r.body);
      },
      getMapping(params: GetMappingParams): Promise<GetMappingResult> {
        return es7.indices.getMapping<GetMappingResult>(params).then(r => r.body);
      },
      stats(params): Promise<IndicesStatsResponse> {
        return es7.indices.stats<IndicesStatsResponse>(params).then(r => r.body);
      },
      refresh(): Promise<unknown> {
        return es7.indices.refresh({});
      }
    },
    async count(p: CountParams): Promise<CountResult> {
      return es7.count<CountResponse>(p).then(res => res.body);
    },
    async search<T extends SearchParams, Doc extends {} = {}>(params: T): Promise<SearchResult<T, Doc>> {
      if (params.type !== undefined) {
        console.warn("Attempt to use doc type", new Error().stack, params.body)
      }

      const res = await es7.search/*<Record<string,any>, Search>*/(params);
      if (typeof res.body.hits.total !== 'number') res.body.hits.total = res.body.hits.total.value; // ES6+ JS client nests total number as a relation
      return res.body as SearchResult<T, Doc>;
    }
  };

  return wrap7;
}
