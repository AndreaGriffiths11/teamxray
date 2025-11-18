import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

export interface GitCommit {
    sha: string;
    author: {
        name: string;
        email: string;
        date: string;
    };
    message: string;
}

export interface GitContributor {
    name: string;
    email: string;
    commits: number;
    lastCommit: string;
}

/**
 * Secure Git service that prevents command injection vulnerabilities
 * by properly escaping inputs and using parameterized commands
 */
export class GitService {
    private readonly GIT_TIMEOUT_MS = 30000; // 30 seconds
    private readonly MAX_BUFFER = 10 * 1024 * 1024; // 10MB

    constructor(
        private readonly repoPath: string,
        private readonly outputChannel?: vscode.OutputChannel
    ) {}

    /**
     * Escapes special shell characters to prevent command injection
     * @param input - User input that needs to be escaped
     * @returns Safely escaped string
     */
    private escapeShellArg(input: string): string {
        // Remove or escape potentially dangerous characters
        return input
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`')
            .replace(/!/g, '\\!')
            .replace(/\n/g, '')
            .replace(/\r/g, '');
    }

    /**
     * Executes a git command with security measures
     * @param args - Git command arguments (NOT a full command string)
     * @returns Command output
     */
    private async executeGitCommand(args: string[]): Promise<string> {
        try {
            // Build command with proper escaping
            const command = `git ${args.join(' ')}`;

            this.outputChannel?.appendLine(`Executing: ${command}`);

            const { stdout } = await execAsync(command, {
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
     * Get commits from the repository
     * @param limit - Maximum number of commits to retrieve
     * @returns Array of git commits
     */
    async getCommits(limit: number = 500): Promise<GitCommit[]> {
        const args = [
            'log',
            '--pretty=format:%H|%an|%ae|%ad|%s',
            '--date=iso',
            `-n ${Math.max(1, Math.min(limit, 1000))}` // Clamp between 1 and 1000
        ];

        const output = await this.executeGitCommand(args);

        return output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('|');
                if (parts.length >= 5) {
                    return {
                        sha: parts[0],
                        author: {
                            name: parts[1],
                            email: parts[2],
                            date: parts[3]
                        },
                        message: parts.slice(4).join('|')
                    };
                }
                return null;
            })
            .filter((commit): commit is GitCommit => commit !== null);
    }

    /**
     * Get commits by a specific author (safely escaped)
     * @param email - Author email address
     * @param limit - Maximum number of commits
     * @returns Array of commits by that author
     */
    async getCommitsByAuthor(email: string, limit: number = 10): Promise<GitCommit[]> {
        // SECURITY: Escape the email to prevent command injection
        const escapedEmail = this.escapeShellArg(email);

        const args = [
            'log',
            `--author="${escapedEmail}"`,
            '--pretty=format:%H|%an|%ae|%ad|%s',
            '--date=iso',
            `-n ${Math.max(1, Math.min(limit, 100))}`
        ];

        const output = await this.executeGitCommand(args);

        return output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('|');
                if (parts.length >= 5) {
                    return {
                        sha: parts[0],
                        author: {
                            name: parts[1],
                            email: parts[2],
                            date: parts[3]
                        },
                        message: parts.slice(4).join('|')
                    };
                }
                return null;
            })
            .filter((commit): commit is GitCommit => commit !== null);
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
                        lastCommit: new Date().toISOString()
                    };
                }
                return null;
            })
            .filter((contributor): contributor is GitContributor => contributor !== null)
            .sort((a, b) => b.commits - a.commits);

        // Get last commit date for top 20 contributors
        for (const contributor of contributors.slice(0, 20)) {
            try {
                const lastCommitDate = await this.getLastCommitDate(contributor.email);
                if (lastCommitDate) {
                    contributor.lastCommit = lastCommitDate;
                }
            } catch (error) {
                // Continue with default date if this fails
                this.outputChannel?.appendLine(
                    `Warning: Could not get last commit for ${contributor.email}`
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
            const escapedEmail = this.escapeShellArg(email);

            const args = [
                'log',
                `--author="${escapedEmail}"`,
                '--pretty=format:%ad',
                '--date=iso',
                '-n 1'
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
            `--since="${sinceDate}"`,
            '--pretty=format:%H|%an|%ae|%ad|%s',
            '--date=iso',
            `-n ${Math.max(1, Math.min(limit, 1000))}`
        ];

        const output = await this.executeGitCommand(args);

        return output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('|');
                if (parts.length >= 5) {
                    return {
                        sha: parts[0],
                        author: {
                            name: parts[1],
                            email: parts[2],
                            date: parts[3]
                        },
                        message: parts.slice(4).join('|')
                    };
                }
                return null;
            })
            .filter((commit): commit is GitCommit => commit !== null);
    }

    /**
     * Get files modified by a specific author
     * @param email - Author email (will be escaped)
     * @param limit - Maximum number of files to return
     * @returns Array of file paths
     */
    async getFilesByAuthor(email: string, limit: number = 20): Promise<string[]> {
        try {
            const escapedEmail = this.escapeShellArg(email);

            const args = [
                'log',
                `--author="${escapedEmail}"`,
                '--name-only',
                '--pretty=format:',
                `-n ${Math.max(1, Math.min(limit, 100))}`
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
