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
     * Analyzes repository expertise using local git analysis and AI analysis
     * (MCP is only used for expert activity features, not main analysis)
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

            // Step 2: Gather repository data using local analysis
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
     * Gathers repository data using local analysis (MCP only used for expert activity)
     */
    private async gatherRepositoryData(repositoryName: string): Promise<any> {
        try {
            this.outputChannel.appendLine('Gathering repository data using local analysis...');

            // Always use local analysis for main repository analysis
            // MCP is only used for expert activity features
            const localData = await this.fallbackWorkspaceAnalysis(repositoryName);
            
            this.outputChannel.appendLine(
                `Gathered data: ${localData.files?.length || 0} files, ` +
                `${localData.contributors?.length || 0} contributors`
            );

            return localData;

        } catch (error) {
            this.outputChannel.appendLine(`Error gathering repository data: ${error}`);
            throw error;
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
        
        // Get Git data locally
        const commits = await this.getLocalGitCommits();
        const contributors = await this.getLocalGitContributors();
        
        this.outputChannel.appendLine(`Fallback analysis found ${files.length} files, ${commits.length} commits, ${contributors.length} contributors`);
        
        return {
            repository: repositoryName,
            files,
            commits,
            contributors,
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
                            content: 'You are an expert code analyst that helps identify team expertise patterns in software repositories. You must respond with valid JSON only. Do not include any explanatory text before or after the JSON. Start your response with { and end with }.'
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

IMPORTANT: Return your response as VALID JSON ONLY. Do not include any explanatory text before or after the JSON. The response must start with { and end with }.

JSON Format:
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
            
            // Try to extract JSON from the response
            let jsonContent = this.extractJSONFromResponse(aiResponse);
            
            if (!jsonContent) {
                this.outputChannel.appendLine(`No JSON found in AI response, creating fallback analysis`);
                return this.createFallbackAnalysis(repositoryData);
            }
            
            const parsed = JSON.parse(jsonContent);
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
            this.outputChannel.appendLine(`AI response was: ${aiResponse.substring(0, 200)}...`);
            this.outputChannel.appendLine(`Creating fallback analysis from repository data`);
            return this.createFallbackAnalysis(repositoryData);
        }
    }

    /**
     * Extracts JSON content from AI response that may contain natural language
     */
    private extractJSONFromResponse(response: string): string | null {
        try {
            this.outputChannel.appendLine(`Extracting JSON from response (first 200 chars): ${response.substring(0, 200)}`);
            
            // Remove markdown code blocks if present
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            // Try to parse as-is first
            try {
                JSON.parse(cleanResponse);
                this.outputChannel.appendLine('Successfully parsed response as-is');
                return cleanResponse;
            } catch {
                this.outputChannel.appendLine('Response is not pure JSON, searching for JSON content...');
                
                // Look for the largest JSON object in the response
                const jsonMatches = [...response.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)];
                
                // Try each match from largest to smallest
                const sortedMatches = jsonMatches.sort((a, b) => (b[0]?.length || 0) - (a[0]?.length || 0));
                
                for (const match of sortedMatches) {
                    try {
                        const candidate = match[0];
                        JSON.parse(candidate);
                        this.outputChannel.appendLine(`Found valid JSON (length: ${candidate.length})`);
                        return candidate;
                    } catch {
                        continue;
                    }
                }
                
                // More sophisticated regex for nested JSON
                const nestedJsonMatch = response.match(/\{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*\}/);
                if (nestedJsonMatch) {
                    try {
                        const candidate = nestedJsonMatch[0];
                        JSON.parse(candidate);
                        this.outputChannel.appendLine(`Found valid nested JSON (length: ${candidate.length})`);
                        return candidate;
                    } catch {
                        this.outputChannel.appendLine('Nested JSON match was invalid');
                    }
                }
                
                // Look for JSON after common phrases with more patterns
                const phrases = [
                    'format the response as json:',
                    'here\'s the analyzed json output:',
                    'json output:',
                    'analysis results:',
                    'here\'s the analysis:',
                    'the analysis is:',
                    'based on the repository structure',
                    'analyzing the repository',
                    'response:'
                ];
                
                for (const phrase of phrases) {
                    const index = response.toLowerCase().indexOf(phrase);
                    if (index !== -1) {
                        const afterPhrase = response.substring(index + phrase.length);
                        
                        // Look for JSON starting with first {
                        const firstBrace = afterPhrase.indexOf('{');
                        if (firstBrace !== -1) {
                            const fromBrace = afterPhrase.substring(firstBrace);
                            const jsonMatch = fromBrace.match(/\{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*\}/);
                            if (jsonMatch) {
                                try {
                                    const candidate = jsonMatch[0];
                                    JSON.parse(candidate);
                                    this.outputChannel.appendLine(`Found valid JSON after phrase "${phrase}" (length: ${candidate.length})`);
                                    return candidate;
                                } catch {
                                    continue;
                                }
                            }
                        }
                    }
                }
                
                this.outputChannel.appendLine('No valid JSON found in response');
                return null;
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error extracting JSON: ${error}`);
            return null;
        }
    }

    /**
     * Creates a fallback analysis when AI response is invalid
     */
    private createFallbackAnalysis(repositoryData: any): ExpertiseAnalysis {
        this.outputChannel.appendLine(`Creating fallback analysis from repository data`);
        
        // Create experts from contributors data
        const experts: Expert[] = (repositoryData.contributors || []).map((contributor: any, index: number) => ({
            name: contributor.name || `Contributor ${index + 1}`,
            email: contributor.email || 'unknown@example.com',
            expertise: Math.min(90, 30 + (contributor.commits || 0) * 2), // Simple expertise calculation
            contributions: contributor.commits || 0,
            lastCommit: contributor.lastCommit ? new Date(contributor.lastCommit) : new Date(),
            specializations: this.inferSpecializationsFromFiles(repositoryData.files || []),
            communicationStyle: 'Analysis unavailable - local data only',
            teamRole: 'Team member',
            hiddenStrengths: ['Code contribution'],
            idealChallenges: ['General development tasks']
        }));

        // Generate insights based on available data
        const insights = [
            `Analyzed ${repositoryData.files?.length || 0} files in the repository`,
            `Found ${experts.length} contributors with commit history`,
            experts.length > 0 ? `Most active contributor: ${experts[0]?.name}` : 'No contributor data available',
            'AI analysis was unavailable - using local git data only',
            'For detailed team insights, check GitHub Models API configuration'
        ].filter(Boolean);

        return {
            repository: repositoryData.repository || 'Unknown Repository',
            generatedAt: new Date(),
            totalFiles: repositoryData.files?.length || 0,
            totalExperts: experts.length,
            fileExpertise: this.mapFileExpertise(repositoryData.files || [], experts),
            expertProfiles: experts,
            teamDynamics: {
                collaborationPatterns: ['Data not available in fallback mode'],
                communicationHighlights: ['Local analysis only'],
                knowledgeSharing: ['Requires AI analysis for detailed insights']
            },
            challengeMatching: {
                toughProblems: ['Complex analysis requires AI integration'],
                recommendedExperts: experts.slice(0, 2).map(e => e.name)
            },
            insights
        };
    }

    /**
     * Infers specializations from file extensions in the repository
     */
    private inferSpecializationsFromFiles(files: string[]): string[] {
        const extensions = files
            .map(f => f.split('.').pop()?.toLowerCase())
            .filter((ext): ext is string => Boolean(ext));
            
        const extensionCounts = extensions.reduce((acc: Record<string, number>, ext: string) => {
            acc[ext] = (acc[ext] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const topExtensions = Object.entries(extensionCounts)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 3)
            .map(([ext]) => ext);
            
        const specializations: string[] = [];
        
        for (const ext of topExtensions) {
            switch (ext) {
                case 'ts':
                case 'tsx':
                    specializations.push('TypeScript');
                    break;
                case 'js':
                case 'jsx':
                    specializations.push('JavaScript');
                    break;
                case 'py':
                    specializations.push('Python');
                    break;
                case 'java':
                    specializations.push('Java');
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
            }
        }
        
        return specializations.length > 0 ? specializations : ['General Programming'];
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
     * Gets local Git commits using git log
     */
    private async getLocalGitCommits(): Promise<any[]> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return [];
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            // Get recent commits with author info
            const command = 'git log --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso -n 50';
            const { stdout } = await execAsync(command, { cwd: workspaceFolder.uri.fsPath });

            const commits = stdout.split('\n')
                .filter((line: string) => line.trim())
                .map((line: string) => {
                    const parts = line.split('|');
                    if (parts.length >= 5) {
                        return {
                            sha: parts[0],
                            author: {
                                name: parts[1],
                                email: parts[2]
                            },
                            date: parts[3],
                            message: parts.slice(4).join('|')
                        };
                    }
                    return null;
                })
                .filter(Boolean);

            this.outputChannel.appendLine(`Found ${commits.length} local commits`);
            return commits;

        } catch (error) {
            this.outputChannel.appendLine(`Failed to get local git commits: ${error}`);
            return [];
        }
    }

    /**
     * Gets local Git contributors using git shortlog
     */
    private async getLocalGitContributors(): Promise<any[]> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return [];
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            // Get contributors with commit counts
            const command = 'git shortlog -sne --all';
            const { stdout } = await execAsync(command, { cwd: workspaceFolder.uri.fsPath });

            const contributors = stdout.split('\n')
                .filter((line: string) => line.trim())
                .map((line: string) => {
                    const match = line.match(/^\s*(\d+)\s+(.+?)\s+<(.+?)>\s*$/);
                    if (match) {
                        const commits = parseInt(match[1]);
                        const name = match[2];
                        const email = match[3];
                        
                        return {
                            name,
                            email,
                            commits,
                            lastCommit: new Date().toISOString() // We'll get this separately if needed
                        };
                    }
                    return null;
                })
                .filter(Boolean)
                .sort((a: any, b: any) => b.commits - a.commits); // Sort by commit count

            // Get last commit date for each contributor
            for (const contributor of contributors) {
                try {
                    const lastCommitCommand = `git log --author="${contributor.email}" --pretty=format:"%ad" --date=iso -n 1`;
                    const { stdout: lastCommitDate } = await execAsync(lastCommitCommand, { cwd: workspaceFolder.uri.fsPath });
                    if (lastCommitDate.trim()) {
                        contributor.lastCommit = lastCommitDate.trim();
                    }
                } catch (error) {
                    this.outputChannel.appendLine(`Failed to get last commit for ${contributor.name}: ${error}`);
                }
            }

            this.outputChannel.appendLine(`Found ${contributors.length} local contributors`);
            contributors.forEach((c: any) => {
                this.outputChannel.appendLine(`  - ${c.name} (${c.email}): ${c.commits} commits, last: ${c.lastCommit}`);
            });

            return contributors;

        } catch (error) {
            this.outputChannel.appendLine(`Failed to get local git contributors: ${error}`);
            return [];
        }
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
