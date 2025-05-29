import * as vscode from 'vscode';
import axios from 'axios';
import { CopilotMCPService, GitHubRepository } from './copilot-mcp-service';

export interface FileExpertise {
    fileName: string;
    filePath: string;
    experts: Expert[];
    lastModified: Date;
    changeFrequency: number;
}

export interface Expert {
    name: string;
    email: string;
    expertise: number; // 0-100 score
    contributions: number;
    lastCommit: Date;
    specializations: string[];
    communicationStyle?: string;
    teamRole?: string;
    hiddenStrengths?: string[];
    idealChallenges?: string[];
}

export interface TeamDynamics {
    collaborationPatterns: string[];
    communicationHighlights: string[];
    knowledgeSharing: string[];
}

export interface ChallengeMatching {
    toughProblems: string[];
    recommendedExperts: string[];
}

export interface ExpertiseAnalysis {
    repository: string;
    generatedAt: Date;
    totalFiles: number;
    totalExperts: number;
    fileExpertise: FileExpertise[];
    expertProfiles: Expert[];
    teamDynamics?: TeamDynamics;
    challengeMatching?: ChallengeMatching;
    insights: string[];
}

export interface GitHubSearchResponse {
    items: Array<{
        name: string;
        path: string;
        repository: {
            full_name: string;
            owner: {
                login: string;
            };
        };
        score: number;
    }>;
    total_count: number;
}

export class ExpertiseAnalyzer {
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private copilotMCPService: CopilotMCPService;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Team X-Ray');
        this.copilotMCPService = new CopilotMCPService(this.outputChannel);
    }

    /**
     * Analyzes repository expertise using GitHub MCP commands and AI analysis
     */
    async analyzeRepository(): Promise<ExpertiseAnalysis | null> {
        try {
            this.outputChannel.show();
            this.outputChannel.appendLine('Starting repository expertise analysis...');

            // Step 1: Get workspace information
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found. Please open a repository folder.');
                return null;
            }

            const repositoryName = workspaceFolder.name;
            this.outputChannel.appendLine(`Analyzing repository: ${repositoryName}`);

            // Step 2: Gather repository data using GitHub MCP commands
            const repositoryData = await this.gatherRepositoryData(repositoryName);
            if (!repositoryData) {
                vscode.window.showErrorMessage('Failed to gather repository data.');
                return null;
            }

            // Step 3: Send data to GitHub Models API for AI analysis
            const analysis = await this.performAIAnalysis(repositoryData);
            if (!analysis) {
                vscode.window.showErrorMessage('Failed to perform AI analysis.');
                return null;
            }

            this.outputChannel.appendLine('Analysis completed successfully!');
            return analysis;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
            vscode.window.showErrorMessage(`Analysis failed: ${errorMessage}`);
            return null;
        }
    }

    /**
     * Finds experts for a specific file
     */
    async findExpertForFile(filePath: string): Promise<Expert[] | null> {
        try {
            this.outputChannel.appendLine(`Finding experts for file: ${filePath}`);

            // Step 1: Try to use MCP service for file-specific analysis
            const repository = await this.copilotMCPService.detectRepository();
            if (repository) {
                // Use MCP to get file-specific contributors and commits
                const fileExperts = await this.copilotMCPService.analyzeFileExperts(filePath, repository);
                if (fileExperts && fileExperts.length > 0) {
                    this.outputChannel.appendLine(`Found ${fileExperts.length} experts via MCP for file`);
                    return fileExperts;
                }
            }

            // Step 2: Fallback to local analysis
            this.outputChannel.appendLine('MCP analysis unavailable, using local file analysis...');
            const fileData = await this.gatherFileData(filePath);
            if (!fileData) {
                return null;
            }

            // Analyze expertise for this specific file using local data
            const experts = await this.analyzeFileExperts(fileData);
            this.outputChannel.appendLine(`Found ${experts?.length || 0} experts for file`);

            return experts;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            this.outputChannel.appendLine(`Error finding experts: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to find experts: ${errorMessage}`);
            return null;
        }
    }

    /**
     * Gathers repository data using GitHub MCP commands
     */
    private async gatherRepositoryData(repositoryName: string): Promise<any> {
        try {
            this.outputChannel.appendLine('Gathering repository data using Copilot Chat + GitHub MCP...');

            // Step 1: Detect GitHub repository info
            const repository = await this.copilotMCPService.detectRepository();
            if (!repository) {
                this.outputChannel.appendLine('Could not detect GitHub repository, falling back to local analysis');
                return await this.fallbackWorkspaceAnalysis(repositoryName);
            }

            // Step 2: Use MCP service to gather comprehensive repository data
            const repositoryData = await this.copilotMCPService.gatherRepositoryData(repository);
            
            // Step 3: Get workspace files for local context
            const files = await this.getWorkspaceFiles();
            
            // Combine MCP data with local file information
            const combinedData = {
                ...repositoryData,
                files,
                repository: repositoryName,
                githubRepo: repository
            };

            this.outputChannel.appendLine(
                `Gathered data: ${files.length} files, ` +
                `${repositoryData.contributors?.length || 0} contributors, ` +
                `${repositoryData.commits?.length || 0} commits`
            );

            return combinedData;

        } catch (error) {
            this.outputChannel.appendLine(`Error gathering repository data: ${error}`);
            // Fallback to workspace analysis
            return await this.fallbackWorkspaceAnalysis(repositoryName);
        }
    }

    /**
     * Gets all files in the workspace
     */
    private async getWorkspaceFiles(): Promise<string[]> {
        const files: string[] = [];
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (workspaceFolder) {
            const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,cs,rb,php,go,rs,kt,swift}');
            const fileUris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
            
            for (const uri of fileUris) {
                files.push(vscode.workspace.asRelativePath(uri));
            }
        }

        return files;
    }

    /**
     * Fallback workspace analysis when MCP is not available
     */
    private async fallbackWorkspaceAnalysis(repositoryName: string): Promise<any> {
        this.outputChannel.appendLine('Using fallback workspace analysis...');
        
        const files = await this.getWorkspaceFiles();
        
        return {
            repository: repositoryName,
            files,
            commits: [],
            contributors: [],
            pullRequests: [],
            fallbackMode: true
        };
    }

    /**
     * Gathers data for a specific file
     */
    private async gatherFileData(filePath: string): Promise<any> {
        try {
            // Get file content and basic stats
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            
            return {
                path: filePath,
                content: document.getText(),
                lineCount: document.lineCount,
                languageId: document.languageId,
                lastModified: new Date() // Would get real timestamp from git
            };

        } catch (error) {
            this.outputChannel.appendLine(`Failed to gather file data: ${error}`);
            return null;
        }
    }

    /**
     * Performs AI analysis using GitHub Models API
     */
    private async performAIAnalysis(repositoryData: any): Promise<ExpertiseAnalysis | null> {
        try {
            this.outputChannel.appendLine('Performing AI analysis with GitHub Models...');

            const config = vscode.workspace.getConfiguration('teamxray');
            let apiKey = config.get<string>('githubModelsKey');

            // Also check environment variable as fallback
            if (!apiKey || apiKey.includes('${input:github_token}')) {
                apiKey = process.env.GITHUB_TOKEN;
                this.outputChannel.appendLine(`Using environment variable: ${apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No'}`);
            }

            this.outputChannel.appendLine(`Raw API Key from config: ${apiKey ? 'Configured' : 'Not configured'}`);
            
            // If the apiKey contains ${input:github_token}, we need to resolve it
            if (apiKey?.includes('${input:github_token}')) {
                this.outputChannel.appendLine('API key contains input variable, prompting user...');
                apiKey = await vscode.window.showInputBox({
                    prompt: 'Enter your GitHub Personal Access Token',
                    password: true,
                    placeHolder: 'ghp_...'
                });
                this.outputChannel.appendLine(`User provided token: ${apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No'}`);
            } else {
                this.outputChannel.appendLine(`API Key available: ${apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No'}`);
            }

            if (!apiKey) {
                this.outputChannel.appendLine('No API key available, cannot perform analysis');
                vscode.window.showErrorMessage('GitHub token is required for team expertise analysis. Please configure your GitHub Personal Access Token.');
                return null;
            }

            const prompt = this.buildAnalysisPrompt(repositoryData);
            
            const response = await axios.post(
                'https://models.github.ai/inference/chat/completions',
                {
                    model: 'openai/gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert code analyst that helps identify team expertise patterns in software repositories.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000
                },
                {
                    headers: {
                        'Accept': 'application/vnd.github+json',
                        'Authorization': `Bearer ${apiKey}`,
                        'X-GitHub-Api-Version': '2022-11-28',
                        'Content-Type': 'application/json'
                    }
                }
            );

            const aiResponse = (response.data as any).choices[0].message.content;
            this.outputChannel.appendLine(`AI Response received: ${aiResponse.substring(0, 200)}...`);
            return this.parseAIResponse(aiResponse, repositoryData);

        } catch (error) {
            if (error instanceof Error && 'response' in error) {
                const axiosError = error as any;
                this.outputChannel.appendLine(`AI analysis failed: ${axiosError.response?.status} - ${axiosError.response?.statusText}`);
                this.outputChannel.appendLine(`Response data: ${JSON.stringify(axiosError.response?.data)}`);
                
                if (axiosError.response?.status === 401) {
                    vscode.window.showErrorMessage('Authentication failed. Please check your GitHub token and ensure you have access to GitHub Models.');
                } else {
                    vscode.window.showErrorMessage(`AI analysis failed: ${axiosError.response?.status} - ${axiosError.response?.statusText}`);
                }
            } else {
                this.outputChannel.appendLine(`AI analysis failed: ${error}`);
                vscode.window.showErrorMessage(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            return null;
        }
    }

    /**
     * Analyzes experts for a specific file
     */
    private async analyzeFileExperts(fileData: any): Promise<Expert[]> {
        try {
            // Get full repository analysis first
            const repositoryData = await this.gatherRepositoryData(fileData.repository || 'current');
            
            // Use the correct property name from fileData
            const filePath = fileData.path || fileData.filePath;
            if (!filePath) {
                throw new Error('File path not found in file data');
            }
            
            // Filter experts based on file-specific contributions
            const fileExperts = repositoryData.contributors
                .filter((contributor: any) => contributor.commits > 0)
                .map((contributor: any) => ({
                    name: contributor.name,
                    email: contributor.email,
                    expertise: Math.min(100, (contributor.commits / Math.max(1, repositoryData.contributors[0]?.commits || 1)) * 100),
                    contributions: contributor.commits,
                    lastCommit: contributor.lastCommit,
                    specializations: this.inferSpecializationsFromFile(filePath),
                    communicationStyle: 'Inferred from commit patterns',
                    teamRole: contributor.commits > 10 ? 'Regular contributor' : 'Occasional contributor',
                    hiddenStrengths: ['Code review', 'Documentation'],
                    idealChallenges: ['Bug fixes', 'Feature development']
                }))
                .sort((a: any, b: any) => b.contributions - a.contributions)
                .slice(0, 5); // Top 5 experts for the file

            return fileExperts;
        } catch (error) {
            this.outputChannel.appendLine(`Error analyzing file experts: ${error}`);
            throw new Error(`Cannot analyze file experts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Infers specializations based on file extension and path
     */
    private inferSpecializationsFromFile(filePath: string): string[] {
        const specializations: string[] = [];
        
        // Safety check for undefined filePath
        if (!filePath || typeof filePath !== 'string') {
            this.outputChannel.appendLine(`Warning: Invalid file path provided for specialization inference: ${filePath}`);
            return ['General Programming'];
        }
        
        const ext = filePath.split('.').pop()?.toLowerCase();
        const path = filePath.toLowerCase();

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
            case 'go':
                specializations.push('Go');
                break;
            case 'rs':
                specializations.push('Rust');
                break;
            case 'cpp':
            case 'cc':
            case 'cxx':
                specializations.push('C++');
                break;
            case 'c':
                specializations.push('C');
                break;
        }

        // Framework/technology specializations based on path
        if (path.includes('test') || path.includes('spec')) {
            specializations.push('Testing');
        }
        if (path.includes('api') || path.includes('server')) {
            specializations.push('Backend');
        }
        if (path.includes('ui') || path.includes('component')) {
            specializations.push('Frontend');
        }
        if (path.includes('database') || path.includes('sql')) {
            specializations.push('Database');
        }

        return specializations.length > 0 ? specializations : ['General'];
    }

    /**
     * Builds the prompt for AI analysis
     */
    private buildAnalysisPrompt(repositoryData: any): string {
        const contributorsInfo = repositoryData.contributors.length > 0 
            ? repositoryData.contributors.map((c: any) => `${c.name} (${c.email}) - ${c.commits} commits, last: ${c.lastCommit}`).join('\n')
            : 'No contributor data available';

        // Analyze commit messages for collaboration patterns
        const recentCommitMessages = repositoryData.commits.slice(0, 20)
            .map((c: any) => `${c.author.name}: ${c.message}`)
            .join('\n');

        return `
You are analyzing a software team to uncover the humans behind the code. Look beyond just technical skills to reveal teamwork patterns, communication styles, and hidden strengths.

Repository: ${repositoryData.repository}
Files: ${repositoryData.files.slice(0, 20).join(', ')}${repositoryData.files.length > 20 ? ` (and ${repositoryData.files.length - 20} more)` : ''}
Total Files: ${repositoryData.files.length}

Team Members:
${contributorsInfo}

Recent Commit Messages (revealing communication style and collaboration):
${recentCommitMessages}

ANALYZE FOR:
1. **Technical Expertise**: What technologies does each person excel at?
2. **Communication Style**: How do they write commit messages? Detailed vs brief? Collaborative indicators?
3. **Teamwork Patterns**: Who pairs with whom? Who mentors? Who documents?
4. **Hidden Strengths**: Beyond code - who's the problem solver, the connector, the innovator?
5. **Challenge Matching**: What types of problems would each person thrive on?

Focus on the HUMANS, not just the code. Look for:
- Mentoring patterns (helpful commit messages, code reviews)
- Communication clarity (commit message quality)
- Collaboration indicators (pair programming, shared files)
- Problem-solving approaches (bug fixes, feature additions)
- Knowledge sharing (documentation commits, comments)

Format the response as JSON:
{
  "experts": [
    {
      "name": "Actual Contributor Name",
      "email": "actual@email.com", 
      "expertise": 85,
      "contributions": 42,
      "lastCommit": "2025-05-28",
      "specializations": ["TypeScript", "React", "Node.js"],
      "communicationStyle": "Clear and detailed, often includes context",
      "teamRole": "Mentor and problem solver",
      "hiddenStrengths": ["Documentation", "Cross-team collaboration"],
      "idealChallenges": ["Complex refactoring", "Team coordination"]
    }
  ],
  "teamDynamics": {
    "collaborationPatterns": ["John and Jane often work on UI components together"],
    "communicationHighlights": ["Team maintains excellent commit message standards"],
    "knowledgeSharing": ["Strong documentation culture evident in commits"]
  },
  "insights": [
    "Human-focused insights about team strengths and dynamics",
    "Recommendations for leveraging each person's unique gifts"
  ],
  "challengeMatching": {
    "toughProblems": ["Performance optimization", "Architecture decisions"],
    "recommendedExperts": ["John for performance", "Jane for architecture"]
  }
}
        `;
    }

    /**
     * Parses AI response into analysis structure
     */
    private parseAIResponse(aiResponse: string, repositoryData: any): ExpertiseAnalysis {
        try {
            this.outputChannel.appendLine(`Attempting to parse AI response as JSON...`);
            
            // Remove markdown code blocks if present
            let cleanResponse = aiResponse.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            const parsed = JSON.parse(cleanResponse);
            this.outputChannel.appendLine(`Successfully parsed JSON response`);
            this.outputChannel.appendLine(`Parsed response structure: ${JSON.stringify(Object.keys(parsed))}`);
            this.outputChannel.appendLine(`Number of experts in response: ${parsed.experts?.length || 0}`);
            
            // Process experts to ensure lastCommit is a Date object
            const processedExperts = (parsed.experts || []).map((expert: any, index: number) => {
                const lastCommit = expert.lastCommit ? new Date(expert.lastCommit) : new Date();
                const specializations = Array.isArray(expert.specializations) ? expert.specializations : [];
                
                // Ensure all required fields are present with defaults
                const processedExpert = {
                    name: expert.name || `Expert ${index + 1}`,
                    email: expert.email || 'unknown@example.com',
                    expertise: typeof expert.expertise === 'number' ? expert.expertise : 0,
                    contributions: typeof expert.contributions === 'number' ? expert.contributions : 0,
                    lastCommit,
                    specializations,
                    communicationStyle: expert.communicationStyle || undefined,
                    teamRole: expert.teamRole || undefined,
                    hiddenStrengths: Array.isArray(expert.hiddenStrengths) ? expert.hiddenStrengths : undefined,
                    idealChallenges: Array.isArray(expert.idealChallenges) ? expert.idealChallenges : undefined
                };
                
                this.outputChannel.appendLine(`Processing expert ${processedExpert.name}: lastCommit=${lastCommit}, specializations=${JSON.stringify(specializations)}, expertise=${processedExpert.expertise}`);
                return processedExpert;
            });

            return {
                repository: repositoryData.repository,
                generatedAt: new Date(),
                totalFiles: repositoryData.files.length,
                totalExperts: processedExperts.length,
                fileExpertise: this.mapFileExpertise(repositoryData.files, processedExperts),
                expertProfiles: processedExperts,
                teamDynamics: parsed.teamDynamics || undefined,
                challengeMatching: parsed.challengeMatching || undefined,
                insights: parsed.insights || []
            };
        } catch (error) {
            this.outputChannel.appendLine(`Failed to parse AI response as JSON: ${error}`);
            this.outputChannel.appendLine(`AI response was: ${aiResponse}`);
            this.outputChannel.appendLine(`Cannot proceed without valid AI response`);
            throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown parsing error'}`);
        }
    }

    /**
     * Maps file expertise from AI analysis
     */
    private mapFileExpertise(files: string[], experts: Expert[]): FileExpertise[] {
        return files.map(file => ({
            fileName: file.split('/').pop() || file,
            filePath: file,
            experts: experts.slice(0, 2), // Top 2 experts per file
            lastModified: new Date(),
            changeFrequency: Math.floor(Math.random() * 10) + 1
        }));
    }

    /**
     * Saves analysis results to workspace state
     */
    async saveAnalysis(analysis: ExpertiseAnalysis): Promise<void> {
        await this.context.workspaceState.update('lastAnalysis', analysis);
        await vscode.commands.executeCommand('setContext', 'teamxray.hasAnalysis', true);
    }

    /**
     * Gets the last saved analysis
     */
    getLastAnalysis(): ExpertiseAnalysis | undefined {
        return this.context.workspaceState.get('lastAnalysis');
    }

}
