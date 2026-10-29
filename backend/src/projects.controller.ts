import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { UseJwt } from './auth';
import { Project } from './entities';

@UseJwt()
@Controller('projects')
export class ProjectsController {
  constructor(@InjectRepository(Project) private readonly projects: Repository<Project>) {}

  @Get()
  async search(@Query('search') query = '') {
    const search = query.trim().slice(0, 100);
    const projects = await this.projects.find({
      where: { name: Like(`%${search}%`) },
      select: { id: true, name: true },
      order: { name: 'ASC' },
      take: 25,
    });
    return projects;
  }
}
