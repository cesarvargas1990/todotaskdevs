import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { Task } from './entities';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null;

  async taskEvent(task: Task, subject: string, description: string, comment?: string) {
    const recipients = Array.from(new Set([task.createdBy.email, task.assignedTo.email]));
    const link = `${process.env.PUBLIC_APP_URL || 'http://localhost:8080/todotaskdev'}/tasks/${task.id}`;
    const text = [
      description,
      `Tarea: ${task.title}`,
      `Creada por: ${task.createdBy.name} <${task.createdBy.email}>`,
      `Asignada a: ${task.assignedTo.name} <${task.assignedTo.email}>`,
      `Estado actual: ${task.status}`,
      comment ? `Comentario: ${comment}` : '',
      `Abrir: ${link}`,
    ].filter(Boolean).join('\n');

    if (!this.transport) {
      this.logger.log(`[SMTP no configurado] ${subject} -> ${recipients.join(', ')}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: process.env.SMTP_FROM, to: recipients, subject, text });
    } catch (error) {
      this.logger.error(`No se pudo enviar correo: ${(error as Error).message}`);
    }
  }
}
