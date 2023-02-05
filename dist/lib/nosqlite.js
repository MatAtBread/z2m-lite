"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoSqlite = void 0;
const sqlite_1 = require("sqlite");
function flattenObject(o, r = [], p = '') {
    for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'number' || typeof v === 'string' || v === null) {
            r.push([p + k, v]);
        }
        else if (typeof v === 'object') {
            flattenObject(v, r, k + '.');
        }
    }
    return r;
}
/*
function expandQuery<Doc extends {}>(where: DocQuery<Doc>) {
    const clause: string[] = [];
    for (const [field,q] of Object.entries(where) as [string,Query<string | number | null>][]) {
        if (typeof q === 'object') {
            clause.push("1=0");
        } else if (typeof q === 'string') {
            clause.push(`${field}='${q}'`)
        } else if (typeof q === 'number') {
            clause.push(`${field}=${q}`)
        }
    }
    return clause.join("\n AND");
}

export type DocQuery<Doc extends {}> = {
    [K in keyof Doc]: Doc[K] extends (number | string | null) ? Query<Doc[K]> : never;
}

export type Query<Value = string | number | null> = Value | // strict equality {
    range?:{
        gt?: Value,
        gte?: Value,
        lt?: Value,
        lte?: Value
    },
    like?: Value extends string ? string : never
    not?: Value
}
*/
class NoSqlite {
    run(...args) { return this.db.then(db => db.run(...args)).catch(ex => { ex.args = args; throw ex; }); }
    prepare(...args) { return this.db.then(db => db.prepare(...args)).catch(ex => { ex.args = args; throw ex; }); }
    //private each(...args: Parameters<DB["each"]>) { return this.db.then(db => db.each<Doc>(...args)).catch(ex => { ex.args = args; throw ex }) }
    //private get(...args: Parameters<DB["get"]>) { return this.db.then(db => db.get(...args)).catch(ex => { ex.args = args; throw ex }) }
    all(...args) { return this.db.then(db => db.all(...args)).catch(ex => { ex.args = args; throw ex; }); }
    close(...args) { return this.db.then(db => db.close(...args)).catch(ex => { ex.args = args; throw ex; }); }
    constructor(config) {
        this.mappingCache = new Map();
        this.db = (0, sqlite_1.open)(config).then(async (db) => {
            await db.run(`CREATE TABLE IF NOT EXISTS MAPPINGS (
                field PRIMARY KEY,
                jsType TEXT,
                sqlType TEXT,
                indexed INTEGER
            )`);
            for (const m of await db.all('SELECT * from MAPPINGS'))
                this.mappingCache.set(m.field, m);
            return db;
        });
    }
    ;
    async updateMapping(field, jsType, sqlType, indexed) {
        let existingMapping = this.mappingCache.get(field);
        if (existingMapping) {
            if (existingMapping.jsType !== jsType)
                throw new Error("Incompatable mapping: " + JSON.stringify({ field, jsType, existingMapping }));
            if (existingMapping.sqlType !== sqlType) {
                if (existingMapping.sqlType === 'INTEGER' && sqlType === 'REAL') {
                    existingMapping.sqlType = 'REAL';
                    this.mappingCache.set(field, existingMapping);
                    await this.run(`UPDATE MAPPINGS set sqlType='REAL' WHERE field=$field`, {
                        $field: field
                    });
                }
                else if (!(existingMapping.sqlType === 'REAL' && sqlType === 'INTEGER')) {
                    throw new Error("Incompatable mapping: " + JSON.stringify({ field, sqlType, existingMapping }));
                }
            }
            if (indexed !== undefined && indexed !== existingMapping.indexed) {
                existingMapping.indexed = indexed;
                this.mappingCache.set(field, existingMapping);
                if (indexed === 1)
                    await this.run(`CREATE INDEX IF NOT EXISTS 'field_index_${field}' on DATA('${field}')`);
                if (indexed === 0)
                    await this.run(`DROP INDEX 'field_index_${field}'`);
                await this.run('UPDATE MAPPINGS set indexed=$indexed WHERE field=$field', {
                    $indexed: indexed,
                    $field: field
                });
            }
        }
        else {
            existingMapping = { field, jsType, sqlType, indexed: indexed || 0 };
            this.mappingCache.set(field, existingMapping);
            await this.run(`INSERT INTO MAPPINGS(field,jsType,sqlType,indexed) VALUES('${field}','${jsType}','${sqlType}',${indexed || 0})`);
            await this.run(`ALTER TABLE DATA ADD COLUMN '${field}' AS (json_extract(_source, '$.${field}'))`);
            if (indexed) {
                await this.run(`CREATE INDEX IF NOT EXISTS 'field_index_${field}' on DATA('${field}')`);
            }
        }
    }
    async createDynamicMapping(o, indexed = undefined, path = []) {
        for (const [field, value] of Object.entries(o)) {
            const jsValue = (Array.isArray(value) ? value[0] : value);
            const jsType = typeof jsValue;
            const fieldPath = [...path, field].join('.');
            switch (jsType) {
                case 'bigint':
                case 'boolean':
                    await this.updateMapping(fieldPath, jsType, 'INTEGER', indexed);
                    break;
                case 'number':
                    await this.updateMapping(fieldPath, jsType, Math.floor(jsValue) === jsValue ? 'INTEGER' : 'REAL', indexed);
                    break;
                case 'string':
                    await this.updateMapping(fieldPath, jsType, 'TEXT', indexed);
                    break;
                case 'symbol':
                case 'undefined':
                case 'function':
                    console.log("Unsupported type", fieldPath, jsType);
                    break;
                case 'object':
                    if (!jsValue) {
                        console.log("Unsupported value", fieldPath, jsValue);
                        return;
                    }
                    await this.createDynamicMapping(jsValue, indexed, [...path, field]);
                    break;
            }
        }
    }
    // Public API
    open($table, indexed) {
        const ready = new Promise(async (resolve) => {
            await this.run(`CREATE TABLE IF NOT EXISTS ${$table} (_source TEXT)`);
            await this.createDynamicMapping(indexed, 1);
            resolve();
        });
        return {
            index: async (o) => {
                await ready;
                await this.createDynamicMapping(o);
                const stmt = await this.prepare(`INSERT INTO ${$table} VALUES (?)`);
                await stmt.run(JSON.stringify(o));
                await stmt.finalize();
            },
            update: async (where, doc) => {
                await ready;
                const $where = flattenObject(where).map(([k, v]) => k + "=" + JSON.stringify(v)).join('\n AND ');
                await this.run(`UPDATE ${$table} SET _source=$value WHERE $where`, {
                    $value: JSON.stringify(doc),
                    $where
                });
            },
            /*query: async (where: DocQuery<Doc>) => {
                await ready;
                const data = await this.all(`SELECT _source from ${$table} where $condition`, {
                    $where: expandQuery(where)
                });
                return data.map(row => JSON.parse(row._source) as Doc);
            },*/
            select: async ($what, $where, p = {}) => {
                await ready;
                return this.all(`SELECT ${$what} from ${$table} where ${$where.replace(/\$table/g, $table)}`, p);
            }
        };
    }
    mappings() {
        return Object.fromEntries(this.mappingCache.entries());
    }
}
exports.NoSqlite = NoSqlite;
