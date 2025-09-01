import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as SDK from 'azure-devops-extension-sdk';
import { getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { GitRestClient } from "azure-devops-extension-api/Git";

import JSZip from 'jszip';
import { applyPatch as diffApplyPatch } from 'diff';
import * as diff from 'diff';



interface Flaw {
  sourceFile: string;
  function: string;
  line: number;
  CWEId: string;
  issueId: number;
  patches: string[];
}

interface FileFixes {
  flaws: Flaw[];
  patch: string[];
}

interface FixesResponse {
  results: {
    [key: string]: FileFixes;
  };
  metadata?: any;
  changedFiles?: Array<{path: string, changeType: string, lines: Array<{oldLine: number, newLine: number, changeType: string}>}>;
}

// Helper to get build ID from query string
// Function to fetch actual changed files from the Git commit using metadata values
const fetchChangedFilesFromCommit = async (projectName: string, repositoryName: string, commitId: string, collectionUri: string): Promise<Array<{path: string, changeType: string, lines: Array<{oldLine: number, newLine: number, changeType: string}>}>> => {
  try {
    console.log('Fetching actual changed files from commit for project:', projectName, 'repository:', repositoryName, 'commit:', commitId);
    
    const gitClient = getClient(GitRestClient);
    
    // Get the repository using the name
    const repositories = await gitClient.getRepositories(projectName);
    const repository = repositories.find(repo => repo.name === repositoryName);
    
    if (!repository) {
      console.log('Repository not found:', repositoryName);
      return [];
    }
    
    console.log('Found repository:', repository.name, 'ID:', repository.id);
    
    // Get the commit details to find the parent
    const commit = await gitClient.getCommit(commitId, repository.id);
    if (!commit || !commit.parents || commit.parents.length === 0) {
      console.log('No parent commit found, this might be the first commit');
      return [];
    }
    
    const parentCommitId = commit.parents[0];
    console.log('Parent commit ID:', parentCommitId);
    
    // Get the changes using a direct API call since SDK doesn't have getCommitChanges
    try {
      console.log('Fetching changes using direct API call...');
      
      // Use the SDK to get the access token and organization URL
      console.log('Getting changes for commit using direct API call...');
      
      try {
        // Get the access token from the SDK
        const accessToken = await SDK.getAccessToken();
        
        
        console.log('Organization URL:', collectionUri);
        console.log('Project name:', projectName);
        console.log('Repository ID:', repository.id);
        console.log('Commit ID:', commitId);
        
        // For line-level changes, we need to fetch individual file contents and compare them
        // Let's use the simpler approach: get file-level changes and then enhance with line info
        console.log('Getting file-level changes and enhancing with line-level information...');
        
        // First, get the basic file changes using the changes endpoint
        const changesUrl = `${collectionUri}${projectName}/_apis/git/repositories/${repository.id}/commits/${commitId}/changes?api-version=7.2-preview.1`;
        console.log('Calling changes API URL:', changesUrl);
        
        const changesResponse = await fetch(changesUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        
        if (!changesResponse.ok) {
          throw new Error(`Changes API call failed: ${changesResponse.status} ${changesResponse.statusText}`);
        }
        
        const changes = await changesResponse.json();
        console.log('Git commit changes response:', changes);
        
        if (changes && changes.changes && Array.isArray(changes.changes)) {
          console.log(`Found ${changes.changes.length} changes, processing each one...`);
          
          // Extract the changed file paths and enhance with line-level information
          const changedFiles = [];
          
          for (const change of changes.changes) {
            console.log('Processing change:', change);
            
            if (change.item && change.item.path) {
              const filePath = change.item.path;
              const changeType = change.changeType;
              
              console.log(`File path: "${filePath}", change type: "${changeType}"`);
              
              // Skip files we don't want (but allow leading slash from Azure DevOps API)
              if (filePath.includes('node_modules') || filePath.includes('.git')) {
                console.log(`Skipping file: ${filePath} (contains excluded pattern)`);
                continue;
              }
              
              console.log(`Processing file: ${filePath} (${changeType})`);
              
              // Generate line-level diff information for each changed file
              let lines: Array<{oldLine: number, newLine: number, changeType: string}> = [];
              
              try {
                if (changeType === 'edit' && change.item.objectId && change.item.originalObjectId) {
                  console.log(`Generating line-level diff for edited file: ${filePath}`);
                  lines = await generateLineLevelDiff(
                    collectionUri,
                    projectName,
                    repository.id,
                    filePath,
                    commitId,
                    parentCommitId,
                    accessToken
                  );
                } else if (changeType === 'add') {
                  console.log(`New file added: ${filePath}`);
                  // For new files, we'll get the actual line count
                  const currentFileUrl = `${collectionUri}${projectName}/_apis/git/repositories/${repository.id}/items${filePath}?versionType=Commit&version=${commitId}&api-version=7.2-preview.1`;
                  const currentResponse = await fetch(currentFileUrl, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Accept': 'text/plain'
                    }
                  });
                  
                  if (currentResponse.ok) {
                    const currentContent = await currentResponse.text();
                    const lineCount = currentContent.split('\n').length;
                    lines = [{
                      oldLine: 0, // No old lines for new files
                      newLine: lineCount,
                      changeType: 'add'
                    }];
                  }
                } else if (changeType === 'delete') {
                  console.log(`File deleted: ${filePath}`);
                  // For deleted files, we can't get line count from current content
                  // but we can mark it as deleted
                  lines = [{
                    oldLine: 1, // Placeholder - would need parent file content
                    newLine: 0, // No new lines for deleted files
                    changeType: 'delete'
                  }];
                }
              } catch (lineError) {
                console.log(`Could not generate line-level info for ${filePath}:`, lineError);
                // Fallback to basic change type info
                lines = [{
                  oldLine: 0,
                  newLine: 0,
                  changeType: changeType
                }];
              }
              
              const fileInfo = {
                path: filePath,
                changeType: changeType,
                lines: lines
              };
              
              changedFiles.push(fileInfo);
            }
          }
          
          console.log('Successfully extracted changed files with enhanced information:', changedFiles);
          console.log('Note: Line-level information is limited. For full line-level diffs, we would need to implement file content comparison.');
          return changedFiles;
        } else {
          console.log('No changes found in Git commit changes response');
          return [];
        }
      } catch (apiError) {
        console.error('Error getting Git commit changes via direct API call:', apiError);
        console.log('Falling back to showing all findings');
        return [];
      }
      
    } catch (error) {
      console.error('Error fetching commit changes:', error);
      console.log('Falling back to showing all findings');
      return [];
    }
    
  } catch (error) {
    console.error('Error fetching changed files from commit:', error);
    return [];
  }
};

// Function to generate line-level diffs by comparing file contents
const generateLineLevelDiff = async (
  collectionUri: string, 
  projectName: string, 
  repositoryId: string, 
  filePath: string, 
  currentCommitId: string, 
  parentCommitId: string,
  accessToken: string
): Promise<Array<{oldLine: number, newLine: number, changeType: string}>> => {
  try {
    console.log(`Generating line-level diff for: ${filePath}`);
    
    // 1. Load current file content
    const currentFileUrl = `${collectionUri}${projectName}/_apis/git/repositories/${repositoryId}/items${filePath}?versionType=Commit&version=${currentCommitId}&api-version=7.2-preview.1`;
    console.log('Loading current file content from:', currentFileUrl);
    
    const currentResponse = await fetch(currentFileUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/plain'
      }
    });
    
    if (!currentResponse.ok) {
      console.log(`Could not load current file content for ${filePath}:`, currentResponse.status);
      return [];
    }
    
    const currentContent = await currentResponse.text();
    
    // 2. Load parent file content
    const parentFileUrl = `${collectionUri}${projectName}/_apis/git/repositories/${repositoryId}/items${filePath}?versionType=Commit&version=${parentCommitId}&api-version=7.2-preview.1`;
    console.log('Loading parent file content from:', parentFileUrl);
    
    const parentResponse = await fetch(parentFileUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/plain'
      }
    });
    
    if (!parentResponse.ok) {
      console.log(`Could not load parent file content for ${filePath}:`, parentResponse.status);
      // This might be a new file, so all lines are new
      const currentLines = currentContent.split('\n').length;
      return [{
        oldLine: 0,
        newLine: currentLines,
        changeType: 'add'
      }];
    }
    
    const parentContent = await parentResponse.text();
    
    // 3. Generate diff using the diff library
    const diffResult = diff.diffLines(parentContent, currentContent, {
      newlineIsToken: true,
      ignoreWhitespace: false
    });
    
    console.log(`Generated diff for ${filePath}:`, diffResult);
    
    // 4. Extract line numbers from the diff
    const lineChanges: Array<{oldLine: number, newLine: number, changeType: string}> = [];
    let oldLineNumber = 1;
    let newLineNumber = 1;
    
    for (const change of diffResult) {
      if (change.added) {
        // New lines added
        const addedLines = change.value.split('\n').filter((line: string) => line.trim() !== '');
        for (let i = 0; i < addedLines.length; i++) {
          lineChanges.push({
            oldLine: 0, // No old line for new content
            newLine: newLineNumber + i,
            changeType: 'add'
          });
        }
        newLineNumber += change.value.split('\n').length - 1;
      } else if (change.removed) {
        // Lines removed
        const removedLines = change.value.split('\n').filter((line: string) => line.trim() !== '');
        for (let i = 0; i < removedLines.length; i++) {
          lineChanges.push({
            oldLine: oldLineNumber + i,
            newLine: 0, // No new line for removed content
            changeType: 'delete'
          });
        }
        oldLineNumber += change.value.split('\n').length - 1;
      } else {
        // Unchanged lines
        oldLineNumber += change.value.split('\n').length - 1;
        newLineNumber += change.value.split('\n').length - 1;
      }
    }
    
    console.log(`Extracted ${lineChanges.length} line changes for ${filePath}:`, lineChanges);
    return lineChanges;
    
  } catch (error) {
    console.error(`Error generating line-level diff for ${filePath}:`, error);
    return [];
  }
};

// Future enhancement: This interface can be used for line-level change information
// when we implement more granular filtering based on specific line changes

const fetchFixesForPipeline = async (): Promise<FixesResponse | { results: {}; runningBuild: true; changedFiles?: Array<{path: string, changeType: string, lines: Array<{oldLine: number, newLine: number, changeType: string}>}> }> => {
  try {
    // Initialize the SDK
    await SDK.init({
      explicitNotifyLoaded: true,
      usePlatformStyles: true,
    } as any );

    // Get the web context
    const webContext = SDK.getWebContext();
    console.log('Web Context:', webContext);
    
    if (!webContext.project?.id) {
      throw new Error("Could not get project ID");
    }
    const projectId = webContext.project.id;

    console.log('Looking for veracode-fixes artifacts in recent builds');

    // Get recent builds for the project (limit to last 20 for efficiency) - same as PR tab
    const buildClient = getClient(BuildRestClient);
    const builds = await buildClient.getBuilds(
      projectId,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      20 // top
    );

    // Check for running builds first - same as PR tab
    const runningBuild = builds.find(build => build.status !== 2); // 2 = completed
    if (runningBuild) {
      console.log('Found running build:', runningBuild.id);
      return { results: {}, runningBuild: true, changedFiles: [] as Array<{path: string, changeType: string, lines: Array<{oldLine: number, newLine: number, changeType: string}>}> };
    }

    // Find the latest build with the veracode-fixes artifact - same as PR tab
    let buildWithArtifact = null;
    for (const build of builds) {
      try {
        const artifact = await buildClient.getArtifact(projectId, build.id, "veracode-fixes");
        if (artifact && artifact.resource && artifact.resource.downloadUrl) {
          buildWithArtifact = build;
          break;
        }
      } catch (e) {
        // Artifact not found for this build, continue
      }
    }

    if (!buildWithArtifact) {
      throw new Error("No recent build found with veracode-fixes artifact.");
    }
    const buildId = buildWithArtifact.id;
    console.log('Using build with artifact:', buildWithArtifact);

    // Get the fixes artifact from the correct build - same as PR tab
    const artifact = await buildClient.getArtifact(projectId, buildId, "veracode-fixes");
    console.log('Artifact:', artifact);
    
    // Use the Azure DevOps client to download the artifact instead of raw fetch
    // This ensures proper authentication and avoids redirect issues
    const artifactContent = await buildClient.getArtifactContentZip(projectId, buildId, "veracode-fixes");
    const zipBlob = new Blob([artifactContent], { type: 'application/zip' });
    
    // Extract the ZIP file
    const zip = new JSZip();
    const zipContents = await zip.loadAsync(zipBlob);
    
    // Debug: List all files in the ZIP
    console.log('Files in artifact ZIP:', Object.keys(zipContents.files));
    
    // Look for both the fixes JSON and metadata JSON in the same artifact - same as PR tab
    let metadata = null;
    let fixes = null;
    
    // Find the metadata file first
    const metadataFile = Object.values(zipContents.files).find(file => file.name.endsWith('veracode-fix-metadata.json'));
    if (metadataFile) {
      const metadataContent = await metadataFile.async('string');
      metadata = JSON.parse(metadataContent);
      console.log('Metadata loaded from artifact:', metadata);
    } else {
      console.log('No metadata file found in artifact');
    }
    
    // Find the fixes JSON file
    const fixesFile = Object.values(zipContents.files).find(file => file.name.endsWith('veracode-fixes.json'));
    if (!fixesFile) {
      throw new Error("No veracode-fixes.json file found in the artifact");
    }
    
    // Read and parse the fixes JSON file
    const fixesContent = await fixesFile.async('string');
    fixes = JSON.parse(fixesContent);
    
    console.log('Fixes data loaded:', fixes);
    
    // Get actual changed files from the Git commit for accurate filtering
    let changedFiles: Array<{path: string, changeType: string, lines: Array<{oldLine: number, newLine: number, changeType: string}>}> = [];
    
    try {
      console.log('Fetching actual changed files from the commit...');
      
      // Use metadata values for accurate API calls
      if (metadata && metadata.projectName && metadata.repositoryName && metadata.commitId) {
        changedFiles = await fetchChangedFilesFromCommit(
          metadata.projectName, 
          metadata.repositoryName, 
          metadata.commitId,
          metadata.collectionUri
        );
        
        if (changedFiles.length > 0) {
          console.log('Successfully fetched changed files from commit:', changedFiles);
        } else {
          console.log('No changed files found in commit, will show all findings');
        }
      } else {
        console.log('Metadata missing required fields, falling back to metadata changedFiles if available');
        if (metadata && metadata.changedFiles && Array.isArray(metadata.changedFiles)) {
          // Convert string array to the new format for backward compatibility
          changedFiles = metadata.changedFiles.map((path: string) => ({
            path: path,
            changeType: 'edit',
            lines: []
          }));
          console.log('Using changed files from metadata as fallback:', changedFiles);
        }
      }
    } catch (error) {
      console.log('Could not fetch changed files from commit, falling back to metadata if available');
      
      // Fallback to metadata if Git API fails
      if (metadata && metadata.changedFiles && Array.isArray(metadata.changedFiles)) {
        // Convert string array to the new format for backward compatibility
        changedFiles = metadata.changedFiles.map((path: string) => ({
          path: path,
          changeType: 'edit',
          lines: []
        }));
        console.log('Using changed files from metadata as fallback:', changedFiles);
      } else {
        console.log('No changed files available from commit or metadata, will show all findings');
        changedFiles = [];
      }
    }
    
    // Add metadata and changed files to the fixes response for use in the component
    return {
      ...fixes,
      metadata: metadata,
      changedFiles: changedFiles
    };
  } catch (error) {
    console.error("Error fetching fixes:", error);
    return { results: {}, changedFiles: [] };
  }
};

class VeracodeFixPipelineTab extends React.Component<{}, { 
  fixes: FixesResponse, 
  error: string | null,
  showOnlyChangedCode: boolean 
}> {
  constructor(props: {}) {
    super(props);
    this.state = {
      fixes: { results: {}, metadata: null, changedFiles: [] },
      error: null,
      showOnlyChangedCode: true // Pre-selected as requested
    };
  }

  async componentDidMount() {
    try {
      console.log('Veracode Fix Pipeline Tab: Component mounting...');
      await SDK.init({ explicitNotifyLoaded: true, usePlatformStyles: true } as any);
      await SDK.ready();
      const config = SDK.getConfiguration();
      console.log('Veracode Fix Pipeline Tab: SDK config:', config);
      
      // No need to detect build ID - the new function will find the right build automatically
      console.log('Veracode Fix Pipeline Tab: Using automatic build detection');
      
      const fixes = await fetchFixesForPipeline();
      
      // Check if this is a running build
      if ('runningBuild' in fixes && fixes.runningBuild) {
        console.log('Veracode Fix Pipeline Tab: Build is still running');
        this.setState({ 
          fixes: { results: {}, metadata: null, changedFiles: [] }, 
          error: null,
          showOnlyChangedCode: false 
        });
        SDK.notifyLoadSucceeded();
        return;
      }
      
      // If no changed files are detected, automatically uncheck the filter
      const showOnlyChangedCode = 'changedFiles' in fixes && fixes.changedFiles && fixes.changedFiles.length > 0 ? true : false;
      
      console.log('Veracode Fix Pipeline Tab: Fixes loaded, changed files:', fixes.changedFiles);
      this.setState({ fixes, showOnlyChangedCode });
      SDK.notifyLoadSucceeded();
      console.log('Veracode Fix Pipeline Tab: Component loaded successfully');
    } catch (err) {
      console.error("Veracode Fix Pipeline Tab: Failed to fetch fixes:", err);
      this.setState({ error: "Failed to load Veracode fixes. Please try again later." });
    }
  }

    // Filter results to show only findings from changed code
  getFilteredResults() {
    console.log('=== getFilteredResults called ===');
    console.log('showOnlyChangedCode:', this.state.showOnlyChangedCode);
    console.log('changedFiles available:', this.state.fixes.changedFiles ? this.state.fixes.changedFiles.length : 'none');
    console.log('Total files to process:', Object.keys(this.state.fixes.results).length);
    
    if (!this.state.showOnlyChangedCode || !this.state.fixes.changedFiles || this.state.fixes.changedFiles.length === 0) {
      console.log('Early return - not filtering or no changed files');
      return this.state.fixes.results;
    }

    const changedFiles = this.state.fixes.changedFiles;
    const filteredResults: { [key: string]: FileFixes } = {};
    
    console.log('Starting to process files for filtering...');
    const fileEntries = Object.entries(this.state.fixes.results);
    console.log('File entries to process:', fileEntries.map(([path, _]) => path));

    for (const [filePath, fileFixes] of fileEntries) {
      // Check if this file was changed in the commit
      const strippedPath = this.stripPrefix(filePath);
      console.log(`=== Processing file ===`);
      console.log(`Original filePath: "${filePath}"`);
      console.log(`Stripped path: "${strippedPath}"`);
      console.log(`Looking for changed file with path: "${strippedPath}"`);
      console.log(`Available changed files:`, changedFiles.map((cf: any) => ({ path: cf.path, changeType: cf.changeType })));
      
      // Normalize paths for comparison (handle leading slash differences)
      const changedFile = changedFiles.find((changedFile: any) => {
        const normalizedChangedPath = changedFile.path.replace(/^\//, ''); // Remove leading slash
        const normalizedStrippedPath = strippedPath.replace(/^\//, ''); // Remove leading slash if present
        const match = normalizedChangedPath === normalizedStrippedPath;
        console.log(`Path comparison: "${normalizedChangedPath}" === "${normalizedStrippedPath}" = ${match}`);
        return match;
      });
      
      if (changedFile) {
          console.log(`File ${strippedPath} was changed. Checking ${fileFixes.flaws.length} flaws against ${changedFile.lines.length} line changes:`, changedFile.lines);
          console.log(`Changed file details:`, changedFile);
          
          // File was changed - now filter findings to only those on changed lines
          const filteredFlaws = fileFixes.flaws.filter((flaw: any) => {
            console.log(`=== Checking flaw ===`);
            console.log(`Flaw object:`, flaw);
            console.log(`Flaw line number: ${flaw.line} (type: ${typeof flaw.line})`);
            console.log(`Changed file lines:`, changedFile.lines);
            
            // Check if the flaw line number matches any of the changed lines
            const matches = changedFile.lines.some((lineChange: any) => {
              console.log(`Checking against line change:`, lineChange);
              
              if (lineChange.changeType === 'edit') {
                // For edited lines, check if flaw line matches new line number
                const match = lineChange.newLine === flaw.line;
                console.log(`Line ${flaw.line} vs edit newLine ${lineChange.newLine}: ${match}`);
                return match;
              } else if (lineChange.changeType === 'add') {
                // For added lines, check if flaw line is within the range of new lines
                const match = flaw.line >= lineChange.newLine && flaw.line < (lineChange.newLine + 1);
                console.log(`Line ${flaw.line} vs add newLine ${lineChange.newLine}: ${match}`);
                return match;
              } else if (lineChange.changeType === 'delete') {
                // For deleted lines, no new findings possible
                console.log(`Line ${flaw.line} vs delete: false`);
                return false;
              }
              return false;
            });
            
            console.log(`Flaw on line ${flaw.line} matches changed lines: ${matches}`);
            return matches;
          });

        // Only include file if it has findings on changed lines
        if (filteredFlaws.length > 0) {
          filteredResults[filePath] = {
            ...fileFixes,
            flaws: filteredFlaws
          };
        }
      }
    }
    
    console.log('=== Filtering complete ===');
    console.log('Final filtered results:', Object.keys(filteredResults));
    console.log('Files with findings after filtering:', Object.keys(filteredResults).length);
    
    return filteredResults;
  }

  // Helper to strip the build path prefix
  stripPrefix = (filePath: string) => filePath.replace(/^\/home\/vsts\/work\/1\/s\//, '');

    // Proper diff renderer using the diff library with separate boxes for each hunk
  renderCustomDiff = (patchString: string, hunks: Array<{ oldStart: number, oldCount: number, newStart: number, newCount: number }>) => {
    if (hunks.length === 0) {
      return <div>No diff information available</div>;
    }

    // Parse the actual patch content to get the correct hunk structure
    // Simply follow the @@ markers to separate hunks
    const patchLines = patchString.split('\n');
    
    // Group lines by hunk based on the actual patch structure
    const hunkGroups: Array<{
      hunkIndex: number;
      oldStart: number;
      newStart: number;
      oldLines: Array<{ lineNumber: number; content: string; type: 'removed' | 'context' }>;
      newLines: Array<{ lineNumber: number; content: string; type: 'added' | 'context' }>;
    }> = [];

    // Initialize hunk groups
    for (let i = 0; i < hunks.length; i++) {
      hunkGroups.push({
        hunkIndex: i,
        oldStart: hunks[i].oldStart,
        newStart: hunks[i].newStart,
        oldLines: [],
        newLines: []
      });
    }

    // Parse the patch content to assign lines to correct hunks
    let currentHunkIndex = 0;
    let inHunk = false;
    let currentOldLine = hunks[0].oldStart;
    let currentNewLine = hunks[0].newStart;

    for (const line of patchLines) {
      if (line.startsWith('@@')) {
        // Start of a new hunk - but don't increment yet, process lines for current hunk first
        inHunk = true;
        continue;
      }
      
      if (!inHunk || line.startsWith('---') || line.startsWith('+++')) {
        continue;
      }

      // Assign lines to the current hunk based on their prefix
      if (line.startsWith('-')) {
        // Line removed (red)
        hunkGroups[currentHunkIndex].oldLines.push({
          lineNumber: currentOldLine++,
          content: line.substring(1),
          type: 'removed'
        });
      } else if (line.startsWith('+')) {
        // Line added (green)
        hunkGroups[currentHunkIndex].newLines.push({
          lineNumber: currentNewLine++,
          content: line.substring(1),
          type: 'added'
        });
      } else if (line.startsWith(' ')) {
        // Context line (unchanged, white)
        hunkGroups[currentHunkIndex].oldLines.push({
          lineNumber: currentOldLine++,
          content: line.substring(1),
          type: 'context'
        });
        hunkGroups[currentHunkIndex].newLines.push({
          lineNumber: currentNewLine++,
          content: line.substring(1),
          type: 'context'
        });
      }

      // Check if we've processed enough lines for the current hunk
      // If so, move to the next hunk for the next @@ marker
      if (currentHunkIndex < hunks.length - 1) {
        const currentHunk = hunks[currentHunkIndex];
        const totalLinesInHunk = Math.max(currentHunk.oldCount, currentHunk.newCount);
        
        // If we've processed enough lines for this hunk, prepare for the next one
        if (hunkGroups[currentHunkIndex].oldLines.length + hunkGroups[currentHunkIndex].newLines.length >= totalLinesInHunk) {
          currentHunkIndex++;
          currentOldLine = hunks[currentHunkIndex].oldStart;
          currentNewLine = hunks[currentHunkIndex].newStart;
        }
      }
    }

    // Render each hunk in its own box
    return (
      <div>
        {hunkGroups.map((hunk, hunkIndex) => (
          <div key={`hunk-${hunkIndex}`} style={{ marginBottom: '20px' }}>
            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: '#f1f8ff', 
              border: '1px solid #c8e1ff',
              borderRadius: '6px 6px 0 0',
              fontSize: '12px',
              color: '#0366d6',
              fontWeight: '600'
            }}>
              Change #{hunkIndex + 1}: Lines {hunk.oldStart}-{hunk.oldStart + hunk.oldLines.length - 1} → {hunk.newStart}-{hunk.newStart + hunk.newLines.length - 1}
            </div>
            <div style={{ display: 'flex', border: '1px solid #e1e4e8', borderTop: 'none' }}>
              {/* Original Code Panel */}
              <div style={{ flex: 1, borderRight: '1px solid #e1e4e8' }}>
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: '#f6f8fa', 
                  borderBottom: '1px solid #e1e4e8',
                  fontWeight: 'bold',
                  color: '#586069'
                }}>
                  Original Code
                </div>
                <div style={{ 
                  backgroundColor: '#ffffff',
                  fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
                  fontSize: '12px',
                  lineHeight: '1.45'
                }}>
                  {hunk.oldLines.map((line, index) => (
                    <div key={`old-${hunkIndex}-${index}`} style={{ 
                      display: 'flex',
                      padding: '2px 0',
                      backgroundColor: line.type === 'removed' ? '#ffeef0' : 'transparent'
                    }}>
                      <div style={{ 
                        width: '60px', 
                        padding: '0 16px', 
                        backgroundColor: '#f6f8fa', 
                        color: '#586069',
                        borderRight: '1px solid #e1e4e8',
                        textAlign: 'right',
                        userSelect: 'none'
                      }}>
                        {line.lineNumber}
                      </div>
                      <div style={{ 
                        padding: '0 16px', 
                        flex: 1,
                        color: line.type === 'removed' ? '#d73a49' : '#24292e'
                      }}>
                        {line.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fixed Code Panel */}
              <div style={{ flex: 1 }}>
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: '#f6f8fa', 
                  borderBottom: '1px solid #e1e4e8',
                  fontWeight: 'bold',
                  color: '#586069'
                }}>
                  Fixed Code
                </div>
                <div style={{ 
                  backgroundColor: '#ffffff',
                  fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
                  fontSize: '12px',
                  lineHeight: '1.45'
                }}>
                  {hunk.newLines.map((line, index) => (
                    <div key={`new-${hunkIndex}-${index}`} style={{ 
                      display: 'flex',
                      padding: '2px 0',
                      backgroundColor: line.type === 'added' ? '#e6ffed' : 'transparent'
                    }}>
                      <div style={{ 
                        width: '60px', 
                        padding: '0 16px', 
                        backgroundColor: '#f6f8fa', 
                        color: '#586069',
                        borderRight: '1px solid #e1e4e8',
                        textAlign: 'right',
                        userSelect: 'none'
                      }}>
                        {line.lineNumber}
                      </div>
                      <div style={{ 
                        padding: '0 16px', 
                        flex: 1,
                        color: line.type === 'added' ? '#28a745' : '#24292e'
                      }}>
                        {line.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };



  render() {
    const { fixes, error, showOnlyChangedCode } = this.state;

    if (error) {
      return (
        <div style={{ 
          color: '#721c24', 
          fontWeight: 600, 
          padding: '20px', 
          background: '#f8d7da', 
          border: '1px solid #f5c6cb', 
          borderRadius: 8,
          textAlign: 'center',
          margin: '20px 0'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '12px', fontWeight: 'bold' }}>
            Unable to Load Veracode Fix Data
          </div>
          <div style={{ fontSize: '14px', color: '#721c24' }}>
            {error}
          </div>
        </div>
      );
    }

    // Check if this is a running build (same logic as PR tab)
    if ((fixes as any).runningBuild) {
      return (
        <div style={{ color: '#b8860b', fontWeight: 600, padding: '16px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
          <span role="img" aria-label="hourglass">⏳</span> A pipeline is currently running for this build.<br />
          Please come back once it has finished to see the latest Veracode Fix suggestions.
        </div>
      );
    }

    // Check if this is a running build by looking at the fixes data structure
    if (Object.keys(fixes.results).length === 0 && !fixes.metadata && !fixes.changedFiles) {
      // This is likely a running build - show the same message as PR tab
      return (
        <div style={{ color: '#b8860b', fontWeight: 600, padding: '16px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
          <span role="img" aria-label="hourglass">⏳</span> A pipeline is currently running for this build.<br />
          Please come back once it has finished to see the latest Veracode Fix suggestions.
        </div>
      );
    }

    const filteredResults = this.getFilteredResults();
    const fileEntries = Object.entries(filteredResults);
    
    if (fileEntries.length === 0) {
      if (this.state.showOnlyChangedCode && Object.keys(fixes.results).length > 0) {
        return (
          <div>
            <div style={{ marginBottom: 20, padding: '12px', background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: 5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showOnlyChangedCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.setState({ showOnlyChangedCode: e.target.checked })}
                />
                Show only findings from files changed in this commit
              </label>
            </div>
            <p>No findings from changed code. Uncheck the box above to see all findings.</p>
          </div>
        );
      }
      return <p>Fixes are being loaded ....</p>;
    }

    // Helper to slugify file names for branch names (max 20 chars, safe chars only)
    function slugifyFileName(filePath: string) {
      return filePath.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase().slice(0, 20) || 'file';
    }

    // Create a new branch and apply fixes
    const createFixBranch = async (fixesToApply: Array<{filePath: string, flaw: any, patch: string}>) => {
      const webContext = SDK.getWebContext();
      const projectId = webContext.project?.id;
      if (!projectId) {
        alert('Could not determine project.');
        return;
      }
      
      // Get all repositories in the project
      const gitClient = getClient(GitRestClient);
      const repositories = await gitClient.getRepositories(projectId);

      // Try to match repo name in filePath, fallback to the only repo if just one, or use metadata if available
      let repoMatch = repositories.find(r => fixesToApply[0].filePath.includes(r.name));
      if (!repoMatch && repositories.length === 1) {
        repoMatch = repositories[0];
      }
      if (!repoMatch && this.state.fixes.metadata?.repositoryName) {
        repoMatch = repositories.find(r => r.name === this.state.fixes.metadata.repositoryName);
      }
      const repoId = repoMatch ? repoMatch.id : repositories[0].id;

      // Debug logging for repo selection
      console.log('File path for fix:', fixesToApply[0].filePath);
      console.log('Available repos:', repositories.map(r => r.name));
      console.log('Selected repo:', repoMatch?.name);

      // Use metadata if available for branch information
      let sourceBranch: string | null = null;
      
      if (this.state.fixes.metadata && this.state.fixes.metadata.sourceBranch) {
        sourceBranch = this.state.fixes.metadata.sourceBranch.replace('refs/heads/', '');
        console.log('Using metadata for branch info:', { sourceBranch });
      } else {
        // No metadata available, cannot determine source branch
        console.log('No metadata or build information available for branch detection');
      }

      if (!sourceBranch) {
        alert('Could not determine source branch.');
        return;
      }

      try {
        // 1. Get the latest commit on the source branch
        const refs = await gitClient.getRefs(repoId, projectId);
        const sourceRef = refs.find(ref => ref.name === `refs/heads/${sourceBranch}`);
        if (!sourceRef) throw new Error(`Source branch ${sourceBranch} not found`);
        const latestCommitId = sourceRef.objectId;

        // Determine if this is a single fix (one file, one patch)
        const isSingleFix = fixesToApply.length === 1;
        let filePatchMap: { [filePath: string]: string } = {};
        let numFilesUpdated = 0;
        const changes: any[] = [];
        let newBranchName = '';
        let newBranchRef = '';
        const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12); // e.g., 20240613T1530

        if (isSingleFix) {
          // Single fix: patch the original file content only
          const { filePath, patch, flaw } = fixesToApply[0];
          const fileSlug = slugifyFileName(filePath);
          const issueId = flaw?.issueId || 'fix';
          const shortSha = latestCommitId.slice(0, 8);
          newBranchName = `veracode-fix-${shortSha}-${fileSlug}-${issueId}-${timestamp}`;
          newBranchRef = `refs/heads/${newBranchName}`;

          // 2. Create the new branch from the source branch's latest commit
          await gitClient.updateRefs([
            {
              name: newBranchRef,
              oldObjectId: '0000000000000000000000000000000000000000',
              newObjectId: latestCommitId,
              repositoryId: repoId,
              isLocked: false
            } as any
          ], repoId, projectId);

          const strippedPath = this.stripPrefix(filePath);
          // 3. Fetch file content from the new branch (now exists)
          const item = await gitClient.getItem(
            repoId,
            strippedPath,
            undefined, undefined, undefined, undefined, undefined, undefined,
            { version: newBranchName, versionType: 0, versionOptions: 0 }
          );
          let content = await (await fetch(item.url)).text();

          // Use the diff library to apply the patch
          const patchedContent = diffApplyPatch(content, patch);
          if (patchedContent === false) {
            alert('Patch could not be applied automatically. Please review manually.');
            console.log('Patch:', patch);
            console.log('File content (start):', content.slice(0, 200));
            return;
          }
          content = patchedContent;

          changes.push({
            changeType: 'edit',
            item: { path: strippedPath },
            newContent: { content, contentType: 'rawtext' }
          } as any);
          numFilesUpdated = 1;
        } else {
          // Batch fix: for each file, apply only the first file-level patch from fileFixes.patch[0]
          const shortSha = latestCommitId.slice(0, 8);
          newBranchName = `veracode-fix-batch-${shortSha}-${timestamp}`;
          newBranchRef = `refs/heads/${newBranchName}`;
          // 2. Create the new branch from the source branch's latest commit
          await gitClient.updateRefs([
            {
              name: newBranchRef,
              oldObjectId: '0000000000000000000000000000000000000000',
              newObjectId: latestCommitId,
              repositoryId: repoId,
              isLocked: false
            } as any
          ], repoId, projectId);
          for (const { filePath } of fixesToApply) {
            // Only use the first fix suggestion for each file
            if (!filePatchMap[filePath]) {
              const fileFixes = this.state.fixes.results[filePath];
              if (fileFixes && fileFixes.patch && fileFixes.patch.length > 0) {
                filePatchMap[filePath] = fileFixes.patch[0];
              }
            }
          }
          for (const filePath of Object.keys(filePatchMap)) {
            const strippedPath = this.stripPrefix(filePath);
            // 3. Fetch file content from the new branch (now exists)
            const item = await gitClient.getItem(
              repoId,
              strippedPath,
              undefined, undefined, undefined, undefined, undefined, undefined,
              { version: newBranchName, versionType: 0, versionOptions: 0 }
            );
            let content = await (await fetch(item.url)).text();

            // Use the diff library to apply the patch
            const patchedContent = diffApplyPatch(content, filePatchMap[filePath]);
            if (patchedContent === false) {
              alert('Patch could not be applied automatically. Please review manually.');
              console.log('Patch:', filePatchMap[filePath]);
              console.log('File content (start):', content.slice(0, 200));
              return;
            }
            content = patchedContent;

            changes.push({
              changeType: 'edit',
              item: { path: strippedPath },
              newContent: { content, contentType: 'rawtext' }
            } as any);
          }
          numFilesUpdated = Object.keys(filePatchMap).length;
        }

        // 4. Commit and push all changes
        await gitClient.createPush({
          refUpdates: [
            {
              name: newBranchRef,
              oldObjectId: latestCommitId,
              repositoryId: repoId,
              isLocked: false,
              newObjectId: undefined // Will be set by server
            } as any
          ],
          commits: [
            {
              comment: `Apply Veracode Fix for pipeline run`,
              changes: changes as any
            }
          ]
        } as any, repoId, projectId);

        // 5. Create a pull request named "Veracode Fix"
        const pr = await gitClient.createPullRequest({
          sourceRefName: newBranchRef,
          targetRefName: `refs/heads/${sourceBranch}`,
          title: 'Veracode Fix',
          description: `This PR applies ${fixesToApply.length} Veracode security fix${fixesToApply.length > 1 ? 'es' : ''} to address identified vulnerabilities.\n\nFixes applied:\n${fixesToApply.map(f => `- ${this.stripPrefix(f.filePath)}: CWE-${f.flaw.CWEId} (Line ${f.flaw.line})`).join('\n')}`,
          isDraft: false
        } as any, repoId, projectId);

        // 6. Show a popup with the PR link instead of redirecting
        const collectionUri = (webContext as any).collection?.uri || (webContext as any).account?.hostUri || '';
        const repoName = repoMatch?.name || repositories[0].name;
        const prUrl = `${collectionUri}${webContext.project.name}/_git/${repoName}/pullrequest/${pr.pullRequestId}`;
        alert(
          `Successfully created branch ${newBranchName} and pull request with ${numFilesUpdated} file(s) updated!\n\n` +
          `View your PR here:\n${prUrl}`
        );
        console.log('PR URL:', prUrl);
      } catch (error) {
        console.error('Error creating fix branch:', error);
        alert(`Error creating fix branch: ${(error as Error).message}`);
      }
    };

    // Apply a single fix
    const handleApplySingleFix = async (filePath: string, flaw: any) => {
      const fileFixes = fixes.results[filePath];
      if (!fileFixes || !fileFixes.flaws) {
        alert('No fixes available for this file.');
        return;
      }

      const flawFix = fileFixes.flaws.find(f => f.issueId === flaw.issueId);
      if (!flawFix || !flawFix.patches || flawFix.patches.length === 0) {
        alert('No patch available for this flaw.');
        return;
      }

      await createFixBranch([{
        filePath,
        flaw: flawFix,
        patch: flawFix.patches[0]
      }]);
    };

    // Apply all fixes
    const handleApplyAllFixes = async () => {
      const allFixes: Array<{filePath: string, flaw: any, patch: string}> = [];
      
      for (const [filePath, fileFixes] of fileEntries) {
        if (fileFixes.flaws) {
          for (const flaw of fileFixes.flaws) {
            if (flaw.patches && flaw.patches.length > 0) {
              allFixes.push({
                filePath,
                flaw,
                patch: flaw.patches[0]
              });
            }
          }
        }
      }

      if (allFixes.length === 0) {
        alert('No fixes available to apply.');
        return;
      }

      await createFixBranch(allFixes);
    };

    return (
      <div style={{ fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '14px' }}>
        <h2>Veracode Fix Suggestions</h2>
        
        {/* Filter checkbox */}
        <div style={{ marginBottom: 20, padding: '12px', background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: 5 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOnlyChangedCode}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.setState({ showOnlyChangedCode: e.target.checked })}
            />
            Show only findings from changed code in this commit
          </label>
          <p style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
            {showOnlyChangedCode 
              ? `Showing ${fileEntries.length} file(s) with findings from changed code only.`
              : `Showing all findings from ${Object.keys(fixes.results).length} file(s).`
            }
          </p>
          {this.state.fixes.changedFiles && this.state.fixes.changedFiles.length > 0 ? (
            <p style={{ marginTop: 4, fontSize: '11px', color: '#888' }}>
              Detected {this.state.fixes.changedFiles.length} changed file(s) from build comparison
              {this.state.showOnlyChangedCode && fileEntries.length > 0 && (
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                  {' '}({fileEntries.length} with findings)
                </span>
              )}
            </p>
          ) : (
            <p style={{ marginTop: 4, fontSize: '11px', color: '#888' }}>
              No changed files detected - showing all findings
            </p>
          )}
        </div>
        
        {/* Apply All Fixes Button */}
        {fileEntries.length > 0 && (
          <div style={{ marginBottom: 20, padding: '12px', background: '#f0f0f0', borderRadius: 5 }}>
            <button
              style={{ 
                padding: '8px 20px', 
                background: '#28a745', 
                color: 'white', 
                border: 'none', 
                borderRadius: 4, 
                cursor: 'pointer', 
                fontWeight: 600,
                fontSize: '14px'
              }}
              onClick={handleApplyAllFixes}
            >
              Apply All Fixes ({fileEntries.reduce((total, [_, fileFixes]) => 
                total + (fileFixes.flaws ? fileFixes.flaws.length : 0), 0)} fixes)
            </button>
            <p style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              This will create a new branch from the source branch and apply all available fixes.
            </p>
          </div>
        )}
        
        {fileEntries.map(([filePath, fileFixes]) => (
          <div key={filePath} style={{ marginBottom: 32 }}>
            <h3>{this.stripPrefix(filePath)}</h3>
            {fileFixes.flaws.map((flaw, idx) => (
              <div key={idx} style={{ marginBottom: 16 }}>
                <h4>CWE-{flaw.CWEId} (Line {flaw.line})</h4>
                                    {flaw.patches.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {(() => {
                          const patchData = this.parsePatch(flaw.patches[0]);
                          const { oldCode, newCode, hunks } = patchData;
                          
                          // Debug logging
                          console.log('Parsed patch for flaw:', flaw);
                          console.log('Old code:', oldCode);
                          console.log('New code:', newCode);
                          console.log('Hunks:', hunks);
                          console.log('Old code length:', oldCode.length);
                          console.log('New code length:', newCode.length);
                          
                          return (
                        <div style={{ border: '1px solid #e1e4e8', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px' }}>
                          <div style={{ padding: '12px', backgroundColor: '#f6f8fa', borderBottom: '1px solid #e1e4e8' }}>
                            <strong>Code Changes for CWE-{flaw.CWEId} (Line {flaw.line})</strong>
                          </div>
                          {this.renderCustomDiff(flaw.patches[0], hunks)}
                        </div>
                      );
                    })()}
                    <button
                      style={{ marginTop: 12, padding: '6px 16px', background: '#0078d4', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => handleApplySingleFix(filePath, flaw)}
                    >
                      Apply this fix
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  private parsePatch(patch: string): { oldCode: string, newCode: string, hunks: Array<{ oldStart: number, oldCount: number, newStart: number, newCount: number }> } {
    const lines = patch.split('\n');
    let oldCode = '';
    let newCode = '';
    let hunks: Array<{ oldStart: number, oldCount: number, newStart: number, newCount: number }> = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        inHunk = true;
        // Parse the @@ line to extract line numbers for this hunk
        // Format: @@ -oldStart,oldCount +newStart,newCount @@
        const match = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (match) {
          const oldStart = parseInt(match[1]);
          const oldCount = parseInt(match[2] || '1');
          const newStart = parseInt(match[3]);
          const newCount = parseInt(match[4] || '1');
          
          hunks.push({ oldStart, oldCount, newStart, newCount });
        }
        continue;
      }
      if (!inHunk || line.startsWith('---') || line.startsWith('+++')) {
        continue;
      }
      if (line.startsWith('-')) {
        oldCode += line.substring(1) + '\n';
      } else if (line.startsWith('+')) {
        newCode += line.substring(1) + '\n';
      } else if (line.startsWith(' ')) {
        oldCode += line.substring(1) + '\n';
        newCode += line.substring(1) + '\n';
      }
    }
    
    return { 
      oldCode: oldCode.trimEnd(), 
      newCode: newCode.trimEnd(), 
      hunks 
    };
  }
}

// Initialize the SDK
console.log('Veracode Fix Pipeline Tab: Initializing SDK...');
console.log('Veracode Fix Pipeline Tab: Document ready state:', document.readyState);
console.log('Veracode Fix Pipeline Tab: Root element exists:', !!document.getElementById('root'));

try {
  SDK.init();
  console.log('Veracode Fix Pipeline Tab: SDK.init() called successfully');
} catch (error) {
  console.error('Veracode Fix Pipeline Tab: SDK.init() failed:', error);
}

// Initialize the component when VSS is ready
SDK.ready().then(() => {
  console.log('Veracode Fix Pipeline Tab: SDK ready, rendering component...');
  console.log('Veracode Fix Pipeline Tab: VSS object:', (window as any).VSS);
  console.log('Veracode Fix Pipeline Tab: SDK object:', SDK);
  
  const rootElement = document.getElementById('root');
  if (rootElement) {
    ReactDOM.render(<VeracodeFixPipelineTab />, rootElement);
    console.log('Veracode Fix Pipeline Tab: Component rendered successfully');
  } else {
    console.error('Veracode Fix Pipeline Tab: Root element not found!');
  }
}).catch(error => {
  console.error('Veracode Fix Pipeline Tab: SDK initialization failed:', error);
}); 