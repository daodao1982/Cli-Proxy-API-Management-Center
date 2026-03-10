import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { buildSaveReceipt } from '@/utils/saveReceipt';

interface UseUnifiedSaveReceiptOptions {
  /** 操作类型，例如 "OpenAI Provider"、"Gemini Key"、"Claude Config" */
  operation: string;
  /** 是否为新增（默认为更新） */
  isCreate?: boolean;
}

/**
 * 统一的保存操作回执 Hook
 * 用于配置保存、模型切换等关键操作，提供带版本信息和时间戳的标准提示
 */
export function useUnifiedSaveReceipt() {
  const { i18n } = useTranslation();
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);

  return (options: UseUnifiedSaveReceiptOptions): string => {
    const { operation, isCreate = false } = options;

    return buildSaveReceipt({
      operation,
      isCreate,
      serverVersion,
      serverBuildDate,
      locale: i18n.language,
    });
  };
}
