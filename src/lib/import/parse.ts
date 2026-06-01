import Papa from "papaparse";
import * as XLSX from "xlsx";

export type RawRow = Record<string, string>;

export async function parseFile(file: File): Promise<RawRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsx(file);
  }
  return parseCsv(file);
}

async function parseCsv(file: File): Promise<RawRow[]> {
  const text = await file.text();
  const results = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (results.errors.length > 0 && results.data.length === 0) {
    throw new Error(results.errors[0].message);
  }
  return results.data;
}

async function parseXlsx(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", raw: false });
}
