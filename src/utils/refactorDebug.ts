export const isRefactorDebugEnabled = (): boolean => false;

export const startRefactorTimer = (): (() => number) => () => 0;

export const refactorDebugLog = (
  _component: string,
  _event: string,
  _details?: Record<string, unknown>
): void => {};

export const getRefactorLogEntries = (): Record<string, unknown>[] => [];
