import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { GitCommit, GitContributor, GitAuthor } from '../types/expert';

const execFileAsync = promisify(execFile);

/**
 * Secure Git service that prevents command injection vulnerabilities
 * by properly escaping inputs and using parameterized commands
 */
export class GitService {
    private readonly GIT_TIMEOUT_MS = 30000; // 30 seconds
    private readonly MAX_BUFFER = 10 * 1024 * 1024; // 10MB
    private static instanceCache = new Map<string, GitService>();

    constructor(
        private readonly repoPath: string,
        private readonly outputChannel?: vscode.OutputChannel
    ) {
        // Validate repository path
        if (!repoPath || typeof repoPath !== 'string') {
            throw new Error('Invalid repository path: path must be a non-empty string');
        }

        // Resolve to absolute path
        const resolvedPath = path.resolve(repoPath);

        // Verify path exists and is a directory
        try {
            const stats = fs.statSync(resolvedPath);
            if (!stats.isDirectory()) {
                throw new Error(`Invalid repository path: "${repoPath}" is not a directory`);
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('Invalid repository path')) {
                throw error;
            }
            throw new Error(`Invalid repository path: "${repoPath}" does not exist or is not accessible`);
        }

        // Update repoPath to use validated absolute path
        (this as any).repoPath = resolvedPath;
    }

    /**
     * Get or create a cached GitService instance for a repository
     * @param repoPath - Repository path
     * @param outputChannel - Optional output channel
     * @returns Cached or new GitService instance
     */
    static getInstance(repoPath: string, outputChannel?: vscode.OutputChannel): GitService {
        const normalizedPath = path.resolve(repoPath);

        if (!GitService.instanceCache.has(normalizedPath)) {
            GitService.instanceCache.set(normalizedPath, new GitService(normalizedPath, outputChannel));
        }

        return GitService.instanceCache.get(normalizedPath)!;
    }

    /**
     * Executes a git command with security measures using execFile (no shell invocation)
     * @param args - Git command arguments as separate array elements
     * @returns Command output
     */
    private async executeGitCommand(args: string[]): Promise<string> {
        try {
            this.outputChannel?.appendLine(`Executing: git ${args.join(' ')}`);

            // Use execFile instead of exec - doesn't invoke shell, prevents command injection
            const { stdout } = await execFileAsync('git', args, {
                cwd: this.repoPath,
                timeout: this.GIT_TIMEOUT_MS,
                maxBuffer: this.MAX_BUFFER
            });

            return stdout;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.outputChannel?.appendLine(`Git command failed: ${errorMessage}`);
            throw new Error(`Git command failed: ${errorMessage}`);
        }
    }

    /**
     * Parse git log output into GitCommit objects (DRY helper method)
     * @param output - Raw git log output with format %H|%an|%ae|%ad|%s
     * @returns Array of parsed GitCommit objects
     */
    private parseCommitOutput(output: string): GitCommit[] {
        return output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('|');
                if (parts.length >= 5) {
                    const author: GitAuthor = {
                        name: parts[1],
                        email: parts[2]
                    };
                    const commit: GitCommit = {
                        sha: parts[0],
                        author: author,
                        message: parts.slice(4).join('|'),
                        date: parts[3],
                        files: [] as string[]  // Files not fetched in basic log, would require --name-only
                    };
                    return commit;
                }
                return null;
            })
            .filter((commit): commit is GitCommit => commit !== null);
    }

    /**
     * Get commits from the repository
     * @param limit - Maximum number of commits to retrieve
     * @returns Array of git commits
     */
    async getCommits(limit: number = 500): Promise<GitCommit[]> {
        const args = [
            'log',
            '--pretty=format:%H|%an|%ae|%ad|%s',
            '--date=iso',
            '-n',
            String(Math.max(1, Math.min(limit, 1000))) // Clamp between 1 and 1000
        ];

        const output = await this.executeGitCommand(args);
        return this.parseCommitOutput(output);
    }

    /**
     * Get commits by a specific author
     * @param email - Author email address
     * @param limit - Maximum number of commits
     * @returns Array of commits by that author
     */
    async getCommitsByAuthor(email: string, limit: number = 10): Promise<GitCommit[]> {
        // No escaping needed - execFile passes arguments directly without shell interpretation
        const args = [
            'log',
            `--author=${email}`,  // No quotes needed with execFile
            '--pretty=format:%H|%an|%ae|%ad|%s',
            '--date=iso',
            '-n',
            String(Math.max(1, Math.min(limit, 100)))
        ];

        const output = await this.executeGitCommand(args);
        return this.parseCommitOutput(output);
    }

    /**
     * Get all contributors from the repository
     * @returns Array of contributors with commit counts
     */
    async getContributors(): Promise<GitContributor[]> {
        const args = ['shortlog', '-sne', '--all'];

        const output = await this.executeGitCommand(args);

        const contributors = output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const match = line.match(/^\s*(\d+)\s+(.+?)\s+<(.+?)>\s*$/);
                if (match) {
                    return {
                        name: match[2],
                        email: match[3],
                        commits: parseInt(match[1], 10),
                        additions: 0,      // Would require git log --numstat to calculate
                        deletions: 0,      // Would require git log --numstat to calculate
                        firstCommit: '',   // Will be populated below for top 20 contributors
                        lastCommit: ''     // Will be populated below for top 20 contributors
                    };
                }
                return null;
            })
            .filter((contributor): contributor is GitContributor => contributor !== null)
            .sort((a, b) => b.commits - a.commits);

        // Get first and last commit dates for top 20 contributors
        for (const contributor of contributors.slice(0, 20)) {
            try {
                const lastCommitDate = await this.getLastCommitDate(contributor.email);
                if (lastCommitDate) {
                    contributor.lastCommit = lastCommitDate;
                }

                const firstCommitDate = await this.getFirstCommitDate(contributor.email);
                if (firstCommitDate) {
                    contributor.firstCommit = firstCommitDate;
                }
            } catch (error) {
                // Continue with default dates if this fails
                this.outputChannel?.appendLine(
                    `Warning: Could not get commit dates for ${contributor.email}`
                );
            }
        }

        return contributors;
    }

    /**
     * Get the last commit date for a specific author
     * @param email - Author email (will be escaped)
     * @returns ISO date string of last commit
     */
    async getLastCommitDate(email: string): Promise<string | null> {
        try {
            const args = [
                'log',
                `--author=${email}`,  // No quotes/escaping needed with execFile
                '--pretty=format:%ad',
                '--date=iso',
                '-n',
                '1'
            ];

            const output = await this.executeGitCommand(args);
            return output.trim() || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get the first commit date for a specific author
     * @param email - Author email
     * @returns ISO date string of first commit
     */
    async getFirstCommitDate(email: string): Promise<string | null> {
        try {
            const args = [
                'log',
                `--author=${email}`,  // No quotes/escaping needed with execFile
                '--pretty=format:%ad',
                '--date=iso',
                '--reverse',  // Reverse order to get oldest first
                '-n',
                '1'
            ];

            const output = await this.executeGitCommand(args);
            return output.trim() || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get commits since a specific date
     * @param since - Date to get commits since
     * @param limit - Maximum number of commits
     * @returns Array of commits
     */
    async getCommitsSince(since: Date, limit: number = 100): Promise<GitCommit[]> {
        const sinceDate = since.toISOString().split('T')[0];

        const args = [
            'log',
            `--since=${sinceDate}`,  // No quotes needed with execFile
            '--pretty=format:%H|%an|%ae|%ad|%s',
            '--date=iso',
            '-n',
            String(Math.max(1, Math.min(limit, 1000)))
        ];

        const output = await this.executeGitCommand(args);
        return this.parseCommitOutput(output);
    }

    /**
     * Get files modified by a specific author
     * @param email - Author email (will be escaped)
     * @param limit - Maximum number of files to return
     * @returns Array of file paths
     */
    async getFilesByAuthor(email: string, limit: number = 20): Promise<string[]> {
        try {
            const args = [
                'log',
                `--author=${email}`,  // No quotes/escaping needed with execFile
                '--name-only',
                '--pretty=format:',
                '-n',
                String(Math.max(1, Math.min(limit, 100)))
            ];

            const output = await this.executeGitCommand(args);

            const files = output
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // Remove duplicates and sort
            const uniqueFiles = Array.from(new Set(files));

            return uniqueFiles.slice(0, limit);
        } catch (error) {
            this.outputChannel?.appendLine(`Error getting files by author: ${error}`);
            return [];
        }
    }

    /**
     * Get the remote URL of the repository
     * @returns Remote URL or null if not found
     */
    async getRemoteUrl(): Promise<string | null> {
        try {
            const args = ['config', '--get', 'remote.origin.url'];
            const output = await this.executeGitCommand(args);
            return output.trim() || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if the directory is a valid git repository
     * @returns True if valid git repo, false otherwise
     */
    async isValidRepository(): Promise<boolean> {
        try {
            const args = ['rev-parse', '--git-dir'];
            await this.executeGitCommand(args);
            return true;
        } catch (error) {
            return false;
        }
    }
}
