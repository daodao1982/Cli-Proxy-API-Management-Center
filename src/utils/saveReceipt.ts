/**
 * 统一的保存操作回执工具
 * 用于配置保存、模型切换等关键操作，提供带版本信息和时间戳的标准提示
 */

import type { NotificationType } from '@/types';

interface SaveReceiptOptions {
  /** 通知类型，默认 success */
  type?: NotificationType;
  /** 操作类型，例如 "OpenAI Provider"、"Gemini Key"、"Claude Config" */
  operation: string;
  /** 是否为新增（默认为更新） */
  isCreate?: boolean;
  /** 服务器版本号（可选） */
  serverVersion?: string | null;
  /** 服务器构建日期（可选） */
  serverBuildDate?: string | null;
  /** 自定义时区语言（可选，默认使用浏览器语言） */
  locale?: string;
}

/**
 * 构建标准化的保存成功提示文本
 *
 * @returns 标准化提示字符串
 */
export function buildSaveReceipt(options: SaveReceiptOptions): string {
  const { type = 'success', operation, isCreate = false, serverVersion, serverBuildDate, locale } = options;

  const actionText = isCreate ? '添加成功' : '已保存';

  const parts: string[] = [`${operation} ${actionText}`];

  if (serverVersion) {
    parts.push(`版本 ${serverVersion}`);
  }

  if (serverBuildDate) {
    const parsedDate = new Date(serverBuildDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      const timeStr = parsedDate.toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      parts.push(`构建于 ${timeStr}`);
    }
  }

  return parts.join(' · ');
}
