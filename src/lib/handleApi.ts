import http from 'http';
import { DataQuery, DataResult, SeriesResult, StoredTopicsQuery } from '../data-api'
import { Aggregations, SourceDoc } from './ESClient';
import { ESClient } from './es';

interface DataDoc<Payload = unknown> {
  msts: number;
  topic: string;
  payload: Payload
}

export async function handleApi(rsp: http.ServerResponse<http.IncomingMessage>, fn: () => Promise<unknown>) {
  try {
    rsp.setHeader("Content-Type", "application/json");
    rsp.write(JSON.stringify(await fn()));
  } catch (ex: any) {
    rsp.setHeader("Content-Type", "application/json");
    rsp.statusCode = 500;
    rsp.write(JSON.stringify({ message: ex.message, ...ex }));
  } finally {
    rsp.end();
  }
}

function changedFields(a: any, b: any, path: string, ignoreFields: string[]) {
  const result: string[] = [];
  (function cmp(a, b, path) {
    if (typeof a !== typeof b)
      return result.push(path);
    if (a === b)
      return;
    if (Array.isArray(a)) {
      if (!Array.isArray(b))
        return result.push(path);
      if (a.length !== b.length)
        return result.push(path);
      for (let i = 0; i < a.length; i++) {
        const p = path;
        cmp(a[i], b[i], path + '.' + i);
      }
    } else if (typeof a === 'object') {
      if (a === null && b !== null || a !== null && b === null)
        return result.push(path);
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const i of keys.values()) {
        if (!ignoreFields.includes(i))
          cmp(a[i], b[i], path + '.' + i);
      }
    } else if (a !== b)
      return result.push(path);
  })(a, b, path);
  return result;
}

function sleep(seconds: number) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

export async function dataApi() {
  const db = ESClient({ node: 'http://house.mailed.me.uk:9200' });

  let attempts = 0;
  while (true) {
    try {
      await db.indices.putTemplate({
        name: 'house-data',
        body: {
          index_patterns: ['data'],
          settings: {
            number_of_replicas: 0,
            number_of_shards: 3
          },
          mappings: {
            dynamic_templates: [{
              "payload_numbers": {
                "match_mapping_type": "long",
                "path_match": "payload.*",
                "mapping": {
                  "type": "float"
                }
              }
            }, {
              "payload_strings": {
                "match_mapping_type": "string",
                "path_match": "payload.*",
                "mapping": {
                  "type": "keyword"
                }
              }
            }],
            properties: {
              topic: {
                type: 'keyword'
              },
              msts: {
                type: 'long'
              },
              payload: {
                type: 'object'
              }
            }
          }
        }
      });
      console.log("Elasticsearch connected");
      break;
    } catch (ex: any) {
      console.log(`Waiting for Elasticsearch #${++attempts} (${ex.message})`);
      await sleep(3.5);
    }
  }
  const storedTopicsCache = await db.search({
    index: 'data',
    ignore_unavailable: true,
    body: {
      aggs: {
        topic: {
          terms: {
            field: 'topic',
            size: 999
          },
          aggs: {
            top: {
              top_hits: {
                size: 1,
                sort: [{ msts: { order: 'desc' } }]
              }
            } as Aggregations.TopHits<DataDoc>
          }
        }
      }
    }
  }, SourceDoc as {}).then(data => data.aggregations?.topic.buckets.map(b => b.top.hits.hits[0]) || []);

  return async function <Q extends DataQuery>(query: Q): Promise<DataResult<Q> | undefined> {
    if (query.q === 'insert') {
      const cached = storedTopicsCache.find(t => t._source.topic === query.topic);
      if (!cached) {
        const newMsg = {
          _source: { msts: query.msts, topic: query.topic, payload: query.payload },
          _id: '',
          _index: 'data'
        };
        storedTopicsCache.push(newMsg);
        newMsg._id = await db.index({
          index: 'data',
          body: newMsg._source
        }).then(r => r._id);
      } else {
        // If everything except the time-stamp is the same, just update the previous record
        const changed = !query.payload
          || !cached._source.payload
          || changedFields(query.payload, cached._source.payload, 'payload', ['timestamp', 'last_seen']);

        if (changed !== true && changed.length) {
          cached._source.payload = query.payload;
          cached._source.msts = query.msts;
          cached._id = await db.index({
            index: 'data',
            body: cached._source
          }).then(r => r._id);
        } else {
          const seq = cached._source.msts;
          cached._source.payload = query.payload;
          cached._source.msts = query.msts;
          await db.update({
            index: 'data',
            id: cached._id,
            refresh: 'wait_for',
            retry_on_conflict: 3,
            body: {
              doc: cached._source,
              doc_as_upsert: true
            }
          });
        }
      }
      return;
    }
    if (query.q === 'latest') {
      return storedTopicsCache.find(t => t._source.topic === query.topic)?._source as DataResult<Q>;
    }
    if (query.q === 'stored_topics') {
      return storedTopicsCache.map(s => s._source) as DataResult<Q>
    }
    if (query.q === 'series') {
      const fieldAggs = Object.fromEntries(query.fields.map(field => [field, {
            stats: {
              field: 'payload.' + field
            }
          }])) as { [field: string]: { stats: { field: string } } };

      const e = await db.search({
        index: 'data',
        body: {
          query: {
            bool: {
              filter: [{
                term: {
                  topic: query.topic
                }
              }, {
                range: {
                  msts: {
                    gte: query.start || 0,
                    lte: query.end || Date.now()
                  }
                }
              }, ...query.fields.map(f => ({
                exists: {
                  field: 'payload.' + f
                }
              }))]
            }
          },
          aggs: {
            series: {
              date_histogram: {
                field: 'msts',
                interval: (query.interval * 60) + 's'
              },
              aggs: fieldAggs
            }
          }
        }
      });

      return e.aggregations.series.buckets.map(b => Object.fromEntries([['time', b.key], ...query.fields.filter(f => typeof b[f]?.[query.metric] === 'number').map(f => [f, b[f][query.metric]])])) as DataResult<Q>;
    }
        /*
if (query.q === 'topics') {
    throw new Error("Not implemented");
    return db.search('distinct topic', '$match is NULL OR topic like $match', {
        $match: query.match
    }) as Promise<DataResult<Q>>;
}
    */
    throw new Error("Unknown API call");
  }
}
