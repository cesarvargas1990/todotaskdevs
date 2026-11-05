import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuthRequest, UseJwt } from './auth';

@UseJwt()
@Controller('projects')
export class ProjectsController {
  @Get()
  async search(@Query('search') query = '', @Req() req: AuthRequest) {
    const search = query.trim().slice(0, 100);
    return (req.user.projects || [])
      .filter((project) => project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name }));
  }
}
