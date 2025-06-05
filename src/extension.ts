import * as vscode from 'vscode';
import { ExpertiseAnalyzer, Expert } from './core/expertise-analyzer';
import { ExpertiseWebviewProvider } from './core/expertise-webview';
import { ExpertiseTreeProvider } from './core/expertise-tree-provider';
import { CopilotMCPService } from './core/copilot-mcp-service';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Secure GitHub token storage using VS Code SecretStorage
    const secretKey = 'github_token';

    // Helper to securely save token
    async function saveToken(token: string): Promise<void> {
        // Store only in secure secret storage
        await context.secrets.store(secretKey, token);
        // Set environment variable for immediate use
        process.env.GITHUB_TOKEN = token;
        console.log('🔧 GitHub token saved securely and set as environment variable');
    }

    // Helper to get token and ensure environment variable is set
    async function getToken(): Promise<string | undefined> {
        const token = await context.secrets.get(secretKey);
        if (token && !process.env.GITHUB_TOKEN) {
            process.env.GITHUB_TOKEN = token;
        }
        return token;
    }

    // Simplified initialization on activation
    async function ensureTokenEnvironment(): Promise<void> {
        await getToken(); // This will set the env var if token exists
    }

    // Initialize token environment on activation
    ensureTokenEnvironment();

    // Command to allow user to set their GitHub token
    context.subscriptions.push(
        vscode.commands.registerCommand('teamxray.setGitHubToken', async () => {
            // Prompt user for GitHub token
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your GitHub token with repo and user permissions',
                password: true, // Hide the input
                ignoreFocusOut: true // Keep the input box open when focus moves
            });

            if (token) {
                // Save token in configuration and secret storage
                await context.secrets.store(secretKey, token);
                // Also update the environment variable for immediate use
                process.env.GITHUB_TOKEN = token;
                vscode.window.showInformationMessage('GitHub token saved successfully');
            } else {
                vscode.window.showWarningMessage('No GitHub token provided');
            }
        })
    );

    // Initialize core components
    const analyzer = new ExpertiseAnalyzer(context);
    const webviewProvider = new ExpertiseWebviewProvider(context);
    const treeProvider = new ExpertiseTreeProvider();

    // Register tree data provider
    vscode.window.registerTreeDataProvider('teamxray.expertiseView', treeProvider);

    // Helper function for safe date formatting
    const safeFormatDate = (date: any): string => {
        if (!date) return 'Unknown';
        try {
            const d = date instanceof Date ? date : new Date(date);
            return d.toLocaleDateString();
        } catch {
            return 'Unknown';
        }
    };

    /**
     * Helper function to execute a task with progress reporting
     * @param title Progress notification title
     * @param task The async task to execute
     * @returns The result of the task
     */
    async function withProgress<T>(title: string, task: (progress: vscode.Progress<{ increment: number, message?: string }>) => Promise<T>): Promise<T> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: false
        }, task);
    }

    /**
     * Ensures a GitHub token is available, showing an error message if not
     * @returns True if token is available, false otherwise
     */
    async function ensureGitHubToken(): Promise<boolean> {
        const token = await getToken();
        if (!token) {
            vscode.window.showWarningMessage('GitHub token is required. Run "Team X-Ray: Set GitHub Token" to provide one.');
            return false;
        }
        return true;
    }

    // Register main analysis command
    const analyzeRepositoryCommand = vscode.commands.registerCommand('teamxray.analyzeRepository', async () => {
        if (!await ensureGitHubToken()) {
            return;
        }
        
        await withProgress("Analyzing repository expertise...", async (progress) => {
            progress.report({ increment: 0, message: "Starting analysis..." });
            const analysis = await analyzer.analyzeRepository();
            if (analysis) {
                progress.report({ increment: 50, message: "Generating report..." });
                await analyzer.saveAnalysis(analysis);
                treeProvider.refresh(analysis);
                progress.report({ increment: 100, message: "Complete!" });
                webviewProvider.showAnalysisResults(analysis);
            }
        });
    });

    // Register find expert for file command
    const findExpertCommand = vscode.commands.registerCommand('teamxray.findExpertForFile', async (uri?: vscode.Uri) => {
        const token = await getToken();
        if (!token) {
            vscode.window.showWarningMessage('GitHub token is required to find file experts. Run "Team XRay: Set Github Token" to provide one.');
            return;
        }
        let filePath: string;
        let isContextMenu = false;

        if (uri) {
            // Command called from context menu
            filePath = uri.fsPath;
            isContextMenu = true;
        } else {
            // Command called from command palette - use active editor
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('No file selected. Please open a file or use the context menu.');
                return;
            }
            filePath = activeEditor.document.fileName;
        }

        // Function to display experts
        const displayExperts = (experts: Expert[]) => {
            if (experts && experts.length > 0) {
                // Show experts in quick pick
                const items = experts.map(expert => ({
                    label: `$(person) ${expert.name}`,
                    description: `${expert.expertise}% expertise`,
                    detail: `${expert.contributions} contributions | Specializations: ${(expert.specializations || []).join(', ')}`,
                    expert: expert
                }));

                vscode.window.showQuickPick(items, {
                    title: `Experts for ${vscode.workspace.asRelativePath(filePath)}`,
                    placeHolder: 'Select an expert to view details'
                }).then(selected => {
                    if (selected) {
                        // Show expert details with activity option
                        const expert = selected.expert;

                        const message = `${expert.name} (${expert.email})
Expertise: ${expert.expertise}%
Contributions: ${expert.contributions}
Last commit: ${safeFormatDate(expert.lastCommit)}
Specializations: ${(expert.specializations || []).join(', ')}`;

                        vscode.window.showInformationMessage(message, 'View Activity', 'Close').then(selection => {
                            if (selection === 'View Activity') {
                                getExpertRecentActivity(expert);
                            }
                        });
                    }
                });
            } else {
                vscode.window.showInformationMessage(`No experts found for ${vscode.workspace.asRelativePath(filePath)}`);
            }
        };

        // If called from context menu, find experts directly without progress indicator
        if (isContextMenu) {
            const experts = await analyzer.findExpertForFile(filePath);
            displayExperts(experts || []);
        } else {
            // Show progress indicator for command palette invocations
            withProgress("Finding experts for file...", async (progress) => {
                progress.report({ increment: 0, message: "Analyzing file..." });
                const experts = await analyzer.findExpertForFile(filePath);
                progress.report({ increment: 100, message: "Complete!" });
                displayExperts(experts || []);
                return null;
            });
        }
    });

    // Register show team overview command
    const showOverviewCommand = vscode.commands.registerCommand('teamxray.showTeamOverview', async () => {
        const lastAnalysis = analyzer.getLastAnalysis();
        if (lastAnalysis) {
            webviewProvider.showAnalysisResults(lastAnalysis);
        } else {
            const choice = await vscode.window.showInformationMessage(
                'No analysis available. Would you like to analyze the repository now?',
                'Analyze Repository',
                'Cancel'
            );

            if (choice === 'Analyze Repository') {
                vscode.commands.executeCommand('teamxray.analyzeRepository');
            }
        }
    });

    // Helper function to get expert recent activity via MCP
    async function getExpertRecentActivity(expert: any) {
        const token = await getToken();
        if (!token) {
            vscode.window.showWarningMessage('GitHub token is required to get expert activity. Run "Team XRay: Set Github Token" to provide one.');
            return;
        }
        const outputChannel = vscode.window.createOutputChannel('Team X-Ray Expert Activity');
        
        try {
            const mcpService = new CopilotMCPService(outputChannel);
            
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Getting recent activity for ${expert.name}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Connecting to GitHub MCP..." });

                const result = await mcpService.getExpertRecentActivity(expert.email, expert.name);
                
                if (result.success && result.activity) {
                    progress.report({ increment: 100, message: "Activity retrieved!" });
                    
                    // Display the activity using the MCP service
                    await mcpService.showExpertActivity(result.activity);
                    
                    vscode.window.showInformationMessage(`✅ Recent activity loaded for ${expert.name}`);
                } else {
                    progress.report({ increment: 100, message: "Failed" });
                    
                    outputChannel.show();
                    outputChannel.appendLine(`❌ Failed to get activity for ${expert.name}: ${result.error}`);
                    
                    vscode.window.showWarningMessage(
                        `Could not get recent activity for ${expert.name}. ${result.error || 'Please check MCP configuration.'}`,
                        'View Logs'
                    ).then(choice => {
                        if (choice === 'View Logs') {
                            outputChannel.show();
                        }
                    });
                }
            });
            
        } catch (error) {
            outputChannel.show();
            outputChannel.appendLine(`❌ Error getting expert activity: ${error}`);
            vscode.window.showErrorMessage(`Error getting expert activity: ${error}`);
        }
    }

    // Register tree view commands
    const openFileFromTreeCommand = vscode.commands.registerCommand('teamxray.openFileFromTree', async (filePath: string) => {
        if (filePath) {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
                    const document = await vscode.workspace.openTextDocument(fullPath);
                    await vscode.window.showTextDocument(document);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
            }
        }
    });

    const showExpertDetailsCommand = vscode.commands.registerCommand('teamxray.showExpertDetails', async (expert: any) => {
        const token = await getToken();
        if (!token) {
            vscode.window.showWarningMessage('GitHub token is required to view expert details. Run "Team XRay: Set Github Token" to provide one.');
            return;
        }
        if (expert) {
            const message = `${expert.name}
Email: ${expert.email}
Expertise: ${expert.expertise}%
Contributions: ${expert.contributions}
Last Commit: ${safeFormatDate(expert.lastCommit)}
Specializations: ${(expert.specializations || []).join(', ')}`;

            const choice = await vscode.window.showInformationMessage(
                message, 
                'Copy Email', 
                'Get Recent Activity',
                'Close'
            );

            switch (choice) {
                case 'Copy Email':
                    vscode.env.clipboard.writeText(expert.email);
                    vscode.window.showInformationMessage('Email copied to clipboard!');
                    break;
                case 'Get Recent Activity':
                    await getExpertRecentActivity(expert);
                    break;
            }
        }
    });

    // Register status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'teamxray.showTeamOverview';
    statusBarItem.text = '$(organization) Team X-Ray';
    statusBarItem.tooltip = 'Show team expertise overview';
    statusBarItem.show();

    // Add all commands to subscriptions
    context.subscriptions.push(
        analyzeRepositoryCommand,
        findExpertCommand,
        showOverviewCommand,
        openFileFromTreeCommand,
        showExpertDetailsCommand,
        statusBarItem
    );

    // Check if we have a previous analysis and update the tree view
    const lastAnalysis = analyzer.getLastAnalysis();
    if (lastAnalysis) {
        treeProvider.refresh(lastAnalysis);
        vscode.commands.executeCommand('setContext', 'teamxray.hasAnalysis', true);
    }

    // Show welcome message for first-time users
    const hasShownWelcome = context.globalState.get('teamxray.hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Welcome to MCP Team X-Ray! Analyze your team\'s expertise to find the right experts for any code.',
            'Analyze Repository',
            'Learn More'
        ).then(choice => {
            switch (choice) {
                case 'Analyze Repository':
                    vscode.commands.executeCommand('teamxray.analyzeRepository');
                    break;
                case 'Learn More':
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/mcp-team-xray'));
                    break;
            }
        });
        context.globalState.update('teamxray.hasShownWelcome', true);
    }
}

// This method is called when your extension is deactivated
export function deactivate() {
    console.log('MCP Team X-Ray extension deactivated');
}