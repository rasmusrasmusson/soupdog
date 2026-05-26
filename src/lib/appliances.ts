// src/lib/appliances.ts
// Appliance capability definitions for connected tool support
// Each appliance defines its cooking modes and the controls for each mode

export type ControlType =
  | 'power_w'       // wattage 0–max
  | 'temperature'   // celsius range
  | 'time_minutes'  // duration
  | 'select'        // fixed options
  | 'toggle'        // on/off

export interface Control {
  id:           string;
  label:        string;
  type:         ControlType;
  min?:         number;
  max?:         number;
  unit?:        string;
  options?:     string[];   // for select type
  required:     boolean;
  defaultValue?: string | number;
  hint?:        string;
}

export interface CookingMode {
  id:       string;
  label:    string;
  controls: Control[];
  hint?:    string;
}

export interface ApplianceDefinition {
  id:           string;
  brand:        string;
  name:         string;
  model:        string;
  category:     'oven' | 'microwave' | 'combination' | 'steamer' | 'other';
  isConnected:  boolean;  // simulated connection
  modes:        CookingMode[];
  notes?:       string;
}

// ── Panasonic NN-DS59NB ───────────────────────────────────────

const DS59NB: ApplianceDefinition = {
  id:          'panasonic-nn-ds59nb',
  brand:       'Panasonic',
  name:        '4-in-1 Steam Combination Oven',
  model:       'NN-DS59NB',
  category:    'combination',
  isConnected: true,
  notes:       '27L capacity. Flat grill, side boiler steam, Inverter microwave. 600ml water tank.',
  modes: [
    {
      id:    'microwave',
      label: 'Microwave',
      hint:  'Inverter microwave — smooth, even heating. Max 1,000W.',
      controls: [
        {
          id: 'power', label: 'Power', type: 'power_w',
          min: 100, max: 1000, unit: 'W',
          options: ['100', '300', '440', '600', '800', '1000'],
          required: true, defaultValue: 600,
          hint: 'Choose from preset levels: 100 / 300 / 440 / 600 / 800 / 1000 W',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 0.5, max: 90, unit: 'min',
          required: true, defaultValue: 2,
        },
      ],
    },
    {
      id:    'steam',
      label: 'Steam',
      hint:  '1,100W side boiler steam. Max 30 min per cycle. Fill water tank (600ml) before use.',
      controls: [
        {
          id: 'level', label: 'Steam Level', type: 'select',
          options: ['Steam 1 – High (1100W)', 'Steam 2 – Low'],
          required: true, defaultValue: 'Steam 1 – High (1100W)',
          hint: 'High for most foods; Low for delicate items like fish',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 30, unit: 'min',
          required: true, defaultValue: 10,
        },
      ],
    },
    {
      id:    'grill',
      label: 'Grill',
      hint:  'Flat top grill 1,350W. Grills top and bottom simultaneously without flipping.',
      controls: [
        {
          id: 'level', label: 'Grill Level', type: 'select',
          options: ['Grill 1 – High', 'Grill 2 – Medium', 'Grill 3 – Low'],
          required: true, defaultValue: 'Grill 2 – Medium',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 90, unit: 'min',
          required: true, defaultValue: 10,
        },
      ],
    },
    {
      id:    'convection',
      label: 'Convection Oven',
      hint:  '30–220°C. Preheat required above 70°C. Max 90 min cook time.',
      controls: [
        {
          id: 'temperature', label: 'Temperature', type: 'temperature',
          min: 30, max: 220, unit: '°C',
          required: true, defaultValue: 180,
          hint: 'Below 70°C: no preheat needed. 70°C and above: preheat required.',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 90, unit: 'min',
          required: true, defaultValue: 20,
        },
        {
          id: 'preheat', label: 'Preheat', type: 'toggle',
          required: false, defaultValue: 1,
          hint: 'Auto-enabled for temperatures above 70°C',
        },
      ],
    },
    {
      id:    'steam_grill',
      label: 'Steam + Grill',
      hint:  'Combination: Steam (1,100W) + Grill (1,300W duty). Max 60 min.',
      controls: [
        {
          id: 'steam_level', label: 'Steam Level', type: 'select',
          options: ['Steam 1 – High', 'Steam 2 – Low'],
          required: true, defaultValue: 'Steam 1 – High',
        },
        {
          id: 'grill_level', label: 'Grill Level', type: 'select',
          options: ['Grill 1 – High', 'Grill 2 – Medium', 'Grill 3 – Low'],
          required: true, defaultValue: 'Grill 2 – Medium',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 60, unit: 'min',
          required: true, defaultValue: 15,
        },
      ],
    },
    {
      id:    'steam_oven',
      label: 'Steam + Oven',
      hint:  'Steam + Convection 150–220°C. Preheat required. Max 60 min.',
      controls: [
        {
          id: 'temperature', label: 'Oven Temperature', type: 'temperature',
          min: 150, max: 220, unit: '°C',
          required: true, defaultValue: 180,
        },
        {
          id: 'steam_level', label: 'Steam Level', type: 'select',
          options: ['Steam 1 – High', 'Steam 2 – Low'],
          required: true, defaultValue: 'Steam 2 – Low',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 60, unit: 'min',
          required: true, defaultValue: 20,
        },
      ],
    },
    {
      id:    'steam_microwave',
      label: 'Steam + Microwave',
      hint:  'Steam + MW 600W alternating. Max 30 min.',
      controls: [
        {
          id: 'steam_level', label: 'Steam Level', type: 'select',
          options: ['Steam 1 – High', 'Steam 2 – Low'],
          required: true, defaultValue: 'Steam 1 – High',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 30, unit: 'min',
          required: true, defaultValue: 8,
        },
      ],
    },
  ],
};

// ── Panasonic NN-CS89LB ───────────────────────────────────────

const CS89LB: ApplianceDefinition = {
  id:          'panasonic-nn-cs89lb',
  brand:       'Panasonic',
  name:        'Combination Oven with Steam Cooking',
  model:       'NN-CS89LB',
  category:    'combination',
  isConnected: true,
  notes:       '31L flatbed (no turntable). Dual steam outlets. 800ml water tank. Genius Sensor.',
  modes: [
    {
      id:    'microwave',
      label: 'Microwave',
      hint:  'Inverter microwave, 1,000W max. Genius Sensor for auto-reheat.',
      controls: [
        {
          id: 'power', label: 'Power', type: 'power_w',
          min: 100, max: 1000, unit: 'W',
          options: ['100', '300', '440', '600', '800', '1000'],
          required: true, defaultValue: 600,
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 0.5, max: 90, unit: 'min',
          required: true, defaultValue: 2,
        },
      ],
    },
    {
      id:    'steam',
      label: 'Steam',
      hint:  '1,300W dual-outlet steam. 800ml tank. Two-level cooking possible.',
      controls: [
        {
          id: 'level', label: 'Steam Level', type: 'select',
          options: ['High (1300W)', 'Low'],
          required: true, defaultValue: 'High (1300W)',
          hint: 'Dual outlets for faster, more even steam distribution',
        },
        {
          id: 'levels', label: 'Rack levels', type: 'select',
          options: ['Single level', 'Dual level'],
          required: false, defaultValue: 'Single level',
          hint: 'Dual level: cook two items simultaneously',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 60, unit: 'min',
          required: true, defaultValue: 10,
        },
      ],
    },
    {
      id:    'grill',
      label: 'Broil / Grill',
      hint:  'Ceiling-integrated broil heater. No flip needed.',
      controls: [
        {
          id: 'level', label: 'Level', type: 'select',
          options: ['High', 'Medium', 'Low'],
          required: true, defaultValue: 'Medium',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 90, unit: 'min',
          required: true, defaultValue: 10,
        },
      ],
    },
    {
      id:    'convection',
      label: 'Convection Bake',
      hint:  '40–230°C convection. Flatbed design for even heat. Preheat recommended.',
      controls: [
        {
          id: 'temperature', label: 'Temperature', type: 'temperature',
          min: 40, max: 230, unit: '°C',
          required: true, defaultValue: 180,
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 90, unit: 'min',
          required: true, defaultValue: 25,
        },
        {
          id: 'preheat', label: 'Preheat', type: 'toggle',
          required: false, defaultValue: 1,
        },
      ],
    },
    {
      id:    'steam_convection',
      label: 'Steam + Convection',
      hint:  'Combination mode. Faster cooking with moisture retention.',
      controls: [
        {
          id: 'temperature', label: 'Oven Temperature', type: 'temperature',
          min: 100, max: 230, unit: '°C',
          required: true, defaultValue: 180,
        },
        {
          id: 'steam_level', label: 'Steam Level', type: 'select',
          options: ['High (1300W)', 'Low'],
          required: true, defaultValue: 'Low',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 60, unit: 'min',
          required: true, defaultValue: 20,
        },
      ],
    },
    {
      id:    'steam_grill',
      label: 'Steam + Grill',
      hint:  'Steam + broil combination.',
      controls: [
        {
          id: 'steam_level', label: 'Steam Level', type: 'select',
          options: ['High (1300W)', 'Low'],
          required: true, defaultValue: 'High (1300W)',
        },
        {
          id: 'grill_level', label: 'Grill Level', type: 'select',
          options: ['High', 'Medium', 'Low'],
          required: true, defaultValue: 'Medium',
        },
        {
          id: 'time', label: 'Time', type: 'time_minutes',
          min: 1, max: 60, unit: 'min',
          required: true, defaultValue: 15,
        },
      ],
    },
  ],
};

// ── Registry ──────────────────────────────────────────────────

export const APPLIANCES: ApplianceDefinition[] = [DS59NB, CS89LB];

export function getAppliance(id: string): ApplianceDefinition | undefined {
  return APPLIANCES.find(a => a.id === id);
}
