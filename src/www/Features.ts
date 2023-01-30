interface CommonFeature {
  // Bit 1: The property can be found in the published state of this device.
  // Bit 2: The property can be set with a /set command
  // Bit 3: The property can be retrieved with a /get command (when this bit is true, bit 1 will also be true)
  access?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  description: string;
  name: string;
  property: string;
}
export interface BinaryFeature extends CommonFeature {
  type: "binary";
  value_off: string;
  value_on: string;
  value_toggle: string;
}
export interface NumericFeature extends CommonFeature {
  type: "numeric";
  unit: string;
}
export interface TextFeature extends CommonFeature {
  type: "text";
}
export interface EnumFeature extends CommonFeature {
  type: 'enum';
  values: string[];
}
export interface LQIFeature extends NumericFeature {
  unit: 'lqi';
  value_max: number;
  value_min: number;
}
export type Feature = BinaryFeature | NumericFeature | EnumFeature | LQIFeature | TextFeature;

export interface Device {
  friendly_name: string;
  ieee_address: string;
  definition?: {
    model: string;
    description: string;
    exposes: Array<{
      features: Feature[];
    } | Feature>;
  };
}
