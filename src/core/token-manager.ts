import * as vscode from 'vscode';
import { TokenValidationResult } from '../types/expert';
import { Validator } from '../utils/validation';
import { ErrorHandler } from '../utils/error-handler';

export class TokenManager {
    private static readonly TOKEN_KEY = 'github_token';
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private cachedToken: string | null = null;
    private tokenValidationCache: Map<string, { result: TokenValidationResult; timestamp: number }> = new Map();
    private readonly VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }
    
    /**
     * Securely stores the GitHub token after validation
     */
    async setToken(token: string): Promise<void> {
        try {
            // Validate token format first
            const validation = await this.validateToken(token);
            if (!validation.isValid) {
                const error = ErrorHandler.createTokenError(
                    `Invalid token: ${validation.errors.join(', ')}`
                );
                throw error;
            }

            // Store only in secure secret storage
            await this.context.secrets.store(TokenManager.TOKEN_KEY, token);
            
            // Cache the token for this session (not in process.env for security)
            this.cachedToken = token;
            
            // Cache validation result
            this.tokenValidationCache.set(token, {
                result: validation,
                timestamp: Date.now()
            });
            
            this.outputChannel.appendLine('✅ GitHub token saved securely');
            
            // Show validation warnings if any
            if (validation.warnings.length > 0) {
                vscode.window.showWarningMessage(
                    `Token saved but: ${validation.warnings.join(', ')}`
                );
            }
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error saving GitHub token: ${error}`);
            if (error instanceof Error && 'code' in error) {
                throw error;
            } else {
                throw ErrorHandler.createTokenError('Failed to save GitHub token');
            }
        }
    }
    
    /**
     * Retrieves the GitHub token securely
     */
    async getToken(): Promise<string | undefined> {
        try {
            // Return cached token if available
            if (this.cachedToken) {
                return this.cachedToken;
            }

            // Retrieve from secure storage
            const token = await this.context.secrets.get(TokenManager.TOKEN_KEY);
            
            if (token) {
                this.cachedToken = token;
            }
            
            return token;
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error retrieving GitHub token: ${error}`);
            ErrorHandler.handleError(ErrorHandler.createTokenError('Failed to retrieve GitHub token'));
            return undefined;
        }
    }
    
    /**
     * Ensures a token exists, prompting the user if needed
     */
    async ensureToken(message: string = 'GitHub token required'): Promise<string | undefined> {
        const token = await this.getToken();
        if (token && await this.isTokenValid(token)) {
            return token;
        }
        
        return this.promptForToken(message);
    }
    
    /**
     * Checks if token exists and is valid with caching
     */
    async hasValidToken(): Promise<boolean> {
        const token = await this.getToken();
        if (!token) {
            return false;
        }
        
        return await this.isTokenValid(token);
    }
    
    /**
     * Validates token with GitHub API and caching
     */
    private async isTokenValid(token: string): Promise<boolean> {
        // Check cache first
        const cached = this.tokenValidationCache.get(token);
        if (cached && (Date.now() - cached.timestamp) < this.VALIDATION_CACHE_TTL) {
            return cached.result.isValid;
        }
        
        try {
            const validation = await this.validateToken(token);
            
            // Update cache
            this.tokenValidationCache.set(token, {
                result: validation,
                timestamp: Date.now()
            });
            
            return validation.isValid;
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error validating token: ${error}`);
            return false;
        }
    }
    
    /**
     * Validates token with GitHub API
     */
    private async validateToken(token: string): Promise<TokenValidationResult> {
        return await Validator.validateGitHubToken(token);
    }
    
    /**
     * Gets token for use in headers (never logs the actual token)
     */
    async getTokenForHeaders(): Promise<string | undefined> {
        const token = await this.getToken();
        if (token) {
            this.outputChannel.appendLine('Using GitHub token for API request');
        }
        return token;
    }
    
    /**
     * Securely logs a command that contains the token by masking it
     */
    logCommandWithToken(command: string): void {
        const token = this.cachedToken;
        if (token && command.includes(token)) {
            const maskedCommand = command.replace(token, '[GITHUB_TOKEN]');
            this.outputChannel.appendLine(`Running: ${maskedCommand}`);
        } else {
            this.outputChannel.appendLine(`Running: ${command}`);
        }
    }
    
    /**
     * Prompts user to set GitHub token if not already set
     */
    async promptForToken(message: string = 'GitHub token required'): Promise<string | undefined> {
        const newToken = await vscode.window.showInputBox({
            prompt: `${message} - Enter your GitHub token with repo and user permissions`,
            password: true,
            ignoreFocusOut: true,
            validateInput: (value: string) => {
                if (!value) {
                    return 'Token is required';
                }
                if (value.length < 40) {
                    return 'Token appears to be too short';
                }
                return undefined;
            }
        });
        
        if (newToken) {
            try {
                await this.setToken(newToken);
                return newToken;
            } catch (error) {
                // Error is already handled in setToken
                return undefined;
            }
        }
        
        return undefined;
    }
    
    /**
     * Gets token validation information for display
     */
    async getTokenValidationInfo(): Promise<TokenValidationResult | null> {
        const token = await this.getToken();
        if (!token) {
            return null;
        }
        
        const cached = this.tokenValidationCache.get(token);
        if (cached && (Date.now() - cached.timestamp) < this.VALIDATION_CACHE_TTL) {
            return cached.result;
        }
        
        try {
            return await this.validateToken(token);
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Clears the stored token and cache
     */
    async clearToken(): Promise<void> {
        try {
            await this.context.secrets.delete(TokenManager.TOKEN_KEY);
            this.cachedToken = null;
            this.tokenValidationCache.clear();
            this.outputChannel.appendLine('GitHub token cleared');
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error clearing token: ${error}`);
            throw ErrorHandler.createTokenError('Failed to clear GitHub token');
        }
    }
    
    /**
     * Refreshes token validation cache
     */
    async refreshTokenValidation(): Promise<void> {
        const token = await this.getToken();
        if (token) {
            this.tokenValidationCache.delete(token);
            await this.isTokenValid(token);
        }
    }
}