import path from "path";
import fs from "fs";

import type { State } from "./lib/ws-mqtt";

type RuleRunner = (context:object, update: string, state: State, publish: Publisher) => void;
export type Publisher = (topic: string, payload: object) => void;

type Rules = Array<{file: string, rule: RuleRunner, context: object}>;
let rules: Rules = [];

const AsyncFunction = (async () => { }).constructor as FunctionConstructor;

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
  return loadRules();
}

export function loadRules() {
  const newRules:Rules = [];
  const response: Record<string, string> = {};

  fs.readdirSync(path.join(__dirname, '..', 'rules')).forEach(file => {
    if (file.endsWith('.js')) {
      try {
        const rule = new AsyncFunction('context', 'update', 'state', 'publish', fs.readFileSync(path.join(__dirname, '..', 'rules', file), 'utf8')) as RuleRunner;
        if (rule && typeof rule === 'function') {
          newRules.push({file, rule, context: {} });
        }
        console.log("Loaded rule: ", file);
      } catch (ex:any) {
        response[file] = ex.message;
        console.error("Error loading rule: ", file, ex);
      }
    }
  });

  rules = newRules;
  return response;
}

export async function runRules(update: string, state: State, publish: (name:string)=>Publisher) {
  for (const rule of rules) {
    try {
      await rule.rule(rule.context, update, state, publish(rule.file));
    } catch (ex) {
      console.error("Error in rule: ", ex);
    }
  }
}
