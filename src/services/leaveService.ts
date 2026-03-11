import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';

export type CreateLeaveRequestInput = {
  employeeId: string;
  actorUserId: string;
  startDate: string;
  endDate: string;
  minutes: number;
  reason?: string;
};

export class LeaveService {
  constructor(private readonly pool: Pool) {}

  /**
   * Single transaction requirement:
   * 1) create leave_request
   * 2) insert double-entry leave_ledger_entries (CREDIT from grant pool, DEBIT to usage)
   * 3) decrement leave_ledgers.balance_minutes
   * 4) write audit_logs
   */
  async requestLeave(input: CreateLeaveRequestInput): Promise<{ leaveRequestId: string }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const ledgerRow = await this.lockLedger(client, input.employeeId);
      if (ledgerRow.balance_minutes < input.minutes) {
        throw new Error('Insufficient leave balance.');
      }

      const leaveRequestId = randomUUID();
      await client.query(
        `INSERT INTO leave_requests (
          id, employee_id, start_date, end_date, requested_minutes, status, reason, created_by
        ) VALUES ($1,$2,$3,$4,$5,'APPROVED',$6,$7)`,
        [
          leaveRequestId,
          input.employeeId,
          input.startDate,
          input.endDate,
          input.minutes,
          input.reason ?? null,
          input.actorUserId
        ]
      );

      const eventGroupId = randomUUID();
      await client.query(
        `INSERT INTO leave_ledger_entries
          (id, employee_id, leave_request_id, entry_type, minutes, event_group_id, description)
         VALUES
          ($1,$2,$3,'DEBIT',$4,$5,$6),
          ($7,$2,$3,'CREDIT',$4,$5,$8)`,
        [
          randomUUID(),
          input.employeeId,
          leaveRequestId,
          input.minutes,
          eventGroupId,
          'Leave usage',
          randomUUID(),
          'Leave pool offset'
        ]
      );

      await client.query(
        `UPDATE leave_ledgers
         SET balance_minutes = balance_minutes - $1,
             updated_at = timezone('utc', now())
         WHERE employee_id = $2`,
        [input.minutes, input.employeeId]
      );

      await this.insertAuditLog(client, {
        actorUserId: input.actorUserId,
        action: 'LEAVE_REQUEST_APPROVED',
        targetTable: 'leave_requests',
        targetId: leaveRequestId,
        afterState: {
          employee_id: input.employeeId,
          minutes: input.minutes,
          start_date: input.startDate,
          end_date: input.endDate
        }
      });

      await client.query('COMMIT');
      return { leaveRequestId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockLedger(client: PoolClient, employeeId: string): Promise<{ balance_minutes: number }> {
    const result = await client.query(
      `SELECT balance_minutes
       FROM leave_ledgers
       WHERE employee_id = $1
       FOR UPDATE`,
      [employeeId]
    );

    if (result.rowCount === 0) {
      throw new Error('Leave ledger not found.');
    }

    return result.rows[0] as { balance_minutes: number };
  }

  private async insertAuditLog(
    client: PoolClient,
    args: {
      actorUserId: string;
      action: string;
      targetTable: string;
      targetId: string;
      afterState: Record<string, unknown>;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_table, target_id, after_state)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [args.actorUserId, args.action, args.targetTable, args.targetId, JSON.stringify(args.afterState)]
    );
  }
}
