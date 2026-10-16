import { Injectable } from '@angular/core';
import { DiffLine, DiffResult } from './debug-mode.models';

export interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

@Injectable({ providedIn: 'root' })
export class DiffEngineService {
  /**
   * Generates a GitHub-style diff between two text strings (typically JSON).
   */
  computeDiff(oldText: string, newText: string): DiffResult {
    const oldLines = this.splitLines(oldText);
    const newLines = this.splitLines(newText);

    if (oldText === newText) {
      const unchanged = oldLines.map((line, idx) => ({
        type: 'unchanged' as const,
        oldLineNumber: idx + 1,
        newLineNumber: idx + 1,
        content: line,
      }));
      return {
        additions: 0,
        deletions: 0,
        changes: 0,
        lines: unchanged,
        leftLines: unchanged,
        rightLines: unchanged,
        isIdentical: true,
      };
    }

    const lcs = this.computeLcsTable(oldLines, newLines);
    const unified: DiffLine[] = [];
    const left: DiffLine[] = [];
    const right: DiffLine[] = [];

    let i = oldLines.length;
    let j = newLines.length;
    const rawOps: Array<{ type: 'same' | 'add' | 'rem'; oldIdx?: number; newIdx?: number }> = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        rawOps.push({ type: 'same', oldIdx: i, newIdx: j });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
        rawOps.push({ type: 'add', newIdx: j });
        j--;
      } else if (i > 0 && (j === 0 || lcs[i][j - 1] < lcs[i - 1][j])) {
        rawOps.push({ type: 'rem', oldIdx: i });
        i--;
      }
    }

    rawOps.reverse();

    let additions = 0;
    let deletions = 0;

    for (let k = 0; k < rawOps.length; k++) {
      const op = rawOps[k];
      if (op.type === 'same') {
        const lineContent = oldLines[op.oldIdx! - 1];
        const lineItem: DiffLine = {
          type: 'unchanged',
          oldLineNumber: op.oldIdx,
          newLineNumber: op.newIdx,
          content: lineContent,
        };
        unified.push(lineItem);
        left.push({ ...lineItem });
        right.push({ ...lineItem });
      } else if (op.type === 'rem') {
        deletions++;
        const oldContent = oldLines[op.oldIdx! - 1];
        const lineItem: DiffLine = {
          type: 'removed',
          oldLineNumber: op.oldIdx,
          content: oldContent,
        };
        unified.push(lineItem);
        left.push({ ...lineItem });

        // Check if matching addition exists next for side-by-side alignment
        const nextOp = rawOps[k + 1];
        if (nextOp && nextOp.type === 'add') {
          additions++;
          k++;
          const newContent = newLines[nextOp.newIdx! - 1];
          const addLineItem: DiffLine = {
            type: 'added',
            newLineNumber: nextOp.newIdx,
            content: newContent,
          };
          // Highlight token difference
          this.attachWordHighlights(lineItem, addLineItem);
          unified.push(addLineItem);
          right.push(addLineItem);
        } else {
          // Spacer for right side
          right.push({
            type: 'unchanged',
            content: '',
          });
        }
      } else if (op.type === 'add') {
        additions++;
        const newContent = newLines[op.newIdx! - 1];
        const addLineItem: DiffLine = {
          type: 'added',
          newLineNumber: op.newIdx,
          content: newContent,
        };
        unified.push(addLineItem);
        left.push({
          type: 'unchanged',
          content: '',
        });
        right.push(addLineItem);
      }
    }

    return {
      additions,
      deletions,
      changes: additions + deletions,
      lines: unified,
      leftLines: left,
      rightLines: right,
      isIdentical: additions === 0 && deletions === 0,
    };
  }

  private attachWordHighlights(remLine: DiffLine, addLine: DiffLine): void {
    // Basic word/token diff for changed line
    const remWords = remLine.content.split(/(\s+|[{}[\],:"])/).filter(Boolean);
    const addWords = addLine.content.split(/(\s+|[{}[\],:"])/).filter(Boolean);

    remLine.subHighlights = remWords.map((word) => ({
      text: word,
      isHighlight: !addWords.includes(word) && word.trim().length > 0,
    }));

    addLine.subHighlights = addWords.map((word) => ({
      text: word,
      isHighlight: !remWords.includes(word) && word.trim().length > 0,
    }));
  }

  private splitLines(text: string): string[] {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  }

  private computeLcsTable(a: string[], b: string[]): number[][] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp;
  }

  /**
   * Generates RFC 6902 JSON Patch operations from an original object to modified object.
   */
  generateJsonPatch(originalObj: Record<string, unknown>, modifiedObj: Record<string, unknown>): JsonPatchOp[] {
    const ops: JsonPatchOp[] = [];

    const walk = (orig: unknown, mod: unknown, path: string) => {
      if (orig === mod) return;

      if (orig === null || orig === undefined || typeof orig !== 'object' ||
          mod === null || mod === undefined || typeof mod !== 'object' ||
          Array.isArray(orig) !== Array.isArray(mod)) {
        ops.push({ op: 'replace', path: path || '/', value: mod });
        return;
      }

      if (Array.isArray(orig) && Array.isArray(mod)) {
        if (JSON.stringify(orig) !== JSON.stringify(mod)) {
          ops.push({ op: 'replace', path, value: mod });
        }
        return;
      }

      const origKeys = Object.keys(orig as Record<string, unknown>);
      const modKeys = Object.keys(mod as Record<string, unknown>);

      // Removed keys
      for (const k of origKeys) {
        if (!(k in (mod as Record<string, unknown>))) {
          ops.push({ op: 'remove', path: `${path}/${k}` });
        }
      }

      // Added or updated keys
      for (const k of modKeys) {
        const origVal = (orig as Record<string, unknown>)[k];
        const modVal = (mod as Record<string, unknown>)[k];

        if (!(k in (orig as Record<string, unknown>))) {
          ops.push({ op: 'add', path: `${path}/${k}`, value: modVal });
        } else {
          walk(origVal, modVal, `${path}/${k}`);
        }
      }
    };

    walk(originalObj, modifiedObj, '');
    return ops;
  }
}
