import * as vscode from 'vscode';

export interface GitHubRepository {
    owner: string;
    repo: string;
}

export interface GitHubContributor {
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

/**
 * Service that integrates with VS Code's Copilot Chat and GitHub MCP Server
 * to gather repository data for team expertise analysis
 */
export class CopilotMCPService {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Check the status of GitHub MCP Server containers
     */
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
        }
    }

    /**
     * Ensure GitHub MCP server is running
     */
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

    /**
     * Detect GitHub repository information from the current workspace
     */
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

            // Always try MCP first - even in debug mode, the user might have MCP available
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

    /**
     * Build a prompt for Copilot Chat to gather data using MCP GitHub tools
     */
    private buildMCPDataGatheringPrompt(repository: GitHubRepository): string {
        return `
Please use the GitHub MCP tools to analyze the repository ${repository.owner}/${repository.repo} and gather the following data for team expertise analysis:

1. **Repository Commits**: Use list_commits to get the last 50 commits with author information
2. **Recent Issues**: Use list_issues to get recent issues for collaboration patterns  
3. **Pull Requests**: Use list_pull_requests to get recent PRs for code review patterns
4. **Contributors**: Analyze commit authors to identify key contributors

Focus on extracting:
- Author names and emails from commits
- Commit messages for communication style analysis
- Collaboration patterns from issues and PRs
- File change patterns to identify expertise areas

Please format the response as JSON with this structure:
{
  "commits": [{"sha": "...", "author": {"name": "...", "email": "...", "date": "..."}, "message": "...", "files": [...]}],
  "contributors": [{"name": "...", "email": "...", "totalCommits": 0, "lastCommit": "...", "recentCommits": [...]}],
  "issues": [...],
  "pullRequests": [...],
  "collaborationInsights": ["..."]
}

If GitHub MCP tools are not available, please let me know so I can use fallback methods.
        `;
    }

    /**
     * Query Copilot Chat with MCP integration
     */
    private async queryCopilotWithMCP(prompt: string, mcpStatus?: MCPServerStatus): Promise<string | null> {
        try {
            // Check if Copilot Chat is available
            const copilotExtension = vscode.extensions.getExtension('GitHub.copilot-chat');
            if (!copilotExtension) {
                this.outputChannel.appendLine('GitHub Copilot Chat extension not found');
                return null;
            }

            // Use provided status or check again
            const status = mcpStatus || await this.checkMCPServerStatus();
            let statusMessage = '';
            
            if (status.isAvailable && status.containerName) {
                statusMessage = `✅ GitHub MCP Server is running (${status.containerName})`;
                this.outputChannel.appendLine(`MCP Server Status: ${statusMessage}`);
            } else {
                statusMessage = `⚠️ GitHub MCP Server not detected. Checking main VS Code instance...`;
                this.outputChannel.appendLine(`MCP Server Status: ${statusMessage}`);
            }

            // Enhanced user experience with better options
            const choice = await vscode.window.showInformationMessage(
                `${statusMessage}\n\nChoose how to analyze the repository:`,
                {
                    title: '🤖 Use MCP + Copilot',
                    detail: 'Open Copilot Chat with MCP tools for comprehensive analysis'
                },
                {
                    title: '⚡ Quick Analysis',
                    detail: 'Use local git analysis (faster, limited data)'
                },
                {
                    title: '❌ Cancel',
                    detail: 'Stop analysis'
                }
            );

            if (choice?.title === '🤖 Use MCP + Copilot') {
                try {
                    // Try to open Copilot Chat
                    await vscode.commands.executeCommand('workbench.action.chat.open');
                    
                    // Copy the enhanced prompt to clipboard
                    const enhancedPrompt = this.createEnhancedMCPPrompt(prompt);
                    await vscode.env.clipboard.writeText(enhancedPrompt);
                    
                    // Show improved instructions
                    const result = await vscode.window.showInformationMessage(
                        `✅ Copilot Chat opened! Instructions:\n\n1. Paste the copied prompt (Cmd/Ctrl+V)\n2. GitHub MCP tools will analyze the repository\n3. Copy the JSON response when complete\n4. Click "Process Results" below`,
                        'Process Results',
                        'View Full Prompt',
                        'Cancel'
                    );

                    if (result === 'Process Results') {
                        // Allow user to paste the results
                        const mcpResults = await vscode.window.showInputBox({
                            title: 'Paste MCP Analysis Results',
                            prompt: 'Paste the JSON response from Copilot Chat here',
                            placeHolder: '{"commits": [...], "contributors": [...], ...}',
                            ignoreFocusOut: true
                        });

                        if (mcpResults && mcpResults.trim().startsWith('{')) {
                            this.outputChannel.appendLine('✅ MCP results received from user');
                            return mcpResults.trim();
                        } else {
                            this.outputChannel.appendLine('❌ No valid MCP results provided');
                            return null;
                        }
                    } else if (result === 'View Full Prompt') {
                        // Show the prompt in an editor
                        const doc = await vscode.workspace.openTextDocument({
                            content: enhancedPrompt,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                        return 'user_chose_mcp';
                    }
                    
                    return 'user_chose_mcp';
                    
                } catch (chatError) {
                    // Fallback if chat command doesn't exist
                    this.outputChannel.appendLine(`Chat command not available: ${chatError}`);
                    vscode.window.showErrorMessage('Could not open Copilot Chat. Please open it manually (Cmd+Shift+I or Ctrl+Shift+I)');
                    return null;
                }
            } else if (choice?.title === '⚡ Quick Analysis') {
                this.outputChannel.appendLine('User chose quick local analysis');
                return null; // This will trigger fallback
            } else {
                this.outputChannel.appendLine('User cancelled analysis');
                return null;
            }

        } catch (error) {
            this.outputChannel.appendLine(`Error in MCP integration: ${error}`);
            return null;
        }
    }

    /**
     * Create an enhanced prompt specifically designed for MCP usage
     */
    private createEnhancedMCPPrompt(basePrompt: string): string {
        return `# 🔍 Team X-Ray Repository Analysis via GitHub MCP

${basePrompt}

## 🎯 MCP Tools to Use:
Please use these GitHub MCP tools to gather comprehensive data:

1. **github_list_commits** - Get recent commits with authors and messages
2. **github_list_pull_requests** - Get PR data for collaboration insights  
3. **github_list_issues** - Get issue discussions and problem-solving patterns
4. **github_get_file_contents** - Sample key files for expertise areas

## 📊 Expected JSON Response Format:
\`\`\`json
{
  "commits": [
    {
      "sha": "abc123",
      "author": {"name": "...", "email": "...", "date": "..."},
      "message": "...",
      "files": ["path1", "path2"]
    }
  ],
  "contributors": [
    {
      "name": "...",
      "email": "...", 
      "totalCommits": 0,
      "lastCommit": "...",
      "recentCommits": ["..."]
    }
  ],
  "pullRequests": [...],
  "issues": [...],
  "collaborationInsights": [
    "Communication style observations",
    "Collaboration patterns",
    "Hidden strengths identified"
  ]
}
\`\`\`

Please gather this data and return it in the exact JSON format above. Thank you! 🚀`;
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
    async analyzeFileExperts(filePath: string, repository: GitHubRepository): Promise<any[] | null> {
        try {
            this.outputChannel.appendLine(`Analyzing experts for file: ${filePath} in ${repository.owner}/${repository.repo}`);

            // Create a specific prompt for file expertise analysis
            const prompt = this.buildFileExpertisePrompt(filePath, repository);

            // Query Copilot Chat with MCP tools
            const chatResponse = await this.queryCopilotWithMCP(prompt);
            
            if (chatResponse) {
                this.outputChannel.appendLine('Successfully analyzed file experts via Copilot + MCP');
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
        return `
Please use the GitHub MCP tools to analyze expertise for the specific file "${filePath}" in repository ${repository.owner}/${repository.repo}:

1. **File History**: Use appropriate MCP tools to get commit history for this specific file
2. **File Contributors**: Identify who has modified this file most frequently and recently
3. **Code Patterns**: Analyze the types of changes made to this file
4. **Expertise Indicators**: Look for patterns that indicate deep knowledge of this file

Focus on the humans behind the code changes - their communication styles in commit messages, collaboration patterns, and the nature of their contributions to this specific file.

Return the analysis as JSON with the following structure:
{
    "fileExperts": [
        {
            "name": "Developer Name",
            "email": "email@example.com",
            "expertise": 85,
            "contributions": 12,
            "lastCommit": "2024-01-15T10:30:00Z",
            "specializations": ["Frontend", "React"],
            "communicationStyle": "Detailed, methodical",
            "teamRole": "Senior Developer",
            "hiddenStrengths": ["Code review", "Mentoring"],
            "idealChallenges": ["Complex architecture", "Performance optimization"]
        }
    ],
    "insights": ["This file shows collaborative development patterns", "Recent changes focus on performance improvements"]
}
        `;
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
        const specializations: string[] = [];
        
        if (!filePath || typeof filePath !== 'string') {
            return ['General Programming'];
        }
        
        const ext = filePath.split('.').pop()?.toLowerCase();
        const pathParts = filePath.toLowerCase().split('/');

        // Language-based specializations
        switch (ext) {
            case 'ts':
            case 'tsx':
                specializations.push('TypeScript');
                if (ext === 'tsx') specializations.push('React');
                break;
            case 'js':
            case 'jsx':
                specializations.push('JavaScript');
                if (ext === 'jsx') specializations.push('React');
                break;
            case 'py':
                specializations.push('Python');
                break;
            case 'java':
                specializations.push('Java');
                break;
            case 'cs':
                specializations.push('C#');
                break;
            case 'cpp':
            case 'cc':
            case 'cxx':
                specializations.push('C++');
                break;
            case 'rs':
                specializations.push('Rust');
                break;
            case 'go':
                specializations.push('Go');
                break;
            case 'rb':
                specializations.push('Ruby');
                break;
            case 'php':
                specializations.push('PHP');
                break;
            case 'swift':
                specializations.push('Swift');
                break;
            case 'kt':
                specializations.push('Kotlin');
                break;
        }

        // Path-based specializations
        if (pathParts.some(part => ['test', 'tests', 'spec'].includes(part))) {
            specializations.push('Testing');
        }
        if (pathParts.some(part => ['api', 'backend', 'server'].includes(part))) {
            specializations.push('Backend');
        }
        if (pathParts.some(part => ['frontend', 'ui', 'components'].includes(part))) {
            specializations.push('Frontend');
        }
        if (pathParts.some(part => ['docs', 'documentation'].includes(part))) {
            specializations.push('Documentation');
        }

        return specializations.length > 0 ? specializations : ['General Programming'];
    }

    /**
     * Force test MCP integration without fallbacks - for debugging MCP connectivity
     */
    async forceMCPTest(repository: GitHubRepository): Promise<{ success: boolean, response?: any, error?: string }> {
        try {
            this.outputChannel.appendLine(`🔬 FORCE MCP TEST: Testing MCP integration for ${repository.owner}/${repository.repo}`);
            this.outputChannel.appendLine('This test will NOT fall back to local analysis - MCP must work or fail\n');

            // Check Copilot Chat availability first
            const copilotExtension = vscode.extensions.getExtension('GitHub.copilot-chat');
            if (!copilotExtension) {
                const error = 'GitHub Copilot Chat extension not found - cannot test MCP';
                this.outputChannel.appendLine(`❌ ${error}`);
                return { success: false, error };
            }

            this.outputChannel.appendLine('✅ GitHub Copilot Chat extension found');

            // Check MCP server status
            const mcpStatus = await this.checkMCPServerStatus();
            this.outputChannel.appendLine(`📊 MCP Server Status:`);
            this.outputChannel.appendLine(`   Available: ${mcpStatus.isAvailable ? '✅' : '❌'}`);
            this.outputChannel.appendLine(`   Container: ${mcpStatus.containerName || 'Not found'}`);
            this.outputChannel.appendLine(`   Status: ${mcpStatus.containerStatus || 'Unknown'}`);
            this.outputChannel.appendLine('');

            // Create a simple MCP test prompt
            const testPrompt = `Use GitHub MCP tools to analyze ${repository.owner}/${repository.repo}:

1. Use mcp_github_list_commits with owner: "${repository.owner}" and repo: "${repository.repo}" 
2. Get the last 5 commits
3. Show the commit authors and messages

If GitHub MCP tools are working, I should see real commit data. If not available, please say "GitHub MCP tools are not available".`;

            // Copy test prompt to clipboard
            await vscode.env.clipboard.writeText(testPrompt);

            // Open Copilot Chat and show test instructions
            try {
                await vscode.commands.executeCommand('workbench.action.chat.open');
                this.outputChannel.appendLine('✅ Copilot Chat opened');
            } catch (chatError) {
                this.outputChannel.appendLine(`⚠️ Could not open Copilot Chat automatically: ${chatError}`);
                this.outputChannel.appendLine('Please open Copilot Chat manually (Ctrl+Shift+I or Cmd+Shift+I)');
            }

            // Show test results options
            const choice = await vscode.window.showInformationMessage(
                `🧪 MCP Test Instructions:\n\n1. Paste the test prompt in Copilot Chat (copied to clipboard)\n2. Check if MCP tools are used\n3. Report the results below`,
                'MCP Worked! ✅',
                'MCP Failed ❌',
                'View Test Prompt',
                'Retry Test'
            );

            switch (choice) {
                case 'MCP Worked! ✅':
                    this.outputChannel.appendLine('🎉 SUCCESS: User confirmed MCP is working!');
                    this.outputChannel.appendLine('✅ GitHub MCP server is properly integrated with VS Code');
                    this.outputChannel.appendLine('✅ Repository analysis can use MCP for enhanced data gathering');
                    
                    vscode.window.showInformationMessage(
                        '🎉 Excellent! MCP is working. You can now use "Analyze Repository" with full MCP integration.',
                        'Analyze Repository'
                    ).then(result => {
                        if (result === 'Analyze Repository') {
                            vscode.commands.executeCommand('teamxray.analyzeRepository');
                        }
                    });
                    
                    return { success: true };

                case 'MCP Failed ❌':
                    this.outputChannel.appendLine('❌ FAILED: User confirmed MCP is not working');
                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine('🔧 Troubleshooting steps:');
                    this.outputChannel.appendLine('1. Check that Docker is running');
                    this.outputChannel.appendLine('2. Verify GITHUB_TOKEN environment variable is set');
                    this.outputChannel.appendLine('3. Restart VS Code to refresh MCP configuration');
                    this.outputChannel.appendLine('4. Check .vscode/mcp.json configuration');
                    
                    const troubleshootChoice = await vscode.window.showErrorMessage(
                        'MCP integration failed. What would you like to do?',
                        'Check Setup Guide',
                        'Restart VS Code',
                        'Use Local Analysis'
                    );
                    
                    switch (troubleshootChoice) {
                        case 'Check Setup Guide':
                            vscode.commands.executeCommand('teamxray.showSetupGuidance');
                            break;
                        case 'Restart VS Code':
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                            break;
                        case 'Use Local Analysis':
                            vscode.commands.executeCommand('teamxray.analyzeRepository');
                            break;
                    }
                    
                    return { success: false, error: 'MCP integration test failed' };

                case 'View Test Prompt':
                    // Show the test prompt in an editor
                    const doc = await vscode.workspace.openTextDocument({
                        content: testPrompt,
                        language: 'markdown'
                    });
                    await vscode.window.showTextDocument(doc);
                    this.outputChannel.appendLine('📄 Test prompt opened in editor');
                    return { success: false, error: 'Test prompt displayed - rerun test after trying' };

                case 'Retry Test':
                    this.outputChannel.appendLine('🔄 Retrying MCP test...');
                    return this.forceMCPTest(repository);

                default:
                    this.outputChannel.appendLine('❓ Test cancelled by user');
                    return { success: false, error: 'Test cancelled' };
            }

        } catch (error) {
            const errorMsg = `Force MCP test failed: ${error}`;
            this.outputChannel.appendLine(`❌ ${errorMsg}`);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Manually start GitHub MCP server (useful for debugging)
     */
    async manuallyStartMCPServer(): Promise<{ success: boolean, containerId?: string, error?: string }> {
        try {
            this.outputChannel.appendLine('🚀 Attempting to manually start GitHub MCP server...');

            // Check if GitHub token is available
            const token = process.env.GITHUB_TOKEN;
            if (!token) {
                const error = 'GITHUB_TOKEN environment variable not set. Please run "Team X-Ray: Setup GitHub Token" first.';
                this.outputChannel.appendLine(`❌ ${error}`);
                vscode.window.showErrorMessage(error);
                return { success: false, error };
            }

            this.outputChannel.appendLine('✅ GITHUB_TOKEN found in environment');

            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);

            // First, check if any MCP servers are already running
            const { stdout: existingContainers } = await execAsync(
                'docker ps --format "{{.Names}}" --filter "ancestor=ghcr.io/github/github-mcp-server"'
            );

            if (existingContainers.trim()) {
                this.outputChannel.appendLine(`⚠️ MCP server already running: ${existingContainers.trim()}`);
                return { success: true, containerId: existingContainers.trim() };
            }

            // Start new MCP server container
            this.outputChannel.appendLine('Starting new GitHub MCP server container...');
            
            const dockerCommand = [
                'docker run -d',
                '--rm',
                `-e GITHUB_TOKEN=${token}`,
                '-p 8080:8080',
                'ghcr.io/github/github-mcp-server',
                '--port 8080',
                '--toolsets repos,users,pull_requests,issues'
            ].join(' ');

            this.outputChannel.appendLine(`Running: ${dockerCommand.replace(token, 'GITHUB_TOKEN')}`);

            const { stdout: containerId } = await execAsync(dockerCommand);
            const cleanContainerId = containerId.trim();

            this.outputChannel.appendLine(`✅ MCP server started with container ID: ${cleanContainerId}`);

            // Wait a moment for container to start
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verify it's running
            const { stdout: containerStatus } = await execAsync(`docker ps --filter "id=${cleanContainerId}" --format "{{.Status}}"`);
            
            if (containerStatus.trim()) {
                this.outputChannel.appendLine(`✅ Container verified running: ${containerStatus.trim()}`);
                
                vscode.window.showInformationMessage(
                    '🎉 GitHub MCP server started successfully! You can now test MCP integration.',
                    'Test MCP Now'
                ).then(selection => {
                    if (selection === 'Test MCP Now') {
                        vscode.commands.executeCommand('teamxray.forceMCPTest');
                    }
                });

                return { success: true, containerId: cleanContainerId };
            } else {
                throw new Error('Container started but not showing in docker ps');
            }

        } catch (error) {
            const errorMsg = `Failed to start MCP server: ${error}`;
            this.outputChannel.appendLine(`❌ ${errorMsg}`);
            vscode.window.showErrorMessage(errorMsg);
            return { success: false, error: errorMsg };
        }
    }
}
