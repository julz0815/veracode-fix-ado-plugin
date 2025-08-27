# Veracode Fix Annotations

This Azure DevOps extension integrates Veracode Fix API suggestions into Azure DevOps pull requests and build pipelines, providing automated security fix recommendations and application capabilities.

## Overview

The extension provides three main use cases for applying Veracode security fixes:

1. **Batch Fix Everything** - Apply all available fixes for specified CWEs
2. **Fix Single Finding** - Apply fixes for individual security issues
3. **Fix Changed Files Only** - Apply fixes only to files modified in the current commit (commit tab only)

## Architecture

### Azure DevOps Task
The core functionality is implemented as an Azure DevOps pipeline task (`VeracodeFix@1`) that:
- Connects to Veracode API using your credentials
- Processes security findings from a JSON results file
- Generates fix suggestions using Veracode's AI-powered fix engine
- Creates artifacts containing fix data for the UI components

### UI Components

#### Pipeline Tab (Commit View)
- **Location**: Available in build pipeline results
- **Use Cases**: 
  - Batch fix everything
  - Fix single finding  
  - Fix changed files only (unique to this tab)
- **Features**: 
  - Shows all findings with fix suggestions
  - Filters by changed files in the commit
  - Displays code diffs with proper hunk separation
  - Line-by-line code comparison with color coding

#### PR Tab (Pull Request View)
- **Location**: Available in pull request interface
- **Use Cases**:
  - Batch fix everything
  - Fix single finding
- **Features**:
  - Shows findings relevant to the PR
  - Displays code diffs with proper hunk separation
  - Line-by-line code comparison with color coding
  - Branch creation and fix application

## Configuration

### Required Parameters
- `veracodeApiId`: Your Veracode API ID
- `veracodeApiKey`: Your Veracode API Key (stored securely)
- `language`: Programming language of the code to fix (e.g., java, python, javascript)
- `inputFile`: Path to the results.json file containing flaws to fix

### Optional Parameters
- `CWEs`: Comma separated list of CWEs to fix (e.g., '117,89,78')
- `DEBUG`: Enable verbose debug output for troubleshooting (default: false)

### Example Pipeline Configuration
```yaml
- task: VeracodeFix@1
  env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
  inputs:
    veracodeApiId: $(vid)
    veracodeApiKey: $(vkey)
    language: 'java'
    inputFile: '$(System.DefaultWorkingDirectory)/filtered_results.json'
    CWEs: '117'
    DEBUG: true
```

## Use Cases

### 1. Batch Fix Everything
**Description**: Apply all available Veracode fix suggestions for the specified CWEs
**Available In**: Both PR Tab and Pipeline Tab
**Workflow**:
1. Run the VeracodeFix task in your pipeline
2. Review all suggested fixes in the UI
3. Apply all fixes at once using the "Apply All Fixes" button
4. Creates a new branch with all fixes applied

**Best For**: Comprehensive security improvements across your codebase

### 2. Fix Single Finding
**Description**: Apply fixes for individual security issues
**Available In**: Both PR Tab and Pipeline Tab
**Workflow**:
1. Run the VeracodeFix task in your pipeline
2. Review individual fix suggestions
3. Apply specific fixes using the "Apply this fix" button
4. Creates a new branch with selected fixes applied

**Best For**: Targeted fixes for specific security vulnerabilities

### 3. Fix Changed Files Only
**Description**: Apply fixes only to files that were modified in the current commit
**Available In**: Pipeline Tab only
**Workflow**:
1. Run the VeracodeFix task in your pipeline
2. UI automatically filters to show only findings in changed files
3. Apply fixes for the specific changes
4. Creates a new branch with targeted fixes

**Best For**: Incremental security improvements that align with your current changes

## How It Works

### 1. Pipeline Execution
1. **Task Runs**: VeracodeFix task executes during your build pipeline
2. **API Connection**: Connects to Veracode using your credentials
3. **Results Processing**: Reads security findings from the specified JSON file
4. **Fix Generation**: Calls Veracode Fix API to generate fix suggestions
5. **Artifact Creation**: Creates build artifacts containing fix data

### 2. UI Display
1. **Tab Loading**: UI components load fix data from build artifacts
2. **Finding Display**: Shows security findings with CWE IDs and line numbers
3. **Diff Rendering**: Displays code differences with proper hunk separation
4. **Color Coding**: Red for removed code, green for added code, white for context

### 3. Fix Application
1. **Review**: Users review suggested fixes in the UI
2. **Selection**: Choose which fixes to apply (all, single, or changed files)
3. **Branch Creation**: System creates a new branch from the source
4. **Code Changes**: Applies the selected fixes to the new branch
5. **Pull Request**: Creates a pull request with the applied fixes

## Features

### Code Diff Display
- **Hunk Separation**: Multiple code changes displayed in separate boxes
- **Line Numbers**: Accurate file line numbers for each change
- **Color Coding**: Visual indicators for added/removed/modified code
- **Context Lines**: Shows surrounding code for better understanding

### File Filtering
- **Changed Files**: Automatically detects files modified in the commit
- **CWE Filtering**: Filter findings by specific CWE types
- **Smart Display**: Shows relevant findings based on context

### Branch Management
- **Automatic Creation**: Creates new branches for fix application
- **Source Tracking**: Maintains reference to original source branch
- **Pull Request Integration**: Seamless integration with Azure DevOps PR workflow

## Security

- **API Key Protection**: Your Veracode API key is stored securely and never exposed in the UI or logs
- **Access Control**: Uses Azure DevOps security model for access control
- **Audit Trail**: All fix applications are tracked in your Git history

## Troubleshooting

### Common Issues
1. **No Fixes Available**: Check that your inputFile contains valid Veracode results
2. **API Connection Failed**: Verify your Veracode credentials and API access
3. **Build Failures**: Enable DEBUG mode for detailed logging

### Debug Mode
Set `DEBUG: true` in your task configuration to get detailed logging information for troubleshooting.

## Support

For issues or questions:
1. Check the debug logs with `DEBUG: true`
2. Verify your Veracode API credentials
3. Ensure your inputFile contains valid results data
4. Check that the specified language is supported by Veracode Fix API 