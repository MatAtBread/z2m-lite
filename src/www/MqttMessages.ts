import { Device } from "./Features";

interface OtherZ2Message {
  topic: '';
  payload: { [key: string]: unknown; };
}
export interface DeviceAvailability {
  topic: `zigbee2mqtt/${string}/availability`;
  payload: { state: "online" | "offline"; };
}
export interface BridgeDevices {
  topic: 'zigbee2mqtt/bridge/devices';
  payload: Device[];
}
interface BridgeState {
  topic: 'zigbee2mqtt/bridge/state';
  payload: { state: 'offline' | 'online'; };
}
export type EnergyImport = {
  cumulative: number;
  day: number;
  month: number;
  week: number;
};
export type Energy = {
  energy: {
    import: EnergyImport & {
      units: string;
      price: {
        unitrate: number;
        standingcharge: number;
      };
    };
  };
};
export interface GlowSensorGas {
  topic: `glow/${string}/SENSOR/gasmeter`;
  payload: {
    gasmeter: Energy;
  };
}
export interface GlowSensorElectricity {
  topic: `glow/${string}/SENSOR/electricitymeter`;
  payload: {
    electricitymeter: Energy & {
      power: {
        value: number;
        units: string;
      };
    };
  };
}
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface BridgeInfo {
  topic: "zigbee2mqtt/bridge/info";
  payload: {
    "version": string;
    "commit": string;
    "coordinator": {
      "ieee_address": string;
      "type": string;
      "meta": object;
    };
    "network": { "channel": number; "pan_id": number; "extended_pan_id": number[]; };
    "log_level": LogLevel;
    "permit_join": boolean;
    "permit_join_timeout"?: number; // Time in seconds till permit join is disabled, `undefined` in case of no timeout
    "config": object;
    "config_schema": object;
    "restart_required": boolean; // Indicates whether Zigbee2MQTT needs to be restarted to apply options set through zigbee2mqtt/request/bridge/options
  };
}
interface BridgeConfig {
  topic: "zigbee2mqtt/bridge/config";
  payload?: never;
}
interface BridgeLogging {
  topic: 'zigbee2mqtt/bridge/logging';
  payload: {
    level: LogLevel;
    message: string;
  };
}
interface BridgeLog {
  topic: 'zigbee2mqtt/bridge/log';
  message: string;
  meta?: {
    friendly_name?: string;
  };
  type: string;
  payload?: never;
}
export type Z2Message = GlowSensorElectricity | GlowSensorGas | DeviceAvailability | BridgeDevices | BridgeState | BridgeLogging | BridgeLog | BridgeInfo | BridgeConfig | OtherZ2Message;
