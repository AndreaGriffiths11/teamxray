import * as vscode from 'vscode';
import { TeamXRayError, ErrorCode } from '../types/expert';

/**
 * Error categories for discriminated unions
 */
export type ErrorCategory = 
    | 'network'
    | 'authentication'
    | 'rate_limit'
    | 'repository'
    | 'mcp_service'
    | 'ai_service'
    | 'validation'
    | 'resource';

/**
 * Help links for different error categories
 */
const HELP_LINKS: Record<ErrorCategory, string> = {
    network: 'https://docs.github.com/en/rest/overview/troubleshooting#connection-issues',
    authentication: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token',
    rate_limit: 'https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting',
    repository: 'https://docs.github.com/en/repositories/creating-and-managing-repositories/troubleshooting-cloning-errors',
    mcp_service: 'https://github.com/github/github-mcp-server#configuration',
    ai_service: 'https://docs.github.com/en/github-models',
    validation: 'https://github.com/AndreaGriffiths11/team-xray#usage',
    resource: 'https://github.com/AndreaGriffiths11/team-xray#troubleshooting'
};

/**
 * Base class for all Team X-Ray errors with enhanced functionality
 */
export class TeamXRayBaseError extends Error {
    readonly code: ErrorCode;
    readonly category: ErrorCategory;
    readonly userMessage: string;
    readonly recoverable: boolean;
    readonly context?: Record<string, unknown>;
    readonly helpLink?: string;
    readonly timestamp: Date;
    readonly retryable: boolean;

    constructor(
        code: ErrorCode,
        category: ErrorCategory,
        message: string,
        userMessage: string,
        options: {
            recoverable?: boolean;
            context?: Record<string, unknown>;
            retryable?: boolean;
            cause?: Error;
        } = {}
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.category = category;
        this.userMessage = userMessage;
        this.recoverable = options.recoverable ?? false;
        this.context = options.context;
        this.helpLink = HELP_LINKS[category];
        this.timestamp = new Date();
        this.retryable = options.retryable ?? false;

        // Preserve stack trace
        if (options.cause) {
            this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
        }
        
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /**
     * Converts to legacy TeamXRayError format for backward compatibility
     */
    toLegacyError(): TeamXRayError {
        return {
            code: this.code,
            message: this.message,
            userMessage: this.userMessage,
            recoverable: this.recoverable,
            context: this.context as Record<string, unknown> | undefined
        };
    }
}

/**
 * Network-related errors (connection issues, timeouts)
 */
export class NetworkError extends TeamXRayBaseError {
    constructor(message: string, options: { cause?: Error; context?: Record<string, unknown> } = {}) {
        super(
            'NETWORK_ERROR',
            'network',
            message,
            'Unable to connect to GitHub. Please check your internet connection and try again.',
            { recoverable: true, retryable: true, ...options }
        );
    }
}

/**
 * Authentication errors (invalid/missing token, expired token)
 */
export class AuthenticationError extends TeamXRayBaseError {
    constructor(message: string, options: { cause?: Error; context?: Record<string, unknown> } = {}) {
        super(
            'INVALID_TOKEN',
            'authentication',
            message,
            'Authentication failed. Please verify your GitHub token has the required permissions (repo, user).',
            { recoverable: true, retryable: false, ...options }
        );
    }
}

/**
 * Rate limiting errors from GitHub API
 */
export class RateLimitError extends TeamXRayBaseError {
    readonly resetTime?: Date;
    readonly remainingRequests: number;

    constructor(
        message: string,
        options: { resetTime?: Date; remainingRequests?: number; context?: Record<string, unknown> } = {}
    ) {
        const resetInfo = options.resetTime 
            ? ` Rate limit resets at ${options.resetTime.toLocaleTimeString()}.`
            : '';
        
        super(
            'RATE_LIMIT_ERROR',
            'rate_limit',
            message,
            `GitHub API rate limit exceeded.${resetInfo} Please wait before retrying.`,
            { recoverable: true, retryable: true, ...options }
        );
        
        this.resetTime = options.resetTime;
        this.remainingRequests = options.remainingRequests ?? 0;
    }
}

/**
 * Repository-related errors (not found, invalid state, access denied)
 */
export class RepositoryError extends TeamXRayBaseError {
    constructor(message: string, options: { cause?: Error; context?: Record<string, unknown> } = {}) {
        super(
            'REPOSITORY_NOT_FOUND',
            'repository',
            message,
            'Repository not found or you do not have access. Please verify the repository exists and you have permission.',
            { recoverable: false, retryable: false, ...options }
        );
    }
}

/**
 * MCP service errors (service unavailable, connection failed)
 */
export class MCPServiceError extends TeamXRayBaseError {
    constructor(message: string, options: { cause?: Error; context?: Record<string, unknown> } = {}) {
        super(
            'RESOURCE_ERROR',
            'mcp_service',
            message,
            'MCP service is unavailable. The extension will use local git analysis as a fallback.',
            { recoverable: true, retryable: true, ...options }
        );
    }
}

/**
 * AI service errors (GitHub Models API failures)
 */
export class AIServiceError extends TeamXRayBaseError {
    readonly statusCode?: number;

    constructor(
        message: string, 
        options: { statusCode?: number; cause?: Error; context?: Record<string, unknown> } = {}
    ) {
        const statusInfo = options.statusCode ? ` (Status: ${options.statusCode})` : '';
        
        super(
            'ANALYSIS_FAILED',
            'ai_service',
            message,
            `AI analysis failed${statusInfo}. The extension will use basic local analysis.`,
            { recoverable: true, retryable: options.statusCode !== 401 && options.statusCode !== 403, ...options }
        );
        
        this.statusCode = options.statusCode;
    }
}

/**
 * Validation errors (invalid input, configuration issues)
 */
export class ValidationError extends TeamXRayBaseError {
    constructor(message: string, options: { context?: Record<string, unknown> } = {}) {
        super(
            'VALIDATION_ERROR',
            'validation',
            message,
            `Invalid input: ${message}. Please check your configuration.`,
            { recoverable: false, retryable: false, ...options }
        );
    }
}

/**
 * Retry configuration options
 */
export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    shouldRetry: (error: Error) => {
        if (error instanceof TeamXRayBaseError) {
            return error.retryable;
        }
        return true;
    }
};

/**
 * Telemetry event for error tracking (opt-in only)
 */
export interface ErrorTelemetryEvent {
    errorCode: ErrorCode;
    category: ErrorCategory;
    timestamp: Date;
    recoverable: boolean;
    retryCount?: number;
    success?: boolean;
}

/**
 * Centralized error handling for the Team X-Ray extension
 */
export class ErrorHandler {
    private static outputChannel: vscode.OutputChannel | null = null;
    private static telemetryEnabled: boolean = false;
    private static telemetryEvents: ErrorTelemetryEvent[] = [];

    static initialize(outputChannel: vscode.OutputChannel): void {
        ErrorHandler.outputChannel = outputChannel;
    }

    /**
     * Enable or disable telemetry collection (opt-in)
     */
    static setTelemetryEnabled(enabled: boolean): void {
        ErrorHandler.telemetryEnabled = enabled;
        if (!enabled) {
            ErrorHandler.telemetryEvents = [];
        }
    }

    /**
     * Get collected telemetry events (for debugging/reporting)
     */
    static getTelemetryEvents(): ErrorTelemetryEvent[] {
        return [...ErrorHandler.telemetryEvents];
    }

    /**
     * Clear telemetry events
     */
    static clearTelemetry(): void {
        ErrorHandler.telemetryEvents = [];
    }

    /**
     * Creates a standardized error object (legacy support)
     */
    static createError(
        code: ErrorCode,
        message: string,
        userMessage: string,
        recoverable: boolean = false,
        context?: Record<string, unknown>
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
     * Logs detailed diagnostics to the output channel
     */
    private static logDiagnostics(error: TeamXRayBaseError | TeamXRayError | Error): void {
        if (!ErrorHandler.outputChannel) {
            return;
        }

        const channel = ErrorHandler.outputChannel;
        const timestamp = new Date().toISOString();

        channel.appendLine(`\n${'='.repeat(60)}`);
        channel.appendLine(`[${timestamp}] ERROR DIAGNOSTICS`);
        channel.appendLine('='.repeat(60));

        if (error instanceof TeamXRayBaseError) {
            channel.appendLine(`Error Type: ${error.name}`);
            channel.appendLine(`Code: ${error.code}`);
            channel.appendLine(`Category: ${error.category}`);
            channel.appendLine(`Message: ${error.message}`);
            channel.appendLine(`User Message: ${error.userMessage}`);
            channel.appendLine(`Recoverable: ${error.recoverable}`);
            channel.appendLine(`Retryable: ${error.retryable}`);
            if (error.helpLink) {
                channel.appendLine(`Help Link: ${error.helpLink}`);
            }
            if (error.context) {
                channel.appendLine(`Context: ${JSON.stringify(error.context, null, 2)}`);
            }
            if (error.stack) {
                channel.appendLine(`\nStack Trace:\n${error.stack}`);
            }
        } else if ('code' in error) {
            const legacyError = error as TeamXRayError;
            channel.appendLine(`Code: ${legacyError.code}`);
            channel.appendLine(`Message: ${legacyError.message}`);
            channel.appendLine(`User Message: ${legacyError.userMessage}`);
            channel.appendLine(`Recoverable: ${legacyError.recoverable}`);
            if (legacyError.context) {
                channel.appendLine(`Context: ${JSON.stringify(legacyError.context, null, 2)}`);
            }
        } else if (error instanceof Error) {
            channel.appendLine(`Error Type: ${error.name}`);
            channel.appendLine(`Message: ${error.message}`);
            if (error.stack) {
                channel.appendLine(`\nStack Trace:\n${error.stack}`);
            }
        }

        channel.appendLine('='.repeat(60));
    }

    /**
     * Records telemetry event if enabled
     */
    private static recordTelemetry(
        error: TeamXRayBaseError,
        retryCount?: number,
        success?: boolean
    ): void {
        if (!ErrorHandler.telemetryEnabled) {
            return;
        }

        ErrorHandler.telemetryEvents.push({
            errorCode: error.code,
            category: error.category,
            timestamp: error.timestamp,
            recoverable: error.recoverable,
            retryCount,
            success
        });

        // Limit telemetry storage to prevent memory issues
        if (ErrorHandler.telemetryEvents.length > 100) {
            ErrorHandler.telemetryEvents = ErrorHandler.telemetryEvents.slice(-50);
        }
    }

    /**
     * Handles and displays errors appropriately with contextual help
     */
    static handleError(error: TeamXRayBaseError | TeamXRayError | Error | string): void {
        // Convert string to error
        if (typeof error === 'string') {
            error = new ValidationError(error);
        }

        // Log detailed diagnostics
        ErrorHandler.logDiagnostics(error);

        // Get display info
        let userMessage: string;
        let recoverable: boolean;
        let helpLink: string | undefined;

        if (error instanceof TeamXRayBaseError) {
            userMessage = error.userMessage;
            recoverable = error.recoverable;
            helpLink = error.helpLink;
            ErrorHandler.recordTelemetry(error);
        } else if ('code' in error && 'userMessage' in error) {
            const legacyError = error as TeamXRayError;
            userMessage = legacyError.userMessage;
            recoverable = legacyError.recoverable;
        } else {
            userMessage = 'An unexpected error occurred. Please try again.';
            recoverable = false;
        }

        // Build action buttons
        const buttons: string[] = [];
        if (recoverable) {
            buttons.push('Retry');
        }
        if (helpLink) {
            buttons.push('Get Help');
        }
        buttons.push('Show Logs');

        // Show message
        const showMessage = recoverable 
            ? vscode.window.showWarningMessage 
            : vscode.window.showErrorMessage;

        showMessage(userMessage, ...buttons).then(choice => {
            if (choice === 'Show Logs' && ErrorHandler.outputChannel) {
                ErrorHandler.outputChannel.show();
            } else if (choice === 'Get Help' && helpLink) {
                vscode.env.openExternal(vscode.Uri.parse(helpLink));
            }
        });
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
            // Convert to appropriate error type if needed
            let handledError: TeamXRayBaseError;
            
            if (error instanceof TeamXRayBaseError) {
                handledError = error;
            } else if (error instanceof Error) {
                handledError = ErrorHandler.classifyError(error, errorContext);
            } else {
                handledError = new ValidationError(String(error), {
                    context: { operation: errorContext }
                });
            }

            ErrorHandler.handleError(handledError);
            return null;
        }
    }

    /**
     * Wraps async operations with retry logic for transient failures
     */
    static async withRetry<T>(
        operation: () => Promise<T>,
        errorContext: string,
        options: Partial<RetryOptions> = {}
    ): Promise<T> {
        const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                const result = await operation();
                
                // Record successful retry in telemetry
                if (attempt > 1 && lastError instanceof TeamXRayBaseError) {
                    ErrorHandler.recordTelemetry(lastError, attempt - 1, true);
                }
                
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                // Log retry attempt
                if (ErrorHandler.outputChannel) {
                    ErrorHandler.outputChannel.appendLine(
                        `[Retry ${attempt}/${config.maxRetries}] ${errorContext}: ${lastError.message}`
                    );
                }

                // Check if we should retry
                if (attempt < config.maxRetries && config.shouldRetry?.(lastError, attempt)) {
                    // Calculate delay with exponential backoff and jitter
                    const delay = Math.min(
                        config.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
                        config.maxDelayMs
                    );
                    
                    if (ErrorHandler.outputChannel) {
                        ErrorHandler.outputChannel.appendLine(
                            `Waiting ${Math.round(delay)}ms before retry...`
                        );
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    // No more retries, throw the error
                    break;
                }
            }
        }

        // Record failed retry in telemetry
        if (lastError instanceof TeamXRayBaseError) {
            ErrorHandler.recordTelemetry(lastError, config.maxRetries, false);
        }

        throw lastError;
    }

    /**
     * Classifies a generic error into the appropriate error type
     */
    static classifyError(error: Error, context?: string): TeamXRayBaseError {
        const message = error.message.toLowerCase();
        const errorContext = context ? { operation: context } : undefined;

        // Network errors
        if (
            message.includes('econnrefused') ||
            message.includes('enotfound') ||
            message.includes('etimedout') ||
            message.includes('network') ||
            message.includes('fetch failed')
        ) {
            return new NetworkError(error.message, { cause: error, context: errorContext });
        }

        // Authentication errors
        if (
            message.includes('401') ||
            message.includes('unauthorized') ||
            message.includes('authentication') ||
            message.includes('token') ||
            message.includes('forbidden') ||
            message.includes('403')
        ) {
            return new AuthenticationError(error.message, { cause: error, context: errorContext });
        }

        // Rate limiting
        if (
            message.includes('rate limit') ||
            message.includes('429') ||
            message.includes('too many requests')
        ) {
            return new RateLimitError(error.message, { context: errorContext });
        }

        // Repository errors
        if (
            message.includes('repository') ||
            message.includes('not found') ||
            message.includes('404')
        ) {
            return new RepositoryError(error.message, { cause: error, context: errorContext });
        }

        // MCP errors
        if (
            message.includes('mcp') ||
            message.includes('docker') ||
            message.includes('container')
        ) {
            return new MCPServiceError(error.message, { cause: error, context: errorContext });
        }

        // AI service errors
        if (
            message.includes('models.github') ||
            message.includes('openai') ||
            message.includes('gpt') ||
            message.includes('inference')
        ) {
            return new AIServiceError(error.message, { cause: error, context: errorContext });
        }

        // Default to validation error
        return new ValidationError(error.message, { context: errorContext });
    }

    /**
     * Creates specific error types for common scenarios (legacy support)
     */
    static createTokenError(message: string = 'Invalid or missing GitHub token'): TeamXRayError {
        return new AuthenticationError(message).toLegacyError();
    }

    static createNetworkError(message: string = 'Network request failed'): TeamXRayError {
        return new NetworkError(message).toLegacyError();
    }

    static createRepositoryError(message: string = 'Repository not found'): TeamXRayError {
        return new RepositoryError(message).toLegacyError();
    }

    static createValidationError(message: string): TeamXRayError {
        return new ValidationError(message).toLegacyError();
    }

    /**
     * Creates a rate limit error with optional reset time
     */
    static createRateLimitError(
        message: string = 'API rate limit exceeded',
        resetTime?: Date
    ): TeamXRayError {
        return new RateLimitError(message, { resetTime }).toLegacyError();
    }

    /**
     * Creates an MCP service error
     */
    static createMCPServiceError(message: string = 'MCP service unavailable'): TeamXRayError {
        return new MCPServiceError(message).toLegacyError();
    }

    /**
     * Creates an AI service error
     */
    static createAIServiceError(
        message: string = 'AI analysis failed',
        statusCode?: number
    ): TeamXRayError {
        return new AIServiceError(message, { statusCode }).toLegacyError();
    }
}