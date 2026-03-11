import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { buildCandidateUsageSourceIds, collectUsageDetails, formatCompactNumber } from '@/utils/usage';
import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from '@/types';
import type { UsagePayload } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

export interface ApiKeyRiskCardProps {
  usage: UsagePayload | null;
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
}

interface RiskRow {
  key: string;
  displayName: string;
  type: string;
  total: number;
  success: number;
  failure: number;
  failureRate: number;
  severity: 'high' | 'warn' | 'idle' | 'ok';
  hint: string;
}

const buildRow = (
  displayName: string,
  type: string,
  candidates: string[],
  buckets: Record<string, { success: number; failure: number }>,
  key: string
): RiskRow => {
  let success = 0;
  let failure = 0;
  candidates.forEach((id) => {
    const bucket = buckets[id];
    if (!bucket) return;
    success += bucket.success;
    failure += bucket.failure;
  });
  const total = success + failure;
  const failureRate = total > 0 ? failure / total : 0;
  let severity: RiskRow['severity'] = 'ok';
  let hint = '';
  if (total === 0) {
    severity = 'idle';
    hint = '近时段无调用';
  } else if (total >= 5 && failureRate >= 0.3) {
    severity = 'high';
    hint = '失败率高，建议检查密钥/上游';
  } else if (total >= 5 && failureRate >= 0.1) {
    severity = 'warn';
    hint = '错误偏多，建议观察';
  } else {
    severity = 'ok';
    hint = '运行正常';
  }

  return {
    key,
    displayName,
    type,
    total,
    success,
    failure,
    failureRate,
    severity,
    hint,
  };
};

export function ApiKeyRiskCard({
  usage,
  loading,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
}: ApiKeyRiskCardProps) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    if (!usage) return [] as RiskRow[];
    const details = collectUsageDetails(usage);
    const buckets: Record<string, { success: number; failure: number }> = {};

    details.forEach((detail) => {
      const source = detail.source;
      if (!source) return;
      if (!buckets[source]) buckets[source] = { success: 0, failure: 0 };
      if (detail.failed) {
        buckets[source].failure += 1;
      } else {
        buckets[source].success += 1;
      }
    });

    const result: RiskRow[] = [];

    geminiKeys.forEach((c, i) => {
      const name = c.prefix?.trim() || `Gemini #${i + 1}`;
      const candidates = buildCandidateUsageSourceIds({ apiKey: c.apiKey, prefix: c.prefix });
      result.push(buildRow(name, 'gemini', candidates, buckets, `gemini:${i}`));
    });

    claudeConfigs.forEach((c, i) => {
      const name = c.prefix?.trim() || `Claude #${i + 1}`;
      const candidates = buildCandidateUsageSourceIds({ apiKey: c.apiKey, prefix: c.prefix });
      result.push(buildRow(name, 'claude', candidates, buckets, `claude:${i}`));
    });

    codexConfigs.forEach((c, i) => {
      const name = c.prefix?.trim() || `Codex #${i + 1}`;
      const candidates = buildCandidateUsageSourceIds({ apiKey: c.apiKey, prefix: c.prefix });
      result.push(buildRow(name, 'codex', candidates, buckets, `codex:${i}`));
    });

    vertexConfigs.forEach((c, i) => {
      const name = c.prefix?.trim() || `Vertex #${i + 1}`;
      const candidates = buildCandidateUsageSourceIds({ apiKey: c.apiKey, prefix: c.prefix });
      result.push(buildRow(name, 'vertex', candidates, buckets, `vertex:${i}`));
    });

    openaiProviders.forEach((provider, providerIndex) => {
      const displayName = provider.prefix?.trim() || provider.name || `OpenAI #${providerIndex + 1}`;
      const candidates = new Set<string>();
      buildCandidateUsageSourceIds({ prefix: provider.prefix }).forEach((id) => candidates.add(id));
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({ apiKey: entry.apiKey }).forEach((id) => candidates.add(id));
      });
      result.push(buildRow(displayName, 'openai', Array.from(candidates), buckets, `openai:${providerIndex}`));
    });

    return result
      .sort((a, b) => {
        const weight = (v: RiskRow) =>
          v.severity === 'high' ? 3 : v.severity === 'warn' ? 2 : v.severity === 'idle' ? 1 : 0;
        const diff = weight(b) - weight(a);
        if (diff !== 0) return diff;
        return b.failureRate - a.failureRate;
      });
  }, [usage, geminiKeys, claudeConfigs, codexConfigs, vertexConfigs, openaiProviders]);

  return (
    <Card title={t('risk_dashboard.title', { defaultValue: 'API Key 风险面板' })}>
      <div className={styles.riskCardHint}>
        {t('risk_dashboard.desc', { defaultValue: '基于当前时间范围内的请求成功/失败统计（不额外消耗 token）' })}
      </div>
      {loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className={styles.hint}>{t('usage_stats.no_data')}</div>
      ) : (
        <div className={styles.riskTableWrapper}>
          <table className={styles.riskTable}>
            <thead>
              <tr>
                <th>{t('risk_dashboard.col_name', { defaultValue: '密钥/供应商' })}</th>
                <th>{t('risk_dashboard.col_rate', { defaultValue: '失败率' })}</th>
                <th>{t('risk_dashboard.col_count', { defaultValue: '请求/失败' })}</th>
                <th>{t('risk_dashboard.col_status', { defaultValue: '状态' })}</th>
                <th>{t('risk_dashboard.col_hint', { defaultValue: '建议' })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <span className={styles.riskName}>{row.displayName}</span>
                    <span className={styles.riskType}>{row.type}</span>
                  </td>
                  <td>{row.total === 0 ? '-' : `${(row.failureRate * 100).toFixed(1)}%`}</td>
                  <td>
                    <span className={styles.riskCount}>{formatCompactNumber(row.total)}</span>
                    <span className={styles.riskSubCount}>/ {formatCompactNumber(row.failure)}</span>
                  </td>
                  <td>
                    <span className={`${styles.riskBadge} ${styles[`riskBadge${row.severity}`]}`}>
                      {row.severity === 'high'
                        ? t('risk_dashboard.high', { defaultValue: '高风险' })
                        : row.severity === 'warn'
                          ? t('risk_dashboard.warn', { defaultValue: '注意' })
                          : row.severity === 'idle'
                            ? t('risk_dashboard.idle', { defaultValue: '无流量' })
                            : t('risk_dashboard.ok', { defaultValue: '正常' })}
                    </span>
                  </td>
                  <td>{row.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
