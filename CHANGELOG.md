# Change Log

All notable changes to the MCP Team X-Ray extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-01-18

### 🎉 Initial Release

### Added
- Human-focused team expertise analysis using GitHub MCP integration
- AI-powered analysis with GitHub Models API (gpt-4o) for communication styles
- VS Code webview for beautiful team insights visualization
- File-specific expert identification with right-click context menu
- Command palette integration for repository analysis
- Sidebar tree view for team navigation
- Graceful fallback to local Git analysis when MCP is unavailable
- Comprehensive CI/CD pipeline for automated testing and marketplace publishing

### Features
- **GitHub MCP Integration**: Uses VS Code's native MCP support with GitHub's official server
- **Right-click Analysis**: Context menu for quick file expert identification
- **Team Discovery**: Reveals hidden strengths and communication patterns
- **Beautiful UI**: VS Code-themed webviews with accessibility support
- **Progressive Enhancement**: Works offline with local Git fallback

### 🔒 Security Improvements
- **Enhanced Token Security**: Uses VS Code's SecretStorage API exclusively - no more process.env exposure
- **Input Validation**: Comprehensive validation for all user inputs, file paths, and API responses
- **Error Handling**: Consistent error reporting with user-friendly messages and technical logging
- **Resource Management**: Proper cleanup of processes and child processes to prevent memory leaks
- **Type Safety**: Eliminated all 'any' types with comprehensive TypeScript interfaces

### Technical
- TypeScript implementation with strict mode
- Comprehensive error handling and logging
- VS Code extension best practices
- Docker-based MCP server configuration
- Automated testing and quality validation
- Secure token management with validation and caching
- Resource leak prevention and proper cleanup

## [0.0.1] - 2025-05-28

### Added
- Initial extension structure and core functionality
- Basic team expertise analysis framework
- GitHub MCP server integration setup
- VS Code extension boilerplate with commands and menus