// Document Status Polling Service
// Polls async document processing jobs until completion

import { logger } from './logger';
import { authService } from './authService';

export interface AsyncJobStatus {
  jobId: string;
  statusUrl: string;
  fileName: string;
  status: 'processing' | 'succeeded' | 'failed';
  result?: any;
  error?: string;
}

class DocumentStatusPoller {
  private pollingInterval = 5000; // 5 seconds
  private maxPollingAttempts = 60; // 5 minutes total
  private activePolls = new Map<string, NodeJS.Timeout>();

  /**
   * Start polling for a single async job
   */
  async pollJobStatus(
    jobId: string,
    statusUrl: string,
    fileName: string,
    onStatusChange?: (status: AsyncJobStatus) => void,
    onComplete?: (result: any) => void,
    onError?: (error: string) => void
  ): Promise<AsyncJobStatus> {
    logger.info(`🔄 Starting status polling for job: ${jobId}`);

    let attempts = 0;

    return new Promise((resolve, reject) => {
      const pollFunction = async () => {
        attempts++;

        try {
          const baseUrl = import.meta.env.DEV ? '' : window.location.origin;
          const session = authService.getCurrentSession();
          const headers: HeadersInit = session?.token ? { Authorization: `Bearer ${session.token}` } : {};

          const response = await fetch(`${baseUrl}${statusUrl}`, {
            headers,
          });

          if (!response.ok) {
            throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
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

          logger.info(`📊 Job ${jobId} status: ${status.status} (attempt ${attempts})`);

          // Notify status change callback
          if (onStatusChange) {
            onStatusChange(status);
          }

          if (status.status === 'succeeded') {
            logger.info(`✅ Job ${jobId} completed successfully`);
            this.clearPolling(jobId);
            if (onComplete) {
              onComplete(status.result);
            }
            resolve(status);
            return;
          }

          if (status.status === 'failed') {
            logger.error(`❌ Job ${jobId} failed: ${status.error}`);
            this.clearPolling(jobId);
            if (onError) {
              onError(status.error || 'Processing failed');
            }
            reject(new Error(status.error || 'Processing failed'));
            return;
          }

          // Still processing - continue polling
          if (attempts >= this.maxPollingAttempts) {
            logger.error(`⏱️ Job ${jobId} polling timeout after ${attempts} attempts`);
            this.clearPolling(jobId);
            if (onError) {
              onError('Processing timeout');
            }
            reject(new Error('Processing timeout'));
            return;
          }

          // Schedule next poll
          const timeoutId = setTimeout(pollFunction, this.pollingInterval);
          this.activePolls.set(jobId, timeoutId);

        } catch (error) {
          logger.error(`❌ Error polling job ${jobId}:`, error);

          if (attempts >= this.maxPollingAttempts) {
            this.clearPolling(jobId);
            if (onError) {
              onError(error instanceof Error ? error.message : 'Polling failed');
            }
            reject(error);
            return;
          }

          // Retry on error
          const timeoutId = setTimeout(pollFunction, this.pollingInterval);
          this.activePolls.set(jobId, timeoutId);
        }
      };

      // Start polling immediately
      pollFunction();
    });
  }

  /**
   * Poll multiple jobs concurrently
   */
  async pollMultipleJobs(
    jobs: { jobId: string; statusUrl: string; fileName: string }[],
    onJobComplete?: (jobId: string, result: any) => void,
    onJobError?: (jobId: string, error: string) => void,
    onAllComplete?: (results: { [jobId: string]: any }) => void
  ): Promise<{ [jobId: string]: any }> {
    logger.info(`🔄 Starting polling for ${jobs.length} async jobs`);

    const results: { [jobId: string]: any } = {};
    let completedCount = 0;

    const promises = jobs.map(job =>
      this.pollJobStatus(
        job.jobId,
        job.statusUrl,
        job.fileName,
        undefined, // onStatusChange
        (result) => {
          results[job.jobId] = result;
          completedCount++;

          if (onJobComplete) {
            onJobComplete(job.jobId, result);
          }

          if (completedCount === jobs.length && onAllComplete) {
            onAllComplete(results);
          }
        },
        (error) => {
          completedCount++;

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
      return results;
    } catch (error) {
      logger.error('❌ Error in multi-job polling:', error);
      throw error;
    }
  }

  /**
   * Clear polling for a specific job
   */
  private clearPolling(jobId: string): void {
    const timeoutId = this.activePolls.get(jobId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activePolls.delete(jobId);
    }
  }

  /**
   * Stop all active polling
   */
  stopAllPolling(): void {
    logger.info(`🛑 Stopping ${this.activePolls.size} active polling operations`);

    for (const [jobId, timeoutId] of this.activePolls.entries()) {
      clearTimeout(timeoutId);
    }

    this.activePolls.clear();
  }

  /**
   * Get status of all active polls
   */
  getActivePolls(): string[] {
    return Array.from(this.activePolls.keys());
  }
}

export const documentStatusPoller = new DocumentStatusPoller();