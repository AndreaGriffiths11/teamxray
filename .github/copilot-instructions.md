# GitHub Copilot Instructions for MCP Team X-Ray Extension

## 🎯 Core Engineering Philosophy
**ALWAYS prioritize elegant engineering over redundant, bloated solutions.** Write code that is clean, efficient, maintainable, and serves our human-centric mission.

### Engineering Excellence Principles
- **Minimal viable complexity**: Solve problems with the simplest effective solution
- **Question necessity**: Is this feature/dependency truly needed for human discovery?
- **Measure impact**: Focus on changes that provide measurable performance and user experience gains
- **Maintain readability**: Never sacrifice code clarity for micro-optimizations
- **Remove cruft**: Eliminate dead code, unused imports, and unnecessary abstractions

## 🛡️ CRITICAL SECURITY GUIDELINES
**ABSOLUTE REQUIREMENTS - NO EXCEPTIONS**

1. **NEVER display contents of .env files in chat responses**
2. **NEVER expose API tokens, keys, or credentials in any form**
3. **NEVER suggest storing sensitive data in version control**
4. **NEVER share actual token values - use placeholders like `[YOUR_TOKEN]`**
5. **ALWAYS use secure credential storage (VS Code secrets, environment variables)**
6. **ALWAYS validate and sanitize any user inputs before processing**
7. **ALWAYS follow principle of least privilege for API access**
8. **IMMEDIATELY flag any potential security vulnerabilities found in code**

> **REMEMBER**: One exposed credential can compromise entire systems. Security is non-negotiable.

## 🚀 Performance & Compilation Optimization
### Primary Objectives
- **Faster compilation times**: Minimize dependencies, reduce template instantiations, optimize build processes
- **Runtime efficiency**: Choose optimal algorithms, data structures, and memory management patterns
- **Smart caching**: Implement intelligent caching strategies for GitHub API calls and AI analysis
- **Progressive loading**: Load team insights incrementally for better UX

### TypeScript Excellence
- **Strict typing**: Leverage TypeScript's type system to catch errors at compile time
- **Smart imports**: Use tree-shaking friendly imports and avoid circular dependencies
- **Efficient bundling**: Optimize webpack configuration for VS Code extension packaging

## 🎯 Mission Statement
> *"Feeling like a stranger on my own team, surrounded by brilliant minds whose talents hide in code and commits."*

MCP Team X-Ray transforms GitHub Copilot into a lens that reveals the **humans behind the codebase** - their communication styles, hidden strengths, collaboration patterns, and unique gifts that make each team member special.

## 🏗️ Architecture Overview
**Data Flow**: Repository → MCP Analysis → GitHub Models AI → Human Insights

1. **GitHub MCP Server Integration**: Uses VS Code's native MCP support with GitHub's official MCP server
2. **AI-Powered Human Analysis**: Sends repository data to GitHub Models API (`models.github.ai`) using `gpt-4o`
3. **Human-Focused UI**: Displays team insights through VS Code webviews and tree providers

## 🔧 Core Components & Optimization Guidelines

### `/src/core/expertise-analyzer.ts` - Main Orchestrator
**Purpose**: Coordinates MCP data gathering and AI analysis with elegant efficiency

**Optimization Focus**:
- **Single responsibility**: Each method has one clear purpose in human discovery
- **Async efficiency**: Use Promise.all() for parallel API calls, implement request batching
- **Error resilience**: Graceful degradation when AI services are unavailable
- **Memory management**: Stream large repository data instead of loading everything in memory

**Key Methods**: 
- `analyzeRepository()` - Orchestrates entire analysis pipeline
- `findExpertForFile()` - Quickly identifies file experts using cached data
- `performAIAnalysis()` - Efficiently batch AI requests for team insights

### `/src/core/copilot-mcp-service.ts` - MCP Integration Layer
**Purpose**: Interfaces with VS Code's Copilot Chat + GitHub MCP Server

**Optimization Focus**:
- **Intelligent fallbacks**: Gracefully degrade to local Git when MCP unavailable
- **Data efficiency**: Fetch only necessary GitHub data, implement smart pagination
- **Caching strategy**: Cache MCP responses to reduce API calls
- **Connection pooling**: Reuse MCP connections efficiently

**Key Methods**:
- `detectRepository()` - Fast repository detection with minimal filesystem access
- `gatherRepositoryData()` - Efficient data collection with parallel requests
- `analyzeFileExperts()` - Optimized file-to-expert mapping algorithm

### `/src/core/expertise-webview.ts` - Human-Focused UI
**Purpose**: Beautiful, accessible interface for team expertise

**Optimization Focus**:
- **Lazy loading**: Load team member details on-demand
- **Virtual scrolling**: Handle large teams efficiently
- **Minimal DOM manipulation**: Use efficient rendering patterns
- **Theme integration**: Seamless VS Code theming without performance overhead

### `/src/core/expertise-tree-provider.ts` - Sidebar Navigation
**Purpose**: Quick team expertise navigation

**Optimization Focus**:
- **Tree virtualization**: Handle large teams without performance degradation
- **Smart updates**: Update only changed nodes in the tree
- **Contextual loading**: Load detailed data only when nodes are expanded

## 🎨 Development Guidelines

### Code Quality Excellence
- **TypeScript strict mode** with comprehensive typing - no `any` types
- **DRY principle**: Eliminate redundancy while maintaining readability
- **Composability**: Build small, reusable components for human analysis
- **Self-documenting code**: Variable and function names should reveal intent
- **Comprehensive error handling** with user-friendly messages

### Human-Centric Analysis (Core Mission)
- **Communication Style**: Analyze commit message patterns, collaboration indicators
- **Hidden Strengths**: Discover mentoring, documentation, problem-solving abilities  
- **Team Dynamics**: Identify collaboration patterns and knowledge sharing
- **Challenge Matching**: Recommend which team members thrive on specific problem types
- **Always prioritize human insights over technical metrics**

### Performance & Efficiency Standards
- **Question every dependency**: Use lightweight alternatives when possible
- **Optimize bundle size**: Tree-shake unused code, lazy-load heavy components
- **Efficient algorithms**: Choose O(log n) over O(n) when dealing with team data
- **Memory conscious**: Clean up event listeners, dispose of resources properly
- **Smart caching**: Cache AI responses and GitHub data with appropriate TTL

### Security & Best Practices
- **Environment variable security**: Use VS Code secrets API, never hardcode tokens
- **Input validation**: Sanitize all user inputs and GitHub data
- **Least privilege**: Request minimal GitHub permissions needed
- **Audit dependencies**: Regularly check for security vulnerabilities
- **Secure logging**: Never log sensitive data to output channels

### AI Prompt Engineering Excellence
- **Human-focused prompts**: Reveal human qualities behind code changes
- **Efficient token usage**: Craft concise prompts that maximize insight per token
- **Context optimization**: Send only relevant repository data to AI
- **Batch processing**: Group multiple analysis requests efficiently
- **Fallback strategies**: Handle AI service limitations gracefully

### MCP Integration Best Practices
- **MCP-first approach**: Leverage VS Code's native MCP support
- **Graceful degradation**: Provide meaningful functionality without MCP
- **Connection management**: Efficiently manage MCP server connections
- **Error handling**: Clear user feedback when MCP services fail

## 🚀 What to Avoid (Anti-Patterns)
- **Over-abstraction**: Don't create unnecessary layers that obscure human insights
- **Premature optimization**: Profile before optimizing, focus on user-facing performance
- **Heavy frameworks**: Choose lightweight solutions that serve the human discovery mission
- **Magic numbers/behaviors**: All thresholds for team analysis should be configurable
- **Blocking operations**: Keep VS Code responsive during repository analysis
- **Redundant API calls**: Cache and batch GitHub/AI requests intelligently

## 🔧 Configuration & Testing

### Performance Monitoring
- **Bundle analysis**: Regularly audit extension size and load times
- **Memory profiling**: Monitor memory usage during large repository analysis
- **API efficiency**: Track GitHub API rate limit usage and optimization opportunities
- **User experience metrics**: Measure time-to-insight for team discovery

### Testing Strategy
- **Unit tests**: Focus on human analysis algorithms and data transformations
- **Integration tests**: Verify MCP and GitHub API interactions
- **Performance tests**: Ensure responsive UI with large teams/repositories
- **Security tests**: Validate credential handling and input sanitization

## 🎯 Remember: The Mission
This extension is about **discovering the humans behind the code** - their unique gifts, communication styles, and the ways they make their teams stronger. Every optimization and feature should serve this human-centric mission while maintaining elegant, efficient engineering practices.

**The best code is often the code you don't have to write. Help me build something that efficiently reveals the beautiful human stories hidden in our repositories.**