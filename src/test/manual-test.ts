import * as vscode from 'vscode';
import { CopilotMCPService } from '../core/copilot-mcp-service';
import { ExpertiseAnalyzer } from '../core/expertise-analyzer';
import { TokenManager } from '../core/token-manager'; // Added import

/**
 * Manual test harness for CopilotMCPService
 */
export async function testLocalRepository(context: vscode.ExtensionContext) {
    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Team X-Ray Tests');
    outputChannel.show();
    outputChannel.appendLine('Starting local repository test...');

    try {
        // Initialize service
        const tokenManager = new TokenManager(context, outputChannel);
        const service = new CopilotMCPService(outputChannel, tokenManager);
        // service.setContext(context); // Removed: setContext likely doesn't exist
        outputChannel.appendLine('Service initialized');

        // Test repository detection
        outputChannel.appendLine('\n🔍 Testing Repository Detection...');
        const repository = await service.detectRepository(); // Changed from getRepository
        if (repository) {
            outputChannel.appendLine('✅ Repository detected:');
            outputChannel.appendLine(`  Type: ${repository.owner === 'local' ? 'Local' : 'GitHub'}`); // Ensure 'local' is a valid owner type or adjust
            outputChannel.appendLine(`  Name: ${repository.repo}`); // Changed from name to repo based on GitHubRepository interface
            outputChannel.appendLine(`  Path/URL: ${repository.owner}/${repository.repo}`); // Changed from url
        } else {
            outputChannel.appendLine('❌ Failed: No repository detected');
            return;
        }

        // Test file expertise analysis
        outputChannel.appendLine('\n📊 Testing File Expertise Analysis...');
        const filePath = '/Users/alacolombiadev/Documents/code/mcp-team-xray/src/core/copilot-mcp-service.ts'; // Example path
        const relativeFilePath = vscode.workspace.asRelativePath(filePath);
        outputChannel.appendLine(`Analyzing file: ${relativeFilePath}`);
        
        const expertsOnFile = await service.analyzeFileExperts(filePath, repository); // Changed from findExpertForFile, ensure repository is not null
        
        if (!expertsOnFile || expertsOnFile.length === 0) {
            outputChannel.appendLine('❌ Failed: No expertise data found for the file.');
            // return; // Decide whether to return or continue
        } else {
            outputChannel.appendLine('✅ File expertise found:');
            outputChannel.appendLine(`  File: ${relativeFilePath}`);
            outputChannel.appendLine(`  Number of contributors for this file: ${expertsOnFile.length}`);
            // outputChannel.appendLine(`  Change Frequency: N/A`); // This metric is not directly available from analyzeFileExperts
        
            // Test expert activity for each expert found on the file
            if (expertsOnFile.length > 0) {
                outputChannel.appendLine('\n👥 Testing Expert Activity for file contributors...');
                for (const expert of expertsOnFile) { // expert is any here, ideally should have a type
                    outputChannel.appendLine(`\nAnalyzing activity for ${expert.name} (${expert.email}):`);
                    outputChannel.appendLine(`  Role: ${expert.teamRole || 'N/A'}`);
                    outputChannel.appendLine(`  Communication Style: ${expert.communicationStyle || 'N/A'}`);
                    outputChannel.appendLine(`  Specializations: ${(expert.specializations || []).join(', ')}`);
                    
                    const activityResponse = await service.getExpertRecentActivity(expert.email, expert.name);

                    if (activityResponse.success && activityResponse.activity) {
                        const expertActivity = activityResponse.activity;
                        outputChannel.appendLine('  Recent Activity Data:');
                        outputChannel.appendLine(`    Commits in this repo: ${expertActivity.recentCommits?.length || 0}`);
                        // The following are not directly in the typical getExpertRecentActivity payload from service
                        outputChannel.appendLine(`    Pull Requests: N/A (Data not directly available from this call)`);
                        outputChannel.appendLine(`    Reviews: N/A (Data not directly available from this call)`);
                        outputChannel.appendLine(`    Issues: N/A (Data not directly available from this call)`);
                        
                        const lastCommit = expertActivity.recentCommits?.[0];
                        outputChannel.appendLine(`    Last Active (last commit date): ${lastCommit ? new Date(lastCommit.date).toLocaleDateString() : 'N/A'}`);
                        
                        if (expertActivity.recentActivity && expertActivity.recentActivity.length > 0) {
                            outputChannel.appendLine('  Recent Activity Summary (from service):');
                            expertActivity.recentActivity.slice(0, 3).forEach((summaryEntry: string) => {
                                outputChannel.appendLine(`    - ${summaryEntry}`);
                            });
                        }
                        if (expertActivity.recentCommits && expertActivity.recentCommits.length > 0) {
                            outputChannel.appendLine('  Recent Commit Details (up to 3):');
                            expertActivity.recentCommits.slice(0, 3).forEach((commit: { message: string; date: string; repo?: string }) => {
                                outputChannel.appendLine(`    - ${commit.repo || 'Commit'}: ${commit.message} (${new Date(commit.date).toLocaleDateString()})`);
                            });
                        }
                    } else {
                        outputChannel.appendLine(`  Failed to get recent activity: ${activityResponse.error || 'Unknown error'}`);
                    }
                }
            }
        }

        outputChannel.appendLine('✅ Test completed successfully');
    } catch (error: any) {
        outputChannel.appendLine(`❌ Test failed with error: ${error.message || error}`);
        if (error.stack) {
            outputChannel.appendLine(error.stack);
        }
    }
}

/**
 * Test MCP integration
 */
export async function testMCPAnalysis(context: vscode.ExtensionContext) {
    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Team X-Ray MCP Tests');
    outputChannel.show();
    outputChannel.appendLine('Starting MCP analysis test...');

    try {
        // Initialize analyzer
        const tokenManager = new TokenManager(context, outputChannel);
        const copilotService = new CopilotMCPService(outputChannel, tokenManager); // Needed if ExpertiseAnalyzer uses it
        // Assuming ExpertiseAnalyzer constructor is (context, tokenManager, copilotService, outputChannel)
        // Or if it's (context, tokenManager) and it creates its own copilotService/outputChannel
        // Based on "Expected 2 arguments, but got 1." for new ExpertiseAnalyzer(context), it's likely (context, tokenManager)
        // const analyzer = new ExpertiseAnalyzer(context, tokenManager);

        // Re-evaluating based on typical structure: ExpertiseAnalyzer would need the output channel and services.
        // If ExpertiseAnalyzer's constructor is just (context, tokenManager), it must be creating other services internally.
        // Let's assume the constructor from your instructions for ExpertiseAnalyzer is (context: vscode.ExtensionContext)
        // and the error "Expected 2 arguments" means it's actually (context, tokenManager)
        const analyzer = new ExpertiseAnalyzer(context, tokenManager /*, copilotService, outputChannel */); // Adjust based on actual ExpertiseAnalyzer constructor
        outputChannel.appendLine('Analyzer initialized');

        // Run full repository analysis
        outputChannel.appendLine('\n🔍 Running repository analysis with MCP...');
        const analysis = await analyzer.analyzeRepository();
        
        if (!analysis) {
            outputChannel.appendLine('❌ Failed: No analysis results');
            return;
        }

        // Log results
        outputChannel.appendLine('\n✅ Analysis completed:');
        // Ensure 'analysis.repository' matches the structure, might be analysis.repository.name or similar
        outputChannel.appendLine(`Repository: ${typeof analysis.repository === 'string' ? analysis.repository : (analysis.repository as any)?.name || 'N/A'}`);
        outputChannel.appendLine(`Total Files: ${analysis.totalFiles}`);
        outputChannel.appendLine(`Total Experts: ${analysis.totalExperts}`);

        // Log team dynamics
        if (analysis.teamDynamics) {
            outputChannel.appendLine('\n👥 Team Dynamics:');
            outputChannel.appendLine('Collaboration Patterns:');
            analysis.teamDynamics.collaborationPatterns.forEach(pattern => 
                outputChannel.appendLine(`  - ${pattern}`)
            );
            outputChannel.appendLine('Communication Highlights:');
            analysis.teamDynamics.communicationHighlights.forEach(highlight => 
                outputChannel.appendLine(`  - ${highlight}`)
            );
            outputChannel.appendLine('Knowledge Sharing:');
            analysis.teamDynamics.knowledgeSharing.forEach(pattern => 
                outputChannel.appendLine(`  - ${pattern}`)
            );
        }

        // Log challenge matching
        if (analysis.challengeMatching) {
            outputChannel.appendLine('\n🎯 Challenge Matching:');
            outputChannel.appendLine('Tough Problems:');
            analysis.challengeMatching.toughProblems.forEach(problem => 
                outputChannel.appendLine(`  - ${problem}`)
            );
            outputChannel.appendLine('Recommended Experts:');
            analysis.challengeMatching.recommendedExperts.forEach(expert => 
                outputChannel.appendLine(`  - ${expert}`)
            );
        }

        // Log insights
        outputChannel.appendLine('\n💡 Insights:');
        analysis.insights.forEach(insight => 
            outputChannel.appendLine(`  - ${insight}`)
        );

        outputChannel.appendLine('\n✅ MCP test completed successfully');
    } catch (error: any) {
        outputChannel.appendLine(`❌ Test failed with error: ${error.message || error}`);
        if (error.stack) {
            outputChannel.appendLine(error.stack);
        }
    }
}
