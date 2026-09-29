// Minimal RFC-4180-style CSV parsing (handles quoted fields and embedded commas)
// Pure TypeScript, no dependencies.

/** Parse a single CSV line into fields, honouring double-quoted sections */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === undefined) break;

    if (inQuotes) {
      if (char === '"') {
        // Doubled quote = escaped quote
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

/** Turn a CSV header row into a column-name → index map */
export function csvHeaderMap(headerLine: string): Map<string, number> {
  const map = new Map<string, number>();
  const fields = parseCsvLine(headerLine);
  fields.forEach((name, index): void => {
    map.set(name, index);
  });
  return map;
}

/** Safely read a field by header name, returns null for missing/empty */
export function getField(
  fields: string[],
  header: Map<string, number>,
  name: string,
): string | null {
  const index = header.get(name);
  if (index === undefined || index >= fields.length) return null;
  const value = fields[index];
  if (value === undefined || value === '') return null;
  return value;
}

/** Parse a full CSV document (header + rows) into objects keyed by header name */
export function parseCsv(content: string): Map<string, string | null>[] {
  const lines = content.split(/\r?\n/).filter((line): boolean => line.length > 0);
  if (lines.length === 0) return [];

  const header = csvHeaderMap(lines[0] ?? '');
  const rows: Map<string, string | null>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.length === 0) continue;
    const fields = parseCsvLine(line);
    const row = new Map<string, string | null>();
    for (const [name, index] of header) {
      row.set(name, fields[index] ?? null);
    }
    rows.push(row);
  }

  return rows;
}
