import * as vscode from 'vscode';
import { ExpertiseAnalyzer } from './core/expertise-analyzer';
import { Expert } from './types/expert';
import { ExpertiseWebviewProvider } from './core/expertise-webview';
import { ExpertiseTreeProvider } from './core/expertise-tree-provider';
import { CopilotMCPService } from './core/copilot-mcp-service';
import { TokenManager } from './core/token-manager';
import { ErrorHandler } from './utils/error-handler';
import { ResourceManager } from './utils/resource-manager';
import { Validator } from './utils/validation';

// This method is called when the extension is activated
// extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Team X-Ray');
    
    // Initialize utilities
    ErrorHandler.initialize(outputChannel);
    const resourceManager = ResourceManager.getInstance();
    resourceManager.initialize(outputChannel);
    
    // Initialize the token manager
    const tokenManager = new TokenManager(context, outputChannel);
    
    // Command to allow user to set their GitHub token
    context.subscriptions.push(
        vscode.commands.registerCommand('teamxray.setGitHubToken', async () => {
            await ErrorHandler.withErrorHandling(async () => {
                const token = await tokenManager.promptForToken('Set your GitHub token');
                if (token) {
                    vscode.window.showInformationMessage('GitHub token saved successfully');
                } else {
                    vscode.window.showWarningMessage('GitHub token was not saved');
                }
            }, 'set GitHub token');
        })
    );

    // Initialize core components with token manager
    const analyzer = new ExpertiseAnalyzer(context, tokenManager);
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
     * Ensures a GitHub token is available, showing an error message if not
     */
    async function ensureGitHubToken(): Promise<boolean> {
        const token = await tokenManager.getToken();
        if (!token) {
            vscode.window.showErrorMessage('GitHub token is required. Please set your token using "Team X-Ray: Set GitHub Token" command.');
            return false;
        }
        return true;
    }
    
    // Register main analysis command
    const analyzeRepositoryCommand = vscode.commands.registerCommand('teamxray.analyzeRepository', async () => {
        await ErrorHandler.withErrorHandling(async () => {
            if (!await ensureGitHubToken()) {
                return;
            }
            
            await resourceManager.withProgress("Analyzing repository expertise...", async (progress) => {
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
        }, 'analyze repository');
    });

    // Register find expert for file command
    const findExpertCommand = vscode.commands.registerCommand('teamxray.findExpertForFile', async (uri?: vscode.Uri) => {
        await ErrorHandler.withErrorHandling(async () => {
            const token = await tokenManager.getToken();
            if (!token) {
                throw ErrorHandler.createTokenError('GitHub token is required to find file experts');
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
                    throw ErrorHandler.createValidationError('No file selected. Please open a file or use the context menu.');
                }
                filePath = activeEditor.document.fileName;
            }

            // Validate file path
            const validation = Validator.validateFilePath(filePath);
            if (!validation.isValid) {
                throw ErrorHandler.createValidationError(`Invalid file path: ${validation.errors.join(', ')}`);
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
                await resourceManager.withProgress("Finding experts for file...", async (progress) => {
                    progress.report({ increment: 0, message: "Analyzing file..." });
                    const experts = await analyzer.findExpertForFile(filePath);
                    progress.report({ increment: 100, message: "Complete!" });
                    displayExperts(experts || []);
                    return null;
                });
            }
        }, 'find expert for file');
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
        const token = await tokenManager.getToken();
        if (!token) {
            vscode.window.showWarningMessage('GitHub token is required to get expert activity. Run "Team XRay: Set Github Token" to provide one.');
            return;
        }
        const outputChannel = vscode.window.createOutputChannel('Team X-Ray Expert Activity');
        
        try {
            const mcpService = new CopilotMCPService(outputChannel, tokenManager);
            
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
        const token = await tokenManager.getToken();
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
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/AndreaGriffiths11/team-xray'));
                    break;
            }
        });
        context.globalState.update('teamxray.hasShownWelcome', true);
    }
}

// This method is called when your extension is deactivated
export function deactivate() {
    console.log('MCP Team X-Ray extension deactivated');
    
    // Cleanup resources
    const resourceManager = ResourceManager.getInstance();
    resourceManager.cleanup();
}