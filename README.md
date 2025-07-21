# Team X-Ray VS Code Extension

> *"Feeling like a stranger on my own team, surrounded by brilliant minds whose talents hide in code and commits."*

Transform GitHub Copilot into team X-ray vision. Discover the humans behind your codebase, reveal hidden expertise, and understand how your teammates collaborate.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/AndreaGriffiths.teamxray?color=blue&label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray)

## Features

- **🔍 File Expert Discovery** – Right-click any file to find who knows it best
- **🧠 Team Expertise Overview** – AI-powered analysis of communication styles and collaboration patterns  
- **🎯 Smart Challenge Matching** – Discover who thrives on different types of problems
- **⚡ MCP Integration** – Uses GitHub's Model Context Protocol for deep repository analysis (optional, falls back to local Git)
- **🎨 Modern UI** – Webview interface with team insights and expert profiles

![Team X-Ray Demo](demo.gif)

## Installation

**From Marketplace:**

- [Install Team X-Ray directly from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray)

**Development Version:**

```bash
git clone https://github.com/AndreaGriffiths11/teamxray.git
cd teamxray
npm install
npm run compile
npm install -g @vscode/vsce && vsce package
```

**Install the .vsix file:**
- From terminal: `code --install-extension teamxray-0.0.1.vsix`
- VS Code UI: Extensions → "..." → "Install from VSIX..." → Select the file
- Drag & drop: Drag the `.vsix` file into VS Code

**Optional: Set up GitHub Token for advanced features**

```bash
export GITHUB_TOKEN="your_github_token_here"
```

## Usage

- Right-click files → "Find Subject Matter Expert"
- Command Palette → "Team X-Ray: Analyze Team Expertise"

## How It Works

- **🔄 Real Git Analysis** – Analyzes commit history and contributor patterns
- **🤖 AI Analysis** – Uses GitHub Models API (GPT-4o) for human-centered insights (optional, in Preview)
- **🔌 MCP Integration** – Leverages VS Code's Model Context Protocol with GitHub's official server; falls back to local analysis if unavailable

> **Note:** This extension uses the GitHub Models API, which is currently in Preview. During the Preview period, API usage is free up to a credit limit. If you reach the free credit limit, please switch over to billed usage. 

## Development

**Prerequisites:** Node.js 20+, VS Code 1.100.0+, Git repository

```bash
git clone https://github.com/AndreaGriffiths11/teamxray.git
cd teamxray
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

## Coming Soon

- Real-time MCP status monitoring
- Advanced team collaboration insights
- Cross-repository expertise aggregation

---

## Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AndreaGriffiths.teamxray)
- [GitHub Repository](https://github.com/AndreaGriffiths11/teamxray)
- [Report Issues](https://github.com/AndreaGriffiths11/teamxray/issues)

---

**Stop being a stranger on your own team. Discover the brilliant minds around you.** 🚀

