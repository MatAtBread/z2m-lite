"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRules = getRules;
exports.saveRule = saveRule;
exports.initializeRules = initializeRules;
exports.loadRules = loadRules;
exports.runRules = runRules;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let rules = [];
function getRules() {
    return rules.map(r => r.file);
}
function saveRule(name, ruleCode) {
    if (!name)
        throw new Error("Rule name is required");
    const ruleFile = path_1.default.join(__dirname, '..', 'rules', name);
    if (!ruleCode) {
        fs_1.default.unlinkSync(ruleFile);
    }
    const res = loadRule(name, ruleCode);
    if ('onUpdate' in res) {
        try {
            res.onUpdate('');
            fs_1.default.writeFileSync(ruleFile, ruleCode);
            return { [res.file]: 'loaded' };
        }
        catch (ex) {
            return { [res.file]: String(ex) };
        }
    }
    else {
        return { [res.file]: res.error };
    }
}
const rulesFooter = `
  return { onUpdate };
`;
let loadRule;
function initializeRules(state, publish, echo) {
    loadRule = (file, ruleCode) => {
        if (file.endsWith('.js')) {
            try {
                const rule = new Function('state', 'publish', 'echo', ruleCode + rulesFooter);
                const onUpdate = rule(state, publish(file), echo).onUpdate;
                // onUpdate.file = file;
                return { file, onUpdate };
            }
            catch (ex) {
                console.error("Error loading rule: ", ruleCode, ex);
                return { file: ruleCode, error: String(ex) };
            }
        }
        else {
            return { file: ruleCode, error: `${ruleCode} is not a .js file` };
        }
    };
    loadRules();
}
function loadRules() {
    const newRules = [];
    const response = Object.fromEntries(fs_1.default.readdirSync(path_1.default.join(__dirname, '..', 'rules')).map(file => loadRule(file, fs_1.default.readFileSync(path_1.default.join(__dirname, '..', 'rules', file), 'utf8'))).map(r => {
        if ('onUpdate' in r) {
            newRules.push(r);
            return [r.file, 'loaded'];
        }
        else {
            return [r.file, r.error];
        }
    }));
    rules = newRules;
    return response;
}
async function runRules(update) {
    for (const r of rules) {
        try {
            if ('onUpdate' in r)
                await r.onUpdate(update);
        }
        catch (ex) {
            console.error("Error in rule: ", ex);
        }
    }
}
