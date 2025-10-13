// Document Status Polling Service
// Polls async document processing jobs until completion

import { logger } from './logger';
import { authService } from './authService';
import { isRefactorDebugEnabled, refactorDebugLog } from '../utils/refactorDebug';

export interface AsyncJobStatus {
  jobId: string;
  statusUrl: string;
  fileName: string;
  status: 'processing' | 'succeeded' | 'failed';
  result?: any;
  error?: string;
}

const logPoller = (event: string, details?: Record<string, unknown>) => {
  if (isRefactorDebugEnabled()) {
    refactorDebugLog('DocumentStatusPoller', event, details);
  }
};

class DocumentStatusPoller {
  private pollingInterval = 5000;
  private maxPollingAttempts = 60;
  private activePolls = new Map<string, NodeJS.Timeout>();

  async pollJobStatus(
    jobId: string,
    statusUrl: string,
    fileName: string,
    onStatusChange?: (status: AsyncJobStatus) => void,
    onComplete?: (result: any) => void,
    onError?: (error: string) => void
  ): Promise<AsyncJobStatus> {
    logger.info('Starting status polling for job: ' + jobId);
    logPoller('poll:start', { jobId, statusUrl, fileName });

    let attempts = 0;

    return new Promise((resolve, reject) => {
      const pollFunction = async () => {
        attempts++;

        try {
          const baseUrl = import.meta.env.DEV ? '' : window.location.origin;
          const session = authService.getCurrentSession();
          const headers: HeadersInit = session?.token ? { Authorization: 'Bearer ' + session.token } : {};

          const response = await fetch(baseUrl + statusUrl, { headers });

          if (!response.ok) {
            throw new Error('Status check failed: ' + response.status + ' ' + response.statusText);
          }

          const data = await response.json();

          const status: AsyncJobStatus = {
            jobId,
            statusUrl,
            fileName,
            status: data.data?.status || 'processing',
            result: data.data,
            error: data.error?.message
          };

          logger.info('Job ' + jobId + ' status: ' + status.status + ' (attempt ' + attempts + ')');
          logPoller('poll:update', {
            jobId,
            status: status.status,
            attempt: attempts
          });

          if (onStatusChange) {
            onStatusChange(status);
          }

          if (status.status === 'succeeded') {
            logger.info('Job ' + jobId + ' completed successfully');
            logPoller('poll:success', { jobId, attempts });
            this.clearPolling(jobId);
            if (onComplete) {
              onComplete(status.result);
            }
            resolve(status);
            return;
          }

          if (status.status === 'failed') {
            logger.error('Job ' + jobId + ' failed: ' + status.error);
            logPoller('poll:failed', { jobId, attempts, error: status.error });
            this.clearPolling(jobId);
            if (onError) {
              onError(status.error || 'Processing failed');
            }
            reject(new Error(status.error || 'Processing failed'));
            return;
          }

          if (attempts >= this.maxPollingAttempts) {
            const message = 'Job ' + jobId + ' polling timeout after ' + attempts + ' attempts';
            logger.error(message);
            logPoller('poll:timeout', { jobId, attempts });
            this.clearPolling(jobId);
            if (onError) {
              onError('Processing timeout');
            }
            reject(new Error('Processing timeout'));
            return;
          }

          const timeoutId = setTimeout(pollFunction, this.pollingInterval);
          this.activePolls.set(jobId, timeoutId);
        } catch (error) {
          logger.error(
            'Error polling job ' + jobId,
            {
              component: 'DocumentStatusPoller',
              operation: 'pollJobStatus',
              metadata: { jobId, attempts }
            },
            error as Error
          );
          logPoller('poll:error', {
            jobId,
            attempts,
            message: error instanceof Error ? error.message : 'Unknown polling error'
          });

          if (attempts >= this.maxPollingAttempts) {
            this.clearPolling(jobId);
            if (onError) {
              onError(error instanceof Error ? error.message : 'Polling failed');
            }
            reject(error);
            return;
          }

          const timeoutId = setTimeout(pollFunction, this.pollingInterval);
          this.activePolls.set(jobId, timeoutId);
        }
      };

      pollFunction();
    });
  }

  async pollMultipleJobs(
    jobs: { jobId: string; statusUrl: string; fileName: string }[],
    onJobComplete?: (jobId: string, result: any) => void,
    onJobError?: (jobId: string, error: string) => void,
    onAllComplete?: (results: { [jobId: string]: any }) => void
  ): Promise<{ [jobId: string]: any }> {
    logger.info('Starting polling for ' + jobs.length + ' async jobs');
    logPoller('batch:start', { jobCount: jobs.length });

    const results: { [jobId: string]: any } = {};
    let completedCount = 0;

    const promises = jobs.map(job =>
      this.pollJobStatus(
        job.jobId,
        job.statusUrl,
        job.fileName,
        undefined,
        (result) => {
          results[job.jobId] = result;
          completedCount++;
          logPoller('batch:job-complete', { jobId: job.jobId, completedCount, total: jobs.length });

          if (onJobComplete) {
            onJobComplete(job.jobId, result);
          }

          if (completedCount === jobs.length && onAllComplete) {
            onAllComplete(results);
          }
        },
        (error) => {
          completedCount++;
          logPoller('batch:job-error', { jobId: job.jobId, completedCount, total: jobs.length, error });

          if (onJobError) {
            onJobError(job.jobId, error);
          }

          if (completedCount === jobs.length && onAllComplete) {
            onAllComplete(results);
          }
        }
      )
    );

    try {
      await Promise.allSettled(promises);
      logPoller('batch:complete', { jobCount: jobs.length });
      return results;
    } catch (error) {
      logger.error(
        'Error in multi-job polling',
        {
          component: 'DocumentStatusPoller',
          operation: 'pollMultipleJobs'
        },
        error as Error
      );
      logPoller('batch:error', { message: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  private clearPolling(jobId: string): void {
    const timeoutId = this.activePolls.get(jobId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activePolls.delete(jobId);
    }
  }

  stopAllPolling(): void {
    logger.info('Stopping ' + this.activePolls.size + ' active polling operations');
    logPoller('batch:stop-all', { activeJobs: this.activePolls.size });

    for (const [, timeoutId] of this.activePolls.entries()) {
      clearTimeout(timeoutId);
    }

    this.activePolls.clear();
  }

  getActivePolls(): string[] {
    return Array.from(this.activePolls.keys());
  }
}

export const documentStatusPoller = new DocumentStatusPoller();
