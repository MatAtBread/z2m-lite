"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoSqlite = void 0;
const sqlite_1 = require("sqlite");
class NoSqlite {
    run(...args) { return this.db.then(db => db.run(...args)).catch(ex => { ex.args = args; throw ex; }); }
    get(...args) { return this.db.then(db => db.get(...args)).catch(ex => { ex.args = args; throw ex; }); }
    prepare(...args) { return this.db.then(db => db.prepare(...args)).catch(ex => { ex.args = args; throw ex; }); }
    each(...args) { return this.db.then(db => db.each(...args)).catch(ex => { ex.args = args; throw ex; }); }
    all(...args) { return this.db.then(db => db.all(...args)).catch(ex => { ex.args = args; throw ex; }); }
    close(...args) { return this.db.then(db => db.close(...args)).catch(ex => { ex.args = args; throw ex; }); }
    constructor(config) {
        this.mappingCache = new Map();
        this.db = (0, sqlite_1.open)(config).then(async (db) => {
            await db.run(`CREATE TABLE IF NOT EXISTS MAPPINGS (
                field TEXT,
                jsType TEXT,
                sqlType TEXT,
                indexed INTEGER
            )`);
            await db.run(`CREATE TABLE IF NOT EXISTS  DATA (_source TEXT)`);
            for (const m of await db.all('SELECT * from MAPPINGS'))
                this.mappingCache.set(m.field, m);
            return db;
        });
    }
    ;
    async createMapping(field, jsType, sqlType) {
        const existingMapping = this.mappingCache.get(field);
        if (existingMapping) {
            if (existingMapping.jsType !== jsType)
                throw new Error("Incompatable mapping: " + JSON.stringify({ field, jsType, existingMapping }));
            if (existingMapping.sqlType === sqlType)
                return;
            if (existingMapping.sqlType === 'REAL' && sqlType === 'INTEGER')
                return;
            if (existingMapping.sqlType === 'INTEGER' && sqlType === 'REAL') {
                existingMapping.sqlType = 'REAL';
                await this.run(`UPDATE MAPPINGS set sqlType='REAL' WHERE field='${field}'`);
                return;
            }
            throw new Error("Incompatable mapping: " + JSON.stringify({ field, sqlType, existingMapping }));
        }
        await this.run(`INSERT INTO MAPPINGS(field,jsType,sqlType,indexed) VALUES('${field}','${jsType}','${sqlType}',1)`);
        await this.run(`ALTER TABLE DATA ADD COLUMN '${field}' AS (json_extract(_source, '$.${field}'))`);
        await this.run(`CREATE INDEX IF NOT EXISTS 'field_index_${field}' on DATA('${field}')`);
        this.mappingCache.set(field, { field, jsType, sqlType, indexed: 1 });
    }
    async createDynamicMapping(o, path = []) {
        for (const [field, value] of Object.entries(o)) {
            const jsValue = (Array.isArray(value) ? value[0] : value);
            const jsType = typeof jsValue;
            const fieldPath = [...path, field].join('.');
            switch (jsType) {
                case 'bigint':
                case 'boolean':
                    await this.createMapping(fieldPath, jsType, 'INTEGER');
                    break;
                case 'number':
                    await this.createMapping(fieldPath, jsType, Math.floor(jsValue) === jsValue ? 'INTEGER' : 'REAL');
                    break;
                case 'string':
                    await this.createMapping(fieldPath, jsType, 'TEXT');
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
                    await this.createDynamicMapping(jsValue, [...path, field]);
                    break;
            }
        }
    }
    // Public API
    async index(o) {
        await this.createDynamicMapping(o);
        const stmt = await this.prepare("INSERT INTO DATA VALUES (?)");
        await stmt.run(JSON.stringify(o));
        await stmt.finalize();
    }
    mappings() {
        return Object.fromEntries(this.mappingCache.entries());
    }
    async update(id, o) {
        throw new Error("Not implemented");
    }
    select(where) {
        const docs = [];
        return this.each(`SELECT rowid, _source from DATA${where ? ` WHERE ${where}` : ''}`, (err, row) => {
            if (err)
                throw err;
            const doc = JSON.parse(row._source);
            Object.defineProperty(doc, '_id', { value: row.rowid });
            docs.push(doc);
        }).then(_ => docs);
    }
    count(where) {
        return this.get(`SELECT count(_source) from DATA${where ? ` WHERE ${where}` : ''}`, (err, row) => {
            if (err)
                throw err;
        }).then(data => data['count(_source)']);
    }
}
exports.NoSqlite = NoSqlite;
