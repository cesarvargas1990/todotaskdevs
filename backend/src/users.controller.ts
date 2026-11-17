import { Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRequest, UseJwt, assertAdmin, safeUser } from './auth';
import { User, UserRole } from './entities';

@UseJwt()
@Controller('users')
export class UsersController {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    const projectIds = new Set((req.user.projects || []).map((project) => project.id));
    const users = await this.users.find({ where: { isActive: true }, order: { name: 'ASC' } });
    return users
      .filter((user) => user.id === req.user.id || (user.projects || []).some((project) => projectIds.has(project.id)))
      .map((user) => {
        const visibleUser = safeUser(user);
        return { ...visibleUser, projects: visibleUser.projects.filter((project) => projectIds.has(project.id)) };
      });
  }

  @Get('admin')
  async adminList(@Req() req: AuthRequest) {
    assertAdmin(req.user);
    const users = await this.users.find({ order: { name: 'ASC' } });
    return users.map((user) => ({ ...safeUser(user), isActive: user.isActive }));
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: AuthRequest) {
    assertAdmin(req.user);
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) throw new NotFoundException('Usuario no encontrado.');
    if (userId === req.user.id) throw new ForbiddenException('No puedes eliminar tu propio usuario.');
    const user = await this.users.findOneBy({ id: userId });
    if (!user || !user.isActive) throw new NotFoundException('Usuario no encontrado.');
    if (user.role === UserRole.ADMIN) throw new ForbiddenException('No se puede eliminar al administrador.');
    user.isActive = false;
    user.role = UserRole.USER;
    await this.users.save(user);
    return { ok: true };
  }
}
