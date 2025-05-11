import path from "path";
import fs from "fs";

import type { State } from "./lib/ws-mqtt";

type RuleRunner = ((update: string) => void) & { file: string };
export type Publisher = (topic: string, payload: object) => void;

type Rules = Array<RuleRunner>;
let rules: Rules = [];

export function getRules() {
  return rules.map(r => r.file);
}

export function saveRule(name: string, ruleCode: string) {
  if (!name)
    throw new Error("Rule name is required");

  const ruleFile = path.join(__dirname, '..', 'rules', name);
  if (!ruleCode)
    fs.unlinkSync(ruleFile);
  else
    fs.writeFileSync(ruleFile, ruleCode);
  const res = loadRule(name);
  if (typeof res === 'function') {
    try {
      res('');
      return { [res.file]: 'loaded' };
    }
    catch (ex) {
      return { [res.file]: String(ex) };
    }
  } else {
    return { [res.file]: res.error };
  }
}

const rulesFooter = `
  return { onUpdate };
`;

type RuleLoader = (file: string) => RuleRunner | { file: string, error: string };
let loadRule: RuleLoader;

export function initializeRules(state: State, publish: (name: string) => Publisher) {
  loadRule = (file) => {
    if (file.endsWith('.js')) {
      try {
        const rule = new Function('state', 'publish', fs.readFileSync(path.join(__dirname, '..', 'rules', file), 'utf8') + rulesFooter) as (state: State, publish: Publisher) => { onUpdate: RuleRunner };
        const onUpdate = rule(state, publish(file)).onUpdate;
        onUpdate.file = file;
        return onUpdate;
      } catch (ex: any) {
        console.error("Error loading rule: ", file, ex);
        return { file, error: String(ex) };
      }
    } else {
      return { file, error: `${file} is not a .js file` }
    }
  };
  loadRules();
}

export function loadRules() {
  const newRules: Rules = [];
  const response: Record<string, string> = {};

  fs.readdirSync(path.join(__dirname, '..', 'rules')).map(loadRule).forEach(r => {
    if (typeof r === 'function') {
      newRules.push(r);
      response[r.file] = 'loaded';
    } else {
      response[r.file] = r.error;
    }
  });

  rules = newRules;
  return response;
}

export async function runRules(update: string) {
  for (const rule of rules) {
    try {
      await rule(update);
    } catch (ex) {
      console.error("Error in rule: ", ex);
    }
  }
}
