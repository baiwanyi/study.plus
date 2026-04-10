import type { TaskType, TaskStatus, Grade, ExchangeStatus, PointRecordType } from './types';

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const taskTypeLabels: Record<TaskType, string> = {
  composition: '作文',
  mindmap: '思维导图',
};

export const taskTypeColors: Record<TaskType, string> = {
  composition: 'bg-purple-100 text-purple-800',
  mindmap: 'bg-pink-100 text-pink-800',
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  pending: '待完成',
  completed: '已完成',
  expired: '已过期',
};

export const gradeColors: Record<Grade, string> = {
  'A+': 'bg-purple-100 text-purple-800',
  A: 'bg-emerald-100 text-emerald-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-amber-100 text-amber-800',
  D: 'bg-red-100 text-red-800',
  E: 'bg-gray-200 text-gray-800',
};

export const exchangeStatusLabels: Record<ExchangeStatus, string> = {
  active: '有效',
  revoked: '已撤销',
};

export const pointTypeLabels: Record<PointRecordType, string> = {
  earn: '加分',
  deduct: '扣分',
};

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
