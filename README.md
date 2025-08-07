# ae-script-runner
Adobe After Effects ExtendScript Runner For VS Code

A Visual Studio Code extension that allows you to run Adobe After Effects ExtendScript code directly from VS Code without leaving your editor.

_Just a quick vibe code project_


## Features

- 🚀 **One-Click Execution**: Run scripts with `Cmd+R` (macOS) or `Ctrl+R` (Windows)
- 🔍 **Auto-Detection**: Automatically detects installed After Effects versions
- 🎯 **Version Selection**: Choose specific AE versions via Command Palette
- 💾 **Smart File Handling**: Works with saved files, unsaved files, and temporary scripts
- 🧹 **Auto-Cleanup**: Temporary files are automatically cleaned up after execution
- 🛠 **Cross-Platform**: Supports both macOS and Windows

## Installation

1. Copy this extension folder to your VS Code extensions directory:
   - **macOS**: `~/.vscode/extensions/`
   - **Windows**: `%USERPROFILE%\.vscode\extensions\`
2. Restart VS Code
3. The extension will be activated automatically

## Usage

### Quick Start

1. Open any `.jsx` or `.js` file containing ExtendScript code
2. Press `Cmd+R` (macOS) or `Ctrl+R` (Windows)
3. Your script will be sent to After Effects automatically!

### Example Script

```javascript
// Create a new composition
var comp = app.project.items.addComp("My Comp", 1920, 1080, 1, 10, 30);

// Add a solid layer
var solidLayer = comp.layers.addSolid([1, 0, 0], "Red Solid", 1920, 1080, 1);

// Show a message
alert("Script executed successfully!");
```

## Commands

Access these commands via `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows):

### `AE: Run ExtendScript in After Effects`
- **Shortcut**: `Cmd+R` / `Ctrl+R`
- Executes the current file or selection in After Effects

### `AE: Choose After Effects Version` (macOS only)
- Opens a picker to select which After Effects version to target
- Shows all detected installations
- Includes auto-detect option (recommended)

## Configuration

### Settings

Configure the extension through VS Code settings (`Cmd+,` / `Ctrl+,`):

#### `aeScriptRunner.saveBeforeRun`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Automatically save files before execution

#### `aeScriptRunner.tempFile`
- **Type**: String  
- **Default**: `${workspaceFolder}/.vscode/ae-temp-script.jsx`
- **Description**: Path for temporary files when document is unsaved

#### `aeScriptRunner.executeFile`
- **Type**: String
- **Default**: `""` (empty)
- **Description**: Always execute this specific file instead of current document

#### `aeScriptRunner.macAfterEffectsBundle` (macOS only)
- **Type**: String
- **Default**: `"auto"`
- **Description**: Bundle identifier for After Effects version targeting
- **Options**:
  - `"auto"` - Auto-detect (recommended)
  - `"com.adobe.AfterEffects.application"` - After Effects 2025+
  - `"com.adobe.AfterEffects"` - After Effects 2024
  - `"com.adobe.aftereffects"` - Legacy versions

#### `aeScriptRunner.winAfterEffectsExe` (Windows only)
- **Type**: String
- **Default**: `"C:/Program Files/Adobe/Adobe After Effects 2025/Support Files/AfterFX.exe"`
- **Description**: Path to AfterFX.exe executable

### Example Settings

```json
{
  "aeScriptRunner.saveBeforeRun": true,
  "aeScriptRunner.macAfterEffectsBundle": "auto",
  "aeScriptRunner.tempFile": "${workspaceFolder}/.vscode/ae-temp-script.jsx"
}
```

## How It Works

### macOS
Uses JavaScript for Automation (JXA) via `osascript` to communicate with After Effects:
- Activates After Effects if not already active
- Executes the script file using `doScriptFile()`
- Works reliably on Intel and Apple Silicon Macs

### Windows  
Uses the After Effects command-line interface:
- Calls `AfterFX.exe -r scriptPath` to execute scripts
- Requires After Effects to be installed in standard location or configured path

## Supported After Effects Versions

### Automatically Detected Versions (macOS)
- **After Effects 2025+**: `com.adobe.AfterEffects.application`
- **After Effects 2024**: `com.adobe.AfterEffects`  
- **Legacy versions**: `com.adobe.aftereffects`

### Windows Support
- After Effects 2022, 2023, 2024, 2025
- Configurable executable path for custom installations

## File Handling

The extension intelligently handles different file states:

1. **Saved Files**: Uses the file directly
2. **Unsaved Changes**: Attempts to save silently, falls back to temporary file
3. **Untitled Documents**: Always creates temporary file
4. **Configured File**: Uses `executeFile` setting if specified

Temporary files are automatically cleaned up after execution.

## Troubleshooting

### "Application can't be found" Error (macOS)

1. **Check Installation**: Ensure After Effects is installed in `/Applications/`
2. **Try Version Picker**: Run `AE: Choose After Effects Version` command
3. **Manual Configuration**: Set `macAfterEffectsBundle` in settings
4. **Check Console**: Open Developer Tools → Console for detailed error info

### Script Not Executing (Windows)

1. **Verify Path**: Check `winAfterEffectsExe` setting points to correct executable
2. **Run as Administrator**: Some systems require elevated permissions
3. **Check AE Version**: Ensure compatible After Effects version

### File Save Issues

- Extension handles save prompts automatically
- For persistent issues, disable `saveBeforeRun` and work with saved files only

## Development

### Building the Extension

```bash
# Install dependencies
npm install

# Package extension
npm run package
```

### File Structure

```
ae-script-runner/
├── extension.js          # Main extension logic
├── package.json          # Extension manifest
└── README.md            # This file
```

## Changelog

### v1.0.0
- Initial release
- Auto-detection of After Effects versions
- Cross-platform support (macOS/Windows)
- Command palette integration
- Smart file handling with auto-cleanup
- Configurable settings

## License

This extension is provided as-is for personal and commercial use.

## Contributing

Found a bug or have a feature request? Open a PR!

---

**Enjoy scripting with After Effects directly from VS Code!** 🎬✨
