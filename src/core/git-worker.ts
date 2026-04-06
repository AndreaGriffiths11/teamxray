/**
 * Worker thread for git operations — runs off the extension host thread.
 * Must NOT import 'vscode'. Only Node built-ins.
 */
import { parentPort } from 'worker_threads';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024;

interface WorkerMessage {
    id: number;
    type: 'getCommits' | 'getContributors';
    repoPath: string;
    limit?: number;
}

async function getCommits(repoPath: string, limit: number) {
    const { stdout } = await execFileAsync('git', [
        'log',
        '--pretty=format:%H|%an|%ae|%ad|%s',
        '--date=iso',
        '-n',
        String(Math.max(1, Math.min(limit, 1000)))
    ], { cwd: repoPath, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER });

    return stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
            const parts = line.split('|');
            if (parts.length >= 5) {
                return {
                    sha: parts[0],
                    author: { name: parts[1], email: parts[2] },
                    message: parts.slice(4).join('|'),
                    date: parts[3],
                    files: [] as string[]
                };
            }
            return null;
        })
        .filter(Boolean);
}

async function getContributors(repoPath: string) {
    const { stdout } = await execFileAsync('git', [
        'shortlog', '-sne', '--all'
    ], { cwd: repoPath, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER });

    const contributors = stdout
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

    // Get first/last commit dates for top 20
    for (const contrib of contributors.slice(0, 20) as any[]) {
        try {
            const { stdout: lastOut } = await execFileAsync('git', [
                'log', `--author=${contrib.email}`, '--pretty=format:%ad', '--date=iso', '-n', '1'
            ], { cwd: repoPath, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
            contrib.lastCommit = lastOut.trim() || '';

            const { stdout: firstOut } = await execFileAsync('git', [
                'log', `--author=${contrib.email}`, '--pretty=format:%ad', '--date=iso', '--reverse', '-n', '1'
            ], { cwd: repoPath, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
            contrib.firstCommit = firstOut.trim() || '';
        } catch {
            // continue
        }
    }

    return contributors;
}

if (parentPort) {
    parentPort.on('message', async (msg: WorkerMessage) => {
        try {
            let result: any;
            if (msg.type === 'getCommits') {
                result = await getCommits(msg.repoPath, msg.limit ?? 500);
            } else if (msg.type === 'getContributors') {
                result = await getContributors(msg.repoPath);
            } else {
                throw new Error(`Unknown message type: ${(msg as any).type}`);
            }
            parentPort!.postMessage({ id: msg.id, result });
        } catch (err: any) {
            parentPort!.postMessage({ id: msg.id, error: err.message || String(err) });
        }
    });
}
