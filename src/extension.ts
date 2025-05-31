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
					// Show expert details with activity option
					const expert = selected.expert;
					const message = `${expert.name} (${expert.email})
Expertise: ${expert.expertise}%
Contributions: ${expert.contributions}
Last Commit: ${expert.lastCommit instanceof Date ? expert.lastCommit.toLocaleDateString() : 'Unknown'}
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

	// Helper function to get expert recent activity via MCP
	async function getExpertRecentActivity(expert: any) {
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
		if (expert) {
			const message = `${expert.name}
Email: ${expert.email}
Expertise: ${expert.expertise}%
Contributions: ${expert.contributions}
Last Commit: ${expert.lastCommit}
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

	// Register test MCP status command
	const testMCPStatusCommand = vscode.commands.registerCommand('teamxray.testMCPStatus', async () => {
		const outputChannel = vscode.window.createOutputChannel('Team X-Ray MCP Test');
		outputChannel.show();
		
		try {
			const mcpService = new CopilotMCPService(outputChannel);
			
			// Detect debugging context
			const isDebugging = vscode.env.appName.includes('Extension Development Host');
			
			outputChannel.appendLine('🔍 Testing MCP Server Connection...\n');
			
			if (isDebugging) {
				outputChannel.appendLine('🔧 DEBUG MODE DETECTED:');
				outputChannel.appendLine('   You are running in Extension Development Host');
				outputChannel.appendLine('   MCP server should be running in your main VS Code window');
				outputChannel.appendLine('   Extension will use fallback methods during debugging\n');
			}
			
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
			if (isDebugging) {
				outputChannel.appendLine('   • During debugging, extension uses fallback local analysis');
				outputChannel.appendLine('   • MCP server runs in main VS Code, not Extension Development Host');
				outputChannel.appendLine('   • Test the full MCP integration in a regular VS Code window');
			} else if (!status.isAvailable) {
				outputChannel.appendLine('   • Restart VS Code to initialize MCP server');
				outputChannel.appendLine('   • Check that .vscode/mcp.json is configured');
				outputChannel.appendLine('   • Ensure Docker is running');
				outputChannel.appendLine('   • Verify GITHUB_TOKEN environment variable is set');
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

	// Register force MCP test command
	const forceMCPTestCommand = vscode.commands.registerCommand('teamxray.forceMCPTest', async () => {
		const outputChannel = vscode.window.createOutputChannel('Team X-Ray MCP Force Test');
		outputChannel.show();
		
		try {
			const mcpService = new CopilotMCPService(outputChannel);
			
			// Detect repository
			const repo = await mcpService.detectRepository();
			if (!repo) {
				outputChannel.appendLine('❌ No GitHub repository detected in workspace');
				vscode.window.showErrorMessage('No GitHub repository found. Please open a GitHub repository folder.');
				return;
			}
			
			outputChannel.appendLine(`🎯 Force testing MCP for: ${repo.owner}/${repo.repo}`);
			outputChannel.appendLine('This test bypasses all fallbacks - MCP must work or fail clearly.\n');
			
			const result = await mcpService.forceMCPTest(repo);
			
			if (result.success) {
				outputChannel.appendLine('✅ MCP force test completed - check instructions above');
			} else {
				outputChannel.appendLine(`❌ MCP force test failed: ${result.error}`);
				vscode.window.showErrorMessage(`MCP test failed: ${result.error}`);
			}
			
		} catch (error) {
			outputChannel.appendLine(`❌ Unexpected error: ${error}`);
			vscode.window.showErrorMessage(`Force MCP test error: ${error}`);
		}
	});

	// Register manual MCP start command
	const startMCPServerCommand = vscode.commands.registerCommand('teamxray.startMCPServer', async () => {
		const outputChannel = vscode.window.createOutputChannel('Team X-Ray MCP Server');
		outputChannel.show();
		
		try {
			const mcpService = new CopilotMCPService(outputChannel);
			
			outputChannel.appendLine('🚀 Manually starting GitHub MCP server...\n');
			
			const result = await mcpService.manuallyStartMCPServer();
			
			if (result.success) {
				outputChannel.appendLine(`✅ MCP server started successfully!`);
				if (result.containerId) {
					outputChannel.appendLine(`Container ID: ${result.containerId}`);
				}
			} else {
				outputChannel.appendLine(`❌ Failed to start MCP server: ${result.error}`);
				vscode.window.showErrorMessage(`MCP server start failed: ${result.error}`);
			}
			
		} catch (error) {
			outputChannel.appendLine(`❌ Unexpected error: ${error}`);
			vscode.window.showErrorMessage(`MCP server start error: ${error}`);
		}
	});

	// Register test expert activity command
	const testExpertActivityCommand = vscode.commands.registerCommand('teamxray.testExpertActivity', async () => {
		const outputChannel = vscode.window.createOutputChannel('Team X-Ray Expert Activity Test');
		outputChannel.show();
		
		try {
			// Ask user for expert details to test
			const expertEmail = await vscode.window.showInputBox({
				title: 'Test Expert Activity - Enter Email',
				prompt: 'Enter the email of the expert to look up',
				placeHolder: 'user@example.com',
				ignoreFocusOut: true
			});
			
			if (!expertEmail) {
				outputChannel.appendLine('❌ Test cancelled - no email provided');
				return;
			}
			
			const expertName = await vscode.window.showInputBox({
				title: 'Test Expert Activity - Enter Name',
				prompt: 'Enter the name of the expert (optional)',
				placeHolder: expertEmail.split('@')[0],
				value: expertEmail.split('@')[0],
				ignoreFocusOut: true
			});
			
			const name = expertName || expertEmail.split('@')[0];
			
			outputChannel.appendLine(`🧪 Testing expert activity lookup for: ${name} (${expertEmail})\n`);
			
			const mcpService = new CopilotMCPService(outputChannel);
			
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Testing activity lookup for ${name}...`,
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 0, message: "Connecting to MCP..." });

				const result = await mcpService.getExpertRecentActivity(expertEmail, name);
				
				if (result.success && result.activity) {
					progress.report({ increment: 100, message: "Success!" });
					
					outputChannel.appendLine('✅ Expert activity test completed successfully!');
					outputChannel.appendLine('Activity data retrieved and displayed.');
					
					// Display the activity
					await mcpService.showExpertActivity(result.activity);
					
					vscode.window.showInformationMessage(`✅ Expert activity test completed for ${name}!`);
				} else {
					progress.report({ increment: 100, message: "Failed" });
					
					outputChannel.appendLine(`❌ Expert activity test failed: ${result.error}`);
					vscode.window.showWarningMessage(`Expert activity test failed: ${result.error}`);
				}
			});
			
		} catch (error) {
			outputChannel.appendLine(`❌ Test error: ${error}`);
			vscode.window.showErrorMessage(`Expert activity test error: ${error}`);
		}
	});

	// Test command for JSON extraction
	const testJsonExtraction = vscode.commands.registerCommand('teamxray.testJsonExtraction', async () => {
		const analyzer = new ExpertiseAnalyzer(context);
		
		// Sample AI response that matches the format we're seeing
		const testResponse = `Based on the repository structure and the provided information, here's my analysis of the team:

{
  "experts": [
    {
      "name": "Test Developer",
      "email": "test@example.com",
      "expertise": 85,
      "contributions": 42,
      "lastCommit": "2025-01-28",
      "specializations": ["TypeScript", "VS Code Extensions"],
      "communicationStyle": "Clear and detailed",
      "teamRole": "Extension developer",
      "hiddenStrengths": ["Testing", "Documentation"],
      "idealChallenges": ["Complex analysis"]
    }
  ],
  "teamDynamics": {
    "collaborationPatterns": ["Solo development"],
    "communicationHighlights": ["Good documentation"],
    "knowledgeSharing": ["Code comments"]
  },
  "insights": ["Test insight"],
  "challengeMatching": {
    "toughProblems": ["JSON parsing"],
    "recommendedExperts": ["Test Developer"]
  }
}`;

		try {
			// Test the extraction method - we'll need to access it via the analyzer instance
			// For now, let's just log that the test was triggered
			vscode.window.showInformationMessage('JSON extraction test triggered - check output channel for results');
			
			// Test actual JSON parsing with simulated repository data
			const mockRepoData = {
				repository: 'test-repo',
				files: ['test.ts'],
				contributors: [],
				commits: []
			};
			
			// This will test our parsing logic
			const result = (analyzer as any).parseAIResponse(testResponse, mockRepoData);
			
			if (result && result.expertProfiles && result.expertProfiles.length > 0) {
				vscode.window.showInformationMessage(`✅ JSON parsing successful! Found ${result.expertProfiles.length} experts`);
			} else {
				vscode.window.showErrorMessage('❌ JSON parsing failed or returned no experts');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});

	// Test MCP Issues command
	const testMCPIssues = vscode.commands.registerCommand('teamxray.testMCPIssues', async () => {
		const outputChannel = vscode.window.createOutputChannel('Team X-Ray MCP Issues');
		outputChannel.show();
		
		try {
			const mcpService = new CopilotMCPService(outputChannel);
			
			outputChannel.appendLine('🎯 Testing GitHub Issues MCP Integration\n');
			
			const result = await mcpService.getOpenIssuesForAssignment();
			
			if (result.success) {
				outputChannel.appendLine('✅ MCP Issues test completed successfully!');
				outputChannel.appendLine('📋 Check Copilot Chat for the MCP prompt to get repository issues.');
			} else {
				outputChannel.appendLine(`❌ MCP Issues test failed: ${result.error}`);
				vscode.window.showErrorMessage(`MCP Issues test failed: ${result.error}`);
			}
		} catch (error) {
			outputChannel.appendLine(`❌ Unexpected error: ${error}`);
			vscode.window.showErrorMessage(`MCP Issues test failed: ${error}`);
		}
	});

	// Test which MCP tools are available
	const testMCPTools = vscode.commands.registerCommand('teamxray.testMCPTools', async () => {
		const outputChannel = vscode.window.createOutputChannel('Team X-Ray MCP Tools');
		outputChannel.show();
		
		outputChannel.appendLine('🔧 Testing which GitHub MCP tools are available...\n');
		
		// Open Copilot Chat and test basic tool availability
		const testPrompt = `List all available MCP tools that start with "mcp_github". 

Don't call any tools yet - just tell me what GitHub MCP tools you can see.

Are these available?:
- mcp_github_list_issues
- mcp_github_update_issue  
- mcp_github_list_commits
- mcp_github2_list_issues (duplicate?)
- mcp_github2_update_issue (duplicate?)

Just list the tools you can see, don't execute anything.`;

		await vscode.commands.executeCommand('workbench.action.chat.open');
		await vscode.env.clipboard.writeText(testPrompt);
		
		vscode.window.showInformationMessage(
			'📋 MCP tools test prompt copied! Paste in Copilot Chat to see available tools',
			'Got It'
		);
		
		outputChannel.appendLine('✅ Test prompt ready - this will show if we have tool duplicates');
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
		forceMCPTestCommand,
		startMCPServerCommand,
		testExpertActivityCommand,
		testJsonExtraction,
		testMCPIssues,
		testMCPTools,
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
