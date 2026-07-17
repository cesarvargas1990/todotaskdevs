import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from './entities';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}

export class CreateTaskDto {
  @IsString() @MaxLength(150) title!: string;
  @IsString() @IsNotEmpty() detailHtml!: string;
  @Type(() => Number) @IsInt() assignedToId!: number;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() detailHtml?: string;
  @IsOptional() @Type(() => Number) @IsInt() assignedToId?: number;
}

export class ChangeStatusDto {
  @IsEnum(TaskStatus) status!: TaskStatus;
  @IsOptional() @IsString() comment?: string;
}

export class CommentDto {
  @IsString() @IsNotEmpty() content!: string;
}
