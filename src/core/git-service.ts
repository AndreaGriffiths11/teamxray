import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { GitCommit, GitContributor } from '../types/expert';
import {
    COMMIT_LOG_FORMAT,
    COMMIT_LOG_FORMAT_WITH_FILES,
    parseCommitLog,
    parseCommitLogWithFiles
} from '../utils/git-log-format';

const execFileAsync = promisify(execFile);

/**
 * Secure Git service that prevents command injection vulnerabilities
 * by properly escaping inputs and using parameterized commands
 */
export class GitService {
    private readonly GIT_TIMEOUT_MS = 30000; // 30 seconds
    private readonly AUTHOR_DATE_TIMEOUT_MS = 5000; // Keep contributor enrichment responsive
    private readonly MAX_BUFFER = 10 * 1024 * 1024; // 10MB
    private readonly CONTRIBUTOR_DATE_ENRICHMENT_LIMIT = 5;
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
    private async executeGitCommand(args: string[], timeoutMs: number = this.GIT_TIMEOUT_MS): Promise<string> {
        try {
            this.outputChannel?.appendLine(`Executing: git ${args.join(' ')}`);

            // Use execFile instead of exec - doesn't invoke shell, prevents command injection
            const { stdout } = await execFileAsync('git', args, {
                cwd: this.repoPath,
                timeout: timeoutMs,
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
     * Parse git log output into GitCommit objects. The shared NUL-delimited
     * format carries co-author and checkpoint trailers alongside the basics.
     */
    private parseCommitOutput(output: string): GitCommit[] {
        return parseCommitLog(output);
    }

    /**
     * Parse git log output where each commit is followed by a list of touched files.
     */
    private parseCommitOutputWithFiles(output: string): GitCommit[] {
        return parseCommitLogWithFiles(output);
    }

    private normalizeGitPath(filePath: string): string {
        const normalizedPath = path.isAbsolute(filePath)
            ? path.relative(this.repoPath, filePath)
            : filePath;

        return normalizedPath.split(path.sep).join('/');
    }

    /**
     * Get commits from the repository
     * @param limit - Maximum number of commits to retrieve
     * @returns Array of git commits
     */
    async getCommits(limit: number = 500, sinceDate?: string): Promise<GitCommit[]> {
        const args = [
            'log',
            `--pretty=format:${COMMIT_LOG_FORMAT}`,
            '-n',
            String(Math.max(1, Math.min(limit, 1000))) // Clamp between 1 and 1000
        ];
        if (sinceDate) {
            args.push(`--since=${sinceDate}`);
        }

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
            `--pretty=format:${COMMIT_LOG_FORMAT}`,
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
        // HEAD (not --all): stays consistent with the commit history the
        // analysis uses and avoids walking every remote ref on large repos
        const args = ['shortlog', '-sne', 'HEAD'];

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

        // Get first and last commit dates for top contributors only to keep large repositories responsive
        for (const contributor of contributors.slice(0, this.CONTRIBUTOR_DATE_ENRICHMENT_LIMIT)) {
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

            const output = await this.executeGitCommand(args, this.AUTHOR_DATE_TIMEOUT_MS);
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

            const output = await this.executeGitCommand(args, this.AUTHOR_DATE_TIMEOUT_MS);
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
            `--pretty=format:${COMMIT_LOG_FORMAT}`,
            '-n',
            String(Math.max(1, Math.min(limit, 1000)))
        ];

        const output = await this.executeGitCommand(args);
        return this.parseCommitOutput(output);
    }

    /**
     * Get commits that touched a specific file, including per-commit file lists.
     * @param filePath - Absolute or repository-relative file path
     * @param limit - Maximum number of commits
     * @returns Array of commits affecting that file
     */
    async getCommitsForFile(filePath: string, limit: number = 100): Promise<GitCommit[]> {
        const normalizedPath = this.normalizeGitPath(filePath);
        const args = [
            'log',
            '--follow',
            '--name-only',
            `--pretty=format:${COMMIT_LOG_FORMAT_WITH_FILES}`,
            '-n',
            String(Math.max(1, Math.min(limit, 1000))),
            '--',
            normalizedPath,
        ];

        const output = await this.executeGitCommand(args);
        return this.parseCommitOutputWithFiles(output);
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
