"use strict";
/* A thunk to implement the older RTA ES6API on top of an ES7 client connection */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESClient = void 0;
const elasticsearch_1 = require("@elastic/elasticsearch");
function ESClient(c) {
    const es7 = new elasticsearch_1.Client(c);
    const wrap7 = {
        toString() {
            return "[object {es7 " + es7.connectionPool?.connections?.[0]?.url + "}]";
        },
        ping() { return es7.ping().then(r => undefined); },
        update(params) {
            return es7.update(params).then(r => r.body);
        },
        delete(params) {
            return es7.delete(params).then(r => r.body);
        },
        get(params, _unused_doc_type_inference_) {
            return es7.get(params).then(r => r.body);
        },
        index(params) {
            return es7.index(params).then(r => r.body);
        },
        deleteByQuery(search) {
            return es7.deleteByQuery(search).then(r => r.body);
        },
        indices: {
            create(params) {
                return es7.indices.create(params).then(r => r.body);
            },
            putTemplate(params) {
                return es7.indices.putTemplate(params).then(r => r.body);
            },
            putMapping(params) {
                return es7.indices.putMapping(params).then(r => r.body);
            },
            getMapping(params) {
                return es7.indices.getMapping(params).then(r => r.body);
            },
            stats(params) {
                return es7.indices.stats(params).then(r => r.body);
            },
            refresh() {
                return es7.indices.refresh({});
            }
        },
        async count(p) {
            return es7.count(p).then(res => res.body);
        },
        async search(params) {
            if (params.type !== undefined) {
                console.warn("Attempt to use doc type", new Error().stack, params.body);
            }
            const res = await es7.search /*<Record<string,any>, Search>*/(params);
            if (typeof res.body.hits.total !== 'number')
                res.body.hits.total = res.body.hits.total.value; // ES6+ JS client nests total number as a relation
            return res.body;
        }
    };
    return wrap7;
}
exports.ESClient = ESClient;
