import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconGithub, IconBookOpen, IconExternalLink, IconCode } from '@/components/ui/icons';
import { useAuthStore, useConfigStore, useNotificationStore, useModelsStore, useThemeStore } from '@/stores';
import { configApi } from '@/services/api';
import { apiKeysApi } from '@/services/api/apiKeys';
import { logsApi } from '@/services/api/logs';
import { classifyModels, type ModelInfo } from '@/utils/models';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { parseLogLine } from '@/pages/hooks/logParsing';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import styles from './SystemPage.module.scss';

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  gemini: iconGemini,
  qwen: iconQwen,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  glm: iconGlm,
  grok: iconGrok,
  deepseek: iconDeepseek,
  minimax: iconMinimax,
};

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [modelStatus, setModelStatus] = useState<{ type: 'success' | 'warning' | 'error' | 'muted'; message: string }>();
  const [requestLogModalOpen, setRequestLogModalOpen] = useState(false);
  const [requestLogDraft, setRequestLogDraft] = useState(false);
  const [requestLogTouched, setRequestLogTouched] = useState(false);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [modelHealthMap, setModelHealthMap] = useState<Record<string, { total: number; errors: number; status: 'ok' | 'warn' | 'error' | 'idle' }>>({});
  const [modelHealthExpanded, setModelHealthExpanded] = useState(false);
  const [modelHealthDetails, setModelHealthDetails] = useState<Array<{ model: string; total: number; errors: number; status: 'ok' | 'warn' | 'error' | 'idle' }>>([]);

  const apiKeysCache = useRef<string[]>([]);
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isZh = i18n.language?.toLowerCase().startsWith('zh');
  const otherLabel = useMemo(
    () => (isZh ? '其他' : 'Other'),
    [isZh]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);
  const requestLogEnabled = config?.requestLog ?? false;
  const requestLogDirty = requestLogDraft !== requestLogEnabled;
  const canEditRequestLog = auth.connectionStatus === 'connected' && Boolean(config);

  const appVersion = __APP_VERSION__ || t('system_info.version_unknown');
  const apiVersion = auth.serverVersion || t('system_info.version_unknown');
  const buildTime = auth.serverBuildDate
    ? new Date(auth.serverBuildDate).toLocaleString(i18n.language)
    : t('system_info.version_unknown');
  const modelPrimary = config?.raw?.['models.primary'] ? String(config.raw['models.primary']) : '';
  const modelFallbackRaw = config?.raw?.['models.fallback'] ?? config?.raw?.['models.fallbacks'];
  const modelFallbacks = Array.isArray(modelFallbackRaw)
    ? (modelFallbackRaw as unknown[]).map((item) => String(item)).filter(Boolean)
    : typeof modelFallbackRaw === 'string'
      ? modelFallbackRaw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  const modelSwitchUpdatedAt = config?.raw?.['models.updated-at'] || config?.raw?.['models.updatedAt'] || '';

  const getIconForCategory = (categoryId: string): string | null => {
    const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
    if (!iconEntry) return null;
    if (typeof iconEntry === 'string') return iconEntry;
    return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
  };

  const resolveModelHealth = useCallback(
    (model: ModelInfo): { total: number; errors: number; status: 'ok' | 'warn' | 'error' | 'idle' } => {
      const key = (model.alias || model.name || '').toLowerCase();
      if (!key) return { total: 0, errors: 0, status: 'idle' };
      return modelHealthMap[key] ?? { total: 0, errors: 0, status: 'idle' };
    },
    [modelHealthMap]
  );

  const healthSummary = useMemo(() => {
    const entries = Object.values(modelHealthMap);
    const base = { ok: 0, warn: 0, error: 0, idle: 0, total: 0, errors: 0 };
    return entries.reduce((acc, item) => {
      acc.total += item.total;
      acc.errors += item.errors;
      acc[item.status] += 1;
      return acc;
    }, base);
  }, [modelHealthMap]);

  const toggleHealthExpanded = useCallback(() => {
    setModelHealthExpanded((prev) => !prev);
  }, []);

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch (err) {
      console.warn('Auto loading API keys for models failed:', err);
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    if (auth.connectionStatus !== 'connected') {
      setModelStatus({
        type: 'warning',
        message: t('notification.connection_required')
      });
      return;
    }

    if (!auth.apiBase) {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    if (forceRefresh) {
      apiKeysCache.current = [];
    }

    setModelStatus({ type: 'muted', message: t('system_info.models_loading') });
    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      const list = await fetchModelsFromStore(auth.apiBase, primaryKey, forceRefresh);
      const hasModels = list.length > 0;
      setModelStatus({
        type: hasModels ? 'success' : 'warning',
        message: hasModels ? t('system_info.models_count', { count: list.length }) : t('system_info.models_empty')
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const suffix = message ? `: ${message}` : '';
      const text = `${t('system_info.models_error')}${suffix}`;
      setModelStatus({ type: 'error', message: text });
    }
  };

  const handleClearLoginStorage = () => {
    showConfirmation({
      title: t('system_info.clear_login_title', { defaultValue: 'Clear Login Storage' }),
      message: t('system_info.clear_login_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: () => {
        auth.logout();
        if (typeof localStorage === 'undefined') return;
        const keysToRemove = [STORAGE_KEY_AUTH, 'isLoggedIn', 'apiBase', 'apiUrl', 'managementKey'];
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        showNotification(t('notification.login_storage_cleared'), 'success');
      },
    });
  };

  const openRequestLogModal = useCallback(() => {
    setRequestLogTouched(false);
    setRequestLogDraft(requestLogEnabled);
    setRequestLogModalOpen(true);
  }, [requestLogEnabled]);

  const handleInfoVersionTap = useCallback(() => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
      openRequestLogModal();
      return;
    }

    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  }, [openRequestLogModal]);

  const handleRequestLogClose = useCallback(() => {
    setRequestLogModalOpen(false);
    setRequestLogTouched(false);
  }, []);

  const handleRequestLogSave = async () => {
    if (!canEditRequestLog) return;
    if (!requestLogDirty) {
      setRequestLogModalOpen(false);
      return;
    }

    const previous = requestLogEnabled;
    setRequestLogSaving(true);
    updateConfigValue('request-log', requestLogDraft);

    try {
      await configApi.updateRequestLog(requestLogDraft);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
      setRequestLogModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('request-log', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig]);

  useEffect(() => {
    if (requestLogModalOpen && !requestLogTouched) {
      setRequestLogDraft(requestLogEnabled);
    }
  }, [requestLogModalOpen, requestLogTouched, requestLogEnabled]);

  useEffect(() => {
    return () => {
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.connectionStatus, auth.apiBase]);

  useEffect(() => {
    if (auth.connectionStatus !== 'connected') {
      setModelHealthMap({});
      return;
    }

    let cancelled = false;
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    const loadHealth = async () => {
      try {
        const response = await logsApi.fetchLogs();
        const parsed = response.lines.map((line) => parseLogLine(line));
        const recent = parsed.filter((line) => {
          if (!line.timestamp) return false;
          const ts = Date.parse(line.timestamp);
          if (Number.isNaN(ts)) return false;
          return ts >= tenMinutesAgo;
        });

        const nextMap: Record<string, { total: number; errors: number; status: 'ok' | 'warn' | 'error' | 'idle' }> = {};

        recent.forEach((line) => {
          const match = line.message?.match(/\bmodel[=:]\s*"?([a-zA-Z0-9._\-/]+)"?/i);
          const modelName = match?.[1];
          if (!modelName) return;
          const key = modelName.toLowerCase();
          if (!nextMap[key]) {
            nextMap[key] = { total: 0, errors: 0, status: 'idle' };
          }
          nextMap[key].total += 1;
          if (line.statusCode && line.statusCode >= 400) {
            nextMap[key].errors += 1;
          }
        });

        Object.values(nextMap).forEach((entry) => {
          if (entry.total === 0) {
            entry.status = 'idle';
            return;
          }
          const errorRate = entry.errors / entry.total;
          if (errorRate >= 0.3) {
            entry.status = 'error';
          } else if (errorRate >= 0.1) {
            entry.status = 'warn';
          } else {
            entry.status = 'ok';
          }
        });

        if (!cancelled) {
          setModelHealthMap(nextMap);
          const details = Object.entries(nextMap)
            .map(([model, entry]) => ({
              model,
              total: entry.total,
              errors: entry.errors,
              status: entry.status
            }))
            .sort((a, b) => b.total - a.total);
          setModelHealthDetails(details);
        }
      } catch (err) {
        if (!cancelled) {
          setModelHealthMap({});
          setModelHealthDetails([]);
        }
      }
    };

    loadHealth();
    const timer = window.setInterval(loadHealth, 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth.connectionStatus]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('system_info.title')}</h1>
      <div className={styles.content}>
      <Card className={styles.aboutCard}>
        <div className={styles.aboutHeader}>
          <img src={INLINE_LOGO_JPEG} alt="CPAMC" className={styles.aboutLogo} />
          <div className={styles.aboutTitle}>{t('system_info.about_title')}</div>
        </div>

        <div className={styles.aboutInfoGrid}>
          <button
            type="button"
            className={`${styles.infoTile} ${styles.tapTile}`}
            onClick={handleInfoVersionTap}
          >
            <div className={styles.tileLabel}>{t('footer.version')}</div>
            <div className={styles.tileValue}>{appVersion}</div>
          </button>

          <div className={styles.infoTile}>
            <div className={styles.tileLabel}>{t('footer.api_version')}</div>
            <div className={styles.tileValue}>{apiVersion}</div>
          </div>

          <div className={styles.infoTile}>
            <div className={styles.tileLabel}>{t('footer.build_date')}</div>
            <div className={styles.tileValue}>{buildTime}</div>
          </div>

	          <div className={styles.infoTile}>
	            <div className={styles.tileLabel}>{t('connection.status')}</div>
	            <div className={styles.tileValue}>{t(`common.${auth.connectionStatus}_status`)}</div>
	            <div className={styles.tileSub}>{auth.apiBase || '-'}</div>
	          </div>
        </div>

        <div className={styles.aboutActions}>
          <Button variant="secondary" size="sm" onClick={() => fetchConfig(undefined, true)}>
            {t('common.refresh')}
          </Button>
        </div>
      </Card>

      <Card title={t('system_info.quick_links_title')}>
        <p className={styles.sectionDescription}>{t('system_info.quick_links_desc')}</p>
        <div className={styles.quickLinks}>
          <a
            href="https://github.com/router-for-me/CLIProxyAPI"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.linkCard}
          >
            <div className={`${styles.linkIcon} ${styles.github}`}>
              <IconGithub size={22} />
            </div>
            <div className={styles.linkContent}>
              <div className={styles.linkTitle}>
                {t('system_info.link_main_repo')}
                <IconExternalLink size={14} />
              </div>
              <div className={styles.linkDesc}>{t('system_info.link_main_repo_desc')}</div>
            </div>
          </a>

          <a
            href="https://github.com/kongkongyo/Cli-Proxy-API-Management-Center"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.linkCard}
          >
            <div className={`${styles.linkIcon} ${styles.github}`}>
              <IconCode size={22} />
            </div>
            <div className={styles.linkContent}>
              <div className={styles.linkTitle}>
                {t('system_info.link_webui_repo')}
                <IconExternalLink size={14} />
              </div>
              <div className={styles.linkDesc}>{t('system_info.link_webui_repo_desc')}</div>
            </div>
          </a>

          <a
            href="https://help.router-for.me/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.linkCard}
          >
            <div className={`${styles.linkIcon} ${styles.docs}`}>
              <IconBookOpen size={22} />
            </div>
            <div className={styles.linkContent}>
              <div className={styles.linkTitle}>
                {t('system_info.link_docs')}
                <IconExternalLink size={14} />
              </div>
              <div className={styles.linkDesc}>{t('system_info.link_docs_desc')}</div>
            </div>
          </a>
        </div>
      </Card>

      <Card
        title={t('system_info.models_title')}
        extra={
          <Button variant="secondary" size="sm" onClick={() => fetchModels({ forceRefresh: true })} loading={modelsLoading}>
            {t('common.refresh')}
          </Button>
        }
      >
        <p className={styles.sectionDescription}>{t('system_info.models_desc')}</p>
        {(modelPrimary || modelFallbacks.length > 0 || modelSwitchUpdatedAt) && (
          <div className={styles.modelMeta}> 
            {modelPrimary && (
              <div className={styles.modelMetaRow}>
                <span className={styles.modelMetaLabel}>{t('system_info.models_primary_label')}</span>
                <span className={styles.modelMetaValue}>{modelPrimary}</span>
              </div>
            )}
            {modelFallbacks.length > 0 && (
              <div className={styles.modelMetaRow}>
                <span className={styles.modelMetaLabel}>{t('system_info.models_fallback_label')}</span>
                <span className={styles.modelMetaValue}>{modelFallbacks.join(' / ')}</span>
              </div>
            )}
            {modelSwitchUpdatedAt && (
              <div className={styles.modelMetaRow}>
                <span className={styles.modelMetaLabel}>{t('system_info.models_updated_label')}</span>
                <span className={styles.modelMetaValue}>{String(modelSwitchUpdatedAt)}</span>
              </div>
            )}
          </div>
        )}
        {modelStatus && <div className={`status-badge ${modelStatus.type}`}>{modelStatus.message}</div>}
        {modelsError && <div className="error-box">{modelsError}</div>}
        {modelsLoading ? (
          <div className="hint">{t('common.loading')}</div>
        ) : models.length === 0 ? (
          <div className="hint">{t('system_info.models_empty')}</div>
        ) : (
          <div className="item-list">
            <button type="button" className={styles.healthToggle} onClick={toggleHealthExpanded}>
              <span className={styles.healthToggleLabel}>
                {isZh ? '10分钟健康统计' : '10-min Health Summary'}
              </span>
              <div className={styles.healthSummaryDots}>
                <span className={`${styles.healthDot} ${styles.healthDotOk}`} title={isZh ? '正常' : 'OK'} />
                <span className={styles.healthSummaryValue}>{healthSummary.ok}</span>
                <span className={`${styles.healthDot} ${styles.healthDotWarn}`} title={isZh ? '警告' : 'Warn'} />
                <span className={styles.healthSummaryValue}>{healthSummary.warn}</span>
                <span className={`${styles.healthDot} ${styles.healthDotError}`} title={isZh ? '异常' : 'Error'} />
                <span className={styles.healthSummaryValue}>{healthSummary.error}</span>
                <span className={`${styles.healthDot} ${styles.healthDotIdle}`} title={isZh ? '无流量' : 'Idle'} />
                <span className={styles.healthSummaryValue}>{healthSummary.idle}</span>
              </div>
              <span className={styles.healthSummaryMeta}>
                {healthSummary.total} req / {healthSummary.errors} err
              </span>
              <span className={styles.healthToggleCaret}>
                {modelHealthExpanded ? '▾' : '▸'}
              </span>
            </button>
            {modelHealthExpanded && (
              <div className={styles.healthDetail}>
                <div className={styles.healthDetailHint}>
                  {isZh ? '统计最近10分钟请求，按请求量排序。' : 'Counts from last 10 minutes, sorted by requests.'}
                </div>
                {modelHealthDetails.length === 0 ? (
                  <div className={styles.healthDetailEmpty}>{isZh ? '暂无数据' : 'No data yet'}</div>
                ) : (
                  <div className={styles.healthDetailList}>
                    {modelHealthDetails.map((item) => (
                      <div key={item.model} className={styles.healthDetailRow}>
                        <span className={styles.healthDetailName}>{item.model}</span>
                        <span className={`${styles.healthDot} ${styles[`healthDot${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}`]}`} />
                        <span className={styles.healthDetailValue}>{item.total} req</span>
                        <span className={styles.healthDetailValue}>{item.errors} err</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {groupedModels.map((group) => {
              const iconSrc = getIconForCategory(group.id);
              return (
                <div key={group.id} className="item-row">
                  <div className="item-meta">
                    <div className={styles.groupTitle}>
                      {iconSrc && <img src={iconSrc} alt="" className={styles.groupIcon} />}
                      <span className="item-title">{group.label}</span>
                    </div>
                    <div className="item-subtitle">{t('system_info.models_count', { count: group.items.length })}</div>
                  </div>
                  <div className={styles.modelTags}>
                    {group.items.map((model) => {
                      const health = resolveModelHealth(model);
                      return (
                        <span
                          key={`${model.name}-${model.alias ?? 'default'}`}
                          className={styles.modelTag}
                          title={model.description || ''}
                        >
                          <span className={styles.modelName}>{model.name}</span>
                          {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                          <span
                            className={`${styles.modelHealthDot} ${styles[`modelHealthDot${health.status}`]}`}
                            title={`10m ${health.total} / ${health.errors}`}
                          />
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={t('system_info.clear_login_title')}>
        <p className={styles.sectionDescription}>{t('system_info.clear_login_desc')}</p>
        <div className={styles.clearLoginActions}>
          <Button variant="danger" onClick={handleClearLoginStorage}>
            {t('system_info.clear_login_button')}
          </Button>
        </div>
      </Card>
      </div>

      <Modal
        open={requestLogModalOpen}
        onClose={handleRequestLogClose}
        title={t('basic_settings.request_log_title')}
        footer={
          <>
            <Button variant="secondary" onClick={handleRequestLogClose} disabled={requestLogSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRequestLogSave}
              loading={requestLogSaving}
              disabled={!canEditRequestLog || !requestLogDirty}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="request-log-modal">
          <div className="status-badge warning">{t('basic_settings.request_log_warning')}</div>
          <ToggleSwitch
            label={t('basic_settings.request_log_enable')}
            labelPosition="left"
            checked={requestLogDraft}
            disabled={!canEditRequestLog || requestLogSaving}
            onChange={(value) => {
              setRequestLogDraft(value);
              setRequestLogTouched(true);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
