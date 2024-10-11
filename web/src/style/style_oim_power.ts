import { text_paint, underground_p, font, local_name } from './common.js'
import {
  all,
  has,
  get,
  interpolate,
  coalesce,
  match,
  case_,
  any,
  zoom,
  concat,
  step,
  round,
  literal,
  if_,
  not,
  rgb
} from './stylehelpers.ts'
import { LayerSpecificationWithZIndex } from './types.ts'
import { DataDrivenPropertyValueSpecification, ExpressionSpecification } from 'maplibre-gl'

const voltage_scale: [number | null, string][] = [
  [null, '#7A7A85'],
  [10, '#6E97B8'],
  [25, '#55B555'],
  [52, '#B59F10'],
  [132, '#B55D00'],
  [220, '#C73030'],
  [310, '#B54EB2'],
  [550, '#00C1CF']
]

const special_voltages = {
  HVDC: '#4E01B5',
  'Traction (<50 Hz)': '#A8B596'
}

const plant_types = {
  coal: 'power_plant_coal',
  geothermal: 'power_plant_geothermal',
  hydro: 'power_plant_hydro',
  nuclear: 'power_plant_nuclear',
  oil: 'power_plant_oilgas',
  gas: 'power_plant_oilgas',
  diesel: 'power_plant_oilgas',
  solar: 'power_plant_solar',
  wind: 'power_plant_wind',
  biomass: 'power_plant_biomass',
  waste: 'power_plant_waste',
  battery: 'power_plant_battery'
}

// === Frequency predicates
const traction_freq_p: ExpressionSpecification = all(
  has('frequency'),
  ['!=', get('frequency'), ''],
  ['!=', ['to-number', get('frequency')], 50],
  ['!=', ['to-number', get('frequency')], 60]
)

const hvdc_p: ExpressionSpecification = all(
  has('frequency'),
  ['!=', get('frequency'), ''],
  ['==', ['to-number', get('frequency')], 0]
)

// Stepwise function to assign colour by voltage:
function voltage_color(field: string): DataDrivenPropertyValueSpecification<string> {
  const voltage_func: any = ['step', ['to-number', coalesce(get(field), 0)]]
  for (const row of voltage_scale) {
    if (row[0] == null) {
      voltage_func.push(row[1])
      continue
    }
    voltage_func.push(row[0] - 0.01)
    voltage_func.push(row[1])
  }

  return case_(
    [
      [hvdc_p, special_voltages['HVDC']], // HVDC (frequency == 0)
      [traction_freq_p, special_voltages['Traction (<50 Hz)']] // Traction power
    ],
    voltage_func as ExpressionSpecification
  )
}

const multi_voltage_min_zoom = 10

// Generate an expression to determine the offset of a power line
// segment with multiple voltages
function voltage_offset(index: number): DataDrivenPropertyValueSpecification<number> {
  const spacing = 14

  const offset = (index - 1) * spacing
  return interpolate(zoom, [
    [multi_voltage_min_zoom - 0.001, 0],
    [
      multi_voltage_min_zoom,
      case_(
        [
          [has('voltage_3'), (offset - spacing) * 0.3],
          [has('voltage_2'), (offset - spacing / 2) * 0.3]
        ],
        0
      )
    ],
    [
      21,
      case_(
        [
          [has('voltage_3'), offset - spacing],
          [has('voltage_2'), offset - spacing / 2]
        ],
        0
      )
    ]
  ])
}

// Function to assign power line thickness.
// Interpolate first by zoom level and then by voltage.
const voltage_line_thickness: ExpressionSpecification = interpolate(
  zoom,
  [
    [1, 0.5],
    [
      21,
      match(
        get('line'),
        [
          ['bay', 1],
          ['busbar', 1]
        ],
        interpolate(coalesce(get('voltage'), 0), [
          [0, 1.5],
          [20, 2],
          [30, 4],
          [100, 6],
          [500, 9]
        ])
      )
    ]
  ],
  1.1
)

const voltage: ExpressionSpecification = ['to-number', coalesce(get('voltage'), 0)]
const output: ExpressionSpecification = ['to-number', coalesce(get('output'), 0)]
const area: ExpressionSpecification = ['to-number', coalesce(get('area'), 0)]

// Determine substation visibility
const substation_visible_p: ExpressionSpecification = all(
  any(
    ['>', voltage, 200],
    all(['>', voltage, 200], ['>', zoom, 6]),
    all(['>', voltage, 100], ['>', zoom, 7]),
    all(['>', voltage, 25], ['>', zoom, 9]),
    all(['>', voltage, 9], ['>', zoom, 10]),
    ['>', zoom, 11]
  ),
  any(['!=', get('substation'), 'transition'], ['>', zoom, 12])
)

const substation_radius: ExpressionSpecification = interpolate(zoom, [
  [
    5,
    interpolate(voltage, [
      [0, 0],
      [200, 1],
      [750, 3]
    ])
  ],
  [
    13,
    interpolate(voltage, [
      [10, 1],
      [30, 3],
      [100, 4],
      [300, 6],
      [500, 8]
    ])
  ],
  [20, 5]
])

// Determine the minimum zoom a point is visible at (before it can be seen as an
// area), based on the area of the substation.
const substation_point_visible_p: ExpressionSpecification = any(
  ['==', area, 0], // Area = 0 - mapped as node
  all(['<', area, 100], ['<', zoom, 16]),
  all(['<', area, 250], ['<', zoom, 15]),
  ['<', zoom, 13]
)

const converter_p: ExpressionSpecification = all(
  ['==', get('substation'), 'converter'],
  any(['>', voltage, 100], ['>', zoom, 6])
)

const substation_label_visible_p: ExpressionSpecification = all(
  any(
    ['>', voltage, 399],
    all(['>', voltage, 200], ['>', zoom, 8]),
    all(['>', voltage, 100], ['>', zoom, 10]),
    all(['>', voltage, 50], ['>', zoom, 12]),
    ['>', zoom, 13]
  ),
  any(['==', area, 0], ['<', zoom, 17]),
  ['!=', get('substation'), 'transition']
)

// Power line / substation visibility
const power_visible_p: ExpressionSpecification = all(
  any(
    ['>', voltage, 199],
    all(['>', voltage, 99], ['>=', zoom, 4]),
    all(['>', voltage, 49], ['>=', zoom, 5]),
    all(['>', voltage, 24], ['>=', zoom, 6]),
    all(['>', voltage, 9], ['>=', zoom, 9]),
    ['>', zoom, 10]
  ),
  any(all(['!=', get('line'), 'busbar'], ['!=', get('line'), 'bay']), ['>', zoom, 12])
)

// Power line ref visibility
const power_ref_visible_p: ExpressionSpecification = all(
  any(
    all(['>', voltage, 330], ['>', zoom, 7]),
    all(['>', voltage, 200], ['>', zoom, 8]),
    all(['>', voltage, 100], ['>', zoom, 9]),
    ['>', zoom, 10]
  ),
  any(all(['!=', get('line'), 'busbar'], ['!=', get('line'), 'bay']), ['>', zoom, 12])
)

const construction_p: ExpressionSpecification = ['get', 'construction']

const construction_label: ExpressionSpecification = ['case', construction_p, ' (under construction) ', '']

const plant_label_visible_p: ExpressionSpecification = any(
  ['>', output, 1000],
  all(['>', output, 750], ['>', zoom, 5]),
  all(['>', output, 250], ['>', zoom, 6]),
  all(['>', output, 100], ['>', zoom, 7]),
  all(['>', output, 10], ['>', zoom, 9]),
  all(['>', output, 1], ['>', zoom, 11]),
  ['>', zoom, 12]
)

const pretty_output: ExpressionSpecification = if_(
  ['>', output, 1],
  concat(output, ' MW'),
  concat(['round', ['*', output, 1000]], ' kW')
)

const plant_label: ExpressionSpecification = step(zoom, local_name, [
  [
    9,
    case_(
      [
        [all(['!', has('name')], has('output')), concat(pretty_output, construction_label)],
        [has('output'), concat(local_name, ' \n', pretty_output, '\n', construction_label)]
      ],
      local_name
    )
  ]
])

function plant_image(): ExpressionSpecification {
  const expr = ['match', get('source')]
  for (const [key, value] of Object.entries(plant_types)) {
    expr.push(key, value)
  }
  expr.push('power_plant') // default
  return expr as ExpressionSpecification
}

const power_opacity: ExpressionSpecification = interpolate(zoom, [
  [4, case_([[construction_p, 0.3]], 0.6)],
  [8, case_([[construction_p, 0.3]], 1)]
])

const freq: ExpressionSpecification = case_(
  [
    [hvdc_p, ' DC'],
    [traction_freq_p, concat(' ', get('frequency'), ' Hz')]
  ],
  ''
)

const line_voltage: ExpressionSpecification = case_(
  [
    [
      all(has('voltage_3'), ['!=', get('voltage_3'), get('voltage_2')]),
      concat(
        round(get('voltage'), 3),
        '/',
        round(get('voltage_2'), 3),
        '/',
        round(get('voltage_3'), 3),
        ' kV'
      )
    ],
    [
      all(has('voltage_2'), ['!=', get('voltage_2'), get('voltage')]),
      concat(round(get('voltage'), 3), '/', round(get('voltage_2'), 3), ' kV')
    ],
    [has('voltage'), concat(round(get('voltage'), 3), ' kV')]
  ],
  ''
)

const line_label: ExpressionSpecification = case_(
  [
    [
      all(has('voltage'), has('name'), ['!=', local_name, '']),
      concat(local_name, ' (', line_voltage, freq, ')', construction_label)
    ],
    [has('voltage'), concat(line_voltage, freq, construction_label)]
  ],
  local_name
)

const substation_label_detail: ExpressionSpecification = case_(
  [
    [
      all(['!=', local_name, ''], has('voltage')),
      concat(local_name, ' ', voltage, ' kV', freq, construction_label)
    ],
    [
      all(['==', local_name, ''], has('voltage')),
      concat('Substation ', voltage, ' kV', freq, construction_label)
    ]
  ],
  local_name
)

const substation_label: ExpressionSpecification = step(zoom, local_name, [[12, substation_label_detail]])

const layers: LayerSpecificationWithZIndex[] = [
  {
    zorder: 60,
    id: 'power_line_case',
    type: 'line',
    source: 'power',
    'source-layer': 'power_line',
    filter: ['==', get('tunnel'), true],
    minzoom: 12,
    paint: {
      'line-opacity': case_([[construction_p, 0.2]], 0.4),
      'line-color': '#7C4544',
      'line-width': interpolate(zoom, [
        [12, 4],
        [18, 10]
      ])
    },
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    }
  },
  {
    zorder: 61,
    id: 'power_line_underground_1',
    type: 'line',
    filter: all(underground_p, power_visible_p),
    source: 'power',
    'source-layer': 'power_line',
    minzoom: 0,
    paint: {
      'line-color': voltage_color('voltage'),
      'line-width': voltage_line_thickness,
      'line-dasharray': [3, 2],
      'line-offset': voltage_offset(1),
      'line-opacity': power_opacity
    },
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    }
  },
  {
    zorder: 61,
    id: 'power_line_underground_2',
    type: 'line',
    filter: all(underground_p, power_visible_p, has('voltage_2')),
    source: 'power',
    'source-layer': 'power_line',
    minzoom: multi_voltage_min_zoom,
    paint: {
      'line-color': voltage_color('voltage_2'),
      'line-width': voltage_line_thickness,
      'line-dasharray': [3, 2],
      'line-offset': voltage_offset(2),
      'line-opacity': power_opacity
    },
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    }
  },
  {
    zorder: 61,
    id: 'power_line_underground_3',
    type: 'line',
    filter: all(underground_p, power_visible_p, has('voltage_3')),
    source: 'power',
    'source-layer': 'power_line',
    minzoom: multi_voltage_min_zoom,
    paint: {
      'line-color': voltage_color('voltage_3'),
      'line-width': voltage_line_thickness,
      'line-dasharray': [3, 2],
      'line-offset': voltage_offset(3),
      'line-opacity': power_opacity
    },
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    }
  },
  {
    zorder: 160,
    id: 'power_plant',
    type: 'fill',
    source: 'power',
    minzoom: 5,
    'source-layer': 'power_plant',
    paint: {
      'fill-opacity': if_(construction_p, 0.05, 0.2)
    }
  },
  {
    zorder: 161,
    id: 'power_plant_outline',
    type: 'line',
    filter: ['!', construction_p],
    source: 'power',
    minzoom: 8,
    'source-layer': 'power_plant',
    paint: {
      'line-color': rgb(30, 30, 30),
      'line-opacity': 0.8,
      'line-width': interpolate(zoom, [
        [13, 0.5],
        [20, 2]
      ])
    },
    layout: {
      'line-join': 'round'
    }
  },
  {
    zorder: 161,
    id: 'power_plant_outline_construction',
    type: 'line',
    filter: construction_p,
    source: 'power',
    minzoom: 8,
    'source-layer': 'power_plant',
    paint: {
      'line-color': rgb(163, 139, 16),
      'line-opacity': 0.8,
      'line-width': interpolate(zoom, [
        [13, 1],
        [20, 3]
      ]),
      'line-dasharray': [2, 2]
    },
    layout: {
      'line-join': 'round'
    }
  },
  {
    zorder: 161,
    id: 'power_substation',
    type: 'fill',
    filter: substation_visible_p,
    source: 'power',
    'source-layer': 'power_substation',
    minzoom: 13,
    paint: {
      'fill-opacity': 0.3,
      'fill-color': voltage_color('voltage')
    }
  },
  {
    zorder: 162,
    id: 'power_substation_outline',
    type: 'line',
    filter: substation_visible_p,
    source: 'power',
    'source-layer': 'power_substation',
    minzoom: 13,
    paint: {
      'line-color': rgb(30, 30, 30),
      'line-opacity': 0.9,
      'line-width': interpolate(zoom, [
        [13, 0.5],
        [20, 2]
      ])
    }
  },
  {
    zorder: 163,
    id: 'power_solar_panel',
    type: 'fill',
    source: 'power',
    'source-layer': 'power_generator_area',
    filter: ['==', get('source'), 'solar'],
    minzoom: 13,
    paint: {
      'fill-color': '#726BA9',
      'fill-outline-color': rgb(50, 50, 50)
    }
  },
  {
    zorder: 260,
    id: 'power_line_1',
    type: 'line',
    source: 'power',
    'source-layer': 'power_line',
    filter: all(not(underground_p), power_visible_p),
    minzoom: 0,
    paint: {
      'line-color': voltage_color('voltage'),
      'line-width': voltage_line_thickness,
      'line-offset': voltage_offset(1),
      'line-opacity': power_opacity
    },
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    }
  },
  {
    zorder: 260,
    id: 'power_line_2',
    type: 'line',
    source: 'power',
    'source-layer': 'power_line',
    filter: all(not(underground_p), power_visible_p, has('voltage_2')),
    minzoom: multi_voltage_min_zoom,
    paint: {
      'line-color': voltage_color('voltage_2'),
      'line-width': voltage_line_thickness,
      'line-offset': voltage_offset(2),
      'line-opacity': power_opacity
    },
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    }
  },
  {
    zorder: 260,
    id: 'power_line_3',
    type: 'line',
    source: 'power',
    'source-layer': 'power_line',
    filter: all(not(underground_p), power_visible_p, has('voltage_3')),
    minzoom: multi_voltage_min_zoom,
    paint: {
      'line-color': voltage_color('voltage_3'),
      'line-width': voltage_line_thickness,
      'line-offset': voltage_offset(3),
      'line-opacity': power_opacity
    },
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    }
  },
  {
    zorder: 261,
    id: 'power_transformer',
    type: 'symbol',
    source: 'power',
    'source-layer': 'power_transformer',
    minzoom: 14,
    paint: text_paint,
    layout: {
      'icon-image': 'power_transformer',
      'icon-allow-overlap': true,
      'icon-size': interpolate(zoom, [
        [14, 0.3],
        [21, 2]
      ])
    }
  },
  {
    zorder: 262,
    id: 'power_compensator',
    type: 'symbol',
    source: 'power',
    'source-layer': 'power_compensator',
    minzoom: 14,
    paint: text_paint,
    layout: {
      'icon-image': 'power_compensator',
      'icon-allow-overlap': true
    }
  },
  {
    zorder: 263,
    id: 'power_switch',
    type: 'symbol',
    source: 'power',
    'source-layer': 'power_switch',
    minzoom: 14,
    paint: text_paint,
    layout: {
      'icon-image': 'power_switch',
      'icon-size': interpolate(zoom, [
        [14, 0.3],
        [21, 2.5]
      ]),
      'icon-allow-overlap': true
    }
  },
  {
    zorder: 264,
    id: 'power_tower',
    type: 'symbol',
    filter: ['==', get('type'), 'tower'],
    source: 'power',
    'source-layer': 'power_tower',
    minzoom: 13,
    paint: text_paint,
    layout: {
      'icon-image': case_(
        [
          [get('transition'), 'power_tower_transition'],
          [any(has('transformer'), has('substation')), 'power_tower_transformer']
        ],
        'power_tower'
      ),
      'icon-offset': if_(any(has('transformer'), has('substation')), literal([12, 0]), literal([0, 0])),
      'icon-allow-overlap': true,
      'icon-size': interpolate(
        zoom,
        [
          [13, 0.6],
          [21, 2.5]
        ],
        1.2
      ),
      'text-field': step(zoom, '', [[14, get('ref')]]),
      'text-font': font,
      'text-size': interpolate(zoom, [
        [13, 8],
        [21, 14]
      ]),
      'text-offset': [0, 1.5],
      'text-max-angle': 10,
      'text-optional': true
    }
  },
  {
    zorder: 265,
    id: 'power_pole',
    type: 'symbol',
    filter: ['==', get('type'), 'pole'],
    source: 'power',
    'source-layer': 'power_tower',
    minzoom: 13,
    paint: text_paint,
    layout: {
      'icon-image': case_(
        [
          [get('transition'), 'power_pole_transition'],
          [any(has('transformer'), has('substation')), 'power_pole_transformer']
        ],
        'power_pole'
      ),
      'icon-offset': if_(any(has('transformer'), has('substation')), literal([10, 0]), literal([0, 0])),
      'icon-allow-overlap': true,
      'icon-size': interpolate(zoom, [
        [13, 0.2],
        [17, 0.8]
      ]),
      'text-field': '{ref}',
      'text-font': font,
      'text-size': interpolate(zoom, [
        [13, 8],
        [21, 14]
      ]),
      'text-offset': [0, 1],
      'text-max-angle': 10
    }
  },
  {
    zorder: 266,
    id: 'power_wind_turbine',
    type: 'symbol',
    source: 'power',
    'source-layer': 'power_generator',
    filter: ['==', get('source'), 'wind'],
    minzoom: 11,
    paint: text_paint,
    layout: {
      'icon-image': 'power_wind',
      'icon-anchor': 'bottom',
      'icon-size': interpolate(zoom, [
        [11, 0.5],
        [21, 3]
      ]),
      'icon-allow-overlap': true,
      'text-field': step(zoom, '', [[12, get('name')]]),
      'text-font': font,
      'text-offset': [0, 1],
      'text-anchor': 'top',
      'text-optional': true
    }
  },
  {
    zorder: 267,
    id: 'power_wind_turbine_point',
    type: 'circle',
    source: 'power',
    'source-layer': 'power_generator',
    filter: ['==', get('source'), 'wind'],
    minzoom: 9,
    maxzoom: 11,
    paint: {
      'circle-radius': 1.5,
      'circle-color': '#444444'
    }
  },
  {
    zorder: 268,
    id: 'power_substation_point',
    type: 'circle',
    filter: all(substation_visible_p, substation_point_visible_p, not(converter_p)),
    source: 'power',
    'source-layer': 'power_substation_point',
    minzoom: 5,
    layout: {},
    paint: {
      'circle-radius': substation_radius,
      'circle-color': voltage_color('voltage'),
      'circle-stroke-color': '#333',
      'circle-stroke-width': interpolate(zoom, [
        [5, 0.1],
        [8, 0.5],
        [15, 2]
      ]),
      'circle-opacity': power_opacity,
      'circle-stroke-opacity': power_opacity
    }
  },
  {
    zorder: 560,
    id: 'power_line_ref',
    type: 'symbol',
    filter: all(power_ref_visible_p, ['!=', coalesce(get('ref'), ''), ''], ['<', ['length', get('ref')], 5]),
    source: 'power',
    'source-layer': 'power_line',
    minzoom: 7,
    layout: {
      'icon-image': 'power_line_ref',
      'text-field': '{ref}',
      'text-font': font,
      'symbol-placement': 'line-center',
      'text-size': 10,
      'text-max-angle': 10
    }
  },
  {
    zorder: 561,
    id: 'power_line_label',
    type: 'symbol',
    filter: power_visible_p,
    source: 'power',
    'source-layer': 'power_line',
    minzoom: 10,
    paint: text_paint,
    layout: {
      'text-field': line_label,
      'text-font': font,
      'symbol-placement': 'line',
      'symbol-spacing': 400,
      'text-size': interpolate(zoom, [
        [11, 10],
        [18, 13]
      ]),
      'text-offset': case_(
        [
          [has('voltage_3'), literal([0, 1.5])],
          [has('voltage_2'), literal([0, 1.25])]
        ],
        literal([0, 1])
      ),
      'text-max-angle': 15
    }
  },
  {
    zorder: 561,
    id: 'power_line_label_low_zoom',
    type: 'symbol',
    filter: all(power_visible_p, any(['>', get('voltage'), 350], hvdc_p)),
    source: 'power',
    'source-layer': 'power_line',
    minzoom: 5,
    maxzoom: 10,
    paint: text_paint,
    layout: {
      'text-field': local_name,
      'text-font': font,
      'symbol-placement': 'line',
      'symbol-spacing': 400,
      'text-size': interpolate(zoom, [
        [5, 9],
        [10, 13]
      ]),
      'text-max-angle': 30,
      'text-padding': 15
    }
  },
  {
    zorder: 562,
    id: 'power_substation_ref_label',
    type: 'symbol',
    filter: substation_label_visible_p,
    source: 'power',
    'source-layer': 'power_substation_point',
    minzoom: 14.5,
    layout: {
      'symbol-z-order': 'source',
      'text-field': '{ref}',
      'text-font': font,
      'text-anchor': 'bottom',
      'text-offset': [0, -0.5],
      'text-size': interpolate(zoom, [
        [14, 9],
        [21, 14]
      ]),
      'text-max-width': 8
    },
    paint: text_paint
  },
  {
    zorder: 562,
    id: 'power_substation_label',
    type: 'symbol',
    source: 'power',
    filter: substation_label_visible_p,
    'source-layer': 'power_substation_point',
    minzoom: 8,
    layout: {
      'symbol-sort-key': ['-', 10000, voltage],
      'symbol-z-order': 'source',
      'text-field': substation_label,
      'text-font': font,
      'text-anchor': 'top',
      'text-offset': [0, 0.5],
      'text-size': interpolate(zoom, [
        [8, 10],
        [
          18,
          interpolate(voltage, [
            [0, 10],
            [400, 16]
          ])
        ]
      ]),
      'text-max-width': 8
    },
    paint: text_paint
  },
  {
    zorder: 562,
    id: 'power_converter_point',
    type: 'symbol',
    filter: all(converter_p, substation_point_visible_p),
    source: 'power',
    'source-layer': 'power_substation_point',
    minzoom: 5.5,
    layout: {
      'icon-image': 'converter',
      'icon-size': interpolate(zoom, [
        [5, 0.4],
        [9, 1]
      ]),
      'text-field': substation_label,
      'text-font': font,
      'text-anchor': 'top',
      'text-offset': [0, 1.2],
      'text-size': interpolate(zoom, [
        [7, 10],
        [
          18,
          interpolate(output, [
            [0, 10],
            [2000, 16]
          ])
        ]
      ]),
      'text-optional': true
    },
    paint: {
      ...text_paint,
      'text-opacity': ['step', zoom, 0, 7, 1],
      'icon-opacity': power_opacity
    }
  },
  {
    zorder: 563,
    id: 'power_plant_label',
    type: 'symbol',
    source: 'power',
    filter: plant_label_visible_p,
    'source-layer': 'power_plant_point',
    minzoom: 6,
    maxzoom: 24,
    layout: {
      'symbol-sort-key': ['-', 10000, output],
      'symbol-z-order': 'source',
      'icon-allow-overlap': true,
      'icon-image': plant_image(),
      'icon-size': interpolate(zoom, [
        [6, 0.6],
        [10, 0.8]
      ]),
      'text-field': plant_label,
      'text-font': font,
      'text-anchor': 'top',
      'text-offset': [0, 1],
      'text-size': interpolate(zoom, [
        [7, 10],
        [
          18,
          interpolate(output, [
            [0, 10],
            [2000, 16]
          ])
        ]
      ]),
      'text-optional': true
    },
    paint: {
      ...text_paint,
      // Control visibility using the opacity property...
      'icon-opacity': ['step', zoom, if_(construction_p, 0.5, 1), 11, 0],
      'text-opacity': ['step', zoom, 0, 7, 1]
    }
  }
]

export { layers as default, voltage_scale, special_voltages, plant_types }
