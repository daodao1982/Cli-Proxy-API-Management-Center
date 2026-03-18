import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import type { ExpirationOption } from '@/types';
import type { ModelInfo } from '@/utils/models';
import styles from '@/pages/AuthFilesPage.module.scss';

// 默认可用模型列表（后续可从后端获取）
const DEFAULT_AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-5-20251114', name: 'Claude Opus 4' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
  { id: 'glm-4', name: 'GLM-4' },
  { id: 'glm-4-flash', name: 'GLM-4 Flash' },
  { id: 'qwen-plus', name: 'Qwen Plus' },
  { id: 'qwen-turbo', name: 'Qwen Turbo' },
];

export interface UploadOptions {
  expirationOption: ExpirationOption;
  customExpirationHours: number;
  allowedModels: string[];
}

interface AddAuthFileModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: UploadOptions) => void;
}

export function AddAuthFileModal({ open, onClose, onConfirm }: AddAuthFileModalProps) {
  const { t } = useTranslation();
  const [expirationOption, setExpirationOption] = useState<ExpirationOption>('never');
  const [customHours, setCustomHours] = useState(24);
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [selectAllModels, setSelectAllModels] = useState(true);

  useEffect(() => {
    if (!open) {
      setExpirationOption('never');
      setCustomHours(24);
      setAllowedModels([]);
      setSelectAllModels(true);
    }
  }, [open]);

  const handleConfirm = () => {
    onConfirm({
      expirationOption,
      customExpirationHours: customHours,
      allowedModels: selectAllModels ? [] : allowedModels,
    });
  };

  const expirationOptions = [
    { value: '12h', label: '12小时' },
    { value: '24h', label: '24小时' },
    { value: '30d', label: '30天' },
    { value: 'custom', label: '自定义' },
    { value: 'never', label: '永久' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加认证文件"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className={styles.uploadOptions}>
        {/* 有效期选择 */}
        <div className={styles.formGroup}>
          <label>有效期</label>
          <Select
            value={expirationOption}
            onChange={(e) => setExpirationOption(e.target.value as ExpirationOption)}
            options={expirationOptions}
          />
        </div>

        {/* 自定义时间输入 */}
        {expirationOption === 'custom' && (
          <div className={styles.formGroup}>
            <label>自定义小时数</label>
            <Input
              type="number"
              value={customHours}
              onChange={(e) => setCustomHours(Number(e.target.value))}
              min={1}
              max={87600}
            />
          </div>
        )}

        {/* 模型限制 */}
        <div className={styles.formGroup}>
          <label>允许使用的模型</label>
          <Checkbox
            checked={selectAllModels}
            onChange={(e) => setSelectAllModels(e.target.checked)}
            label="允许全部模型"
          />
          
          {!selectAllModels && DEFAULT_AVAILABLE_MODELS.length > 0 && (
            <div className={styles.modelList}>
              {DEFAULT_AVAILABLE_MODELS.map((model) => (
                <Checkbox
                  key={model.id}
                  checked={allowedModels.includes(model.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAllowedModels([...allowedModels, model.id]);
                    } else {
                      setAllowedModels(allowedModels.filter((m) => m !== model.id));
                    }
                  }}
                  label={model.name || model.id}
                />
              ))}
            </div>
          )}
          
          {selectAllModels && (
            <p className={styles.hint}>
              用户可以使用所有可用模型
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
