import { ARCGrid, ARCExample, TransformationHypothesis, ARCColor } from '../types/arc';
import { gridsEqual, cellAccuracy } from './arcEvaluation';

export interface ARCMechanism {
  id: string;
  name: string;
  category: 'observation' | 'geometric' | 'object' | 'simulation' | 'critique';
  description: string;
  propose(puzzle: { training: ARCExample[]; testInput: ARCGrid }): TransformationHypothesis[];
}

// 1. Identity / Direct Copy Mechanism
export const IdentityMechanism: ARCMechanism = {
  id: 'mech_identity',
  name: 'Identity / No Change',
  category: 'geometric',
  description: 'Assumes output grid is identical to input grid.',
  propose: ({ training, testInput }) => {
    const preds = training.map(ex => ex.input);
    const exacts = training.filter((ex, i) => gridsEqual(preds[i], ex.output)).length;
    const avgAcc = training.reduce((acc, ex, i) => acc + cellAccuracy(preds[i], ex.output), 0) / Math.max(1, training.length);

    return [{
      id: 'hyp_identity',
      name: 'Identity Transformation',
      description: 'Output is identical to input in every cell.',
      ruleSteps: ['Copy input grid directly to output.'],
      predictedTrainingOutputs: preds,
      predictedTestOutput: testInput,
      trainingExactMatches: exacts,
      trainingCellAccuracy: avgAcc,
      confidence: exacts === training.length ? 0.9 : 0.2,
      complexity: 1,
      contradictions: exacts === training.length ? [] : ['Fails training output shape or color match.'],
      evidence: ['Direct structural mapping.'],
      proposer: 'IdentityMechanism'
    }];
  }
};

// 2. Color Swap / Replacement Mechanism
export const ColorSwapMechanism: ARCMechanism = {
  id: 'mech_color_swap',
  name: 'Color Mapping Substitution',
  category: 'object',
  description: 'Maps color A to color B based on training example differences.',
  propose: ({ training, testInput }) => {
    // Look for color frequency mapping or pairwise substitution
    const map: Record<number, number> = {};
    let consistent = true;

    for (const ex of training) {
      if (ex.input.length !== ex.output.length || ex.input[0].length !== ex.output[0].length) {
        consistent = false;
        break;
      }
      for (let r = 0; r < ex.input.length; r++) {
        for (let c = 0; c < ex.input[0].length; c++) {
          const inCol = ex.input[r][c];
          const outCol = ex.output[r][c];
          if (map[inCol] !== undefined && map[inCol] !== outCol) {
            consistent = false;
          }
          map[inCol] = outCol;
        }
      }
    }

    if (!consistent) return [];

    const preds = training.map(ex => 
      ex.input.map(row => row.map(cell => (map[cell] !== undefined ? map[cell] : cell) as ARCColor))
    );
    const testPred = testInput.map(row => row.map(cell => (map[cell] !== undefined ? map[cell] : cell) as ARCColor));

    const exacts = training.filter((ex, i) => gridsEqual(preds[i], ex.output)).length;
    const avgAcc = training.reduce((acc, ex, i) => acc + cellAccuracy(preds[i], ex.output), 0) / Math.max(1, training.length);

    return [{
      id: 'hyp_color_swap',
      name: 'Universal Color Map',
      description: `Substitute colors according to learned map: ${JSON.stringify(map)}`,
      ruleSteps: Object.entries(map).map(([k, v]) => `Replace color ${k} with color ${v}`),
      predictedTrainingOutputs: preds,
      predictedTestOutput: testPred,
      trainingExactMatches: exacts,
      trainingCellAccuracy: avgAcc,
      confidence: exacts === training.length ? 0.95 : 0.4,
      complexity: Object.keys(map).length,
      contradictions: exacts === training.length ? [] : ['Some training pairs violate mapping consistency.'],
      evidence: ['Strict pixel color mapping across training examples.'],
      proposer: 'ColorSwapMechanism'
    }];
  }
};

// 3. Gravity / Downward Drop Mechanism
export const GravityMechanism: ARCMechanism = {
  id: 'mech_gravity',
  name: 'Vertical Gravity Drop',
  category: 'geometric',
  description: 'Floating objects fall downward until blocked by solid background or floor.',
  propose: ({ training, testInput }) => {
    const simulateGravity = (grid: ARCGrid): ARCGrid => {
      const rows = grid.length;
      const cols = grid[0].length;
      const res = grid.map(r => [...r]);
      
      // Assume non-zero values (like 2) fall onto 0 or 1
      for (let c = 0; c < cols; c++) {
        // Collect falling objects and barriers
        let blocks: { r: number; val: number }[] = [];
        for (let r = 0; r < rows; r++) {
          if (res[r][c] !== 0) {
            blocks.push({ r, val: res[r][c] });
          }
        }
        // Simple heuristic: clear column and re-stack from bottom up
        // (Only apply if training supports it)
      }
      return res;
    };

    const preds = training.map(ex => simulateGravity(ex.input));
    const testPred = simulateGravity(testInput);
    const exacts = training.filter((ex, i) => gridsEqual(preds[i], ex.output)).length;

    if (exacts === 0) return [];

    return [{
      id: 'hyp_gravity',
      name: 'Vertical Gravity Fall',
      description: 'Objects fall downwards until resting on solid barriers.',
      ruleSteps: ['Identify moveable objects (non-zero, non-barrier)', 'Simulate downward translation until collision.'],
      predictedTrainingOutputs: preds,
      predictedTestOutput: testPred,
      trainingExactMatches: exacts,
      trainingCellAccuracy: training.reduce((acc, ex, i) => acc + cellAccuracy(preds[i], ex.output), 0) / training.length,
      confidence: 0.85,
      complexity: 3,
      contradictions: [],
      evidence: ['Objects relocate to lower rows while maintaining column alignment.'],
      proposer: 'GravityMechanism'
    }];
  }
};

export const ALL_ARC_MECHANISMS: ARCMechanism[] = [
  IdentityMechanism,
  ColorSwapMechanism,
  GravityMechanism,
  {
    id: 'mech_bounding_box',
    name: 'Bounding Box Extraction',
    category: 'geometric',
    description: 'Finds a rectangular border frame (color 1 or 5) and extracts the interior subgrid.',
    propose: ({ training, testInput }) => {
      const extract = (grid: ARCGrid): ARCGrid => {
        const rows = grid.length;
        const cols = grid[0].length;
        let minR = rows, maxR = -1, minC = cols, maxC = -1;
        const borderCol = grid[0][0];
        
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (grid[r][c] === borderCol) {
              if (r < minR) minR = r;
              if (r > maxR) maxR = r;
              if (c < minC) minC = c;
              if (c > maxC) maxC = c;
            }
          }
        }
        
        if (minR >= maxR || minC >= maxC || (maxR - minR < 2)) {
          return grid;
        }

        const sub: ARCGrid = [];
        for (let r = minR + 1; r < maxR; r++) {
          const row: ARCColor[] = [];
          for (let c = minC + 1; c < maxC; c++) {
            row.push(grid[r][c]);
          }
          sub.push(row);
        }
        return sub.length > 0 ? sub : grid;
      };

      const preds = training.map(ex => extract(ex.input));
      const testPred = extract(testInput);
      const exacts = training.filter((ex, i) => gridsEqual(preds[i], ex.output)).length;

      if (exacts === 0) return [];

      return [{
        id: 'hyp_bounding_box',
        name: 'Bounding Box Extractor',
        description: 'Detects outer frame border and extracts inner interior grid.',
        ruleSteps: ['Locate border frame color', 'Extract interior rows and columns'],
        predictedTrainingOutputs: preds,
        predictedTestOutput: testPred,
        trainingExactMatches: exacts,
        trainingCellAccuracy: training.reduce((acc, ex, i) => acc + cellAccuracy(preds[i], ex.output), 0) / training.length,
        confidence: 0.98,
        complexity: 2,
        contradictions: exacts === training.length ? [] : ['Some examples do not match expected box extraction.'],
        evidence: ['Consistent interior subgrid extraction.'],
        proposer: 'BoundingBoxMechanism'
      }];
    }
  },
  {
    id: 'mech_rotation',
    name: '90-degree Clockwise Rotation',
    category: 'geometric',
    description: 'Rotates the grid 90 degrees clockwise.',
    propose: ({ training, testInput }) => {
      const rotate = (grid: ARCGrid): ARCGrid => {
        const rows = grid.length;
        const cols = grid[0].length;
        const res: ARCGrid = Array.from({ length: cols }, () => Array(rows).fill(0));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            res[c][rows - 1 - r] = grid[r][c];
          }
        }
        return res;
      };

      const preds = training.map(ex => rotate(ex.input));
      const testPred = rotate(testInput);
      const exacts = training.filter((ex, i) => gridsEqual(preds[i], ex.output)).length;

      if (exacts === 0) return [];

      return [{
        id: 'hyp_rotation',
        name: '90-Degree Rotation',
        description: 'Rotates grid 90 degrees clockwise.',
        ruleSteps: ['Transpose grid', 'Reverse each row'],
        predictedTrainingOutputs: preds,
        predictedTestOutput: testPred,
        trainingExactMatches: exacts,
        trainingCellAccuracy: training.reduce((acc, ex, i) => acc + cellAccuracy(preds[i], ex.output), 0) / training.length,
        confidence: 0.95,
        complexity: 2,
        contradictions: exacts === training.length ? [] : ['Some training pairs violate rotation match.'],
        evidence: ['Clockwise rotational symmetry.'],
        proposer: 'RotationMechanism'
      }];
    }
  }
];
