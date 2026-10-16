import { Injectable } from '@angular/core';

export interface SimulationResult {
  output: string;
  success: boolean;
  error?: string;
  steps: string[];
}

@Injectable({ providedIn: 'root' })
export class TransformSimulatorService {
  /**
   * Simulates an ISC transform execution client-side given the transform definition and mock inputs.
   */
  simulate(transformDef: Record<string, unknown>, mockInputs: Record<string, string>): SimulationResult {
    const steps: string[] = [];
    try {
      steps.push(`Evaluating transform "${transformDef['name'] || 'Untitled'}" of type "${transformDef['type']}"`);
      const output = this.evaluateNode(transformDef, mockInputs, steps);
      steps.push(`Final output: "${output}"`);
      return { output, success: true, steps };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push(`Error during simulation: ${msg}`);
      return { output: '', success: false, error: msg, steps };
    }
  }

  private evaluateNode(node: unknown, inputs: Record<string, string>, steps: string[]): string {
    if (typeof node === 'string') {
      return node;
    }
    if (typeof node !== 'object' || node === null) {
      return String(node ?? '');
    }

    const obj = node as Record<string, unknown>;
    const type = String(obj['type'] || 'static').toLowerCase();
    const attrs = (obj['attributes'] || {}) as Record<string, unknown>;

    // Handle input attribute resolution
    const resolveInput = (): string => {
      if (attrs['input']) {
        return this.evaluateNode(attrs['input'], inputs, steps);
      }
      if (obj['input']) {
        return this.evaluateNode(obj['input'], inputs, steps);
      }
      // Check for default input or first available mock key
      const firstKey = Object.keys(inputs)[0];
      return firstKey ? inputs[firstKey] : '';
    };

    switch (type) {
      case 'static': {
        const val = String(attrs['value'] ?? obj['value'] ?? '');
        steps.push(`Static value: "${val}"`);
        return val;
      }

      case 'identityattribute':
      case 'accountattribute': {
        const attrName = String(attrs['name'] ?? attrs['attributeName'] ?? '');
        const val = inputs[attrName] ?? inputs[attrName.toLowerCase()] ?? '';
        steps.push(`Resolved attribute "${attrName}" => "${val}"`);
        return val;
      }

      case 'lower': {
        const raw = resolveInput();
        const res = raw.toLowerCase();
        steps.push(`ToLower: "${raw}" => "${res}"`);
        return res;
      }

      case 'upper': {
        const raw = resolveInput();
        const res = raw.toUpperCase();
        steps.push(`ToUpper: "${raw}" => "${res}"`);
        return res;
      }

      case 'trim': {
        const raw = resolveInput();
        const res = raw.trim();
        steps.push(`Trim: "${raw}" => "${res}"`);
        return res;
      }

      case 'concat': {
        const rawValues = (attrs['values'] || obj['values'] || []) as unknown[];
        const parts: string[] = [];
        for (const item of rawValues) {
          parts.push(this.evaluateNode(item, inputs, steps));
        }
        const res = parts.join('');
        steps.push(`Concat [${parts.length} parts] => "${res}"`);
        return res;
      }

      case 'substring': {
        const raw = resolveInput();
        const begin = Number(attrs['begin'] ?? 0);
        const end = attrs['end'] !== undefined ? Number(attrs['end']) : undefined;
        const res = end !== undefined ? raw.substring(begin, end) : raw.substring(begin);
        steps.push(`Substring (${begin}${end !== undefined ? ', ' + end : ''}): "${raw}" => "${res}"`);
        return res;
      }

      case 'replace': {
        const raw = resolveInput();
        const regex = String(attrs['regex'] ?? attrs['pattern'] ?? '');
        const replacement = String(attrs['replacement'] ?? '');
        let res = raw;
        if (regex) {
          try {
            res = raw.replace(new RegExp(regex, 'g'), replacement);
          } catch {
            res = raw.split(regex).join(replacement);
          }
        }
        steps.push(`Replace "${regex}" with "${replacement}": "${raw}" => "${res}"`);
        return res;
      }

      case 'replaceall': {
        const raw = resolveInput();
        const table = (attrs['table'] || {}) as Record<string, string>;
        let res = raw;
        for (const [find, replace] of Object.entries(table)) {
          res = res.split(find).join(replace);
        }
        steps.push(`ReplaceAll: "${raw}" => "${res}"`);
        return res;
      }

      case 'lookup': {
        const raw = resolveInput();
        const table = (attrs['table'] || {}) as Record<string, string>;
        const defaultVal = table['default'] ?? attrs['default'] ?? '';
        const match = table[raw] ?? table[raw.toLowerCase()] ?? defaultVal;
        steps.push(`Lookup table match for "${raw}" => "${match}"`);
        return String(match);
      }

      case 'firstvalid': {
        const rawValues = (attrs['values'] || obj['values'] || []) as unknown[];
        steps.push(`FirstValid evaluating ${rawValues.length} candidates`);
        for (const candidate of rawValues) {
          const val = this.evaluateNode(candidate, inputs, steps);
          if (val && val.trim().length > 0) {
            steps.push(`FirstValid selected first non-empty: "${val}"`);
            return val;
          }
        }
        steps.push(`FirstValid found no non-empty candidates, returning empty string`);
        return '';
      }

      case 'dateformat': {
        const raw = resolveInput();
        steps.push(`DateFormat input: "${raw}"`);
        const date = raw ? new Date(raw) : new Date();
        if (isNaN(date.getTime())) {
          return raw;
        }
        const outputFormat = String(attrs['outputFormat'] || 'ISO8601');
        if (outputFormat === 'ISO8601') {
          const res = date.toISOString();
          steps.push(`Formatted to ISO8601 => "${res}"`);
          return res;
        }
        const res = date.toISOString().split('T')[0];
        steps.push(`Formatted date => "${res}"`);
        return res;
      }

      case 'datecompare': {
        const firstDate = this.evaluateNode(attrs['firstDate'] ?? resolveInput(), inputs, steps);
        const secondDate = this.evaluateNode(attrs['secondDate'] ?? 'now', inputs, steps);
        const operator = String(attrs['operator'] || 'gt').toLowerCase();
        const pos = String(attrs['positiveCondition'] ?? 'true');
        const neg = String(attrs['negativeCondition'] ?? 'false');

        const d1 = new Date(firstDate === 'now' ? Date.now() : firstDate).getTime();
        const d2 = new Date(secondDate === 'now' ? Date.now() : secondDate).getTime();

        let passes = false;
        if (operator === 'gt' || operator === 'greaterthan') passes = d1 > d2;
        else if (operator === 'gte' || operator === 'greaterthanorequal') passes = d1 >= d2;
        else if (operator === 'lt' || operator === 'lessthan') passes = d1 < d2;
        else if (operator === 'lte' || operator === 'lessthanorequal') passes = d1 <= d2;
        else if (operator === 'eq' || operator === 'equal') passes = d1 === d2;

        steps.push(`DateCompare ${firstDate} ${operator} ${secondDate} => ${passes}`);
        return passes ? pos : neg;
      }

      case 'datemath': {
        const expr = String(attrs['expression'] || '');
        steps.push(`DateMath expression "${expr}" evaluated`);
        return new Date().toISOString();
      }

      case 'conditional': {
        const expression = String(attrs['expression'] || '');
        const pos = String(attrs['positiveCondition'] ?? '');
        const neg = String(attrs['negativeCondition'] ?? '');
        steps.push(`Conditional evaluate: "${expression}"`);
        return pos || neg;
      }

      case 'decomposediacriticalmarks': {
        const raw = resolveInput();
        const res = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        steps.push(`Decompose diacritical marks: "${raw}" => "${res}"`);
        return res;
      }

      case 'base64encode': {
        const raw = resolveInput();
        const res = btoa(raw);
        steps.push(`Base64Encode: "${raw}" => "${res}"`);
        return res;
      }

      case 'base64decode': {
        const raw = resolveInput();
        try {
          const res = atob(raw);
          steps.push(`Base64Decode: "${raw}" => "${res}"`);
          return res;
        } catch {
          return raw;
        }
      }

      case 'e164phone': {
        const raw = resolveInput();
        const digits = raw.replace(/\D/g, '');
        const res = digits ? `+${digits}` : '';
        steps.push(`E164Phone: "${raw}" => "${res}"`);
        return res;
      }

      case 'getendofstring': {
        const raw = resolveInput();
        const len = Number(attrs['numChars'] ?? attrs['length'] ?? 1);
        const res = raw.slice(-len);
        steps.push(`GetEndOfString (${len} chars): "${raw}" => "${res}"`);
        return res;
      }

      case 'indexof': {
        const raw = resolveInput();
        const sub = String(attrs['substring'] ?? '');
        const idx = raw.indexOf(sub);
        steps.push(`IndexOf "${sub}" in "${raw}" => ${idx}`);
        return String(idx);
      }

      case 'lastindexof': {
        const raw = resolveInput();
        const sub = String(attrs['substring'] ?? '');
        const idx = raw.lastIndexOf(sub);
        steps.push(`LastIndexOf "${sub}" in "${raw}" => ${idx}`);
        return String(idx);
      }

      case 'leftpad': {
        const raw = resolveInput();
        const length = Number(attrs['length'] ?? raw.length);
        const padding = String(attrs['padding'] ?? '0');
        const res = raw.padStart(length, padding);
        steps.push(`LeftPad (len ${length}, char "${padding}"): "${raw}" => "${res}"`);
        return res;
      }

      case 'rightpad': {
        const raw = resolveInput();
        const length = Number(attrs['length'] ?? raw.length);
        const padding = String(attrs['padding'] ?? ' ');
        const res = raw.padEnd(length, padding);
        steps.push(`RightPad (len ${length}, char "${padding}"): "${raw}" => "${res}"`);
        return res;
      }

      case 'split': {
        const raw = resolveInput();
        const delimiter = String(attrs['delimiter'] ?? ',');
        const index = Number(attrs['index'] ?? 0);
        const parts = raw.split(delimiter);
        const res = parts[index] ?? '';
        steps.push(`Split by "${delimiter}" at index ${index} => "${res}"`);
        return res;
      }

      case 'namenormalizer': {
        const raw = resolveInput();
        const res = raw.trim().replace(/\s+/g, ' ');
        steps.push(`NameNormalizer: "${raw}" => "${res}"`);
        return res;
      }

      case 'generaterandomstring':
      case 'randomalphanumeric': {
        const len = Number(attrs['length'] ?? 12);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let res = '';
        for (let i = 0; i < len; i++) {
          res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        steps.push(`Random Alphanumeric (${len} chars) => "${res}"`);
        return res;
      }

      case 'randomnumeric': {
        const len = Number(attrs['length'] ?? 6);
        let res = '';
        for (let i = 0; i < len; i++) {
          res += Math.floor(Math.random() * 10);
        }
        steps.push(`Random Numeric (${len} digits) => "${res}"`);
        return res;
      }

      case 'uuid': {
        const res = crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
          (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
        );
        steps.push(`UUID generated => "${res}"`);
        return res;
      }

      default: {
        const fallback = resolveInput();
        steps.push(`Evaluated type "${type}" => "${fallback}"`);
        return fallback;
      }
    }
  }
}
