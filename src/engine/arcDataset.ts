import { ARCPuzzle } from '../types/arc';

export const BUNDLED_ARC_PUZZLES: ARCPuzzle[] = [
  {
    id: 'puzzle-01',
    name: 'Red Dot Gravity (Drop Down)',
    description: 'Red objects (color 2) fall downwards until they hit the bottom or another solid block (color 1).',
    source: 'bundled',
    training: [
      {
        input: [
          [0, 0, 0, 0],
          [0, 2, 0, 0],
          [1, 1, 1, 1],
          [0, 0, 0, 0]
        ],
        output: [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [0, 2, 0, 0]
        ]
      },
      {
        input: [
          [2, 0, 0, 0],
          [0, 0, 2, 0],
          [1, 1, 1, 1],
          [0, 0, 0, 0]
        ],
        output: [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [2, 0, 2, 0]
        ]
      }
    ],
    test: [
      {
        input: [
          [0, 2, 0, 2],
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [0, 0, 0, 0]
        ],
        expectedOutput: [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [0, 2, 0, 2]
        ]
      }
    ]
  },
  {
    id: 'puzzle-02',
    name: 'Diagonal Mirror Symmetry',
    description: 'Reflect the upper-left quadrant across the main diagonal into the bottom-right.',
    source: 'bundled',
    training: [
      {
        input: [
          [1, 3, 0, 0],
          [4, 2, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0]
        ],
        output: [
          [1, 3, 0, 4],
          [4, 2, 3, 0],
          [0, 3, 0, 0],
          [4, 0, 0, 0]
        ]
      },
      {
        input: [
          [5, 1, 0, 0],
          [2, 6, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0]
        ],
        output: [
          [5, 1, 0, 2],
          [2, 6, 1, 0],
          [0, 1, 0, 0],
          [2, 0, 0, 0]
        ]
      }
    ],
    test: [
      {
        input: [
          [3, 7, 0, 0],
          [8, 1, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0]
        ],
        expectedOutput: [
          [3, 7, 0, 8],
          [8, 1, 7, 0],
          [0, 7, 0, 0],
          [8, 0, 0, 0]
        ]
      }
    ]
  },
  {
    id: 'puzzle-03',
    name: 'Color Flood Replacement',
    description: 'Replace all occurrences of color 3 (green) with color 4 (yellow) when adjacent to color 1 (blue).',
    source: 'bundled',
    training: [
      {
        input: [
          [1, 3, 3, 0],
          [3, 3, 0, 0],
          [0, 0, 2, 2]
        ],
        output: [
          [1, 4, 4, 0],
          [4, 4, 0, 0],
          [0, 0, 2, 2]
        ]
      },
      {
        input: [
          [0, 3, 1, 3],
          [3, 0, 0, 3],
          [5, 5, 5, 0]
        ],
        output: [
          [0, 4, 1, 4],
          [4, 0, 0, 4],
          [5, 5, 5, 0]
        ]
      }
    ],
    test: [
      {
        input: [
          [3, 3, 1, 0],
          [3, 0, 0, 3],
          [0, 2, 2, 0]
        ],
        expectedOutput: [
          [4, 4, 1, 0],
          [4, 0, 0, 4],
          [0, 2, 2, 0]
        ]
      }
    ]
  },
  {
    id: 'puzzle-04',
    name: 'Bounding Box Extractor',
    description: 'Extract the subgrid enclosed by the blue (1) border frame.',
    source: 'bundled',
    training: [
      {
        input: [
          [1, 1, 1, 1, 1],
          [1, 5, 6, 5, 1],
          [1, 6, 8, 6, 1],
          [1, 5, 6, 5, 1],
          [1, 1, 1, 1, 1]
        ],
        output: [
          [5, 6, 5],
          [6, 8, 6],
          [5, 6, 5]
        ]
      },
      {
        input: [
          [1, 1, 1, 1],
          [1, 2, 3, 1],
          [1, 4, 2, 1],
          [1, 1, 1, 1]
        ],
        output: [
          [2, 3],
          [4, 2]
        ]
      }
    ],
    test: [
      {
        input: [
          [1, 1, 1, 1, 1],
          [1, 7, 7, 7, 1],
          [1, 7, 3, 7, 1],
          [1, 7, 7, 7, 1],
          [1, 1, 1, 1, 1]
        ],
        expectedOutput: [
          [7, 7, 7],
          [7, 3, 7],
          [7, 7, 7]
        ]
      }
    ]
  }
];
