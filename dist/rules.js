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
    if (!ruleCode)
        fs_1.default.unlinkSync(ruleFile);
    else
        fs_1.default.writeFileSync(ruleFile, ruleCode);
    const res = loadRule(name);
    if (typeof res === 'function') {
        try {
            res('');
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
function initializeRules(state, publish) {
    loadRule = (file) => {
        if (file.endsWith('.js')) {
            try {
                const rule = new Function('state', 'publish', fs_1.default.readFileSync(path_1.default.join(__dirname, '..', 'rules', file), 'utf8') + rulesFooter);
                const onUpdate = rule(state, publish(file)).onUpdate;
                onUpdate.file = file;
                return onUpdate;
            }
            catch (ex) {
                console.error("Error loading rule: ", file, ex);
                return { file, error: String(ex) };
            }
        }
        else {
            return { file, error: `${file} is not a .js file` };
        }
    };
    loadRules();
}
function loadRules() {
    const newRules = [];
    const response = {};
    fs_1.default.readdirSync(path_1.default.join(__dirname, '..', 'rules')).map(loadRule).forEach(r => {
        if (typeof r === 'function') {
            newRules.push(r);
            response[r.file] = 'loaded';
        }
        else {
            response[r.file] = r.error;
        }
    });
    rules = newRules;
    return response;
}
async function runRules(update) {
    for (const rule of rules) {
        try {
            await rule(update);
        }
        catch (ex) {
            console.error("Error in rule: ", ex);
        }
    }
}
