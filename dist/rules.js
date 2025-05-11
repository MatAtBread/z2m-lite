"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRules = void 0;
exports.getRules = getRules;
exports.saveRule = saveRule;
exports.initializeRules = initializeRules;
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
    return (0, exports.loadRules)();
}
const rulesFooter = `
  return { onUpdate };
`;
function initializeRules(state, publish) {
    exports.loadRules = () => {
        const newRules = [];
        const response = {};
        fs_1.default.readdirSync(path_1.default.join(__dirname, '..', 'rules')).forEach(file => {
            if (file.endsWith('.js')) {
                try {
                    const rule = new Function('state', 'publish', fs_1.default.readFileSync(path_1.default.join(__dirname, '..', 'rules', file), 'utf8') + rulesFooter);
                    if (rule && typeof rule === 'function') {
                        const onUpdate = rule(state, publish(file)).onUpdate;
                        onUpdate.file = file;
                        newRules.push(onUpdate);
                    }
                    response[file] = 'loaded';
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
    };
    (0, exports.loadRules)();
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
