import { Controller, Get, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRequest, UseJwt, safeUser } from './auth';
import { User } from './entities';

@UseJwt()
@Controller('users')
export class UsersController {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    const projectIds = new Set((req.user.projects || []).map((project) => project.id));
    const users = await this.users.find({ order: { name: 'ASC' } });
    return users
      .filter((user) => user.id === req.user.id || (user.projects || []).some((project) => projectIds.has(project.id)))
      .map((user) => {
        const visibleUser = safeUser(user);
        return { ...visibleUser, projects: visibleUser.projects.filter((project) => projectIds.has(project.id)) };
      });
  }
}
