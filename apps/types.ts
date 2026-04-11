import type { InferSelectModel } from 'drizzle-orm';
import type { tasks, submissions, pointRecords, exchanges, ruleConfig, monthSummary } from '@apps/db/schema';

// ============ 数据库模型类型 ============

export type Task = InferSelectModel<typeof tasks>;

export type Submission = InferSelectModel<typeof submissions>;

export type PointRecord = InferSelectModel<typeof pointRecords>;

export type Exchange = InferSelectModel<typeof exchanges>;

export type RuleConfig = InferSelectModel<typeof ruleConfig>;

export type MonthSummary = InferSelectModel<typeof monthSummary>;

// ============ 作业相关枚举 ============

export type TaskType = 'composition' | 'mindmap';
export type TaskStatus = 'pending' | 'completed' | 'expired';
export type PointRecordType = 'earn' | 'deduct';
export type RelatedType = 'task' | 'submission' | 'exam' | 'extra' | 'custom';
export type ExchangeItemType = string;
export type ExchangeStatus = 'active' | 'revoked';

// ============ API 请求/响应类型 ============

// Tasks
export interface CreateTaskRequest {
  title: string;
  type: TaskType;
}

export interface UpdateTaskRequest {
  title?: string;
  type?: TaskType;
  status?: TaskStatus;
}

export interface SubmitTaskRequest {
  content: string;
}

export interface SubmitTaskResponse {
  submission: Submission;
  aiResult: import('@apps/services/ai').AIScoreResult;
  pointsEarned: number;
}

// Points
export interface CreatePointRecordRequest {
  type: PointRecordType;
  amount: number;
  reason: string;
  ruleName?: string;
  relatedId?: number;
  relatedType?: RelatedType;
}

export interface PointStats {
  month: string;
  totalEarn: number;
  totalDeduct: number;
  net: number;
}

// Exchanges
export interface CreateExchangeRequest {
  itemType: ExchangeItemType;
  pointsCost: number;
}

export interface RevokeExchangeResponse {
  success: boolean;
}

// ============ 通用 API 响应 ============

export interface ApiErrorResponse {
  error: string;
  balance?: number;
}

export interface ApiSuccessResponse {
  success: boolean;
}
