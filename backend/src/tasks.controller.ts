import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { existsSync } from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRequest, UseJwt } from './auth';
import { ChangeStatusDto, CommentDto, CreateTaskDto, UpdateTaskDto } from './dto';
import { TaskAttachment } from './entities';
import { TasksService } from './tasks.service';

@UseJwt()
@Controller()
export class TasksController {
  constructor(
    private readonly service: TasksService,
    @InjectRepository(TaskAttachment) private readonly attachments: Repository<TaskAttachment>,
  ) {}

  @Get('tasks')
  list() {
    return this.service.list();
  }

  @Get('tasks/:id')
  one(@Param('id') id: string) {
    return this.service.one(Number(id));
  }

  @Post('tasks')
  @UseInterceptors(FilesInterceptor('attachments'))
  create(@Body() dto: CreateTaskDto, @Req() req: AuthRequest, @UploadedFiles() files: Express.Multer.File[]) {
    return this.service.create(dto, req.user, files);
  }

  @Patch('tasks/:id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @Req() req: AuthRequest) {
    return this.service.update(Number(id), dto, req.user);
  }

  @Patch('tasks/:id/status')
  changeStatus(@Param('id') id: string, @Body() dto: ChangeStatusDto, @Req() req: AuthRequest) {
    return this.service.changeStatus(Number(id), dto, req.user);
  }

  @Get('tasks/:id/comments')
  async comments(@Param('id') id: string) {
    return (await this.service.one(Number(id))).comments || [];
  }

  @Post('tasks/:id/comments')
  addComment(@Param('id') id: string, @Body() dto: CommentDto, @Req() req: AuthRequest) {
    return this.service.addComment(Number(id), dto, req.user);
  }

  @Post('tasks/:id/attachments')
  @UseInterceptors(FilesInterceptor('attachments'))
  async addAttachments(@Param('id') id: string, @Req() req: AuthRequest, @UploadedFiles() files: Express.Multer.File[]) {
    const task = await this.service.one(Number(id));
    await this.service.saveFiles(task, req.user, files);
    return this.service.one(Number(id));
  }

  @Get('attachments/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const attachment = await this.attachments.findOneBy({ id: Number(id) });
    if (!attachment || !existsSync(attachment.filePath)) return res.status(404).json({ message: 'Adjunto no encontrado' });
    return res.download(attachment.filePath, attachment.originalName);
  }

  @Delete('attachments/:id')
  deleteAttachment(@Param('id') id: string) {
    return this.service.deleteAttachment(Number(id));
  }
}
