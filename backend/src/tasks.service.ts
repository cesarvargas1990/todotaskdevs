import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import * as sharp from 'sharp';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { ChangeStatusDto, CommentDto, CreateTaskDto, UpdateTaskDto } from './dto';
import { Project, Task, TaskAttachment, TaskComment, TaskStatus, TaskStatusHistory, User } from './entities';
import { MailService } from './mail.service';
import { assertAdmin } from './auth';

const purifier = createDOMPurify(new JSDOM('').window);
const allowedExtensions = new Set([
  '.zip', '.rar', '.pdf', '.doc', '.docx', '.xlsx', '.csv', '.md', '.json', '.txt',
]);
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1920;
const WEBP_QUALITY = 80;
// GIF (puede ser animado) y SVG se dejan intactos.
const compressibleImage = /data:image\/(?:png|jpe?g|webp|bmp);base64,([A-Za-z0-9+/=]+)/gi;

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

  /** Convierte a WebP (máx. 1920px de ancho) las imágenes base64 incrustadas; conserva la original si no pesa menos. */
  async optimizeImages(html: string) {
    const matches = [...html.matchAll(compressibleImage)];
    if (!matches.length) return html;
    const replacements = await Promise.all(matches.map(async match => {
      try {
        const original = Buffer.from(match[1], 'base64');
        const webp = await sharp(original).rotate().resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toBuffer();
        return webp.length < original.length ? `data:image/webp;base64,${webp.toString('base64')}` : match[0];
      } catch {
        return match[0];
      }
    }));
    let index = 0;
    return html.replace(compressibleImage, () => replacements[index++]);
  }

  private async prepareHtml(html: string) {
    return this.sanitize(await this.optimizeImages(html));
  }

  private normalizeTitle(title: string) {
    return title.trim().replace(/\p{L}/u, letter => letter.toUpperCase());
  }

  private async resolveProjects(projectNames: string | undefined, user: User) {
    if (!projectNames) throw new BadRequestException('Debes seleccionar al menos un proyecto.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(projectNames);
    } catch {
      throw new BadRequestException('La lista de proyectos no es válida.');
    }
    if (!Array.isArray(parsed) || parsed.some((name) => typeof name !== 'string')) {
      throw new BadRequestException('La lista de proyectos no es válida.');
    }

    const namesByKey = new Map<string, string>();
    for (const value of parsed as string[]) {
      const name = value.trim();
      if (!name) continue;
      if (name.length > 100) throw new BadRequestException('Cada proyecto admite hasta 100 caracteres.');
      const key = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      if (!namesByKey.has(key)) namesByKey.set(key, name);
    }
    if (namesByKey.size > 30) throw new BadRequestException('Puedes asignar hasta 30 proyectos por tarea.');
    const names = [...namesByKey.values()];
    if (!names.length) throw new BadRequestException('Debes seleccionar al menos un proyecto.');

    const byName = new Map((user.projects || []).map((project) => [
      project.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(),
      project,
    ]));
    const unassigned = names.filter((name) => !byName.has(name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()));
    if (unassigned.length) {
      throw new BadRequestException(`No tienes asignado${unassigned.length > 1 ? 's' : ''} el proyecto: ${unassigned.join(', ')}`);
    }
    return [...namesByKey.keys()].map((key) => byName.get(key)).filter((project): project is Project => Boolean(project));
  }

  async list(user: User) {
    const allowedProjectIds = (user.projects || []).map((project) => project.id);
    if (!allowedProjectIds.length) return [];

    const tasks = await this.tasks.createQueryBuilder('task')
      .leftJoin('task.createdBy', 'createdBy')
      .addSelect(['createdBy.id', 'createdBy.name'])
      .leftJoin('task.assignedTo', 'assignedTo')
      .addSelect(['assignedTo.id', 'assignedTo.name'])
      .leftJoinAndSelect('task.projects', 'project')
      .loadRelationCountAndMap('task.commentCount', 'task.comments')
      .loadRelationCountAndMap('task.attachmentCount', 'task.attachments')
      .where('project.id IN (:...allowedProjectIds)', { allowedProjectIds })
      .orderBy('task.updatedAt', 'DESC')
      .getMany();
    return tasks.map((task: Task & { commentCount?: number; attachmentCount?: number }) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      createdBy: this.publicUser(task.createdBy),
      assignedTo: this.publicUser(task.assignedTo),
      projects: task.projects.filter((project) => allowedProjectIds.includes(project.id)).map(({ id, name }) => ({ id, name })),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      commentCount: task.commentCount || 0,
      attachmentCount: task.attachmentCount || 0,
    }));
  }

  async one(id: number, user?: User) {
    const task = await this.oneEntity(id, user, false);
    return {
      id: task.id,
      title: task.title,
      detailHtml: task.detailHtml,
      status: task.status,
      createdBy: this.publicUser(task.createdBy),
      assignedTo: this.publicUser(task.assignedTo),
      projects: task.projects.map(({ id: projectId, name }) => ({ id: projectId, name })),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      commentCount: (task as Task & { commentCount?: number }).commentCount || 0,
      attachments: (task.attachments || []).map((attachment) => ({
        id: attachment.id, originalName: attachment.originalName, mimeType: attachment.mimeType,
        fileSize: attachment.fileSize, createdAt: attachment.createdAt,
        uploadedBy: this.publicUser(attachment.uploadedBy),
      })),
      history: (task.history || []).map((item) => ({
        id: item.id, previousStatus: item.previousStatus, newStatus: item.newStatus,
        comment: item.comment, createdAt: item.createdAt, changedBy: this.publicUser(item.changedBy),
      })),
    };
  }

  private publicUser(user: User) {
    return user ? { id: user.id, name: user.name } : null;
  }

  async canAccessTask(id: number, user: User) {
    const allowedProjectIds = (user.projects || []).map((project) => project.id);
    if (!allowedProjectIds.length) return false;
    return this.tasks.createQueryBuilder('task')
      .innerJoin('task.projects', 'project')
      .where('task.id = :id', { id })
      .andWhere('project.id IN (:...allowedProjectIds)', { allowedProjectIds })
      .getExists();
  }

  async getComments(id: number, user: User) {
    if (!await this.canAccessTask(id, user)) throw new NotFoundException('Tarea no encontrada');
    const comments = await this.comments.createQueryBuilder('comment')
      .innerJoin('comment.task', 'task')
      .leftJoin('comment.user', 'commentUser')
      .addSelect(['commentUser.id', 'commentUser.name'])
      .where('task.id = :id', { id })
      .orderBy('comment.createdAt', 'ASC')
      .getMany();
    return comments.map((comment) => ({
      id: comment.id, content: comment.content, createdAt: comment.createdAt,
      updatedAt: comment.updatedAt, user: this.publicUser(comment.user),
    }));
  }

  taskForAttachmentUpload(id: number, user: User) {
    return this.oneEntity(id, user, false);
  }

  private async oneEntity(id: number, user?: User, includeComments = true) {
    const task = await this.tasks.createQueryBuilder('task')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .leftJoinAndSelect('task.assignedTo', 'assignedTo')
      .leftJoinAndSelect('task.projects', 'project')
      .loadRelationCountAndMap('task.commentCount', 'task.comments')
      .where('task.id = :id', { id })
      .getOne();
    if (!task) throw new NotFoundException('Tarea no encontrada');
    if (user) {
      const allowedProjectIds = new Set((user.projects || []).map((project) => project.id));
      task.projects = (task.projects || []).filter((project) => allowedProjectIds.has(project.id));
      if (!task.projects.length) throw new NotFoundException('Tarea no encontrada');
    }
    const [comments, attachments, history] = await Promise.all([
      includeComments ? this.comments.createQueryBuilder('comment')
        .innerJoin('comment.task', 'commentTask')
        .leftJoin('comment.user', 'commentUser')
        .addSelect(['commentUser.id', 'commentUser.name', 'commentUser.email'])
        .where('commentTask.id = :id', { id }).orderBy('comment.createdAt', 'ASC').getMany() : Promise.resolve([] as TaskComment[]),
      this.attachments.createQueryBuilder('attachment')
        .innerJoin('attachment.task', 'attachmentTask')
        .leftJoin('attachment.uploadedBy', 'uploadedBy')
        .addSelect(['uploadedBy.id', 'uploadedBy.name'])
        .where('attachmentTask.id = :id', { id }).orderBy('attachment.createdAt', 'ASC').getMany(),
      this.history.createQueryBuilder('history')
        .innerJoin('history.task', 'historyTask')
        .leftJoin('history.changedBy', 'changedBy')
        .addSelect(['changedBy.id', 'changedBy.name'])
        .where('historyTask.id = :id', { id }).orderBy('history.createdAt', 'ASC').getMany(),
    ]);
    task.comments = comments;
    task.attachments = attachments;
    task.history = history;
    return task;
  }

  async create(dto: CreateTaskDto, user: User, files: Express.Multer.File[] = []) {
    const assignedTo = await this.users.findOneBy({ id: dto.assignedToId });
    if (!assignedTo) throw new BadRequestException('Usuario asignado inválido');
    const task = await this.tasks.save(this.tasks.create({
      title: this.normalizeTitle(dto.title),
      detailHtml: await this.prepareHtml(dto.detailHtml),
      createdBy: user,
      assignedTo,
      status: TaskStatus.TODO,
      projects: await this.resolveProjects(dto.projectNames, user),
    }));
    await this.history.save(this.history.create({ task, previousStatus: null, newStatus: TaskStatus.TODO, changedBy: user }));
    await this.saveFiles(task, user, files);
    await this.mail.taskEvent(await this.oneEntity(task.id), 'Nueva tarea asignada', 'Se creó una tarea en TodoTasks.');
    return this.one(task.id);
  }

  async update(id: number, dto: UpdateTaskDto, user: User) {
    const task = await this.oneEntity(id, user);
    const previousAssigned = task.assignedTo.id;
    if (dto.assignedToId) {
      const assignedTo = await this.users.findOneBy({ id: dto.assignedToId });
      if (!assignedTo) throw new BadRequestException('Usuario asignado inválido');
      task.assignedTo = assignedTo;
    }
    if (dto.title) task.title = this.normalizeTitle(dto.title);
    if (dto.detailHtml) task.detailHtml = await this.prepareHtml(dto.detailHtml);
    if (dto.projectNames !== undefined) task.projects = await this.resolveProjects(dto.projectNames, user);
    const saved = await this.tasks.save(task);
    if (previousAssigned !== saved.assignedTo.id) {
      await this.mail.taskEvent(await this.oneEntity(id), 'Tarea reasignada', `${user.name} reasignó la tarea.`);
    }
    return this.one(id, user);
  }

  async changeStatus(id: number, dto: ChangeStatusDto, user: User) {
    const task = await this.oneEntity(id, user);
    if (dto.status === TaskStatus.BLOCKED && !dto.comment?.trim()) {
      throw new BadRequestException('Para bloquear una tarea debes indicar el motivo.');
    }
    const previous = task.status;
    task.status = dto.status;
    task.completedAt = dto.status === TaskStatus.DONE ? new Date() : null;
    const saved = await this.tasks.save(task);
    await this.history.save(this.history.create({ task: saved, previousStatus: previous, newStatus: dto.status, changedBy: user, comment: dto.comment || null }));
    await this.mail.taskEvent(await this.oneEntity(id), dto.status === TaskStatus.DONE ? 'Tarea finalizada' : 'Cambio de estado', `${user.name} cambió el estado de la tarea.`, dto.comment);
    return this.one(id, user);
  }

  async addComment(id: number, dto: CommentDto, user: User) {
    const task = await this.oneEntity(id, user);
    const content = await this.prepareHtml(dto.content.trim());
    const textContent = content.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim();
    if (!textContent && !/<img\b/i.test(content)) throw new BadRequestException('El comentario no puede estar vacío.');
    const comment = await this.comments.save(this.comments.create({ task, user, content }));
    const mailContent = content.replace(/<br\s*\/?\s*>|<\/p>|<\/li>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim();
    await this.mail.taskEvent(await this.oneEntity(id), 'Nuevo comentario', `${user.name} agregó un comentario.`, mailContent);
    return { id: comment.id, content: comment.content, createdAt: comment.createdAt, updatedAt: comment.updatedAt, user: this.publicUser(user) };
  }

  async saveFiles(task: Task, user: User, files: Express.Multer.File[] = []) {
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
    for (const file of files) {
      const extension = extname(file.originalname).toLowerCase();
      if (file.size > MAX_ATTACHMENT_SIZE) {
        throw new BadRequestException(`El archivo ${file.originalname} supera el límite de 20 MB.`);
      }
      if (!allowedExtensions.has(extension) && !file.mimetype.toLowerCase().startsWith('image/')) {
        throw new BadRequestException(`Tipo de archivo no permitido: ${file.originalname}`);
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

  async deleteAttachment(id: number, user: User) {
    const attachment = await this.attachments.findOne({ where: { id }, relations: { task: true } });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado');
    await this.one(attachment.task.id, user);
    if (existsSync(attachment.filePath)) unlinkSync(attachment.filePath);
    await this.attachments.delete(id);
    return { ok: true };
  }

  async deleteTask(id: number, user: User) {
    assertAdmin(user);
    const task = await this.tasks.findOneBy({ id });
    if (!task) throw new NotFoundException('Tarea no encontrada.');
    const files = await this.attachments.find({ where: { task: { id } } });
    await this.tasks.delete(id);
    for (const file of files) {
      if (existsSync(file.filePath)) unlinkSync(file.filePath);
    }
    return { ok: true };
  }
}
