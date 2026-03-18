/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export type ExpirationOption = '12h' | '24h' | '30d' | 'custom' | 'never';

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastRefresh?: string | number;
  modified?: number;
  // 新增：有效期设置
  expiration?: string | null;  // 过期时间 ISO 字符串
  expirationOption?: ExpirationOption;  // 预设选项
  customExpirationHours?: number;  // 自定义小时数
  // 新增：允许的模型列表
  allowedModels?: string[];  // 允许使用的模型，null表示全部可用
  // 新增：使用统计
  usage?: {
    totalRequests: number;
    totalTokens: number;
    models: Record<string, number>;  // model -> tokens
  };
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}
