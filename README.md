[![Build Status](https://github.com/AndreaGriffiths11/team-xray/workflows/CI%2FCD%20Pipeline/badge.svg)](https://github.com/AndreaGriffiths11/teamxray/actions)

# Team X-Ray VS Code Extension

> *"Feeling like a stranger on my own team, surrounded by brilliant minds whose talents hide in code and commits."*


Transform GitHub Copilot into team X-ray vision. Discover the humans behind the codebase, reveal hidden expertise, and understand how your teammates naturally collaborate.

## Features

- **🔍 File Expert Discovery** - Right-click any file to find who knows it best
- **🧠 Team Expertise Overview** - AI-powered analysis of communication styles and collaboration patterns  
- **🎯 Smart Challenge Matching** - Discover who thrives on different types of problems
- **⚡ MCP Integration** - Uses GitHub's Model Context Protocol for deep repository analysis
- **🎨 Pretty UI** - Modern webview interface with team insights and expert profiles

![Team X-Ray Demo](demo.gif)
## Installation & Setup

**Development Version** - Install from source:

```bash
git clone https://github.com/AndreaGriffiths11/team-xray.git
cd team-xray
npm install
npm run compile
npm install -g @vscode/vsce && vsce package
```

**Install the .vsix file in VS Code:**
- **Command Line:** `code --install-extension teamxray-0.0.1.vsix`
- **VS Code UI:** Extensions → "..." → "Install from VSIX..." → Select the .vsix file
- **Drag & Drop:** Drag the .vsix file into VS Code

**Setup GitHub Token:**
```bash
export GITHUB_TOKEN="your_github_token_here"
```

**Usage:**
- Right-click files → "Find Subject Matter Expert"
- Command Palette → "Team X-Ray: Analyze Team Expertise"

## How It Works

- **🔄 Real Git Analysis** - Analyzes commit history and contributor patterns
- **🤖 AI Analysis** - Uses GitHub Models API (GPT-4o) for human-centered insights (currently in Preview)
- **🔌 MCP Integration** - Leverages VS Code's Model Context Protocol with GitHub's official server
- **⚡ Smart Fallback** - Works offline with local Git when MCP unavailable

> **Note:** This extension uses the GitHub Models API, which is currently in Preview. During the Preview period, API usage is free with your GitHub token. When the Preview ends, you may need to update your token or adjust to usage limits based on GitHub's pricing model.

## Development

**Prerequisites:** Node.js 20+, VS Code 1.100.0+, Git repository

```bash
git clone https://github.com/AndreaGriffiths11/team-xray.git
cd team-xray
npm install
export GITHUB_TOKEN="your_token"
npm run compile
# Press F5 in VS Code to test
```

## Requirements

- VS Code 1.100.0+
- Node.js 20+
- GitHub repository with commit history
- GitHub token for enhanced features

## Coming Soon...

- VS Code Marketplace publication
- Real-time MCP status monitoring
- Advanced team collaboration insights
- Cross-repository expertise aggregation

---

**Stop being a stranger on your own team. Discover the brilliant minds around you.** 🚀
