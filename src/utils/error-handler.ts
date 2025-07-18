import * as vscode from 'vscode';
import { TeamXRayError, ErrorCode } from '../types/expert';

/**
 * Centralized error handling for the Team X-Ray extension
 */
export class ErrorHandler {
    private static outputChannel: vscode.OutputChannel | null = null;

    static initialize(outputChannel: vscode.OutputChannel): void {
        ErrorHandler.outputChannel = outputChannel;
    }

    /**
     * Creates a standardized error object
     */
    static createError(
        code: ErrorCode,
        message: string,
        userMessage: string,
        recoverable: boolean = false,
        context?: Record<string, any>
    ): TeamXRayError {
        return {
            code,
            message,
            userMessage,
            recoverable,
            context
        };
    }

    /**
     * Handles and displays errors appropriately
     */
    static handleError(error: TeamXRayError | Error | string): void {
        let teamXRayError: TeamXRayError;

        if (typeof error === 'string') {
            teamXRayError = ErrorHandler.createError(
                'VALIDATION_ERROR',
                error,
                error,
                false
            );
        } else if (error instanceof Error) {
            teamXRayError = ErrorHandler.createError(
                'VALIDATION_ERROR',
                error.message,
                'An unexpected error occurred. Please try again.',
                false,
                { stack: error.stack }
            );
        } else {
            teamXRayError = error;
        }

        // Log technical details
        if (ErrorHandler.outputChannel) {
            ErrorHandler.outputChannel.appendLine(
                `[${teamXRayError.code}] ${teamXRayError.message}`
            );
            if (teamXRayError.context) {
                ErrorHandler.outputChannel.appendLine(
                    `Context: ${JSON.stringify(teamXRayError.context, null, 2)}`
                );
            }
        }

        // Show user-friendly message
        if (teamXRayError.recoverable) {
            vscode.window.showWarningMessage(
                teamXRayError.userMessage,
                'Retry',
                'Show Logs'
            ).then(choice => {
                if (choice === 'Show Logs' && ErrorHandler.outputChannel) {
                    ErrorHandler.outputChannel.show();
                }
            });
        } else {
            vscode.window.showErrorMessage(
                teamXRayError.userMessage,
                'Show Logs'
            ).then(choice => {
                if (choice === 'Show Logs' && ErrorHandler.outputChannel) {
                    ErrorHandler.outputChannel.show();
                }
            });
        }
    }

    /**
     * Wraps async operations with error handling
     */
    static async withErrorHandling<T>(
        operation: () => Promise<T>,
        errorContext: string
    ): Promise<T | null> {
        try {
            return await operation();
        } catch (error) {
            const teamXRayError = ErrorHandler.createError(
                'VALIDATION_ERROR',
                error instanceof Error ? error.message : String(error),
                `Failed to ${errorContext}. Please try again.`,
                true,
                { operation: errorContext }
            );
            ErrorHandler.handleError(teamXRayError);
            return null;
        }
    }

    /**
     * Creates specific error types for common scenarios
     */
    static createTokenError(message: string = 'Invalid or missing GitHub token'): TeamXRayError {
        return ErrorHandler.createError(
            'INVALID_TOKEN',
            message,
            'Please set a valid GitHub token with repo and user permissions.',
            true
        );
    }

    static createNetworkError(message: string = 'Network request failed'): TeamXRayError {
        return ErrorHandler.createError(
            'NETWORK_ERROR',
            message,
            'Unable to connect to GitHub. Please check your internet connection.',
            true
        );
    }

    static createRepositoryError(message: string = 'Repository not found'): TeamXRayError {
        return ErrorHandler.createError(
            'REPOSITORY_NOT_FOUND',
            message,
            'Repository not found or insufficient permissions.',
            false
        );
    }

    static createValidationError(message: string): TeamXRayError {
        return ErrorHandler.createError(
            'VALIDATION_ERROR',
            message,
            'Invalid input provided. Please check your settings.',
            false
        );
    }
}