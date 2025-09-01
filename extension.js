const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Resolve the absolute path of a file to execute.
 * If a path is provided in the configuration it will be used. Otherwise the
 * currently open document is used. Unsaved documents are written to a
 * temporary file. For saved files, the temp file is created in the same
 * directory as the original file. For untitled files, the temp file is
 * created using the `aeScriptRunner.tempFile` setting.
 *
 * @param {vscode.WorkspaceConfiguration} config Current configuration for this extension
 * @returns {Promise<{path: string, isTemp: boolean}>} Object with absolute path to the script file and whether it's a temporary file
 */
async function resolveScriptPath(config) {
  const executeFile = config.get('executeFile');
  const workspaceFolders = vscode.workspace.workspaceFolders;

  // If a file path is configured, resolve it relative to the first workspace folder
  if (executeFile && executeFile.trim().length > 0) {
    let candidate = executeFile;
    if (!path.isAbsolute(candidate)) {
      const base = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : process.cwd();
      candidate = path.join(base, candidate);
    }
    return { path: path.resolve(candidate), isTemp: false };
  }

  // Use the active text document
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('No active editor found. Open a JSX/JS file before running the command.');
  }
  const document = editor.document;
  // Save the document if required
  const saveBeforeRun = config.get('saveBeforeRun');
  if (!document.isUntitled && document.isDirty && saveBeforeRun) {
    try {
      // Try to save the document silently
      await document.save();
      if (!document.isDirty) {
        return { path: document.fileName, isTemp: false };
      }
    } catch (err) {
      // If save fails, we'll fall through to use temporary file
      console.log('Save failed, using temporary file instead:', err.message);
    }
  }
  // Otherwise write the contents to a temporary file
  let tempFile;
  let tempDir;
  
  // If the document has been saved before (not untitled), use its directory
  if (!document.isUntitled && document.fileName) {
    tempDir = path.dirname(document.fileName);
    tempFile = path.join(tempDir, 'ae-temp-script.jsx');
  } else {
    // For untitled documents, fall back to workspace or temp directory
    let configTempFile = config.get('tempFile');
    // Expand ${workspaceFolder} placeholder
    if (configTempFile.includes('${workspaceFolder}')) {
      const base = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : os.tmpdir();
      configTempFile = configTempFile.replace('${workspaceFolder}', base);
    }
    tempFile = path.resolve(configTempFile);
    tempDir = path.dirname(tempFile);
  }
  
  // Ensure directory exists
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(tempFile, document.getText(), 'utf8');
  return { path: tempFile, isTemp: true };
}

/**
 * Clean up a temporary file if it exists.
 *
 * @param {string} filePath Path to the temporary file to remove
 */
function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Cleaned up temporary file: ${filePath}`);
    }
  } catch (err) {
    console.warn(`Failed to clean up temporary file ${filePath}:`, err.message);
  }
}

/**
 * Get version information from bundle ID for user-friendly display
 * 
 * @param {string} bundleId Bundle identifier
 * @returns {Promise<string>} Version string or empty if not available
 */
async function getBundleVersion(bundleId) {
  try {
    const versionResult = await new Promise((resolve) => {
      const testCommand = `osascript -l JavaScript -e "Application('${bundleId}').version()"`;
      cp.exec(testCommand, { timeout: 3000 }, (error, stdout, stderr) => {
        if (!error && stdout.trim()) {
          resolve(stdout.trim());
        } else {
          resolve('');
        }
      });
    });
    return versionResult;
  } catch (err) {
    return '';
  }
}

/**
 * Convert a bundle identifier to a user-friendly display name
 * 
 * @param {string} bundleId Bundle identifier
 * @returns {string} User-friendly name
 */
function bundleIdToDisplayName(bundleId) {
  // Handle new naming convention (AE 2025+)
  if (bundleId === 'com.adobe.AfterEffects.application') {
    return 'After Effects 2025+';
  }
  
  // Handle specific version naming
  if (bundleId === 'com.adobe.AfterEffects') {
    return 'After Effects 2024';
  }
  
  // Handle legacy versioned naming
  if (bundleId.includes('.2023')) {
    return 'After Effects 2023';
  }
  if (bundleId.includes('.2022')) {
    return 'After Effects 2022';
  }
  if (bundleId.includes('.2021')) {
    return 'After Effects 2021';
  }
  
  // Handle generic fallback
  if (bundleId === 'com.adobe.aftereffects') {
    return 'After Effects (Generic)';
  }
  
  // For any unknown bundle IDs, try to extract year or show as-is
  const yearMatch = bundleId.match(/\.(\d{4})$/);
  if (yearMatch) {
    return `After Effects ${yearMatch[1]}`;
  }
  
  return bundleId; // Fallback to showing the bundle ID itself
}

/**
 * Get suggestions for After Effects bundle identifiers based on actual installation patterns.
 * 
 * @returns {string[]} Array of suggested bundle identifiers
 */
function getAfterEffectsBundleSuggestions() {
  return [
    'com.adobe.AfterEffects.application', // AE 2025+ (newest naming convention)
    'com.adobe.AfterEffects', // AE 2024 and some versions
    'com.adobe.aftereffects', // Legacy/fallback
    'com.adobe.aftereffects.2023', // Older versions might still use this
    'com.adobe.aftereffects.2022',
    'com.adobe.aftereffects.2021'
  ];
}

/**
 * Dynamically discover After Effects installations by scanning /Applications folder
 * This makes the extension future-proof for AE 2026, 2027, etc.
 * 
 * @returns {Promise<string[]>} Array of discovered bundle identifiers
 */
async function discoverAfterEffectsInstallations() {
  if (process.platform !== 'darwin') {
    return [];
  }
  
  const discovered = [];
  
  try {
    // Scan /Applications for After Effects installations
    const applicationsPath = '/Applications';
    const items = fs.readdirSync(applicationsPath);
    
    for (const item of items) {
      if (item.startsWith('Adobe After Effects')) {
        const appPath = path.join(applicationsPath, item, `${item}.app`, 'Contents', 'Info.plist');
        
        try {
          if (fs.existsSync(appPath)) {
            // Try to read the bundle identifier
            const bundleId = await new Promise((resolve) => {
              cp.exec(`defaults read "${appPath}" CFBundleIdentifier`, (error, stdout, stderr) => {
                if (!error && stdout.trim()) {
                  resolve(stdout.trim());
                } else {
                  resolve(null);
                }
              });
            });
            
            if (bundleId && !discovered.includes(bundleId)) {
              discovered.push(bundleId);
            }
          }
        } catch (err) {
          // Skip this installation if we can't read its info
          continue;
        }
      }
    }
  } catch (err) {
    console.log('Could not scan Applications folder:', err.message);
  }
  
  return discovered;
}

/**
 * Detect installed After Effects versions on macOS by checking common bundle identifiers
 * and scanning the Applications folder for future-proofing
 * 
 * @returns {Promise<string[]>} Array of detected bundle identifiers
 */
async function detectInstalledAfterEffects() {
  if (process.platform !== 'darwin') {
    return [];
  }
  
  const installed = new Set(); // Use Set to avoid duplicates
  
  // First, try the known bundle IDs
  const knownBundles = getAfterEffectsBundleSuggestions();
  for (const bundleId of knownBundles) {
    try {
      await new Promise((resolve) => {
        const testCommand = `osascript -l JavaScript -e "Application('${bundleId}').version()"`;
        cp.exec(testCommand, { timeout: 5000 }, (error, stdout, stderr) => {
          if (!error && stdout.trim()) {
            installed.add(bundleId);
            console.log(`Found After Effects: ${bundleId} (version: ${stdout.trim()})`);
          }
          resolve();
        });
      });
    } catch (err) {
      // This bundle doesn't exist, continue
    }
  }
  
  // Then, discover any additional installations (future-proofing)
  const discovered = await discoverAfterEffectsInstallations();
  for (const bundleId of discovered) {
    if (!installed.has(bundleId)) {
      // Test if this discovered bundle actually works with JXA
      try {
        await new Promise((resolve) => {
          const testCommand = `osascript -l JavaScript -e "Application('${bundleId}').version()"`;
          cp.exec(testCommand, { timeout: 3000 }, (error, stdout, stderr) => {
            if (!error && stdout.trim()) {
              installed.add(bundleId);
              console.log(`Discovered working After Effects: ${bundleId} (version: ${stdout.trim()})`);
            }
            resolve();
          });
        });
      } catch (err) {
        // Skip if it doesn't work
      }
    }
  }
  
  const result = Array.from(installed);
  console.log(`Total detected After Effects versions: ${result.length}`);
  return result;
}

/**
 * Build a shell command to send a script to After Effects based on the current OS.
 *
 * For macOS this uses JavaScript for Automation (JXA) via `osascript -l JavaScript`.
 * This approach has been shown to work reliably on Apple Silicon Macs when
 * `DoScriptFile` fails【368440511994649†L268-L283】. For Windows it calls the
 * AfterFX executable with the `-r` switch as documented in Adobe's scripting
 * guide【697721517310854†L285-L317】.
 *
 * @param {string} scriptPath Absolute path to the JSX/JSXBIN file to execute
 * @param {vscode.WorkspaceConfiguration} config Extension configuration
 * @returns {Promise<Object>} An object containing the command to execute and its arguments
 */
async function buildCommand(scriptPath, config) {
  const platform = process.platform;
  if (platform === 'darwin') {
    // Get the After Effects bundle identifier from config, or auto-detect
    let bundleId = config.get('macAfterEffectsBundle');
    
    // If no bundle ID is configured or it's set to 'auto', detect installed versions
    if (!bundleId || bundleId === 'auto') {
      console.log('Auto-detecting After Effects versions...');
      const installed = await detectInstalledAfterEffects();
      if (installed.length > 0) {
        bundleId = installed[0]; // Use the first (newest) detected version
        console.log(`Auto-detected After Effects: ${bundleId}`);
      } else {
        // If detection fails, try the most common bundle IDs as fallback
        console.log('Auto-detection failed, trying fallback bundle IDs...');
        const fallbacks = ['com.adobe.aftereffects', 'com.adobe.aftereffects.2024', 'com.adobe.aftereffects.2025'];
        for (const fallback of fallbacks) {
          try {
            // Quick test to see if this bundle works
            await new Promise((resolve, reject) => {
              const testCommand = `osascript -l JavaScript -e "Application('${fallback}').running()"`;
              cp.exec(testCommand, { timeout: 3000 }, (error, stdout, stderr) => {
                if (!error) {
                  bundleId = fallback;
                  console.log(`Fallback successful: ${bundleId}`);
                }
                resolve();
              });
            });
            if (bundleId) break;
          } catch (err) {
            continue;
          }
        }
        
        // Final fallback
        if (!bundleId) {
          bundleId = 'com.adobe.aftereffects';
          console.log(`Using final fallback: ${bundleId}`);
        }
      }
    }
    
    // Escape single quotes in the path for insertion into single-quoted JXA string
    const escapedPath = scriptPath.replace(/'/g, "\\'");
    // Compose a JXA one‑liner that activates After Effects and runs the script file.
    const jxa = `ae = Application('${bundleId}'); ae.activate(); ae.doscriptfile('${escapedPath}');`;
    return {
      command: 'osascript',
      args: ['-l', 'JavaScript', '-e', jxa],
      bundleId: bundleId
    };
  }
  if (platform === 'win32') {
    // Determine path to AfterFX.exe
    const exe = config.get('winAfterEffectsExe');
    const exePath = exe && exe.trim().length > 0 ? exe : 'AfterFX.exe';
    return {
      command: exePath,
      args: ['-r', scriptPath]
    };
  }
  // Unsupported platform
  throw new Error('AE Script Runner only supports macOS and Windows at this time.');
}

/**
 * Execute a shell command asynchronously.
 *
 * @param {string} command The executable to run
 * @param {string[]} args Array of arguments
 * @returns {Promise<void>}
 */
function executeCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = cp.spawn(command, args, { shell: false });
    let stderr = '';
    proc.stdout.on('data', (data) => {
      console.log(data.toString());
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Handle browsing for After Effects application manually
 */
async function handleBrowseForAfterEffects() {
  const uri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Select After Effects',
    defaultUri: vscode.Uri.file('/Applications'),
    filters: {
      'Applications': ['app']
    }
  });

  if (uri && uri[0]) {
    const selectedPath = uri[0].fsPath;
    
    // Validate it's actually After Effects
    if (!selectedPath.toLowerCase().includes('after effects')) {
      vscode.window.showWarningMessage('Selected application does not appear to be After Effects.');
      return;
    }

    try {
      // Try to extract bundle identifier from the selected app
      const infoPlistPath = path.join(selectedPath, 'Contents', 'Info.plist');
      
      const bundleId = await new Promise((resolve) => {
        cp.exec(`defaults read "${infoPlistPath}" CFBundleIdentifier`, (error, stdout, stderr) => {
          if (!error && stdout.trim()) {
            resolve(stdout.trim());
          } else {
            resolve(null);
          }
        });
      });

      if (!bundleId) {
        vscode.window.showErrorMessage('Could not read bundle identifier from selected application.');
        return;
      }

      // Test if this bundle ID works with JXA
      const testResult = await new Promise((resolve) => {
        const testCommand = `osascript -l JavaScript -e "Application('${bundleId}').version()"`;
        cp.exec(testCommand, { timeout: 5000 }, (error, stdout, stderr) => {
          resolve({ success: !error, version: stdout?.trim() });
        });
      });

      if (!testResult.success) {
        vscode.window.showErrorMessage('Selected After Effects application is not accessible via scripting.');
        return;
      }

      // Save the bundle ID
      const config = vscode.workspace.getConfiguration('aeScriptRunner');
      await config.update('macAfterEffectsBundle', bundleId, vscode.ConfigurationTarget.Global);
      
      const displayName = bundleIdToDisplayName(bundleId);
      vscode.window.showInformationMessage(`After Effects target set to: ${displayName} (${bundleId})`);
      
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to configure selected After Effects: ${err.message}`);
    }
  }
}

/**
 * This method is called when your extension is activated. Your extension is
 * activated the very first time the command is executed.
 *
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // Main command to run script
  const runCommand = vscode.commands.registerCommand('aeScriptRunner.run', async () => {
    const config = vscode.workspace.getConfiguration('aeScriptRunner');
    let tempFilePath = null;
    
    try {
      const { path: scriptPath, isTemp } = await resolveScriptPath(config);
      if (isTemp) {
        tempFilePath = scriptPath;
      }
      
      const { command, args, bundleId } = await buildCommand(scriptPath, config);
      await executeCommand(command, args);
      vscode.window.showInformationMessage(`Sent script to After Effects: ${path.basename(scriptPath)}`);
    } catch (err) {
      console.error(err);
      
      // Provide helpful error message for macOS bundle issues
      if (process.platform === 'darwin' && err.message.includes("Application can't be found")) {
        const installed = await detectInstalledAfterEffects();
        let errorMsg = 'Could not find After Effects. ';
        
        if (installed.length > 0) {
          errorMsg += `Found these versions: ${installed.join(', ')}. Try running "AE: Choose After Effects Version" command.`;
        } else {
          errorMsg += 'No After Effects installations detected. Please make sure After Effects is installed.';
        }
        
        vscode.window.showErrorMessage(errorMsg);
      } else {
        vscode.window.showErrorMessage(err.message || 'Failed to run script in After Effects');
      }
    } finally {
      // Clean up temporary file if one was created
      if (tempFilePath) {
        // Add a small delay to ensure After Effects has finished reading the file
        setTimeout(() => cleanupTempFile(tempFilePath), 1000);
      }
    }
  });

  // Command to choose After Effects version
  const chooseVersionCommand = vscode.commands.registerCommand('aeScriptRunner.chooseVersion', async () => {
    if (process.platform !== 'darwin') {
      vscode.window.showWarningMessage('Version selection is only available on macOS.');
      return;
    }

    try {
      const installed = await detectInstalledAfterEffects();
      
      // Create user-friendly options with version information
      const installedOptions = await Promise.all(
        installed.map(async (bundleId) => {
          const displayName = bundleIdToDisplayName(bundleId);
          const version = await getBundleVersion(bundleId);
          
          return {
            label: `🎬 ${displayName}`,
            description: version ? `Version ${version}` : 'Installed version',
            detail: `Bundle ID: ${bundleId}`, // Technical details shown smaller
            value: bundleId
          };
        })
      );
      
      const allOptions = [
        { 
          label: '🔍 Auto-detect (recommended)', 
          description: 'Automatically use the newest installed version', 
          detail: 'Scans for all installed versions and picks the newest',
          value: 'auto' 
        },
        { 
          label: '📁 Browse for After Effects...', 
          description: 'Manually select After Effects application', 
          detail: 'Use file picker to choose specific installation',
          value: 'browse' 
        },
        ...installedOptions
      ];

      if (installed.length === 0) {
        // If no auto-detected versions, still show browse option
        const browseOptions = [
          { label: '📁 Browse for After Effects...', description: 'Manually select After Effects application', value: 'browse' }
        ];
        
        const selected = await vscode.window.showQuickPick(browseOptions, {
          placeHolder: 'No After Effects installations auto-detected. Browse manually?',
          ignoreFocusOut: true
        });
        
        if (selected && selected.value === 'browse') {
          await handleBrowseForAfterEffects();
        }
        return;
      }

      const selected = await vscode.window.showQuickPick(allOptions, {
        placeHolder: 'Choose After Effects version to target',
        ignoreFocusOut: true
      });

      if (selected) {
        if (selected.value === 'browse') {
          await handleBrowseForAfterEffects();
        } else {
          const config = vscode.workspace.getConfiguration('aeScriptRunner');
          await config.update('macAfterEffectsBundle', selected.value, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`After Effects target set to: ${selected.label.replace(/^🎬 /, '')}`);
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to detect After Effects versions: ${err.message}`);
    }
  });

  context.subscriptions.push(runCommand, chooseVersionCommand);
}

/**
 * This method is called when your extension is deactivated
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate
};