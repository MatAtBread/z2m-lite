import { open, ISqlite } from 'sqlite'

export type JSPRIMITIVE = 'bigint' | 'number' | 'string' | 'boolean' | 'undefined' | 'symbol';
export type SQLPRIMITIVE = 'INTEGER' | 'TEXT' | 'REAL';
export interface Mapping {
    field: string;
    jsType: JSPRIMITIVE;
    sqlType: SQLPRIMITIVE;
    indexed: 0 | 1;
}

type DB = Awaited<ReturnType<typeof open>>;

export class NoSqlite<Doc extends {}> {
    private db: ReturnType<typeof open>;
    private mappingCache = new Map<string, Mapping>();

    private run(...args: Parameters<DB["run"]>) { return this.db.then(db => db.run(...args)).catch(ex => { ex.args = args; throw ex }) }
    private get(...args: Parameters<DB["get"]>) { return this.db.then(db => db.get(...args)).catch(ex => { ex.args = args; throw ex }) }
    private prepare(...args: Parameters<DB["prepare"]>) { return this.db.then(db => db.prepare(...args)).catch(ex => { ex.args = args; throw ex }) }
    private each(...args: Parameters<DB["each"]>) { return this.db.then(db => db.each<Doc>(...args)).catch(ex => { ex.args = args; throw ex }) }

    all(...args: Parameters<DB["all"]>) { return this.db.then(db => db.all(...args)).catch(ex => { ex.args = args; throw ex }) }
    close(...args: Parameters<DB["close"]>) { return this.db.then(db => db.close(...args)).catch(ex => { ex.args = args; throw ex }) }

    constructor(config: ISqlite.Config, indexed: Partial<Doc>) {
        this.db = open(config).then(async db => {
            await db.run(`CREATE TABLE IF NOT EXISTS MAPPINGS (
                field PRIMARY KEY,
                jsType TEXT,
                sqlType TEXT,
                indexed INTEGER
            )`);
            await db.run(`CREATE TABLE IF NOT EXISTS  DATA (_source TEXT)`);
            for (const m of await db.all<Mapping[]>('SELECT * from MAPPINGS'))
                this.mappingCache.set(m.field, m);
            return db;
        });
        this.db.then(async ()=>{
            this.createDynamicMapping(indexed,1);
        });
    };

    private async updateMapping(field: string, jsType: JSPRIMITIVE, sqlType: SQLPRIMITIVE, indexed: 0|1|undefined) {
        let existingMapping = this.mappingCache.get(field);
        if (existingMapping) {
            if (existingMapping.jsType !== jsType)
                throw new Error("Incompatable mapping: " + JSON.stringify({ field, jsType, existingMapping }));

            if (existingMapping.sqlType !== sqlType) {
                if (existingMapping.sqlType === 'INTEGER' && sqlType === 'REAL') {
                    existingMapping.sqlType = 'REAL';
                    this.mappingCache.set(field, existingMapping);
                    await this.run(`UPDATE MAPPINGS set sqlType='REAL' WHERE field=$field`,{
                        $field: field
                    });
                } else if (!(existingMapping.sqlType === 'REAL' && sqlType === 'INTEGER')) {
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
        } else {
            existingMapping = { field, jsType, sqlType, indexed: indexed || 0 };
            this.mappingCache.set(field, existingMapping);
            await this.run(`INSERT INTO MAPPINGS(field,jsType,sqlType,indexed) VALUES('${field}','${jsType}','${sqlType}',${indexed || 0})`);
            await this.run(`ALTER TABLE DATA ADD COLUMN '${field}' AS (json_extract(_source, '$.${field}'))`);
            if (indexed) {
                await this.run(`CREATE INDEX IF NOT EXISTS 'field_index_${field}' on DATA('${field}')`);
            }
        }
    }

    private async createDynamicMapping(o: Partial<Doc>, indexed: 0|1|undefined = undefined, path: string[] = []) {
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
    async index(o: Doc) {
        await this.db;
        await this.createDynamicMapping(o);
        const stmt = await this.prepare("INSERT INTO DATA VALUES (?)");
        await stmt.run(JSON.stringify(o));
        await stmt.finalize();
    }

    mappings() {
        return Object.fromEntries(this.mappingCache.entries());
    }

    async update(id: { _id: unknown }, o: Partial<Doc>) {
        throw new Error("Not implemented");
    }

    select(where?: string) {
        const docs: (Doc & { _id: unknown })[] = [];
        return this.each(`SELECT rowid, _source from DATA${where ? ` WHERE ${where}` : ''}`,
            (err: any, row: any) => {
                if (err) throw err;
                const doc = JSON.parse(row._source);
                Object.defineProperty(doc, '_id', { value: row.rowid });
                docs.push(doc);
            }).then(_ => docs);
    }

    count(where?: string): Promise<number> {
        return this.get(`SELECT count(_source) from DATA${where ? ` WHERE ${where}` : ''}`,
            (err: any, row: any) => {
                if (err) throw err;
            }).then(data => data['count(_source)']);
    }
}

