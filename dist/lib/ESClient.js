"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceDoc = exports.conditionalAggs = exports.desc = exports.asc = void 0;
exports.asc = 'asc';
exports.desc = 'desc';
/* Same very basic helper functions */
/* A thing that changes `A | B` to `A? & B?`. This is useful for coecring (f ? agg1 : agg2) so that both sets of results
 are in the result type, even conditionally */
function conditionalAggs(a) {
    return a;
}
exports.conditionalAggs = conditionalAggs;
;
// Exporeted so _unused_doc_type_inference_ can be supplied, as in:
//   es6client.search(_trace_,query, SearchDoc as Document)
exports.SourceDoc = undefined;
