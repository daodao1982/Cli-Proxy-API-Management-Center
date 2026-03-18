/**
 * API 密钥管理
 */

import { apiClient } from './client';

export interface ApiKeyLifecycleItem {
  key: string;
  label?: string;
  preset?: '12h' | '7d' | 'custom' | 'permanent' | string;
  expiresAt?: string;
  models?: string[];
  disabled?: boolean;
  disabledReason?: string;
  disabledAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const apiKeysApi = {
  async list(): Promise<string[]> {
    const data = await apiClient.get<Record<string, unknown>>('/api-keys');
    const keys = data['api-keys'] ?? data.apiKeys;
    return Array.isArray(keys) ? keys.map((key) => String(key)) : [];
  },

  replace: (keys: string[]) => apiClient.put('/api-keys', keys),

  update: (index: number, value: string) => apiClient.patch('/api-keys', { index, value }),

  delete: (index: number) => apiClient.delete(`/api-keys?index=${index}`),

  async listLifecycle(): Promise<ApiKeyLifecycleItem[]> {
    const data = await apiClient.get<{ items?: ApiKeyLifecycleItem[] }>('/api-keys/lifecycle');
    return Array.isArray(data?.items) ? data.items : [];
  },

  setLifecycle: (payload: {
    key: string;
    preset: '12h' | '24h' | '7d' | '30d' | 'custom' | 'permanent';
    expiresAt?: string;
    label?: string;
    models?: string[];
  }) => apiClient.put('/api-keys/lifecycle', payload),

  disableLifecycleKey: (key: string) => apiClient.post('/api-keys/lifecycle/disable', { key }),

  enableLifecycleKey: (key: string) => apiClient.post('/api-keys/lifecycle/enable', { key }),

  deleteLifecycleKey: (key: string) => apiClient.delete(`/api-keys/lifecycle?key=${encodeURIComponent(key)}`)
};
