#!/bin/bash

# Script to convert SVG icon to PNG for VS Code extension
# Requires ImageMagick or similar tool

# Check if ImageMagick is installed
if command -v convert &> /dev/null; then
    echo "Converting SVG to PNG using ImageMagick..."
    convert resources/icon.svg -background transparent -resize 128x128 resources/icon.png
    echo "✅ Icon converted successfully!"
elif command -v inkscape &> /dev/null; then
    echo "Converting SVG to PNG using Inkscape..."
    inkscape --export-type=png --export-width=128 --export-height=128 --export-filename=resources/icon.png resources/icon.svg
    echo "✅ Icon converted successfully!"
else
    echo "⚠️  Neither ImageMagick nor Inkscape found."
    echo "Please install one of them or manually convert the SVG to PNG:"
    echo "- Install ImageMagick: brew install imagemagick"
    echo "- Install Inkscape: brew install inkscape"
    echo ""
    echo "For now, using a base64 placeholder..."
    
    # Create a simple base64 encoded 1x1 PNG as placeholder
    echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > resources/icon.png
    echo "📝 Created placeholder icon"
fi

# Update package.json to include the icon
echo "📝 Updating package.json to include icon..."
cat package.json | jq '. + {"icon": "resources/icon.png"}' > package.json.tmp && mv package.json.tmp package.json
echo "✅ Package.json updated"
