import * as vscode from 'vscode';

export class TokenManager {
    private static readonly TOKEN_KEY = 'github_token';
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    
    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }
    
    /**
     * Securely stores the GitHub token and sets environment variable
     */
    async setToken(token: string): Promise<void> {
        try {
            // Store only in secure secret storage
            await this.context.secrets.store(TokenManager.TOKEN_KEY, token);
            
            // Set environment variable for immediate use
            process.env.GITHUB_TOKEN = token;
            
            this.outputChannel.appendLine('✅ GitHub token saved securely');
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error saving GitHub token: ${error}`);
            throw new Error('Failed to save GitHub token');
        }
    }
    
    /**
     * Retrieves the GitHub token and ensures environment variable is set
     * This token is used for both GitHub API and GitHub Models API
     */
    async getToken(): Promise<string | undefined> {
        try {
            const token = await this.context.secrets.get(TokenManager.TOKEN_KEY);
            
            if (token && !process.env.GITHUB_TOKEN) {
                process.env.GITHUB_TOKEN = token;
            }
            
            return token;
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error retrieving GitHub token: ${error}`);
            return undefined;
        }
    }
    
    /**
     * Ensures a token exists, prompting the user if needed
     */
    async ensureToken(message: string = 'GitHub token required'): Promise<string | undefined> {
        const token = await this.getToken();
        if (token) {
            return token;
        }
        
        return this.promptForToken(message);
    }
    
    /**
     * Checks if token exists and is valid
     */
    async hasValidToken(): Promise<boolean> {
        const token = await this.getToken();
        return !!token && token.length > 10;
    }
    
    /**
     * Securely logs a command that contains the token by masking it
     */
    logCommandWithToken(command: string): void {
        const token = process.env.GITHUB_TOKEN;
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
            ignoreFocusOut: true
        });
        
        if (newToken) {
            await this.setToken(newToken);
            return newToken;
        }
        
        return undefined;
    }
    
    /**
     * Clears the stored token
     */
    async clearToken(): Promise<void> {
        await this.context.secrets.delete(TokenManager.TOKEN_KEY);
        delete process.env.GITHUB_TOKEN;
        this.outputChannel.appendLine('GitHub token cleared');
    }
}