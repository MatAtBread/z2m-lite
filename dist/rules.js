"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRules = getRules;
exports.saveRule = saveRule;
exports.loadRules = loadRules;
exports.runRules = runRules;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let rules = [];
const AsyncFunction = (async () => { }).constructor;
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
    return loadRules();
}
function loadRules() {
    const newRules = [];
    const response = {};
    fs_1.default.readdirSync(path_1.default.join(__dirname, '..', 'rules')).forEach(file => {
        if (file.endsWith('.js')) {
            try {
                const rule = new AsyncFunction('context', 'update', 'state', 'publish', fs_1.default.readFileSync(path_1.default.join(__dirname, '..', 'rules', file), 'utf8'));
                if (rule && typeof rule === 'function') {
                    newRules.push({ file, rule, context: {} });
                }
                console.log("Loaded rule: ", file);
            }
            catch (ex) {
                response[file] = ex.message;
                console.error("Error loading rule: ", file, ex);
            }
        }
    });
    rules = newRules;
    return response;
}
async function runRules(update, state, publish) {
    for (const rule of rules) {
        try {
            await rule.rule(rule.context, update, state, publish(rule.file));
        }
        catch (ex) {
            console.error("Error in rule: ", ex);
        }
    }
}
