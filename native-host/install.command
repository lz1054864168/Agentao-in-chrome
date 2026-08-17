#!/bin/sh
# Agentao in Chrome — macOS installer (double-click to run from Finder)
# Finder runs .command files in Terminal. This is the same as install.sh
# but with a .command extension so macOS users can double-click it.

set -e

# Change to the directory containing this script
cd "$(dirname "$0")"

echo "============================================"
echo "  Agentao in Chrome — Native Host Installer"
echo "============================================"
echo ""

# Check the executable exists
if [ ! -f "./agentao-chrome-host" ]; then
    echo "[ERROR] agentao-chrome-host not found."
    echo "Make sure you extracted the full archive and did not move this file"
    echo "out of its folder."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Ensure the executable is runnable
chmod +x ./agentao-chrome-host

echo "Installing native messaging host..."
echo ""
./agentao-chrome-host --install
RC=$?

echo ""
if [ $RC -eq 0 ]; then
    echo "============================================"
    echo "  Installation successful!"
    echo "============================================"
    echo ""
    echo "Next steps:"
    echo "  1. Load the extension in chrome://extensions/"
    echo "     (Developer mode -> Load unpacked)"
    echo "  2. Open the Agentao sidebar"
    echo "  3. Configure your API key in the options page"
    echo ""
else
    echo "============================================"
    echo "  Installation FAILED (exit code $RC)"
    echo "============================================"
    echo ""
    echo "If Chrome is running, close and reopen it after installing."
    echo ""
fi

read -p "Press Enter to exit..."
