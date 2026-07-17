import { Body, Controller, Get, Injectable, Post, Req, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { compare } from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginDto } from './dto';
import { User } from './entities';

export type AuthRequest = Request & { user: User };

export function safeUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev_secret',
    });
  }

  async validate(payload: { sub: number }) {
    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

export const UseJwt = () => {
  const { UseGuards } = require('@nestjs/common') as typeof import('@nestjs/common');
  return UseGuards(JwtAuthGuard);
};

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email }),
      user: safeUser(user),
    };
  }

  @UseJwt()
  @Get('me')
  me(@Req() req: AuthRequest) {
    return safeUser(req.user);
  }
}
