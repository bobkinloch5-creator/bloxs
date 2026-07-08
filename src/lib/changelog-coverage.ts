// Changelog completeness check.
//
// Compares every file in `supabase/migrations/*.sql` against the entries in
// `src/components/ChangelogNotifications.tsx` (grouped by date) and returns any
// migration dates that have no matching changelog entry. Runs client-side via
// `import.meta.glob` so no build step is required — the manifest is baked in
// at compile time.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// Import migration filenames as raw text (we only care about the keys).
// Path is project-root-relative so Vite resolves it against the workspace.
const MIGRATION_FILES = import.meta.glob("/supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type MigrationSummary = { file: string; date: string /* "Jul 8" */; iso: string /* "2026-07-08" */ };

/** Parse `YYYYMMDDHHMMSS_slug.sql` → { date: "Mon D", iso: "YYYY-MM-DD" }. */
function parseMigrationDate(path: string): MigrationSummary | null {
  const base = path.split("/").pop() ?? path;
  const m = /^(\d{4})(\d{2})(\d{2})\d*_.*\.sql$/.exec(base);
  if (!m) return null;
  const [, y, mo, d] = m;
  const monthIdx = Number(mo) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return {
    file: base,
    iso: `${y}-${mo}-${d}`,
    date: `${MONTHS[monthIdx]} ${Number(d)}`,
  };
}

export function listMigrations(): MigrationSummary[] {
  return Object.keys(MIGRATION_FILES)
    .map(parseMigrationDate)
    .filter((x): x is MigrationSummary => x !== null)
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

export type CoverageReport = {
  totalMigrations: number;
  coveredDates: string[]; // e.g. ["Jul 8", "Jul 7"]
  missingDates: string[]; // migration dates with no changelog entry
  orphanMigrations: MigrationSummary[]; // full rows for the missing dates
};

/**
 * Check every recent migration has at least one same-day changelog entry.
 * Only migrations from the last RECENT_DAYS days are considered — older
 * historical migrations aren't worth surfacing a warning for.
 * `changelogDates` is the flat list of `date` fields from CHANGELOG_ITEMS.
 */
const RECENT_DAYS = 5;

export function checkChangelogCoverage(changelogDates: string[]): CoverageReport {
  const allMigrations = listMigrations();
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const migrations = allMigrations.filter((m) => m.iso >= cutoffIso);

  const covered = new Set(changelogDates.map((d) => d.trim()));
  const migrationDates = new Set(migrations.map((m) => m.date));
  const missingDates: string[] = [];
  for (const d of migrationDates) if (!covered.has(d)) missingDates.push(d);
  missingDates.sort();
  const orphanMigrations = migrations.filter((m) => missingDates.includes(m.date));
  return {
    totalMigrations: allMigrations.length,
    coveredDates: Array.from(migrationDates).filter((d) => covered.has(d)),
    missingDates,
    orphanMigrations,
  };
}

/** Fire-once console warning for any missing dates. */
let warned = false;
export function warnIfIncomplete(report: CoverageReport) {
  if (warned || report.missingDates.length === 0) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[changelog] ${report.missingDates.length} migration date(s) have no changelog entry:`,
    report.missingDates,
    report.orphanMigrations.map((m) => m.file),
  );
}
