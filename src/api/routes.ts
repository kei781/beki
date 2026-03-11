import { FastifyInstance } from 'fastify';
import { AttendanceExcelService } from '../services/attendanceExcelService';
import { LeaveService } from '../services/leaveService';

export async function registerRoutes(app: FastifyInstance, deps: {
  attendanceExcelService: AttendanceExcelService;
  leaveService: LeaveService;
}) {
  app.post('/attendance/upload', async (request, reply) => {
    const file = await (request as any).file();
    const buffer = await file.toBuffer();

    const rows = deps.attendanceExcelService.parseExcel(buffer);
    const summaries = deps.attendanceExcelService.buildDailySummaries(rows);

    return reply.send({ importedRows: rows.length, summaries });
  });

  app.post('/leave-requests', async (request, reply) => {
    const body = request.body as {
      employeeId: string;
      actorUserId: string;
      startDate: string;
      endDate: string;
      minutes: number;
      reason?: string;
    };

    const result = await deps.leaveService.requestLeave(body);
    return reply.code(201).send(result);
  });
}
