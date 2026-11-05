import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthController, JwtStrategy } from './auth';
import { Project, Task, TaskAttachment, TaskComment, TaskStatusHistory, User } from './entities';
import { MailService } from './mail.service';
import { UsersController } from './users.controller';
import { TasksController } from './tasks.controller';
import { ProjectsController } from './projects.controller';
import { TasksService } from './tasks.service';

class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
  ) {}

  async onApplicationBootstrap() {
    const users = await this.users.find();
    const projects = await this.projects.find();
    const assignments = await this.users.manager.query('SELECT COUNT(*) AS count FROM `user_projects`');
    if (Number(assignments[0]?.count || 0) === 0 && users.length && projects.length) {
      for (const user of users) {
        user.projects = projects;
        await this.users.save(user);
      }
    }

    const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
    const visualMaster = users.find((user) => normalize(user.name) === 'visual master sas');
    const requested = new Set(['visualtech', 'vsm erp']);
    if (visualMaster) {
      visualMaster.projects = projects.filter((project) => requested.has(normalize(project.name)));
      await this.users.save(visualMaster);
    }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      username: process.env.DB_USER || 'todotasks',
      password: process.env.DB_PASSWORD || 'todotasks_password',
      database: process.env.DB_NAME || 'todotasks',
      entities: [User, Task, Project, TaskComment, TaskAttachment, TaskStatusHistory],
      synchronize: true,
      charset: 'utf8mb4',
    }),
    TypeOrmModule.forFeature([User, Task, Project, TaskComment, TaskAttachment, TaskStatusHistory]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '8d' },
    }),
  ],
  controllers: [AuthController, UsersController, TasksController, ProjectsController],
  providers: [JwtStrategy, MailService, TasksService, SeedService],
})
export class AppModule {}
