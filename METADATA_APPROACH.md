# Veracode Fix Metadata Approach

## Problem
The PR tab component was unable to reliably determine the PR ID when running on a pull request, making it impossible to create new branches from the correct source branch.

## Solution
We implemented a metadata artifact approach that stores PR information during the pipeline run and makes it available to the PR tab component.

## Implementation

### 1. Metadata Creation (run_batch.ts)
During the pipeline run, a metadata artifact is created containing:
- `prId`: The original PR ID
- `sourceBranch`: The original source branch
- `targetBranch`: The target branch
- `commitId`: The commit ID when the pipeline ran
- `buildId`: The build ID for reference
- `repositoryName`: Repository name
- `projectName`: Project name
- `collectionUri`: Collection URI
- `buildDefinitionId`: Build definition ID
- `buildDefinitionName`: Build definition name
- `timestamp`: When the metadata was created

### 2. Metadata Usage (veracode-fix-pr-tab.tsx)
The PR tab component:
1. First attempts to load the metadata artifact
2. Uses the stored PR ID and source branch information
3. Falls back to URL-based detection if metadata is not available

### 3. Benefits
- **Reliable PR ID detection**: No longer dependent on URL parsing
- **Complete context**: All necessary PR information is preserved
- **Backward compatibility**: Falls back to existing URL-based approach
- **Debugging**: Metadata provides complete context for troubleshooting

## Environment Variables Used
The following Azure DevOps environment variables are captured in the metadata:
- `SYSTEM_PULLREQUEST_PULLREQUESTID`
- `SYSTEM_PULLREQUEST_SOURCEBRANCH`
- `SYSTEM_PULLREQUEST_TARGETBRANCH`
- `BUILD_SOURCEVERSION`
- `BUILD_BUILDID`
- `BUILD_REPOSITORY_NAME`
- `SYSTEM_TEAMPROJECT`
- `SYSTEM_COLLECTIONURI`
- `SYSTEM_DEFINITIONID`
- `BUILD_DEFINITIONNAME`

## Artifacts Created
1. `veracode-fixes.json` - The original fixes data
2. `veracode-fix-metadata.json` - The new metadata artifact

## Usage
The metadata approach is transparent to users. The PR tab will automatically:
1. Load metadata if available
2. Use stored PR information for branch creation
3. Fall back to URL-based detection if needed
4. Provide detailed logging for debugging 