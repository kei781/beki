import cron from 'node-cron';
import { Pool } from 'pg';

/**
 * NOTE: README detail in repository is truncated, so exact accrual counts are placeholders.
 * Replace minute values with finalized HR policy before production release.
 */
export class LeaveAccrualCron {
  constructor(private readonly pool: Pool) {}

  start(): void {
    // Monthly accrual for first-year employees who satisfy "full attendance on day 1" rule.
    cron.schedule('0 5 1 * *', async () => {
      await this.grantMonthlyAccrual();
    }, { timezone: 'UTC' });

    // Fiscal-year accrual every Jan 1st for second-year+ employees.
    cron.schedule('0 6 1 1 *', async () => {
      await this.grantFiscalYearAccrual();
    }, { timezone: 'UTC' });
  }

  private async grantMonthlyAccrual(): Promise<void> {
    await this.pool.query('BEGIN');
    try {
      // Placeholder: grant 480 minutes (1 day) to eligible first-year employees.
      await this.pool.query(
        `INSERT INTO leave_ledger_entries (id, employee_id, entry_type, minutes, event_group_id, description)
         SELECT gen_random_uuid(), e.id, 'CREDIT', 480, gen_random_uuid(), 'Monthly first-year accrual'
         FROM employees e
         WHERE e.is_active = TRUE`
      );

      await this.pool.query(
        `UPDATE leave_ledgers l
         SET balance_minutes = l.balance_minutes + 480,
             updated_at = timezone('utc', now())
         FROM employees e
         WHERE l.employee_id = e.id AND e.is_active = TRUE`
      );

      await this.pool.query('COMMIT');
    } catch (e) {
      await this.pool.query('ROLLBACK');
      throw e;
    }
  }

  private async grantFiscalYearAccrual(): Promise<void> {
    await this.pool.query('BEGIN');
    try {
      // Placeholder: grant 7200 minutes (15 days) to eligible employees.
      await this.pool.query(
        `INSERT INTO leave_ledger_entries (id, employee_id, entry_type, minutes, event_group_id, description)
         SELECT gen_random_uuid(), e.id, 'CREDIT', 7200, gen_random_uuid(), 'Fiscal-year accrual'
         FROM employees e
         WHERE e.is_active = TRUE`
      );

      await this.pool.query(
        `UPDATE leave_ledgers l
         SET balance_minutes = l.balance_minutes + 7200,
             updated_at = timezone('utc', now())
         FROM employees e
         WHERE l.employee_id = e.id AND e.is_active = TRUE`
      );

      await this.pool.query('COMMIT');
    } catch (e) {
      await this.pool.query('ROLLBACK');
      throw e;
    }
  }
}
