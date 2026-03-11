import * as XLSX from 'xlsx';

export type AttendanceRow = {
  employeeNo: string;
  punchTimeUtc: Date;
};

export type DailyAttendanceSummary = {
  employeeNo: string;
  workDate: string; // YYYY-MM-DD in UTC
  firstInUtc: Date;
  lastOutUtc: Date;
  workedMinutes: number;
};

/**
 * Phase 1 core rule:
 * - Same-day multi-punch => MIN(punch) is check-in, MAX(punch) is check-out.
 */
export class AttendanceExcelService {
  parseExcel(buffer: Buffer): AttendanceRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { raw: false });

    return rows
      .map((row) => {
        const employeeNo = String(row.employee_no ?? row.employeeNo ?? '').trim();
        const punch = row.punch_time_utc ?? row.punchTimeUtc;
        const punchTimeUtc = new Date(String(punch));

        if (!employeeNo || Number.isNaN(punchTimeUtc.valueOf())) return null;
        return { employeeNo, punchTimeUtc };
      })
      .filter((r): r is AttendanceRow => r !== null);
  }

  buildDailySummaries(rows: AttendanceRow[]): DailyAttendanceSummary[] {
    const grouped = new Map<string, AttendanceRow[]>();

    for (const row of rows) {
      const workDate = row.punchTimeUtc.toISOString().slice(0, 10);
      const key = `${row.employeeNo}:${workDate}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    const summaries: DailyAttendanceSummary[] = [];

    for (const [key, punchRows] of grouped.entries()) {
      punchRows.sort((a, b) => a.punchTimeUtc.getTime() - b.punchTimeUtc.getTime());
      const [employeeNo, workDate] = key.split(':');
      const firstInUtc = punchRows[0].punchTimeUtc;
      const lastOutUtc = punchRows[punchRows.length - 1].punchTimeUtc;
      const workedMinutes = Math.max(0, Math.floor((lastOutUtc.getTime() - firstInUtc.getTime()) / 60000));

      summaries.push({ employeeNo, workDate, firstInUtc, lastOutUtc, workedMinutes });
    }

    return summaries;
  }
}
