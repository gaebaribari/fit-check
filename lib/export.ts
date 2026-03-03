import Papa from "papaparse";
import { TikTokProfile } from "./tiktok";

export function generateCSV(profiles: TikTokProfile[]): string {
  const data = profiles.map((p) => ({
    url: p.uniqueUrl,
  }));

  return Papa.unparse(data);
}
