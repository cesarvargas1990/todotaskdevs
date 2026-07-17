import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id!: number;
  @Column() name!: string;
  @Column({ unique: true }) email!: string;
  @Column({ name: 'password_hash' }) passwordHash!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ length: 150 }) title!: string;
  @Column({ name: 'detail_html', type: 'longtext' }) detailHtml!: string;
  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.TODO }) status!: TaskStatus;
  @ManyToOne(() => User, { eager: true }) createdBy!: User;
  @ManyToOne(() => User, { eager: true }) assignedTo!: User;
  @OneToMany(() => TaskComment, (comment) => comment.task) comments!: TaskComment[];
  @OneToMany(() => TaskAttachment, (attachment) => attachment.task) attachments!: TaskAttachment[];
  @OneToMany(() => TaskStatusHistory, (history) => history.task) history!: TaskStatusHistory[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
  @Column({ name: 'completed_at', type: 'datetime', nullable: true }) completedAt!: Date | null;
}

@Entity('task_comments')
export class TaskComment {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Task, (task) => task.comments, { onDelete: 'CASCADE' }) task!: Task;
  @ManyToOne(() => User, { eager: true }) user!: User;
  @Column({ type: 'text' }) content!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('task_attachments')
export class TaskAttachment {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Task, (task) => task.attachments, { onDelete: 'CASCADE' }) task!: Task;
  @ManyToOne(() => User, { eager: true }) uploadedBy!: User;
  @Column({ name: 'original_name' }) originalName!: string;
  @Column({ name: 'stored_name' }) storedName!: string;
  @Column({ name: 'file_path' }) filePath!: string;
  @Column({ name: 'mime_type' }) mimeType!: string;
  @Column({ name: 'file_size' }) fileSize!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('task_status_history')
export class TaskStatusHistory {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Task, (task) => task.history, { onDelete: 'CASCADE' }) task!: Task;
  @Column({ name: 'previous_status', type: 'enum', enum: TaskStatus, nullable: true }) previousStatus!: TaskStatus | null;
  @Column({ name: 'new_status', type: 'enum', enum: TaskStatus }) newStatus!: TaskStatus;
  @ManyToOne(() => User, { eager: true }) changedBy!: User;
  @Column({ type: 'text', nullable: true }) comment!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
