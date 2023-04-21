import { text_paint, font } from './style_oim_common.js';

const colour_gas = '#BFBC6B';
const colour_oil = '#6B6B6B';
const colour_fuel = '#CC9F83';
const colour_petroleum_other = '#78CC9E';
const colour_hydrogen = '#CC78AB';
const colour_co2 = '#7885CC';
const colour_unknown = '#BABABA';

const substance = ["coalesce", ["get", "substance"], ["get", "type"], ""];

const pipeline_colour = ["match",
  substance,
  ['gas', 'natural_gas', 'cng', 'lpg', 'lng'], colour_gas,
  'oil', colour_oil,
  'fuel', colour_fuel,
  ['ngl', 'y-grade', 'hydrocarbons', 'condensate'], colour_petroleum_other,
  'hydrogen', colour_hydrogen,
  'carbon_dioxide', colour_co2,
  colour_unknown
]

const pipeline_label = ["concat",
  ["case", ["has", "name"], ["get", "name"], ["get", "operator"]],
  ["case", ["all",
    ["!=", substance, ""],
    ['any',
      ["has", "operator"],
      ['has', 'name']
    ]
  ],
    ["concat", " (", substance, ")"],
    substance
  ]
]

const layers = [
  {
    zorder: 0,
    id: 'petroleum_pipeline_case',
    type: 'line',
    source: 'openinframap',
    minzoom: 7,
    'source-layer': 'petroleum_pipeline',
    paint: {
      'line-color': '#666666',
      'line-width': ['interpolate', ['linear'], ['zoom'],
        8, 1.5,
        16, ['match', ['get', 'usage'],
          'transmission', 4,
          1.5]
      ],
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
  },
  {
    zorder: 1,
    id: 'petroleum_pipeline',
    type: 'line',
    source: 'openinframap',
    minzoom: 3,
    'source-layer': 'petroleum_pipeline',
    paint: {
      'line-color': pipeline_colour,
      'line-width': ['interpolate', ['linear'], ['zoom'],
        3, 1,
        16, ['match', ['get', 'usage'],
          'transmission', 2,
          1]
      ]
    },
  },
  {
    zorder: 100,
    id: 'petroleum_site',
    type: 'fill',
    source: 'openinframap',
    minzoom: 8,
    'source-layer': 'petroleum_site',
    paint: {
      'fill-opacity': 0.3,
      'fill-color': colour_oil,
      'fill-outline-color': 'rgba(0, 0, 0, 1)',
    },
  },
  {
    zorder: 101,
    id: 'petroleum_well',
    type: 'circle',
    source: 'openinframap',
    minzoom: 10,
    'source-layer': 'petroleum_well',
    paint: {
      'circle-color': colour_oil,
      'circle-stroke-color': '#666666',
      'circle-stroke-width': 1,
      'circle-radius': ['interpolate',
        ['linear'], ['zoom'],
        10, 1,
        12, 2,
        14, 5
      ],
    },
  },
  {
    zorder: 500,
    id: 'petroleum_pipeline_label',
    type: 'symbol',
    source: 'openinframap',
    'source-layer': 'petroleum_pipeline',
    minzoom: 12,
    paint: text_paint,
    layout: {
      'text-field': pipeline_label,
      'text-font': font,
      'symbol-placement': 'line',
      'symbol-spacing': 400,
      'text-size': 10,
      'text-offset': [0, 1],
      'text-max-angle': 10
    }
  },
  {
    zorder: 501,
    id: 'petroleum_site_label',
    type: 'symbol',
    source: 'openinframap',
    'source-layer': 'petroleum_site',
    minzoom: 12,
    layout: {
      'text-field': '{name}',
      'text-font': font,
      'text-anchor': 'top',
      'text-offset': [0, 1],
      'text-size': 11,
    },
    paint: text_paint,
  },
  {
    zorder: 502,
    id: 'petroleum_well_label',
    type: 'symbol',
    source: 'openinframap',
    'source-layer': 'petroleum_well',
    minzoom: 13,
    layout: {
      'text-field': 'Well {name}',
      'text-font': font,
      'text-anchor': 'top',
      'text-offset': [0, 0.5],
      'text-size': 10,
    },
    paint: text_paint,
  },
];

export {
  layers as default,
  colour_gas,
  colour_oil,
  colour_fuel,
  colour_petroleum_other,
  colour_hydrogen,
  colour_co2,
  colour_unknown
};
