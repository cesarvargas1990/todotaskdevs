import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { Task } from './entities';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly host = process.env.MAIL_HOST || process.env.SMTP_HOST;
  private readonly port = Number(process.env.MAIL_PORT || process.env.SMTP_PORT || 587);
  private readonly user = process.env.MAIL_USERNAME || process.env.SMTP_USER;
  private readonly pass = process.env.MAIL_PASSWORD || process.env.SMTP_PASS;
  private readonly fromAddress = process.env.MAIL_FROM_ADDRESS || process.env.SMTP_FROM || this.user;
  private readonly fromName = process.env.MAIL_FROM_NAME || 'TodoTaskDev';
  private readonly transport = this.createTransport();

  private createTransport() {
    if (!this.host) return null;
    try {
      const nodemailer = require('nodemailer') as typeof import('nodemailer');
      return nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: this.user ? { user: this.user, pass: this.pass } : undefined,
        tls: process.env.MAIL_ENCRYPTION === 'tls' ? { rejectUnauthorized: false } : undefined,
      });
    } catch (error) {
      this.logger.error(`SMTP deshabilitado: ${(error as Error).message}`);
      return null;
    }
  }

  async taskEvent(task: Task, subject: string, description: string, comment?: string) {
    const recipients = Array.from(new Set([
      task.createdBy?.email,
      task.assignedTo?.email,
      ...(task.comments || []).map((item) => item.user?.email),
      ...(task.history || []).map((item) => item.changedBy?.email),
    ].filter(Boolean)));
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
      const attachments = (task.attachments || [])
        .filter((item) => item.filePath && existsSync(item.filePath))
        .map((item) => ({ filename: item.originalName, path: item.filePath }));
      await this.transport.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to: recipients,
        subject,
        text,
        attachments,
      });
    } catch (error) {
      this.logger.error(`No se pudo enviar correo: ${(error as Error).message}`);
    }
  }
}
