import { logger } from '../services/logger';

type RefactorDetails = Record<string, unknown>;

interface RefactorLogEntry {
  component: string;
  event: string;
  details?: RefactorDetails;
  timestamp: string;
}

interface RefactorLogInspector {
  getEntries: () => RefactorLogEntry[];
  clear: () => void;
  print: () => void;
  size: () => number;
}

declare global {
  interface Window {
    __TRUCKBO_REFACTOR_LOG__?: RefactorLogInspector;
  }
}

const LOG_BUFFER_LIMIT = 200;
const logBuffer: RefactorLogEntry[] = [];

const getEnvFlag = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return String(import.meta.env.VITE_REFACTOR_DEBUG ?? '').toLowerCase();
  }
  if (typeof process !== 'undefined' && process.env) {
    return String(process.env.VITE_REFACTOR_DEBUG ?? process.env.REFACTOR_DEBUG ?? '').toLowerCase();
  }
  return '';
};

const ensureInspector = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const win = window as Window;
  if (!win.__TRUCKBO_REFACTOR_LOG__) {
    win.__TRUCKBO_REFACTOR_LOG__ = {
      getEntries: () => [...logBuffer],
      clear: () => {
        logBuffer.length = 0;
      },
      print: () => {
        if (typeof console !== 'undefined' && typeof console.table === 'function') {
          console.table(logBuffer);
        } else if (typeof console !== 'undefined') {
          console.log('[Refactor] log entries', logBuffer);
        }
      },
      size: () => logBuffer.length
    };
  }
};

const pushLogEntry = (entry: RefactorLogEntry): void => {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_LIMIT) {
    logBuffer.shift();
  }
  ensureInspector();
};

export const isRefactorDebugEnabled = (): boolean => getEnvFlag() === 'true';

export const startRefactorTimer = (): (() => number) => {
  const start = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  return () => {
    const end = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    return end - start;
  };
};

export const refactorDebugLog = (
  component: string,
  event: string,
  details?: RefactorDetails
): void => {
  if (!isRefactorDebugEnabled()) {
    return;
  }

  const timestamp = new Date().toISOString();
  const payload: RefactorDetails = {
    ...(details ?? {}),
    timestamp
  };

  pushLogEntry({ component, event, details: payload, timestamp });

  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[Refactor]', component, event, payload);
  }

  logger.debug(`[RefactorBaseline] ${event}`, {
    component,
    layer: 'frontend',
    operation: event,
    metadata: payload
  });
};

export const getRefactorLogEntries = (): RefactorLogEntry[] => [...logBuffer];
