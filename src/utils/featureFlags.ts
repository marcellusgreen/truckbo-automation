const getEnvValue = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envRecord = import.meta.env as unknown as Record<string, string | undefined>;
    const value = envRecord[key];
    if (typeof value === 'string') {
      return value.toLowerCase();
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (typeof value === 'string') {
      return value.toLowerCase();
    }
  }

  return '';
};

const defaultFlags: Record<string, boolean> = {
  VITE_USE_FLEET_HOOK: true,
  VITE_USE_ONBOARDING_HOOK: true
};

const isFlagEnabled = (key: string): boolean => {
  const value = getEnvValue(key);

  if (value === '') {
    return Boolean(defaultFlags[key]);
  }

  return value === 'true' || value === '1' || value === 'enabled';
};

export const isFleetAdapterEnabled = (): boolean => isFlagEnabled('VITE_USE_FLEET_ADAPTER');

export const isFleetHookEnabled = (): boolean => isFlagEnabled('VITE_USE_FLEET_HOOK');

export const isOnboardingHookEnabled = (): boolean => isFlagEnabled('VITE_USE_ONBOARDING_HOOK');

export const isRefactorDebugEnabledFlag = (): boolean => isFlagEnabled('VITE_REFACTOR_DEBUG');
