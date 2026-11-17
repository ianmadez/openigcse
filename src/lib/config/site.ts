/**
 * Reference data used by onboarding. None of it describes a particular learner:
 * it mirrors how Cambridge organises entries, so the family picks from it.
 */

export type Region = {
  code: string;
  name: string;
  /** Cambridge administrative zone, which decides the paper variant suffix. */
  zone: 1 | 2 | 3 | 4 | 5 | 6;
  timezone: string;
};

export const regions: Region[] = [
  { code: "GB", name: "United Kingdom", zone: 1, timezone: "Europe/London" },
  { code: "IE", name: "Ireland", zone: 1, timezone: "Europe/Dublin" },
  { code: "AE", name: "United Arab Emirates", zone: 2, timezone: "Asia/Dubai" },
  { code: "CY", name: "Cyprus", zone: 2, timezone: "Asia/Nicosia" },
  { code: "DE", name: "Germany", zone: 2, timezone: "Europe/Berlin" },
  { code: "EG", name: "Egypt", zone: 2, timezone: "Africa/Cairo" },
  { code: "ES", name: "Spain", zone: 2, timezone: "Europe/Madrid" },
  { code: "GR", name: "Greece", zone: 2, timezone: "Europe/Athens" },
  { code: "IT", name: "Italy", zone: 2, timezone: "Europe/Rome" },
  { code: "KE", name: "Kenya", zone: 3, timezone: "Africa/Nairobi" },
  { code: "NG", name: "Nigeria", zone: 3, timezone: "Africa/Lagos" },
  { code: "ZA", name: "South Africa", zone: 3, timezone: "Africa/Johannesburg" },
  { code: "TZ", name: "Tanzania", zone: 3, timezone: "Africa/Dar_es_Salaam" },
  { code: "UG", name: "Uganda", zone: 3, timezone: "Africa/Kampala" },
  { code: "ZM", name: "Zambia", zone: 3, timezone: "Africa/Lusaka" },
  { code: "ZW", name: "Zimbabwe", zone: 3, timezone: "Africa/Harare" },
  { code: "IN", name: "India", zone: 4, timezone: "Asia/Kolkata" },
  { code: "PK", name: "Pakistan", zone: 4, timezone: "Asia/Karachi" },
  { code: "SG", name: "Singapore", zone: 4, timezone: "Asia/Singapore" },
  { code: "MY", name: "Malaysia", zone: 4, timezone: "Asia/Kuala_Lumpur" },
  { code: "HK", name: "Hong Kong", zone: 4, timezone: "Asia/Hong_Kong" },
  { code: "CN", name: "China", zone: 4, timezone: "Asia/Shanghai" },
  { code: "AU", name: "Australia", zone: 5, timezone: "Australia/Sydney" },
  { code: "NZ", name: "New Zealand", zone: 5, timezone: "Pacific/Auckland" },
  { code: "CA", name: "Canada", zone: 6, timezone: "America/Toronto" },
  { code: "US", name: "United States", zone: 6, timezone: "America/New_York" },
  { code: "BR", name: "Brazil", zone: 6, timezone: "America/Sao_Paulo" },
  { code: "MX", name: "Mexico", zone: 6, timezone: "America/Mexico_City" },
];

export function regionByCode(code: string) {
  return regions.find((region) => region.code === code);
}

export const stages = [
  "Lower Secondary Stage 7",
  "Lower Secondary Stage 8",
  "Lower Secondary Stage 9",
  "Form 1",
  "Form 2",
  "Form 3",
  "Form 4",
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
];

export const candidateTypes = ["Private Candidate", "School Candidate"] as const;

export const examSeriesMonths = ["March", "June", "November"] as const;

export const examSeriesYears = [2027, 2028, 2029, 2030, 2031];

export function seriesLabel(month: string, year: number | string) {
  return `${month} ${year}`;
}

export const guardianRelationships = ["Mum", "Dad", "Guardian", "Sister", "Brother", "Tutor"];

export const studyDayOptions = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Timezones offered when the browser cannot report one. */
export const fallbackTimezones = Array.from(new Set(regions.map((region) => region.timezone))).sort();
