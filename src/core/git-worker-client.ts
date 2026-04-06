import { Worker } from 'worker_threads';
import * as path from 'path';

/**
 * Client wrapper for the git worker thread.
 * Lazily spawns a Worker and provides async methods for git operations.
 */
export class GitWorkerClient {
    private worker: Worker | null = null;
    private nextId = 0;
    private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    private static readonly TIMEOUT_MS = 30_000;

    private ensureWorker(): Worker {
        if (!this.worker) {
            const workerPath = path.join(__dirname, 'git-worker.js');
            this.worker = new Worker(workerPath);
            this.worker.on('message', (msg: { id: number; result?: any; error?: string }) => {
                const entry = this.pending.get(msg.id);
                if (!entry) { return; }
                this.pending.delete(msg.id);
                clearTimeout(entry.timer);
                if (msg.error) {
                    entry.reject(new Error(msg.error));
                } else {
                    entry.resolve(msg.result);
                }
            });
            this.worker.on('error', (err) => {
                // Reject all pending
                for (const [, entry] of this.pending) {
                    clearTimeout(entry.timer);
                    entry.reject(err);
                }
                this.pending.clear();
                this.worker = null;
            });
            this.worker.on('exit', () => {
                for (const [, entry] of this.pending) {
                    clearTimeout(entry.timer);
                    entry.reject(new Error('Worker exited unexpectedly'));
                }
                this.pending.clear();
                this.worker = null;
            });
        }
        return this.worker;
    }

    private send(msg: Record<string, any>): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('Worker timeout'));
            }, GitWorkerClient.TIMEOUT_MS);
            this.pending.set(id, { resolve, reject, timer });
            this.ensureWorker().postMessage({ ...msg, id });
        });
    }

    async getCommits(repoPath: string, limit: number = 500): Promise<any[]> {
        return this.send({ type: 'getCommits', repoPath, limit });
    }

    async getContributors(repoPath: string): Promise<any[]> {
        return this.send({ type: 'getContributors', repoPath });
    }

    dispose(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        for (const [, entry] of this.pending) {
            clearTimeout(entry.timer);
            entry.reject(new Error('Worker disposed'));
        }
        this.pending.clear();
    }
}
