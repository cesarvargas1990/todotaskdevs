import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { ChangeStatusDto, CommentDto, CreateTaskDto, UpdateTaskDto } from './dto';
import { Task, TaskAttachment, TaskComment, TaskStatus, TaskStatusHistory, User } from './entities';
import { MailService } from './mail.service';

const purifier = createDOMPurify(new JSDOM('').window);
const allowedMime = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
]);

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(TaskComment) private readonly comments: Repository<TaskComment>,
    @InjectRepository(TaskAttachment) private readonly attachments: Repository<TaskAttachment>,
    @InjectRepository(TaskStatusHistory) private readonly history: Repository<TaskStatusHistory>,
    private readonly mail: MailService,
  ) {}

  sanitize(html: string) {
    return purifier.sanitize(html, { ADD_TAGS: ['img'], ADD_ATTR: ['src', 'alt', 'style', 'class'] });
  }

  async list() {
    return this.tasks.find({ relations: { comments: true, attachments: true }, order: { updatedAt: 'DESC' } });
  }

  async one(id: number) {
    const task = await this.tasks.findOne({
      where: { id },
      relations: {
        comments: { user: true },
        attachments: { uploadedBy: true },
        history: { changedBy: true },
      },
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    return task;
  }

  async create(dto: CreateTaskDto, user: User, files: Express.Multer.File[] = []) {
    const assignedTo = await this.users.findOneBy({ id: dto.assignedToId });
    if (!assignedTo) throw new BadRequestException('Usuario asignado inválido');
    const task = await this.tasks.save(this.tasks.create({
      title: dto.title,
      detailHtml: this.sanitize(dto.detailHtml),
      createdBy: user,
      assignedTo,
      status: TaskStatus.TODO,
    }));
    await this.history.save(this.history.create({ task, previousStatus: null, newStatus: TaskStatus.TODO, changedBy: user }));
    await this.saveFiles(task, user, files);
    await this.mail.taskEvent(await this.one(task.id), 'Nueva tarea asignada', 'Se creó una tarea en TodoTasks.');
    return this.one(task.id);
  }

  async update(id: number, dto: UpdateTaskDto, user: User) {
    const task = await this.one(id);
    const previousAssigned = task.assignedTo.email;
    if (dto.assignedToId) {
      const assignedTo = await this.users.findOneBy({ id: dto.assignedToId });
      if (!assignedTo) throw new BadRequestException('Usuario asignado inválido');
      task.assignedTo = assignedTo;
    }
    if (dto.title) task.title = dto.title;
    if (dto.detailHtml) task.detailHtml = this.sanitize(dto.detailHtml);
    const saved = await this.tasks.save(task);
    if (previousAssigned !== saved.assignedTo.email) {
      await this.mail.taskEvent(await this.one(id), 'Tarea reasignada', `${user.name} reasignó la tarea.`);
    }
    return this.one(id);
  }

  async changeStatus(id: number, dto: ChangeStatusDto, user: User) {
    const task = await this.one(id);
    if (dto.status === TaskStatus.BLOCKED && !dto.comment?.trim()) {
      throw new BadRequestException('Para bloquear una tarea debes indicar el motivo.');
    }
    const previous = task.status;
    task.status = dto.status;
    task.completedAt = dto.status === TaskStatus.DONE ? new Date() : null;
    const saved = await this.tasks.save(task);
    await this.history.save(this.history.create({ task: saved, previousStatus: previous, newStatus: dto.status, changedBy: user, comment: dto.comment || null }));
    await this.mail.taskEvent(await this.one(id), dto.status === TaskStatus.DONE ? 'Tarea finalizada' : 'Cambio de estado', `${user.name} cambió el estado de la tarea.`, dto.comment);
    return this.one(id);
  }

  async addComment(id: number, dto: CommentDto, user: User) {
    const task = await this.one(id);
    const comment = await this.comments.save(this.comments.create({ task, user, content: dto.content.trim() }));
    await this.mail.taskEvent(await this.one(id), 'Nuevo comentario', `${user.name} agregó un comentario.`, comment.content);
    return comment;
  }

  async saveFiles(task: Task, user: User, files: Express.Multer.File[] = []) {
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024 || !allowedMime.has(file.mimetype)) {
        throw new BadRequestException(`Archivo no permitido: ${file.originalname}`);
      }
      const storedName = `${uuid()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await this.attachments.save(this.attachments.create({
        task,
        uploadedBy: user,
        originalName: file.originalname,
        storedName,
        filePath: join(uploadDir, storedName),
        mimeType: file.mimetype,
        fileSize: file.size,
      }));
      require('fs').writeFileSync(join(uploadDir, storedName), file.buffer);
    }
  }

  async deleteAttachment(id: number) {
    const attachment = await this.attachments.findOneBy({ id });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado');
    if (existsSync(attachment.filePath)) unlinkSync(attachment.filePath);
    await this.attachments.delete(id);
    return { ok: true };
  }
}
