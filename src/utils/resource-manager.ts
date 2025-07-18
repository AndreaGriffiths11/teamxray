import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { ErrorHandler } from './error-handler';

/**
 * Resource manager for proper cleanup of processes and resources
 */
export class ResourceManager {
    private static instance: ResourceManager;
    private activeProcesses: Set<ChildProcess> = new Set();
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel | null = null;

    private constructor() {
        // Register cleanup on extension deactivation
        this.registerCleanupHandlers();
    }

    static getInstance(): ResourceManager {
        if (!ResourceManager.instance) {
            ResourceManager.instance = new ResourceManager();
        }
        return ResourceManager.instance;
    }

    initialize(outputChannel: vscode.OutputChannel): void {
        this.outputChannel = outputChannel;
    }

    /**
     * Executes a shell command with proper resource management
     */
    async executeCommand(
        command: string,
        args: string[],
        options: { cwd?: string; timeout?: number } = {}
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        const { cwd = process.cwd(), timeout = 30000 } = options;

        return new Promise((resolve, reject) => {
            const process = spawn(command, args, {
                cwd,
                stdio: 'pipe',
                shell: true
            });

            this.activeProcesses.add(process);

            let stdout = '';
            let stderr = '';
            let timeoutHandle: NodeJS.Timeout | null = null;

            // Set up timeout
            if (timeout > 0) {
                timeoutHandle = setTimeout(() => {
                    this.killProcess(process);
                    reject(ErrorHandler.createError(
                        'RESOURCE_ERROR',
                        `Command timed out after ${timeout}ms`,
                        'Command execution timed out. Please try again.',
                        true
                    ));
                }, timeout);
            }

            // Handle stdout
            process.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            // Handle stderr
            process.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            // Handle process exit
            process.on('exit', (code: number | null) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                this.activeProcesses.delete(process);

                const exitCode = code || 0;
                this.logCommand(command, args, exitCode, stdout, stderr);

                resolve({
                    stdout,
                    stderr,
                    exitCode
                });
            });

            // Handle process errors
            process.on('error', (error: Error) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                this.activeProcesses.delete(process);
                
                this.logCommand(command, args, -1, stdout, stderr);
                reject(ErrorHandler.createError(
                    'RESOURCE_ERROR',
                    `Command failed: ${error.message}`,
                    'Command execution failed. Please try again.',
                    true,
                    { command, args, error: error.message }
                ));
            });
        });
    }

    /**
     * Executes a git command with proper error handling
     */
    async executeGitCommand(
        args: string[],
        options: { cwd?: string; timeout?: number } = {}
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        try {
            return await this.executeCommand('git', args, options);
        } catch (error) {
            throw ErrorHandler.createError(
                'RESOURCE_ERROR',
                `Git command failed: ${error}`,
                'Git operation failed. Please ensure you are in a git repository.',
                true,
                { args, options }
            );
        }
    }

    /**
     * Kills a specific process
     */
    private killProcess(process: ChildProcess): void {
        try {
            if (process && !process.killed) {
                process.kill('SIGTERM');
                
                // Force kill if process doesn't exit gracefully
                setTimeout(() => {
                    if (!process.killed) {
                        process.kill('SIGKILL');
                    }
                }, 5000);
            }
        } catch (error) {
            if (this.outputChannel) {
                this.outputChannel.appendLine(`Warning: Failed to kill process: ${error}`);
            }
        }
    }

    /**
     * Adds a disposable resource for cleanup
     */
    addDisposable(disposable: vscode.Disposable): void {
        this.disposables.push(disposable);
    }

    /**
     * Creates a progress indicator with proper cleanup
     */
    async withProgress<T>(
        title: string,
        task: (progress: vscode.Progress<{ increment: number; message?: string }>) => Promise<T>
    ): Promise<T> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: true
        }, async (progress, token) => {
            // Handle cancellation
            token.onCancellationRequested(() => {
                this.cleanupActiveProcesses();
            });

            try {
                return await task(progress);
            } catch (error) {
                this.cleanupActiveProcesses();
                throw error;
            }
        });
    }

    /**
     * Cleans up all active processes
     */
    private cleanupActiveProcesses(): void {
        this.activeProcesses.forEach(process => {
            this.killProcess(process);
        });
        this.activeProcesses.clear();
    }

    /**
     * Logs command execution details
     */
    private logCommand(
        command: string,
        args: string[],
        exitCode: number,
        stdout: string,
        stderr: string
    ): void {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`Executed: ${command} ${args.join(' ')}`);
            this.outputChannel.appendLine(`Exit code: ${exitCode}`);
            
            if (stdout) {
                this.outputChannel.appendLine(`Stdout: ${stdout.substring(0, 1000)}${stdout.length > 1000 ? '...' : ''}`);
            }
            
            if (stderr) {
                this.outputChannel.appendLine(`Stderr: ${stderr.substring(0, 1000)}${stderr.length > 1000 ? '...' : ''}`);
            }
        }
    }

    /**
     * Registers cleanup handlers
     */
    private registerCleanupHandlers(): void {
        // Handle process exit
        process.on('exit', () => {
            this.cleanup();
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            if (this.outputChannel) {
                this.outputChannel.appendLine(`Uncaught exception: ${error.message}`);
            }
            this.cleanup();
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            if (this.outputChannel) {
                this.outputChannel.appendLine(`Unhandled promise rejection: ${reason}`);
            }
            this.cleanup();
        });
    }

    /**
     * Performs cleanup of all resources
     */
    cleanup(): void {
        // Kill all active processes
        this.cleanupActiveProcesses();

        // Dispose all disposables
        this.disposables.forEach(disposable => {
            try {
                disposable.dispose();
            } catch (error) {
                if (this.outputChannel) {
                    this.outputChannel.appendLine(`Warning: Failed to dispose resource: ${error}`);
                }
            }
        });
        this.disposables = [];

        if (this.outputChannel) {
            this.outputChannel.appendLine('Team X-Ray: All resources cleaned up');
        }
    }

    /**
     * Creates a timeout promise for operations
     */
    createTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                reject(ErrorHandler.createError(
                    'RESOURCE_ERROR',
                    `Operation timed out after ${timeoutMs}ms`,
                    'Operation timed out. Please try again.',
                    true
                ));
            }, timeoutMs);

            promise
                .then(result => {
                    clearTimeout(timeoutHandle);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeoutHandle);
                    reject(error);
                });
        });
    }
}