import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as SDK from 'azure-devops-extension-sdk';
import { getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
//import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api/Common";
//import { getService } from "azure-devops-extension-sdk";
import { GitRestClient } from "azure-devops-extension-api/Git";
// import DiffViewer from 'react-diff-viewer'; // Removed - using custom diff renderer
import JSZip from 'jszip';
import { applyPatch as diffApplyPatch } from 'diff';

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
  metadata?: any; // Added for metadata
}

// Helper to get PR ID from query string
function getPrIdFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('prId');
}

// Helper to extract PR ID from the parent window URL (fallback)
function getPrIdFromParentUrl(): string | null {
  try {
    const parentUrl = window.parent.location.href;
    const match = parentUrl.match(/pullrequest\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Use PR ID from query string if available, otherwise fallback
function getCurrentPrId(): string | null {
  return getPrIdFromQuery() || getPrIdFromParentUrl();
}

const fetchFixesForPR = async (prId: string): Promise<FixesResponse | { results: {}; runningBuild: true }> => {
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

    if (!prId) {
      throw new Error("Could not determine PR ID for artifact lookup");
    }
    console.log('Looking for artifacts for PR ID:', prId);

    // Get recent builds for the project (limit to last 20 for efficiency)
    const buildClient = getClient(BuildRestClient);
    const builds = await buildClient.getBuilds(
      projectId,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      20 // top
    );

    // Check for running builds for this PR
    const runningBuild = builds.find(build => {
      const buildPrId = build.triggerInfo && (build.triggerInfo['pr.number'] || build.triggerInfo['pullRequestId']);
      return String(buildPrId) === String(prId) && build.status !== 2; // 2 = completed
    });
    if (runningBuild) {
      return { results: {}, runningBuild: true };
    }

    // Find the latest build for this PR with the veracode-fixes artifact
    let buildWithArtifact = null;
    for (const build of builds) {
      // Check if this build is for the current PR
      const buildPrId = build.triggerInfo && (build.triggerInfo['pr.number'] || build.triggerInfo['pullRequestId']);
      if (String(buildPrId) === String(prId)) {
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
    }

    if (!buildWithArtifact) {
      throw new Error("No recent build found for this PR with veracode-fixes artifact.");
    }
    const buildId = buildWithArtifact.id;
    console.log('Using build:', buildWithArtifact);

    // Get the fixes artifact from the correct build
    const artifact = await buildClient.getArtifact(projectId, buildId, "veracode-fixes");
    console.log('Artifact:', artifact);
    
    const downloadUrl = artifact.resource.downloadUrl;
    const response = await fetch(downloadUrl);
    const zipBlob = await response.blob();
    
    // Extract the ZIP file
    const zip = new JSZip();
    const zipContents = await zip.loadAsync(zipBlob);
    
    // Debug: List all files in the ZIP
    console.log('Files in artifact ZIP:', Object.keys(zipContents.files));
    
    // Look for both the fixes JSON and metadata JSON in the same artifact
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
    
    // Add metadata to the fixes response for use in the component
    return {
      ...fixes,
      metadata: metadata
    };
  } catch (error) {
    console.error("Error fetching fixes:", error);
    return { results: {} };
  }
};

class VeracodeFixPRTab extends React.Component<{}, { fixes: FixesResponse, error: string | null }> {
  constructor(props: {}) {
    super(props);
    this.state = {
      fixes: { results: {}, metadata: null },
      error: null
    };
  }

  async componentDidMount() {
    try {
      await SDK.init({ explicitNotifyLoaded: true, usePlatformStyles: true } as any);
      await SDK.ready();
      const config = SDK.getConfiguration();
      // Prefer SDK config, fallback to query/URL
      const prId = config.pullRequestId || getCurrentPrId();
      if (!prId) {
        this.setState({ error: "Could not determine PR ID for artifact lookup" });
        return;
      }
      const fixes = await fetchFixesForPR(prId);
      this.setState({ fixes });
      SDK.notifyLoadSucceeded();
    } catch (err) {
      console.error("Failed to fetch fixes:", err);
      this.setState({ error: "Failed to load Veracode fixes. Please try again later." });
    }
  }

  render() {
    const { fixes, error } = this.state;

    if (error) {
      return <div className="error-message">{error}</div>;
    }

    if ((fixes as any).runningBuild) {
      return (
        <div style={{ color: '#b8860b', fontWeight: 600, padding: '16px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
          <span role="img" aria-label="hourglass">⏳</span> A pipeline is currently running for this PR.<br />
          Please come back once it has finished to see the latest Veracode Fix suggestions.
        </div>
      );
    }

    const fileEntries = Object.entries(fixes.results);
    if (fileEntries.length === 0) {
      return <p>Fixes are being loaded ....</p>;
    }

    // Helper to strip the build path prefix
    const stripPrefix = (filePath: string) => filePath.replace(/^\/home\/vsts\/work\/1\/s\//, '');

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

      // Use metadata if available, otherwise fall back to URL-based detection
      let prId: string | null = null;
      let sourceBranch: string | null = null;
      
      if (this.state.fixes.metadata && this.state.fixes.metadata.prId) {
        prId = this.state.fixes.metadata.prId;
        sourceBranch = this.state.fixes.metadata.sourceBranch ? this.state.fixes.metadata.sourceBranch.replace('refs/heads/', '') : null;
        console.log('Using metadata for PR info:', { prId, sourceBranch });
      } else {
        prId = getCurrentPrId();
        if (!prId) {
          alert('Could not determine PR ID from URL or metadata.');
          return;
        }
        const pr = await gitClient.getPullRequestById(Number(prId), projectId);
        sourceBranch = pr.sourceRefName.replace('refs/heads/', '');
        console.log('Using URL-based PR detection:', { prId, sourceBranch });
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

          const strippedPath = stripPrefix(filePath);
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
            const strippedPath = stripPrefix(filePath);
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
              comment: `Apply Veracode Batch Fix for PR #${prId}`,
              changes: changes as any
            }
          ]
        } as any, repoId, projectId);

        // 5. Create a pull request named "Veracode Batch Fix"
        const pr = await gitClient.createPullRequest({
          sourceRefName: newBranchRef,
          targetRefName: `refs/heads/${sourceBranch}`,
          title: 'Veracode Batch Fix',
          description: `This PR applies ${fixesToApply.length} Veracode security fix${fixesToApply.length > 1 ? 'es' : ''} to address identified vulnerabilities.\n\nFixes applied:\n${fixesToApply.map(f => `- ${stripPrefix(f.filePath)}: CWE-${f.flaw.CWEId} (Line ${f.flaw.line})`).join('\n')}`,
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
            <h3>{stripPrefix(filePath)}</h3>
            {fileFixes.flaws.map((flaw, idx) => (
              <div key={idx} style={{ marginBottom: 16 }}>
                <h4>CWE-{flaw.CWEId} (Line {flaw.line})</h4>
                {flaw.patches.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {this.renderCustomDiff(flaw.patches[0], this.parsePatch(flaw.patches[0]).hunks)}
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

  private parsePatch(patch: string): { hunks: Array<{ oldStart: number, oldCount: number, newStart: number, newCount: number }> } {
    const lines = patch.split('\n');
    let hunks: Array<{ oldStart: number, oldCount: number, newStart: number, newCount: number }> = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
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
    }
    return { hunks };
  }

  // Custom diff renderer using the same logic as pipeline tab
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
                        color: line.type === 'added' ? '#22863a' : '#24292e'
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

  // private applyPatch(originalContent: string, patch: string): string {
  //   const [oldCode, newCode] = this.parsePatch(patch);
  //   
  //   // Simple replacement - in a real implementation, you'd want more sophisticated patch application
  //   if (originalContent.includes(oldCode)) {
  //     return originalContent.replace(oldCode, newCode);
  //   }
  //   
  //   // Fallback: return the new code if exact match not found
  //   return newCode;
  // }
}

// Initialize the SDK
SDK.init();

// Initialize the component when VSS is ready
SDK.ready().then(() => {
  ReactDOM.render(<VeracodeFixPRTab />, document.getElementById('root'));
});