# Veracode Fix Annotations

This extension integrates Veracode Fix API suggestions into Azure DevOps pull requests.

## Configuration

### Veracode Credentials
- `vid`: Your Veracode API ID
- `vkey`: Your Veracode API Key (stored securely)

### Fix Options
- `language`: Programming language of the code to fix
- `prComment`: Comment to add to the pull request
- `sourceBasePath`: Base path to the source code

## Usage

1. Configure your Veracode credentials in the extension settings
2. Set your preferred fix options
3. Open a pull request
4. Navigate to the "Veracode Fix" tab
5. Review and apply suggested fixes

## Security

Your Veracode API key is stored securely and never exposed in the UI or logs. 