import * as vscode from 'vscode';
import axios from 'axios';
import { ValidationResult, TokenValidationResult, GitHubUser, GitHubRepository } from '../types/expert';
import { ErrorHandler } from './error-handler';

/**
 * Input validation utilities for the Team X-Ray extension
 */
export class Validator {
    /**
     * Validates a GitHub token format and permissions
     */
    static async validateGitHubToken(token: string): Promise<TokenValidationResult> {
        const result: TokenValidationResult = {
            isValid: false,
            errors: [],
            warnings: [],
            hasRepoAccess: false,
            hasUserAccess: false,
            rateLimitRemaining: 0
        };

        // Basic format validation
        if (!token) {
            result.errors.push('Token is required');
            return result;
        }

        if (token.length < 40) {
            result.errors.push('Token appears to be too short');
            return result;
        }

        if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
            result.warnings.push('Token format may be incorrect (should start with ghp_ or github_pat_)');
        }

        // Test token with GitHub API
        try {
            const userResponse = await axios.get<GitHubUser>('https://api.github.com/user', {
                headers: { 
                    'Authorization': `token ${token}`,
                    'User-Agent': 'Team-X-Ray-Extension'
                },
                timeout: 10000
            });

            if (userResponse.status === 200) {
                result.hasUserAccess = true;
                result.rateLimitRemaining = parseInt(userResponse.headers['x-ratelimit-remaining'] || '0');
                
                // Check if user has a valid email
                if (!userResponse.data.email) {
                    result.warnings.push('GitHub user email is not public. This may limit some features.');
                }
            }

            // Test repository access by trying to list user repos
            const repoResponse = await axios.get<GitHubRepository[]>('https://api.github.com/user/repos', {
                headers: { 
                    'Authorization': `token ${token}`,
                    'User-Agent': 'Team-X-Ray-Extension'
                },
                params: { per_page: 1 },
                timeout: 10000
            });

            if (repoResponse.status === 200) {
                result.hasRepoAccess = true;
            }

            result.isValid = result.hasUserAccess && result.hasRepoAccess;

            if (!result.hasRepoAccess) {
                result.errors.push('Token does not have repository access permissions');
            }

        } catch (error: any) {
            if (error.response) {
                if (error.response.status === 401) {
                    result.errors.push('Invalid token or token has expired');
                } else if (error.response.status === 403) {
                    result.errors.push('Token has insufficient permissions or rate limit exceeded');
                } else if (error.response.status === 404) {
                    result.errors.push('GitHub API endpoint not found');
                } else {
                    result.errors.push(`GitHub API error: ${error.response.status || 'Unknown'}`);
                }
            } else {
                result.errors.push('Network error while validating token');
            }
        }

        return result;
    }

    /**
     * Validates a file path
     */
    static validateFilePath(filePath: string): ValidationResult {
        const result: ValidationResult = {
            isValid: false,
            errors: [],
            warnings: []
        };

        if (!filePath) {
            result.errors.push('File path is required');
            return result;
        }

        if (!filePath.trim()) {
            result.errors.push('File path cannot be empty');
            return result;
        }

        // Check for potentially dangerous paths
        if (filePath.includes('..')) {
            result.errors.push('File path cannot contain ".." for security reasons');
            return result;
        }

        // Check if file exists
        try {
            const uri = vscode.Uri.file(filePath);
            vscode.workspace.fs.stat(uri);
            result.isValid = true;
        } catch (error) {
            result.errors.push('File does not exist or is not accessible');
        }

        return result;
    }

    /**
     * Validates email format
     */
    static validateEmail(email: string): ValidationResult {
        const result: ValidationResult = {
            isValid: false,
            errors: [],
            warnings: []
        };

        if (!email) {
            result.errors.push('Email is required');
            return result;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            result.errors.push('Invalid email format');
            return result;
        }

        result.isValid = true;
        return result;
    }

    /**
     * Validates repository name/URL
     */
    static validateRepository(repository: string): ValidationResult {
        const result: ValidationResult = {
            isValid: false,
            errors: [],
            warnings: []
        };

        if (!repository) {
            result.errors.push('Repository name is required');
            return result;
        }

        // Check for GitHub URL format
        const githubUrlRegex = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?$/;
        const githubNameRegex = /^([^\/]+)\/([^\/]+)$/;

        if (githubUrlRegex.test(repository) || githubNameRegex.test(repository)) {
            result.isValid = true;
        } else {
            result.errors.push('Repository must be in format "owner/repo" or a valid GitHub URL');
        }

        return result;
    }

    /**
     * Validates a numeric value within a range
     */
    static validateNumericRange(value: number, min: number, max: number, fieldName: string): ValidationResult {
        const result: ValidationResult = {
            isValid: false,
            errors: [],
            warnings: []
        };

        if (isNaN(value)) {
            result.errors.push(`${fieldName} must be a valid number`);
            return result;
        }

        if (value < min || value > max) {
            result.errors.push(`${fieldName} must be between ${min} and ${max}`);
            return result;
        }

        result.isValid = true;
        return result;
    }

    /**
     * Validates input against potential command injection
     */
    static validateShellInput(input: string): ValidationResult {
        const result: ValidationResult = {
            isValid: false,
            errors: [],
            warnings: []
        };

        if (!input) {
            result.errors.push('Input is required');
            return result;
        }

        // Check for dangerous characters
        const dangerousChars = ['&', '|', ';', '`', '$', '(', ')', '<', '>', '\\n', '\\r'];
        const foundDangerous = dangerousChars.filter(char => input.includes(char));

        if (foundDangerous.length > 0) {
            result.errors.push(`Input contains potentially dangerous characters: ${foundDangerous.join(', ')}`);
            return result;
        }

        result.isValid = true;
        return result;
    }

    /**
     * Sanitizes input for shell commands
     */
    static sanitizeShellInput(input: string): string {
        return input.replace(/[&|;`$()><\n\r]/g, '');
    }

    /**
     * Validates API response structure
     */
    static validateApiResponse<T>(response: any, requiredFields: string[]): ValidationResult {
        const result: ValidationResult = {
            isValid: false,
            errors: [],
            warnings: []
        };

        if (!response) {
            result.errors.push('Response is null or undefined');
            return result;
        }

        if (typeof response !== 'object') {
            result.errors.push('Response must be an object');
            return result;
        }

        const missingFields = requiredFields.filter(field => 
            !response.hasOwnProperty(field) || response[field] === null || response[field] === undefined
        );

        if (missingFields.length > 0) {
            result.errors.push(`Missing required fields: ${missingFields.join(', ')}`);
            return result;
        }

        result.isValid = true;
        return result;
    }
}