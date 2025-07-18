import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';
import { TokenManager } from './token-manager';
import { ExpertiseAnalyzer, ExpertiseAnalysis } from './expertise-analyzer';
import { Expert } from '../types/expert';

export interface GitHubRepository {
    owner: string;
    repo: string;
}

export interface GitHubContributor { // Ensure this interface is defined here or correctly imported if it's elsewhere
    name: string;
    email: string;
    contributions: number;
    lastCommit: Date;
    recentCommits: string[];
}

export interface MCPServerStatus {
    isAvailable: boolean;
    containerName?: string;
    containerStatus?: string;
    error?: string;
}

//Service that integrates with VS Code's Copilot Chat and GitHub MCP Server
//to gather repository data for team expertise analysis

export class CopilotMCPService {
    private outputChannel: vscode.OutputChannel;
    private tokenManager: TokenManager;

    constructor(outputChannel: vscode.OutputChannel, tokenManager: TokenManager) {
        this.outputChannel = outputChannel;
        this.tokenManager = tokenManager;
    }

    //Check the status of GitHub MCP Server containers
  
    async checkMCPServerStatus(): Promise<MCPServerStatus> {
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);

            // List running GitHub MCP server containers
            const { stdout } = await execAsync(
                'docker ps --format "table {{.Names}}\\t{{.Status}}" --filter "ancestor=ghcr.io/github/github-mcp-server"'
            );

            this.outputChannel.appendLine(`Docker containers check:\n${stdout}`);

            const lines = stdout.split('\n').filter((line: string) => line.trim() && !line.startsWith('NAMES'));
            
            if (lines.length > 0) {
                const parts = lines[0].split('\t');
                const containerName = parts[0] || '';
                const status = parts[1] || 'Unknown status';
                this.outputChannel.appendLine(`Found MCP server: ${containerName} (${status})`);
                
                return {
                    isAvailable: true,
                    containerName: containerName.trim(),
                    containerStatus: status.trim()
                };
            } else {
                this.outputChannel.appendLine('No GitHub MCP server containers found running');
                return {
                    isAvailable: false,
                    error: 'No GitHub MCP server containers are running'
                };
            }

        } catch (error) {
            this.outputChannel.appendLine(`Error checking MCP server status: ${error}`);
            return {
                isAvailable: false,
                error: `Failed to check Docker containers: ${error}`
            };
        } // This closes the catch block
    } // This closes the checkMCPServerStatus method

    //Ensure GitHub MCP server is running
  
    async ensureMCPServerRunning(): Promise<MCPServerStatus> {
        const status = await this.checkMCPServerStatus();
        
        if (status.isAvailable) {
            return status;
        }

        // Try to start a new container if none are running
        try {
            this.outputChannel.appendLine('Attempting to start GitHub MCP server...');
            
            const choice = await vscode.window.showInformationMessage(
                'GitHub MCP server is not running. Would you like to start it?',
                'Start MCP Server',
                'Use Fallback Method'
            );

            if (choice === 'Start MCP Server') {
                // Detect if we're in Extension Development Host
                const isDebugging = vscode.env.appName.includes('Extension Development Host');
                const message = isDebugging 
                    ? '🔧 You\'re debugging an extension! MCP server runs in your main VS Code window, not the debug instance. The extension will use fallback methods during debugging.'
                    : 'Please restart VS Code to initialize the GitHub MCP server via .vscode/mcp.json configuration.';
                    
                vscode.window.showInformationMessage(message);
            }

            return {
                isAvailable: false,
                error: 'User needs to restart VS Code for MCP initialization'
            };

        } catch (error) {
            this.outputChannel.appendLine(`Failed to start MCP server: ${error}`);
            return {
                isAvailable: false,
                error: `Failed to start MCP server: ${error}`
            };
        }
    }

    
    //Detect GitHub repository information from the current workspace
     
    async detectRepository(): Promise<GitHubRepository | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder open');
            }

            // Try to parse git remote to get owner/repo
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);

            const { stdout } = await execAsync('git config --get remote.origin.url', {
                cwd: workspaceFolder.uri.fsPath
            });

            const remoteUrl = stdout.trim();
            this.outputChannel.appendLine(`Git remote URL: ${remoteUrl}`);

            // Parse GitHub URL (supports both HTTPS and SSH)
            const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
            if (githubMatch) {
                const [, owner, repo] = githubMatch;
                this.outputChannel.appendLine(`Detected GitHub repo: ${owner}/${repo}`);
                return { owner, repo };
            }

            return null;
        } catch (error) {
            this.outputChannel.appendLine(`Failed to detect repository: ${error}`);
            return null;
        }
    }

    /**
     * Use Copilot Chat with MCP to gather comprehensive repository data
     */
    async gatherRepositoryData(repository: GitHubRepository): Promise<any> {
        try {
            this.outputChannel.appendLine(`Gathering repository data for ${repository.owner}/${repository.repo} via Copilot Chat + MCP...`);

            // Always try MCP first - even in debug mode
            const prompt = this.buildMCPDataGatheringPrompt(repository);
            
            // Check MCP server status for user information (but don't block on it)
            const mcpStatus = await this.checkMCPServerStatus();
            this.outputChannel.appendLine(`MCP Server Check: ${mcpStatus.isAvailable ? 'Available' : 'Not detected'}`);
            
            if (mcpStatus.containerName) {
                this.outputChannel.appendLine(`Using container: ${mcpStatus.containerName} (${mcpStatus.containerStatus})`);
            }

            // Try Copilot Chat with MCP regardless of container detection
            // The user might have MCP configured differently or in the main VS Code instance
            const chatResponse = await this.queryCopilotWithMCP(prompt, mcpStatus);
            
            if (chatResponse === 'user_chose_mcp') {
                // User chose to use MCP manually - don't run fallback automatically
                this.outputChannel.appendLine('User chose to use MCP manually - skipping automatic fallback');
                throw new Error('User opted for manual MCP usage - analysis paused');
            } else if (chatResponse) {
                this.outputChannel.appendLine('Successfully gathered repository data via Copilot + MCP');
                return this.parseRepositoryResponse(chatResponse, repository);
            } else {
                // Only use fallback if user explicitly chooses it or Copilot Chat is unavailable
                this.outputChannel.appendLine('Using local git analysis as requested or Copilot unavailable');
                return await this.fallbackLocalAnalysis(repository);
            }

        } catch (error) {
            this.outputChannel.appendLine(`Error gathering repository data: ${error}`);
            return await this.fallbackLocalAnalysis(repository);
        }
    }

    //Build a prompt for Copilot Chat to gather data using MCP GitHub tools
 
    private buildMCPDataGatheringPrompt(repository: GitHubRepository): string {
        return `Call mcp_github_list_commits with owner: "${repository.owner}", repo: "${repository.repo}", perPage: 10

After you get the commits data, immediately respond with this JSON format (fill in real data):
{
  "commits": [{"sha": "actual_sha", "author": {"name": "actual_name", "email": "actual_email", "date": "actual_date"}, "message": "actual_message"}],
  "contributors": [{"name": "contributor_name", "email": "email", "totalCommits": 1}],
  "issues": [],
  "pullRequests": [],
  "collaborationInsights": ["Commit analysis complete"]
}

Just call the tool and format the response. Don't explain anything else.`;
    }

    /**
     * Query Copilot Chat with MCP integration
     */
    private async queryCopilotWithMCP(prompt: string, mcpStatus?: MCPServerStatus, skipPrompt: boolean = false): Promise<string | null> {
        try {
            // Check if Copilot Chat is available
            const copilotExtension = vscode.extensions.getExtension('GitHub.copilot-chat');
            if (!copilotExtension) {
                this.outputChannel.appendLine('GitHub Copilot Chat extension not found');
                return null;
            }

            // Use provided status or check again
            const status = mcpStatus || await this.checkMCPServerStatus();
            
            // Skip the prompt if requested
            if (skipPrompt) {
                // Proceed with local git analysis instead
                this.outputChannel.appendLine('Skipping MCP prompt and performing direct git analysis for file');
                
                // Extract file path from the prompt
                const filePathMatch = prompt.match(/path: "([^"]+)"/);
                const filePath = filePathMatch ? filePathMatch[1] : null;
                
                if (!filePath) {
                    this.outputChannel.appendLine('Could not extract file path from prompt');
                    return null;
                }
                
                // Get workspace path
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    this.outputChannel.appendLine('No workspace folders found');
                    return null;
                }
                
                // Convert relative path to absolute path
                const absolutePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
                
                return await this.performDirectFileAnalysis(absolutePath); // This method needs to be implemented
            }

            // MCP Server is available or not confirmed
            let statusMessage = status.isAvailable ? 
                `✅ GitHub MCP Server is running (${status.containerName})` : 
                `⚠️ GitHub MCP Server not detected. Checking main VS Code instance...`;
            
            this.outputChannel.appendLine(`MCP Server Status: ${statusMessage}`);

            // Enhanced user experience with better options
            const choice = await vscode.window.showInformationMessage(
                `${statusMessage}\n\nChoose how to analyze the repository:`,
                {
                    title: '🤖 Use MCP + Copilot',
                    detail: 'Open Copilot Chat with MCP tools for comprehensive analysis'
                },
                {
                    title: '⚡ Quick Analysis',
                    detail: 'Use local git data for faster results without MCP'
                }
            );

            if (choice && choice.title === '🤖 Use MCP + Copilot') {
                // Open Copilot Chat with the prepared prompt
                this.outputChannel.appendLine('Opening Copilot Chat with MCP tools...');
                
                // Execute the command to open Copilot Chat
                await vscode.commands.executeCommand('github.copilot.interactiveEditor.explain', prompt);
                
                // Wait for user to interact with Copilot Chat
                const userResponse = await vscode.window.showInformationMessage(
                    'After receiving the analysis from Copilot Chat, click "Done" to continue.',
                    'Done',
                    'Cancel'
                );
                
                if (userResponse === 'Done') {
                    // User indicates they've received the analysis
                    this.outputChannel.appendLine('User confirmed analysis completion via Copilot Chat');
                    
                    // Use the last command from VS Code's internal clipboard as a fallback
                    // This isn't perfect but helps bridge the gap
                    return "Analysis completed via Copilot Chat. Please check the chat panel for details.";
                } else {
                    this.outputChannel.appendLine('User cancelled Copilot Chat analysis');
                    return null;
                }
            } else if (choice && choice.title === '⚡ Quick Analysis') {
                // Extract file path for local analysis
                const filePathMatch = prompt.match(/path: "([^"]+)"/);
                const filePath = filePathMatch ? filePathMatch[1] : null;
                
                if (!filePath) {
                    this.outputChannel.appendLine('Could not extract file path for local analysis');
                    return null;
                }
                
                // Get workspace path
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    this.outputChannel.appendLine('No workspace folders found');
                    return null;
                }
                
                // Convert relative path to absolute path
                const absolutePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
                
                // Perform local git analysis
                this.outputChannel.appendLine(`Performing quick analysis for: ${absolutePath}`);
                return await this.performDirectFileAnalysis(absolutePath); // This method needs to be implemented
            } else {
                // User cancelled
                this.outputChannel.appendLine('User cancelled the analysis');
                return null;
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error in queryCopilotWithMCP: ${error}`);
            return null;
        }
    }

    /**
     * Create an enhanced prompt specifically designed for MCP usage
     */
    private createEnhancedMCPPrompt(basePrompt: string): string {
        // Extract repository info from the base prompt
        const repoMatch = basePrompt.match(/(\w+\/\w+)/);
        const repoPath = repoMatch ? repoMatch[1] : 'owner/repo';
        const [owner, repo] = repoPath.split('/');

        return `Call mcp_github_list_commits with owner: "${owner}", repo: "${repo}", perPage: 5

Then respond with JSON format:
{
  "commits": [{"sha": "...", "author": {"name": "...", "email": "...", "date": "..."}, "message": "..."}],
  "contributors": [{"name": "...", "email": "...", "totalCommits": 0}],
  "issues": [],
  "pullRequests": [],
  "collaborationInsights": ["Analysis complete"]
}

Execute now.`;
    }

    /**
     * Parse repository response from Copilot Chat
     */
    private parseRepositoryResponse(response: string, repository: GitHubRepository): any {
        try {
            // Try to parse JSON response from Copilot
            const data = JSON.parse(response);
            
            return {
                repository: `${repository.owner}/${repository.repo}`,
                files: data.files || [],
                commits: data.commits || [],
                contributors: this.processContributors(data.contributors || []),
                collaborationData: {
                    issues: data.issues || [],
                    pullRequests: data.pullRequests || [],
                    insights: data.collaborationInsights || []
                }
            };
        } catch (error) {
            this.outputChannel.appendLine(`Failed to parse Copilot response: ${error}`);
            throw error;
        }
    }

    /**
     * Process contributors from MCP data
     */
    private processContributors(rawContributors: any[]): GitHubContributor[] {
        return rawContributors.map(contributor => ({
            name: contributor.name || 'Unknown',
            email: contributor.email || 'unknown@example.com',
            contributions: contributor.totalCommits || 0,
            lastCommit: contributor.lastCommit ? new Date(contributor.lastCommit) : new Date(),
            recentCommits: contributor.recentCommits || []
        }));
    }

    /**
     * Fallback to local git analysis when MCP is not available
     */
    private async fallbackLocalAnalysis(repository: GitHubRepository): Promise<any> {
        try {
            this.outputChannel.appendLine('Using fallback local git analysis...');

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder available for fallback analysis');
            }

            const commits = await this.getLocalCommits(workspaceFolder.uri.fsPath);
            const contributors = this.extractContributorsFromCommits(commits);
            const files = await this.getWorkspaceFiles(workspaceFolder.uri.fsPath);

            return {
                repository: `${repository.owner}/${repository.repo}`,
                files,
                commits,
                contributors,
                collaborationData: {
                    issues: [],
                    pullRequests: [],
                    insights: ['Data gathered from local git history only']
                }
            };

        } catch (error) {
            this.outputChannel.appendLine(`Fallback analysis failed: ${error}`);
            throw error;
        }
    }

    /**
     * Get commits from local git repository
     */
    private async getLocalCommits(repoPath: string): Promise<any[]> {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        try {
            const { stdout } = await execAsync('git log --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso -n 50', {
                cwd: repoPath
            });

            return stdout.split('\n')
                .filter((line: string) => line.trim())
                .map((line: string) => {
                    const [sha, author, email, date, message] = line.split('|');
                    return {
                        sha,
                        author: { name: author, email, date },
                        message,
                        files: [] // Would need additional git commands to get files per commit
                    };
                });
        } catch (error) {
            this.outputChannel.appendLine(`Error getting local commits: ${error}`);
            return [];
        }
    }

    /**
     * Extract contributors from commit data
     */
    private extractContributorsFromCommits(commits: any[]): GitHubContributor[] {
        const contributorMap = new Map<string, GitHubContributor>();

        commits.forEach(commit => {
            const email = commit.author.email;
            const name = commit.author.name;
            const commitDate = new Date(commit.author.date);

            if (contributorMap.has(email)) {
                const contributor = contributorMap.get(email)!;
                contributor.contributions++;
                contributor.recentCommits.push(commit.message);
                if (commitDate > contributor.lastCommit) {
                    contributor.lastCommit = commitDate;
                }
            } else {
                contributorMap.set(email, {
                    name,
                    email,
                    contributions: 1,
                    lastCommit: commitDate,
                    recentCommits: [commit.message]
                });
            }
        });

        return Array.from(contributorMap.values())
            .sort((a, b) => b.contributions - a.contributions);
    }

    /**
     * Get workspace files for analysis
     */
    private async getWorkspaceFiles(repoPath: string): Promise<string[]> {
        try {
            const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
            return files.map(file => vscode.workspace.asRelativePath(file));
        } catch (error) {
            this.outputChannel.appendLine(`Error getting workspace files: ${error}`);
            return [];
        }
    }

    /**
     * Analyze file-specific experts using Copilot Chat + MCP
     */
    async analyzeFileExperts(filePath: string, repository: GitHubRepository, skipPrompt: boolean = false): Promise<any[] | null> {
        try {
            this.outputChannel.appendLine(`Analyzing experts for file: ${filePath} in ${repository.owner}/${repository.repo}`);

            // Create a specific prompt for file expertise analysis
            const prompt = this.buildFileExpertisePrompt(filePath, repository);

            // Query Copilot Chat with MCP tools, passing the skipPrompt parameter
            const chatResponse = await this.queryCopilotWithMCP(prompt, undefined, skipPrompt);
            
            if (chatResponse) {
                this.outputChannel.appendLine('Successfully analyzed file experts');
                return this.parseFileExpertsResponse(chatResponse, filePath);
            }

            return null;
        } catch (error) {
            this.outputChannel.appendLine(`Error analyzing file experts: ${error}`);
            return null;
        }
    }

    /**
     * Build a prompt for analyzing file-specific expertise
     */
    private buildFileExpertisePrompt(filePath: string, repository: GitHubRepository): string {
        // Get the relative file path (remove the absolute workspace path)
        const relativePath = vscode.workspace.asRelativePath(filePath);
        
        return `Call mcp_github_list_commits with owner: "${repository.owner}", repo: "${repository.repo}", path: "${relativePath}", perPage: 30

Then respond with JSON format:
{
  "file": "${relativePath}",
  "experts": [
    {
      "name": "Contributor Name",
      "email": "email@example.com",
      "expertise": 85,
      "contributions": 25,
      "lastCommit": "2025-05-29T12:34:56Z",
      "specializations": ["TypeScript", "React"]
    }
  ],
  "totalCommits": 50,
  "lastModified": "2025-05-29T12:34:56Z"
}

Execute now.`;
    }

    /**
     * Parse the file experts response from Copilot Chat
     */
    private parseFileExpertsResponse(response: string, filePath: string): any[] {
        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed.fileExperts || [];
            }

            // If no JSON found, create a basic response
            this.outputChannel.appendLine('Could not parse structured response, creating basic experts list');
            return [
                {
                    name: 'Unknown Developer',
                    email: 'unknown@example.com',
                    expertise: 50,
                    contributions: 1,
                    lastCommit: new Date(),
                    specializations: this.inferSpecializationsFromFile(filePath),
                    communicationStyle: 'Analysis unavailable',
                    teamRole: 'Contributor',
                    hiddenStrengths: ['Code maintenance'],
                    idealChallenges: ['Bug fixes', 'Feature development']
                }
            ];
        } catch (error) {
            this.outputChannel.appendLine(`Error parsing file experts response: ${error}`);
            return [];
        }
    }

    /**
     * Infer specializations from file path and extension
     */
    private inferSpecializationsFromFile(filePath: string): string[] {
        const extension = path.extname(filePath).toLowerCase();
        // Basic mapping, can be expanded
        const map: { [key: string]: string } = {
            '.ts': 'TypeScript',
            '.js': 'JavaScript',
            '.py': 'Python',
            '.java': 'Java',
            '.cs': 'C#',
            '.go': 'Go',
            '.rs': 'Rust',
            '.rb': 'Ruby',
            '.php': 'PHP',
            '.html': 'HTML',
            '.css': 'CSS',
            '.scss': 'SCSS',
            '.md': 'Markdown',
        };
        return map[extension] ? [map[extension]] : ['General'];
    }

    // Placeholder for performDirectFileAnalysis
    private async performDirectFileAnalysis(filePath: string): Promise<string | null> {
        this.outputChannel.appendLine(`Placeholder: performDirectFileAnalysis called for ${filePath}`);
        // Implement actual local file analysis logic here (e.g., git blame, simple parsing)
        // For now, returns a dummy response or null
        // Example:
        // const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        // const commitHistory = await this.getLocalCommits(path.dirname(filePath)); // Simplified
        // return JSON.stringify({ file: filePath, experts: [{ name: "Local Expert", contributions: 5 }] });
        return null;
    }

    private async getExpertiseAnalysis(analyzer: ExpertiseAnalyzer): Promise<ExpertiseAnalysis | null> {
        const analysis = await analyzer.getLastAnalysis();
        if (!analysis) {
            this.outputChannel.appendLine('Error: No expertise analysis found. Please run an analysis first.');
            vscode.window.showErrorMessage('No expertise analysis found. Please run an analysis first.');
            return null;
        }
        return analysis;
    }

    // Placeholder for suggestExpertForIssueNumber
    // public async suggestExpertForIssueNumber(analyzer: ExpertiseAnalyzer): Promise<void> {
    //     this.outputChannel.appendLine('Suggesting expert for GitHub issue by number...');

    //     const issueNumberStr = await vscode.window.showInputBox({
    //         prompt: 'Enter the GitHub issue number',
    //         placeHolder: 'e.g., 42',
    //         validateInput: text => {
    //             return /^[1-9]\\\\d*$/.test(text) ? null : 'Please enter a valid issue number.';
    //         }
    //     });

    //     if (!issueNumberStr) {
    //         this.outputChannel.appendLine('Issue number input cancelled.');
    //         return;
    //     }
    //     const issueNumber = parseInt(issueNumberStr, 10);

    //     const githubToken = await this.tokenManager.getToken();
    //     if (!githubToken) {
    //         vscode.window.showErrorMessage('GitHub token not available. Please configure it first.');
    //         this.outputChannel.appendLine('GitHub token not available.');
    //         return;
    //     }

    //     const repoInfo = await this.detectRepository();
    //     if (!repoInfo) {
    //         vscode.window.showErrorMessage('Could not detect repository information.');
    //         this.outputChannel.appendLine('Repository detection failed.');
    //         return;
    //     }

    //     this.outputChannel.appendLine(`Fetching issue #${issueNumber} from ${repoInfo.owner}/${repoInfo.repo}`);
    //     let issueData;
    //     try {
    //         const response = await axios.get(
    //             `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${issueNumber}`,
    //             {
    //                 headers: {
    //                     Authorization: `token ${githubToken}`,
    //                     Accept: 'application/vnd.github.v3+json',
    //                 },
    //             }
    //         );
    //         issueData = this.extractIssueDataFromResponse(response.data);
    //     } catch (error: any) {
    //         this.outputChannel.appendLine(`Error fetching issue: ${error.message}`);
    //         vscode.window.showErrorMessage(`Failed to fetch issue #${issueNumber}: ${error.message}`);
    //         return;
    //     }

    //     if (!issueData) {
    //         this.outputChannel.appendLine('No data extracted from issue response.');
    //         return;
    //     }

    //     const analysis = await this.getExpertiseAnalysis(analyzer);
    //     if (!analysis || !analysis.expertProfiles || analysis.expertProfiles.length === 0) { // Changed to expertProfiles
    //         vscode.window.showInformationMessage('No expertise data available to suggest an expert. Please run repository analysis first.');
    //         this.outputChannel.appendLine('No expertise data for suggestion.');
    //         return;
    //     }

    //     const bestExpert = this.findBestExpertForIssue(issueData, analysis.expertProfiles, this.extractKeywords); // Changed to expertProfiles
    //     this.displayExpertForIssue(bestExpert, issueData, issueNumber);
    // }

    // Placeholder for suggestExpertForIssueDetails
    public async suggestExpertForIssueDetails(issueDetails: any, analyzer: ExpertiseAnalyzer): Promise<void> {
        this.outputChannel.appendLine(`Suggesting expert for issue (details provided): ${issueDetails.title}`);
        const analysis = await this.getExpertiseAnalysis(analyzer);
        if (!analysis || !analysis.expertProfiles || analysis.expertProfiles.length === 0) {
            vscode.window.showInformationMessage('No expertise data available. Please run repository analysis first.');
            this.outputChannel.appendLine('No expertise data for suggestion based on details.');
            return;
        }
        const bestExpert = this.findBestExpertForIssue(issueDetails, analysis.expertProfiles, this.extractKeywords);
        this.displayExpertForIssue(bestExpert, issueDetails);
        // vscode.window.showInformationMessage('suggestExpertForIssueDetails called. See logs.');
    }


    private extractIssueDataFromResponse(responseData: any): any {
        return {
            title: responseData.title,
            body: responseData.body,
            labels: responseData.labels?.map((label: any) => label.name) || [],
            number: responseData.number,
            url: responseData.html_url
        };
    }

    private findBestExpertForIssue(issueData: any, experts: Expert[], extractKeywords: (text: string) => string[]): Expert | null {
        if (!experts || experts.length === 0) return null;
        const issueKeywords = extractKeywords(`${issueData.title} ${issueData.body}`);
        let bestExpert: Expert | null = null;
        let bestScore = -1;
        for (const expert of experts) {
            const expertSkills = (expert.specializations || []).map(s => s.toLowerCase());
            const matchCount = issueKeywords.filter(k => expertSkills.includes(k)).length;
            if (matchCount > bestScore) {
                bestScore = matchCount;
                bestExpert = expert;
            }
        }
        return bestExpert;
    }

    /**
     * Extract keywords from text for expert matching
     */
    private extractKeywords(text: string): string[] {
        // Simple keyword extraction: split by non-alphanumeric characters, lowercase, and filter
        return text
            .split(/[\W_]+/)
            .map(kw => kw.toLowerCase())
            .filter(kw => kw.length > 2); // Minimum length 3 for keywords
    }

    /**
     * Display the suggested expert for the issue
     */
    private displayExpertForIssue(expert: Expert | null, issueData: any, issueNumber?: number): void {
        if (!expert) {
            this.outputChannel.appendLine('No suitable expert found for this issue.');
            vscode.window.showInformationMessage('No suitable expert found for this issue.');
            return;
        }

        // Enhanced message with expert details
        const message = `Suggested Expert: ${expert.name} <${expert.email}>\n` +
                        `Expertise: ${expert.specializations?.join(', ') || 'N/A'}\n` +
                        `Contributions: ${expert.contributions}\n` +
                        `Last Commit: ${expert.lastCommit.toISOString()}\n\n` +
                        `Issue Title: ${issueData.title}\n` +
                        `Issue URL: ${issueData.url}\n\n` +
                        `Click to notify the expert or copy details.`;

        this.outputChannel.appendLine(message);

        // Show notification with action to notify the expert
        vscode.window.showInformationMessage(message, { modal: true }, 'Notify Expert')
            .then(async (selection) => {
                if (selection === 'Notify Expert') {
                    await this.notifyExpert(expert, issueData, issueNumber);
                }
            });
    }

    /**
     * Notify the expert about the issue (e.g., via GitHub comment, email, etc.)
     */
    private async notifyExpert(expert: Expert, issueData: any, issueNumber?: number): Promise<void> {
        if (!expert.email) {
            vscode.window.showErrorMessage('No email available for the expert. Cannot send notification.');
            return;
        }

        // Simple email notification (placeholder, integrate with actual email service)
        const subject = `Expertise Requested for Issue #${issueNumber}: ${issueData.title}`;
        const body = `Hello ${expert.name},\n\n` +
                     `You have been suggested as an expert for GitHub Issue #${issueNumber} - ${issueData.title}.\n` +
                     `Issue URL: ${issueData.url}\n\n` +
                     `Please check the issue for details and consider contributing your expertise.\n\n` +
                     `Thank you!`;

        this.outputChannel.appendLine(`Sending email to ${expert.email}...`);
        // Integrate with email service here

        vscode.window.showInformationMessage(`Notification sent to ${expert.name} <${expert.email}>`, { modal: true });
    }

    // Add getExpertRecentActivity and showExpertActivity methods back to CopilotMCPService

    async getExpertRecentActivity(expertEmail: string, expertName: string): Promise<{success: boolean, activity?: any, error?: string}> {
        try {
            this.outputChannel.appendLine(`🔍 Getting recent activity for expert: ${expertName} (${expertEmail})`);
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return { success: false, error: 'No workspace folder found' };
            }
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            try {
                const commitCommand = `git log --author="${expertEmail}" --pretty=format:"%H|%s|%ad" --date=short -n 10`;
                const { stdout: commitOutput } = await execAsync(commitCommand, { cwd: workspaceFolder.uri.fsPath });
                const recentCommits = commitOutput.split('\n')
                    .filter((line: string) => line.trim())
                    .map((line: string) => {
                        const [sha, message, date] = line.split('|');
                        return {
                            repo: "Current Repository",
                            message: message || "No message",
                            date: date || new Date().toISOString().split('T')[0],
                            url: `#${sha?.substring(0, 7) || 'unknown'}`
                        };
                    });
                const fileCommand = `git log --author=\"${expertEmail}\" --name-only --pretty=format: -n 20 | sort | uniq | head -10`;
                const { stdout: fileOutput } = await execAsync(fileCommand, { cwd: workspaceFolder.uri.fsPath });
                const recentFiles = fileOutput.split('\n')
                    .filter((file: string) => file.trim())
                    .slice(0, 5);
                const activity = {
                    expertName,
                    expertEmail,
                    recentCommits: recentCommits.length > 0 ? recentCommits : [{
                        repo: "Current Repository",
                        message: "No recent commits found",
                        date: new Date().toISOString().split('T')[0],
                        url: "#"
                    }],
                    recentActivity: [
                        `${recentCommits.length} recent commits in this repository`,
                        recentFiles.length > 0 ? `Recently worked on: ${recentFiles.slice(0, 3).join(', ')}` : "No recent file activity found",
                        `Last commit: ${recentCommits[0]?.date || 'Unknown'}`
                    ],
                    currentFocus: recentCommits.length > 0 ? 
                        `Recent work: ${recentCommits[0]?.message?.substring(0, 100) || 'No recent activity'}` :
                        "No recent activity in this repository"
                };
                this.outputChannel.appendLine(`✅ Generated activity summary for ${expertName} with ${recentCommits.length} commits`);
                return { success: true, activity };
            } catch (gitError) {
                this.outputChannel.appendLine(`⚠️ Git command failed, using fallback data: ${gitError}`);
                const fallbackActivity = {
                    expertName,
                    expertEmail,
                    recentCommits: [{
                        repo: "Current Repository",
                        message: "Git history not accessible",
                        date: new Date().toISOString().split('T')[0],
                        url: "#"
                    }],
                    recentActivity: [
                        `Expert: ${expertName}`,
                        `Email: ${expertEmail}`,
                        "Git history requires repository access"
                    ],
                    currentFocus: "Repository analysis required for detailed activity"
                };
                return { success: true, activity: fallbackActivity };
            }
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error getting expert activity: ${error}`);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    async showExpertActivity(activity: any): Promise<void> {
        try {
            const { expertName, expertEmail, recentCommits, recentActivity, currentFocus } = activity;
            let activityDisplay = `# 🔍 Recent Activity: ${expertName}\n\n`;
            activityDisplay += `**Email:** ${expertEmail}\n\n`;
            if (currentFocus) {
                activityDisplay += `**🎯 Current Focus:** ${currentFocus}\n\n`;
            }
            if (recentCommits && recentCommits.length > 0) {
                activityDisplay += `## 📝 Recent Commits:\n`;
                recentCommits.slice(0, 5).forEach((commit: any, index: number) => {
                    activityDisplay += `${index + 1}. **${commit.repo || 'Repository'}\n`;
                    activityDisplay += `   ${commit.message || 'Commit message'}\n`;
                    activityDisplay += `   *${commit.date || 'Recent'}*\n\n`;
                });
            }
            if (recentActivity && recentActivity.length > 0) {
                activityDisplay += `## 🚀 Activity Summary:\n`;
                recentActivity.forEach((item: string) => {
                    activityDisplay += `• ${item}\n`;
                });
            }
            const doc = await vscode.workspace.openTextDocument({
                content: activityDisplay,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Error displaying expert activity: ${error}`);
        }
    }
}