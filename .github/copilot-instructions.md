# Copilot Instructions for MCP Team X-Ray Extension

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a VS Code extension project focused on **human discovery through code analysis**. Always use the `get_vscode_api` tool with relevant queries to fetch the latest VS Code API references.

## 🎯 Mission Statement
> *"Feeling like a stranger on my own team, surrounded by brilliant minds whose talents hide in code and commits."*

MCP Team X-Ray transforms GitHub Copilot into a lens that reveals the **humans behind the codebase** - their communication styles, hidden strengths, collaboration patterns, and unique gifts that make each team member special.

## 🏗️ Architecture Overview
**Data Flow**: Repository → MCP Analysis → GitHub Models AI → Human Insights

1. **GitHub MCP Server Integration**: Uses VS Code's native MCP support with GitHub's official MCP server
2. **AI-Powered Human Analysis**: Sends repository data to GitHub Models API (`models.github.ai`) using `gpt-4o`
3. **Human-Focused UI**: Displays team insights through VS Code webviews and tree providers

## 🔧 Core Components

### `/src/core/expertise-analyzer.ts`
- **Main orchestrator** that coordinates MCP data gathering and AI analysis
- Contains human-focused AI prompts that analyze communication styles and teamwork patterns
- Handles GitHub Models API integration with comprehensive error handling
- **Key Methods**: `analyzeRepository()`, `findExpertForFile()`, `performAIAnalysis()`

### `/src/core/copilot-mcp-service.ts` 
- **MCP Integration Layer** that interfaces with VS Code's Copilot Chat + GitHub MCP Server
- Detects GitHub repositories and gathers comprehensive team data
- Provides fallback to local Git analysis when MCP is unavailable
- **Key Methods**: `detectRepository()`, `gatherRepositoryData()`, `analyzeFileExperts()`

### `/src/core/expertise-webview.ts`
- **Human-focused webview** that displays team expertise in a beautiful, accessible interface
- Uses VS Code theming and modern web standards
- Shows expert profiles with communication styles, hidden strengths, and ideal challenges

### `/src/core/expertise-tree-provider.ts`
- **Sidebar tree view** for quick team expertise navigation
- Organized by team members and their areas of expertise
- Provides contextual actions for deeper analysis

## 🎨 Design Philosophy

### Human-Centric Analysis
- **Communication Style**: Analyze commit message patterns, collaboration indicators
- **Hidden Strengths**: Discover mentoring, documentation, problem-solving abilities
- **Team Dynamics**: Identify collaboration patterns and knowledge sharing
- **Challenge Matching**: Recommend which team members thrive on specific problem types

### Technical Excellence
- **MCP-First**: Leverage VS Code's native MCP support with GitHub's official server
- **Graceful Fallbacks**: When MCP unavailable, fall back to local Git analysis
- **Progressive Enhancement**: Basic functionality works without external dependencies
- **Comprehensive Logging**: Use `outputChannel` for detailed debugging information

## 🛠️ Development Guidelines

### Code Quality
- Use TypeScript strict mode with proper typing
- Follow VS Code extension best practices and security guidelines
- Implement comprehensive error handling with user-friendly messages
- Add extensive logging to `outputChannel` for debugging

### Human-Focused Features
- **Always prioritize human insights over technical metrics**
- Look for collaboration patterns, not just code contributions
- Analyze communication styles in commit messages and comments
- Identify mentoring relationships and knowledge sharing patterns
- Focus on team member strengths and growth opportunities

### AI Prompt Engineering
- Craft prompts that reveal human qualities behind code changes
- Ask about communication styles, teamwork patterns, hidden strengths
- Request insights about challenge matching and ideal project types
- Emphasize emotional intelligence and team dynamics

### MCP Integration
- Use `CopilotMCPService` for all GitHub data gathering
- Always provide fallback mechanisms for offline/MCP-unavailable scenarios
- Leverage VS Code's built-in MCP support rather than custom implementations
- Configure GitHub MCP Server via `.vscode/mcp.json`

### UI/UX Standards
- Use VS Code theming (`vscode.window.createWebviewPanel`)
- Implement accessible interfaces with proper ARIA labels
- Provide progress indicators for long-running operations
- Show clear error messages with actionable next steps
- Use consistent iconography and VS Code design patterns

## 🔧 Configuration Files

### `.vscode/mcp.json`
Configures GitHub MCP Server with Docker-based deployment:
- Uses GitHub's official MCP server image
- Configured toolsets: `repos,users,pull_requests,issues`
- Secure token handling via VS Code input prompts

### `package.json`
- Extension contributes commands for repository analysis and file expertise
- Context menus for right-click file analysis
- Configuration for GitHub Models API tokens

## 🚀 Testing Strategy
- **Manual Testing**: Use F5 debugging with real GitHub repositories
- **MCP Testing**: Verify GitHub MCP Server integration with various repo types
- **AI Testing**: Test GitHub Models API responses with different repository sizes
- **Fallback Testing**: Ensure graceful degradation when MCP/API unavailable

## 🎯 Future Enhancements
- Real-time team expertise updates via GitHub webhooks
- Integration with VS Code's chat interface for contextual queries
- Team collaboration recommendations based on expertise analysis
- Historical team evolution tracking and insights
- Cross-repository team expertise aggregation

Remember: This extension is about **discovering the humans behind the code** - their unique gifts, communication styles, and the ways they make their teams stronger. Every feature should serve this human-centric mission.
