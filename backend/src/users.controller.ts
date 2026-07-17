import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UseJwt, safeUser } from './auth';
import { User } from './entities';

@UseJwt()
@Controller('users')
export class UsersController {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  @Get()
  async list() {
    return (await this.users.find({ order: { name: 'ASC' } })).map(safeUser);
  }
}
