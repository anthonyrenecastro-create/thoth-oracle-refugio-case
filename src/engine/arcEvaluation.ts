import { ARCGrid, ARCColor } from '../types/arc';

export function isValidARCGrid(grid: unknown): grid is ARCGrid {
  if (!Array.isArray(grid)) return false;
  if (grid.length === 0) return false;
  const rowLength = grid[0]?.length;
  if (rowLength === undefined || rowLength === 0) return false;

  for (const row of grid) {
    if (!Array.isArray(row)) return false;
    if (row.length !== rowLength) return false;
    for (const cell of row) {
      if (typeof cell !== 'number' || cell < 0 || cell > 9 || !Number.isInteger(cell)) {
        return false;
      }
    }
  }
  return true;
}

export function gridsEqual(a: ARCGrid | undefined, b: ARCGrid | undefined): boolean {
  if (!a || !b) return false;
  if (!isValidARCGrid(a) || !isValidARCGrid(b)) return false;
  if (a.length !== b.length) return false;
  if (a[0].length !== b[0].length) return false;

  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[0].length; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

export function cellAccuracy(pred: ARCGrid | undefined, exp: ARCGrid | undefined): number {
  if (!pred || !exp || !isValidARCGrid(pred) || !isValidARCGrid(exp)) return 0;
  const pRows = pred.length;
  const pCols = pred[0].length;
  const eRows = exp.length;
  const eCols = exp[0].length;

  if (pRows !== eRows || pCols !== eCols) {
    // Dimension mismatch partial score or 0
    let matched = 0;
    let total = Math.max(pRows * pCols, eRows * eCols);
    if (total === 0) return 100;
    for (let r = 0; r < Math.min(pRows, eRows); r++) {
      for (let c = 0; c < Math.min(pCols, eCols); c++) {
        if (pred[r][c] === exp[r][c]) matched++;
      }
    }
    return Math.round((matched / total) * 10000) / 100;
  }

  let totalCells = pRows * pCols;
  if (totalCells === 0) return 100;
  let correctCells = 0;

  for (let r = 0; r < pRows; r++) {
    for (let c = 0; c < pCols; c++) {
      if (pred[r][c] === exp[r][c]) {
        correctCells++;
      }
    }
  }

  return Math.round((correctCells / totalCells) * 10000) / 100;
}

export function createEmptyGrid(rows: number, cols: number, fill: ARCColor = 0): ARCGrid {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}
