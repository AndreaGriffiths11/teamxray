// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ExpertiseAnalyzer } from './core/expertise-analyzer';
import { ExpertiseWebviewProvider } from './core/expertise-webview';
import { ExpertiseTreeProvider } from './core/expertise-tree-provider';
import { CopilotMCPService } from './core/copilot-mcp-service';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('MCP Team X-Ray extension is now active!');

	// Initialize core components
	const analyzer = new ExpertiseAnalyzer(context);
	const webviewProvider = new ExpertiseWebviewProvider(context);
	const treeProvider = new ExpertiseTreeProvider();

	// Register tree data provider
	vscode.window.registerTreeDataProvider('teamxray.expertiseView', treeProvider);

	// Register main analysis command
	const analyzeRepositoryCommand = vscode.commands.registerCommand('teamxray.analyzeRepository', async () => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Analyzing repository expertise...",
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 0, message: "Starting analysis..." });

			const analysis = await analyzer.analyzeRepository();
			if (analysis) {
				progress.report({ increment: 50, message: "Generating report..." });
				
				// Save analysis and update tree view
				await analyzer.saveAnalysis(analysis);
				treeProvider.refresh(analysis);
				
				progress.report({ increment: 100, message: "Complete!" });
				
				// Show results in webview
				webviewProvider.showAnalysisResults(analysis);
			}
		});
	});

	// Register find expert for file command
	const findExpertCommand = vscode.commands.registerCommand('teamxray.findExpertForFile', async (uri?: vscode.Uri) => {
		let filePath: string;

		if (uri) {
			// Command called from context menu
			filePath = uri.fsPath;
		} else {
			// Command called from command palette - use active editor
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showErrorMessage('No file selected. Please open a file or use the context menu.');
				return;
			}
			filePath = activeEditor.document.fileName;
		}

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Finding experts for file...",
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 0, message: "Analyzing file..." });

			const experts = await analyzer.findExpertForFile(filePath);
			if (experts && experts.length > 0) {
				progress.report({ increment: 100, message: "Complete!" });

				// Show experts in quick pick
				const items = experts.map(expert => ({
					label: `$(person) ${expert.name}`,
					description: `${expert.expertise}% expertise`,
					detail: `${expert.contributions} contributions | Specializations: ${(expert.specializations || []).join(', ')}`,
					expert: expert
				}));

				const selected = await vscode.window.showQuickPick(items, {
					title: `Experts for ${vscode.workspace.asRelativePath(filePath)}`,
					placeHolder: 'Select an expert to view details'
				});

				if (selected) {
					// Show expert details
					const expert = selected.expert;
					const message = `${expert.name} (${expert.email})
Expertise: ${expert.expertise}%
Contributions: ${expert.contributions}
Last Commit: ${expert.lastCommit instanceof Date ? expert.lastCommit.toLocaleDateString() : 'Unknown'}
Specializations: ${(expert.specializations || []).join(', ')}`;

					vscode.window.showInformationMessage(message, 'Copy Email').then(choice => {
						if (choice === 'Copy Email') {
							vscode.env.clipboard.writeText(expert.email);
							vscode.window.showInformationMessage('Email copied to clipboard!');
						}
					});
				}
			} else {
				vscode.window.showInformationMessage('No experts found for this file.');
			}
		});
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

	const showExpertDetailsCommand = vscode.commands.registerCommand('teamxray.showExpertDetails', (expert: any) => {
		if (expert) {
			const message = `${expert.name}
Email: ${expert.email}
Expertise: ${expert.expertise}%
Contributions: ${expert.contributions}
Last Commit: ${expert.lastCommit}
Specializations: ${(expert.specializations || []).join(', ')}`;

			vscode.window.showInformationMessage(message, 'Copy Email').then(choice => {
				if (choice === 'Copy Email') {
					vscode.env.clipboard.writeText(expert.email);
					vscode.window.showInformationMessage('Email copied to clipboard!');
				}
			});
		}
	});

	// Register test MCP status command
	const testMCPStatusCommand = vscode.commands.registerCommand('teamxray.testMCPStatus', async () => {
		const outputChannel = vscode.window.createOutputChannel('Team X-Ray MCP Test');
		outputChannel.show();
		
		try {
			const mcpService = new CopilotMCPService(outputChannel);
			
			outputChannel.appendLine('🔍 Testing MCP Server Connection...\n');
			
			// Test repository detection
			const repo = await mcpService.detectRepository();
			if (repo) {
				outputChannel.appendLine(`✅ Repository detected: ${repo.owner}/${repo.repo}\n`);
			} else {
				outputChannel.appendLine('❌ No GitHub repository detected\n');
			}
			
			// Test MCP server status
			const status = await mcpService.checkMCPServerStatus();
			outputChannel.appendLine('📊 MCP Server Status:');
			outputChannel.appendLine(`   Available: ${status.isAvailable ? '✅ Yes' : '❌ No'}`);
			
			if (status.containerName) {
				outputChannel.appendLine(`   Container: ${status.containerName}`);
				outputChannel.appendLine(`   Status: ${status.containerStatus}`);
			}
			
			if (status.error) {
				outputChannel.appendLine(`   Error: ${status.error}`);
			}
			
			outputChannel.appendLine('\n🔧 Recommendations:');
			if (!status.isAvailable) {
				outputChannel.appendLine('   • Restart VS Code to initialize MCP server');
				outputChannel.appendLine('   • Check that .vscode/mcp.json is configured');
				outputChannel.appendLine('   • Ensure Docker is running');
			} else {
				outputChannel.appendLine('   • MCP server is ready for use!');
				outputChannel.appendLine('   • Try running "Analyze Repository" command');
			}
			
		} catch (error) {
			outputChannel.appendLine(`❌ Test failed: ${error}`);
		}
	});

	// Register setup guidance command
	const setupGuidanceCommand = vscode.commands.registerCommand('teamxray.showSetupGuidance', async () => {
		const outputChannel = vscode.window.createOutputChannel('Team X-Ray Setup');
		outputChannel.show();
		
		outputChannel.appendLine('🚀 MCP Team X-Ray Setup Guide\n');
		outputChannel.appendLine('To use GitHub MCP integration, you need to configure a GitHub token:\n');
		
		outputChannel.appendLine('📋 OPTION 1: Environment Variable (Recommended)');
		outputChannel.appendLine('   1. Get a GitHub Personal Access Token from: https://github.com/settings/tokens');
		outputChannel.appendLine('   2. Set environment variable: export GITHUB_TOKEN=your_token_here');
		outputChannel.appendLine('   3. Restart VS Code');
		outputChannel.appendLine('');
		
		outputChannel.appendLine('📋 OPTION 2: VS Code Settings');
		outputChannel.appendLine('   1. Go to VS Code Settings (Cmd/Ctrl + ,)');
		outputChannel.appendLine('   2. Search for "teamxray.githubToken"');
		outputChannel.appendLine('   3. Enter your GitHub token');
		outputChannel.appendLine('');
		
		outputChannel.appendLine('🔧 Verify Setup:');
		outputChannel.appendLine('   • Run "Team X-Ray: Test MCP Server Status" command');
		outputChannel.appendLine('   • Check that Docker is running');
		outputChannel.appendLine('   • Ensure you have access to the GitHub repository');
		outputChannel.appendLine('');
		
		outputChannel.appendLine('🔒 Security Note:');
		outputChannel.appendLine('   Your GitHub token is kept secure and never exposed in logs or UI.');
		
		const choice = await vscode.window.showInformationMessage(
			'Setup guide displayed in output channel. Would you like to open GitHub token settings?',
			'Open Token Settings',
			'Test MCP Status',
			'Got It'
		);
		
		switch (choice) {
			case 'Open Token Settings':
				vscode.env.openExternal(vscode.Uri.parse('https://github.com/settings/tokens'));
				break;
			case 'Test MCP Status':
				vscode.commands.executeCommand('teamxray.testMCPStatus');
				break;
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
		testMCPStatusCommand,
		setupGuidanceCommand,
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
