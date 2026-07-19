/**
 * Worker thread for git operations — runs off the extension host thread.
 * Must NOT import 'vscode'. Only Node built-ins and vscode-free utils.
 */
import { parentPort } from 'worker_threads';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { COMMIT_LOG_FORMAT, parseCommitLog } from '../utils/git-log-format';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;
const HEAD_TIMEOUT_MS = 5_000;
const MAX_BUFFER = 10 * 1024 * 1024;

interface WorkerMessage {
    id: number;
    type: 'getCommits' | 'getContributors' | 'getHead';
    repoPath: string;
    limit?: number;
    sinceDate?: string;
}

async function getCommits(repoPath: string, limit: number, sinceDate?: string) {
    const args = [
        'log',
        `--pretty=format:${COMMIT_LOG_FORMAT}`,
        '-n',
        String(Math.max(1, Math.min(limit, 1000)))
    ];
    if (sinceDate) {
        args.push(`--since=${sinceDate}`);
    }
    const { stdout } = await execFileAsync('git', args, {
        cwd: repoPath,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER
    });

    return parseCommitLog(stdout);
}

/**
 * Contributor list via `git shortlog`. Kept as a fallback for repositories
 * where the commit log comes back empty — the analyzer normally derives
 * contributors (with first/last dates) from the commit list in one pass.
 */
async function getContributors(repoPath: string) {
    const { stdout } = await execFileAsync('git', [
        'shortlog', '-sne', 'HEAD'
    ], { cwd: repoPath, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER });

    return stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
            const match = line.match(/^\s*(\d+)\s+(.+?)\s+<(.+?)>\s*$/);
            if (match) {
                return {
                    name: match[2],
                    email: match[3],
                    commits: parseInt(match[1], 10),
                    additions: 0,
                    deletions: 0,
                    firstCommit: '',
                    lastCommit: ''
                };
            }
            return null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.commits - a.commits);
}

async function getHead(repoPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: repoPath,
        timeout: HEAD_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER
    });
    return stdout.trim();
}

if (parentPort) {
    parentPort.on('message', async (msg: WorkerMessage) => {
        try {
            let result: any;
            if (msg.type === 'getCommits') {
                result = await getCommits(msg.repoPath, msg.limit ?? 500, msg.sinceDate);
            } else if (msg.type === 'getContributors') {
                result = await getContributors(msg.repoPath);
            } else if (msg.type === 'getHead') {
                result = await getHead(msg.repoPath);
            } else {
                throw new Error(`Unknown message type: ${(msg as any).type}`);
            }
            parentPort!.postMessage({ id: msg.id, result });
        } catch (err: any) {
            parentPort!.postMessage({ id: msg.id, error: err.message || String(err) });
        }
    });
}
