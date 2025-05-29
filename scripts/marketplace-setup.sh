#!/bin/bash

# MCP Team X-Ray Extension - Marketplace Setup Script
# This script helps configure the extension for VS Code Marketplace publishing

echo "🎯 MCP Team X-Ray - Marketplace Setup"
echo "======================================"
echo ""

# Check if user is logged into vsce
echo "📋 Checking VSCE authentication..."
if vsce ls-publishers 2>/dev/null | grep -q "alacolombiadev"; then
    echo "✅ Already authenticated with VSCE publisher 'alacolombiadev'"
else
    echo "⚠️  Not authenticated with VSCE. Please follow these steps:"
    echo ""
    echo "1. 🌐 Visit https://dev.azure.com/"
    echo "2. 🔑 Create a Personal Access Token with 'Marketplace' scope"
    echo "3. 💻 Run: vsce login alacolombiadev"
    echo "4. 📝 Enter your Personal Access Token when prompted"
    echo ""
    echo "📖 Full guide: https://code.visualstudio.com/api/working-with-extensions/publishing-extension"
fi

echo ""
echo "🔧 Repository Secrets Setup"
echo "================================"
echo ""
echo "For automated publishing, configure these GitHub repository secrets:"
echo ""
echo "🔑 VSCE_PAT:"
echo "   - Same Personal Access Token from Azure DevOps"
echo "   - Used for automated marketplace publishing"
echo "   - Set at: https://github.com/AndreaGriffiths11/mcp-team-xray/settings/secrets/actions"
echo ""

# Check current package.json configuration
echo "📦 Current Extension Configuration"
echo "=================================="
echo ""

if [ -f "package.json" ]; then
    NAME=$(jq -r '.name' package.json)
    DISPLAY_NAME=$(jq -r '.displayName' package.json)
    VERSION=$(jq -r '.version' package.json)
    PUBLISHER=$(jq -r '.publisher' package.json)
    DESCRIPTION=$(jq -r '.description' package.json)
    
    echo "📋 Extension Details:"
    echo "   Name: $NAME"
    echo "   Display Name: $DISPLAY_NAME"
    echo "   Version: $VERSION"
    echo "   Publisher: $PUBLISHER"
    echo "   Description: $DESCRIPTION"
    echo ""
    
    # Check for icon
    if jq -e '.icon' package.json > /dev/null; then
        ICON_PATH=$(jq -r '.icon' package.json)
        if [ -f "$ICON_PATH" ]; then
            echo "✅ Icon: $ICON_PATH (found)"
        else
            echo "❌ Icon: $ICON_PATH (not found)"
        fi
    else
        echo "⚠️  No icon specified"
    fi
    
    # Check for license
    if [ -f "LICENSE" ]; then
        echo "✅ License file: LICENSE (found)"
    else
        echo "⚠️  No LICENSE file (recommended for marketplace)"
    fi
    
    # Check for README
    if [ -f "README.md" ] && [ -s "README.md" ]; then
        echo "✅ README.md: Found and not empty"
    else
        echo "❌ README.md: Missing or empty (required)"
    fi
else
    echo "❌ package.json not found!"
    exit 1
fi

echo ""
echo "🚀 Publishing Workflow"
echo "======================"
echo ""
echo "To publish to the VS Code Marketplace:"
echo ""
echo "1. 🧪 Test the extension locally:"
echo "   F5 → New Extension Development Host window"
echo ""
echo "2. 🔍 Dry run validation:"
echo "   Go to GitHub Actions → Marketplace Preparation → Run workflow"
echo "   Set 'Dry run' to true"
echo ""
echo "3. 🎯 Actual publishing:"
echo "   Go to GitHub Actions → Marketplace Preparation → Run workflow"
echo "   Set 'Dry run' to false"
echo "   Choose version bump: patch/minor/major"
echo ""
echo "4. 📦 Manual publishing (alternative):"
echo "   npm run compile"
echo "   vsce package"
echo "   vsce publish"
echo ""

echo "🔗 Useful Links"
echo "==============="
echo ""
echo "📖 VS Code Extension Publishing: https://code.visualstudio.com/api/working-with-extensions/publishing-extension"
echo "🌐 Azure DevOps (for PAT): https://dev.azure.com/"
echo "🏪 VS Code Marketplace: https://marketplace.visualstudio.com/"
echo "📊 Publisher Management: https://marketplace.visualstudio.com/manage/publishers/alacolombiadev"
echo "🔧 Repository Settings: https://github.com/AndreaGriffiths11/mcp-team-xray/settings"
echo ""

echo "✅ Setup script complete!"
echo ""
echo "💡 Next steps:"
echo "   1. Configure VSCE authentication (if needed)"
echo "   2. Set up GitHub repository secrets"
echo "   3. Test the extension locally"
echo "   4. Run marketplace preparation workflow"
