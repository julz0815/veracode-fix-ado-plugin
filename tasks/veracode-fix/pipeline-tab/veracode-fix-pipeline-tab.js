"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const React = __importStar(require("react"));
const ReactDOM = __importStar(require("react-dom"));
const SDK = __importStar(require("azure-devops-extension-sdk"));
const azure_devops_extension_api_1 = require("azure-devops-extension-api");
const Build_1 = require("azure-devops-extension-api/Build");
const Git_1 = require("azure-devops-extension-api/Git");
const react_diff_viewer_1 = __importDefault(require("react-diff-viewer"));
const jszip_1 = __importDefault(require("jszip"));
const diff_1 = require("diff");
function getBuildIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('buildId');
}
function getBuildIdFromParentUrl() {
    try {
        const parentUrl = window.parent.location.href;
        const match = parentUrl.match(/build\/(\d+)/);
        return match ? match[1] : null;
    }
    catch {
        return null;
    }
}
function getCurrentBuildId() {
    return getBuildIdFromQuery() || getBuildIdFromParentUrl();
}
const fetchChangedFilesFromBuild = async (projectId, buildId) => {
    var _a;
    try {
        const buildClient = (0, azure_devops_extension_api_1.getClient)(Build_1.BuildRestClient);
        const gitClient = (0, azure_devops_extension_api_1.getClient)(Git_1.GitRestClient);
        const build = await buildClient.getBuild(projectId, buildId);
        if (!build || !build.sourceVersion) {
            console.log('No source version found in build, cannot determine changed files');
            return [];
        }
        const repositoryId = (_a = build.repository) === null || _a === void 0 ? void 0 : _a.id;
        if (!repositoryId) {
            console.log('No repository ID found in build, cannot determine changed files');
            return [];
        }
        const builds = await buildClient.getBuilds(projectId, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 10);
        const currentBranch = build.sourceBranch;
        const previousBuild = builds.find(b => b.id !== buildId &&
            b.sourceBranch === currentBranch &&
            b.status === 2 &&
            b.result === 2);
        if (!previousBuild || !previousBuild.sourceVersion) {
            console.log('No previous build found for comparison, showing all files');
            return [];
        }
        const changes = await gitClient.getChanges(repositoryId, previousBuild.sourceVersion, build.sourceVersion);
        if (!changes || !changes.changes) {
            console.log('No changes found between builds');
            return [];
        }
        const changedFiles = changes.changes
            .filter(change => change.item && change.item.path)
            .map(change => change.item.path)
            .filter(path => path && !path.startsWith('/'))
            .filter(path => path && !path.includes('node_modules'))
            .filter(path => path && !path.includes('.git'));
        console.log('Changed files detected:', changedFiles);
        return changedFiles;
    }
    catch (error) {
        console.error('Error fetching changed files:', error);
        return [];
    }
};
const fetchFixesForBuild = async (buildId) => {
    var _a;
    try {
        await SDK.init({
            explicitNotifyLoaded: true,
            usePlatformStyles: true,
        });
        const webContext = SDK.getWebContext();
        console.log('Web Context:', webContext);
        if (!((_a = webContext.project) === null || _a === void 0 ? void 0 : _a.id)) {
            throw new Error("Could not get project ID");
        }
        const projectId = webContext.project.id;
        if (!buildId) {
            throw new Error("Could not determine build ID for artifact lookup");
        }
        console.log('Looking for artifacts for build ID:', buildId);
        const buildClient = (0, azure_devops_extension_api_1.getClient)(Build_1.BuildRestClient);
        const build = await buildClient.getBuild(projectId, Number(buildId));
        if (!build) {
            throw new Error("Build not found");
        }
        if (build.status !== 2) {
            return { results: {}, runningBuild: true, changedFiles: [] };
        }
        try {
            const artifact = await buildClient.getArtifact(projectId, build.id, "veracode-fixes");
            if (!artifact || !artifact.resource || !artifact.resource.downloadUrl) {
                throw new Error("No veracode-fixes artifact found in this build");
            }
            console.log('Artifact:', artifact);
            const downloadUrl = artifact.resource.downloadUrl;
            const response = await fetch(downloadUrl);
            const zipBlob = await response.blob();
            const zip = new jszip_1.default();
            const zipContents = await zip.loadAsync(zipBlob);
            console.log('Files in artifact ZIP:', Object.keys(zipContents.files));
            let metadata = null;
            let fixes = null;
            const metadataFile = Object.values(zipContents.files).find(file => file.name.endsWith('veracode-fix-metadata.json'));
            if (metadataFile) {
                const metadataContent = await metadataFile.async('string');
                metadata = JSON.parse(metadataContent);
                console.log('Metadata loaded from artifact:', metadata);
            }
            else {
                console.log('No metadata file found in artifact');
            }
            const fixesFile = Object.values(zipContents.files).find(file => file.name.endsWith('veracode-fixes.json'));
            if (!fixesFile) {
                throw new Error("No veracode-fixes.json file found in the artifact");
            }
            const fixesContent = await fixesFile.async('string');
            fixes = JSON.parse(fixesContent);
            console.log('Fixes data loaded:', fixes);
            const changedFiles = await fetchChangedFilesFromBuild(projectId, build.id);
            return {
                ...fixes,
                metadata: metadata,
                changedFiles: changedFiles
            };
        }
        catch (e) {
            throw new Error(`No veracode-fixes artifact found in build ${buildId}: ${e}`);
        }
    }
    catch (error) {
        console.error("Error fetching fixes:", error);
        return { results: {}, changedFiles: [] };
    }
};
class VeracodeFixPipelineTab extends React.Component {
    constructor(props) {
        super(props);
        this.stripPrefix = (filePath) => filePath.replace(/^\/home\/vsts\/work\/1\/s\//, '');
        this.state = {
            fixes: { results: {}, metadata: null, changedFiles: [] },
            error: null,
            showOnlyChangedCode: true
        };
    }
    async componentDidMount() {
        try {
            await SDK.init({ explicitNotifyLoaded: true, usePlatformStyles: true });
            await SDK.ready();
            const config = SDK.getConfiguration();
            const buildId = config.buildId || getCurrentBuildId();
            if (!buildId) {
                this.setState({ error: "Could not determine build ID for artifact lookup" });
                return;
            }
            const fixes = await fetchFixesForBuild(buildId);
            const showOnlyChangedCode = 'changedFiles' in fixes && fixes.changedFiles && fixes.changedFiles.length > 0 ? true : false;
            this.setState({ fixes, showOnlyChangedCode });
            SDK.notifyLoadSucceeded();
        }
        catch (err) {
            console.error("Failed to fetch fixes:", err);
            this.setState({ error: "Failed to load Veracode fixes. Please try again later." });
        }
    }
    getFilteredResults() {
        if (!this.state.showOnlyChangedCode || !this.state.fixes.changedFiles || this.state.fixes.changedFiles.length === 0) {
            return this.state.fixes.results;
        }
        const changedFiles = this.state.fixes.changedFiles;
        const filteredResults = {};
        for (const [filePath, fileFixes] of Object.entries(this.state.fixes.results)) {
            const strippedPath = this.stripPrefix(filePath);
            if (changedFiles.includes(strippedPath)) {
                filteredResults[filePath] = fileFixes;
            }
        }
        return filteredResults;
    }
    render() {
        const { fixes, error, showOnlyChangedCode } = this.state;
        if (error) {
            return <div className="error-message">{error}</div>;
        }
        if (fixes.runningBuild) {
            return (<div style={{ color: '#b8860b', fontWeight: 600, padding: '16px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
          <span role="img" aria-label="hourglass">⏳</span> This pipeline is currently running.<br />
          Please come back once it has finished to see the latest Veracode Fix suggestions.
        </div>);
        }
        const filteredResults = this.getFilteredResults();
        const fileEntries = Object.entries(filteredResults);
        if (fileEntries.length === 0) {
            if (this.state.showOnlyChangedCode && Object.keys(fixes.results).length > 0) {
                return (<div>
            <div style={{ marginBottom: 20, padding: '12px', background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: 5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={showOnlyChangedCode} onChange={(e) => this.setState({ showOnlyChangedCode: e.target.checked })}/>
                Show only findings from changed code in this commit
              </label>
            </div>
            <p>No findings from changed code. Uncheck the box above to see all findings.</p>
          </div>);
            }
            return <p>No fixes available for this pipeline run.</p>;
        }
        function slugifyFileName(filePath) {
            var _a;
            return ((_a = filePath.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase().slice(0, 20)) || 'file';
        }
        const createFixBranch = async (fixesToApply) => {
            var _a, _b, _c, _d;
            const webContext = SDK.getWebContext();
            const projectId = (_a = webContext.project) === null || _a === void 0 ? void 0 : _a.id;
            if (!projectId) {
                alert('Could not determine project.');
                return;
            }
            const gitClient = (0, azure_devops_extension_api_1.getClient)(Git_1.GitRestClient);
            const repositories = await gitClient.getRepositories(projectId);
            let repoMatch = repositories.find(r => fixesToApply[0].filePath.includes(r.name));
            if (!repoMatch && repositories.length === 1) {
                repoMatch = repositories[0];
            }
            if (!repoMatch && ((_b = this.state.fixes.metadata) === null || _b === void 0 ? void 0 : _b.repositoryName)) {
                repoMatch = repositories.find(r => r.name === this.state.fixes.metadata.repositoryName);
            }
            const repoId = repoMatch ? repoMatch.id : repositories[0].id;
            console.log('File path for fix:', fixesToApply[0].filePath);
            console.log('Available repos:', repositories.map(r => r.name));
            console.log('Selected repo:', repoMatch === null || repoMatch === void 0 ? void 0 : repoMatch.name);
            let sourceBranch = null;
            if (this.state.fixes.metadata && this.state.fixes.metadata.sourceBranch) {
                sourceBranch = this.state.fixes.metadata.sourceBranch.replace('refs/heads/', '');
                console.log('Using metadata for branch info:', { sourceBranch });
            }
            else {
                const buildId = getCurrentBuildId();
                if (buildId) {
                    const buildClient = (0, azure_devops_extension_api_1.getClient)(Build_1.BuildRestClient);
                    const build = await buildClient.getBuild(projectId, Number(buildId));
                    if (build && build.sourceBranch) {
                        sourceBranch = build.sourceBranch.replace('refs/heads/', '');
                        console.log('Using build source branch:', sourceBranch);
                    }
                }
            }
            if (!sourceBranch) {
                alert('Could not determine source branch.');
                return;
            }
            try {
                const refs = await gitClient.getRefs(repoId, projectId);
                const sourceRef = refs.find(ref => ref.name === `refs/heads/${sourceBranch}`);
                if (!sourceRef)
                    throw new Error(`Source branch ${sourceBranch} not found`);
                const latestCommitId = sourceRef.objectId;
                const isSingleFix = fixesToApply.length === 1;
                let filePatchMap = {};
                let numFilesUpdated = 0;
                const changes = [];
                let newBranchName = '';
                let newBranchRef = '';
                const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);
                if (isSingleFix) {
                    const { filePath, patch, flaw } = fixesToApply[0];
                    const fileSlug = slugifyFileName(filePath);
                    const issueId = (flaw === null || flaw === void 0 ? void 0 : flaw.issueId) || 'fix';
                    const shortSha = latestCommitId.slice(0, 8);
                    newBranchName = `veracode-fix-${shortSha}-${fileSlug}-${issueId}-${timestamp}`;
                    newBranchRef = `refs/heads/${newBranchName}`;
                    await gitClient.updateRefs([
                        {
                            name: newBranchRef,
                            oldObjectId: '0000000000000000000000000000000000000000',
                            newObjectId: latestCommitId,
                            repositoryId: repoId,
                            isLocked: false
                        }
                    ], repoId, projectId);
                    const strippedPath = this.stripPrefix(filePath);
                    const item = await gitClient.getItem(repoId, strippedPath, undefined, undefined, undefined, undefined, undefined, undefined, { version: newBranchName, versionType: 0, versionOptions: 0 });
                    let content = await (await fetch(item.url)).text();
                    const patchedContent = (0, diff_1.applyPatch)(content, patch);
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
                    });
                    numFilesUpdated = 1;
                }
                else {
                    const shortSha = latestCommitId.slice(0, 8);
                    newBranchName = `veracode-fix-batch-${shortSha}-${timestamp}`;
                    newBranchRef = `refs/heads/${newBranchName}`;
                    await gitClient.updateRefs([
                        {
                            name: newBranchRef,
                            oldObjectId: '0000000000000000000000000000000000000000',
                            newObjectId: latestCommitId,
                            repositoryId: repoId,
                            isLocked: false
                        }
                    ], repoId, projectId);
                    for (const { filePath } of fixesToApply) {
                        if (!filePatchMap[filePath]) {
                            const fileFixes = this.state.fixes.results[filePath];
                            if (fileFixes && fileFixes.patch && fileFixes.patch.length > 0) {
                                filePatchMap[filePath] = fileFixes.patch[0];
                            }
                        }
                    }
                    for (const filePath of Object.keys(filePatchMap)) {
                        const strippedPath = this.stripPrefix(filePath);
                        const item = await gitClient.getItem(repoId, strippedPath, undefined, undefined, undefined, undefined, undefined, undefined, { version: newBranchName, versionType: 0, versionOptions: 0 });
                        let content = await (await fetch(item.url)).text();
                        const patchedContent = (0, diff_1.applyPatch)(content, filePatchMap[filePath]);
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
                        });
                    }
                    numFilesUpdated = Object.keys(filePatchMap).length;
                }
                await gitClient.createPush({
                    refUpdates: [
                        {
                            name: newBranchRef,
                            oldObjectId: latestCommitId,
                            repositoryId: repoId,
                            isLocked: false,
                            newObjectId: undefined
                        }
                    ],
                    commits: [
                        {
                            comment: `Apply Veracode Fix for pipeline run`,
                            changes: changes
                        }
                    ]
                }, repoId, projectId);
                const pr = await gitClient.createPullRequest({
                    sourceRefName: newBranchRef,
                    targetRefName: `refs/heads/${sourceBranch}`,
                    title: 'Veracode Fix',
                    description: `This PR applies ${fixesToApply.length} Veracode security fix${fixesToApply.length > 1 ? 'es' : ''} to address identified vulnerabilities.\n\nFixes applied:\n${fixesToApply.map(f => `- ${this.stripPrefix(f.filePath)}: CWE-${f.flaw.CWEId} (Line ${f.flaw.line})`).join('\n')}`,
                    isDraft: false
                }, repoId, projectId);
                const collectionUri = ((_c = webContext.collection) === null || _c === void 0 ? void 0 : _c.uri) || ((_d = webContext.account) === null || _d === void 0 ? void 0 : _d.hostUri) || '';
                const repoName = (repoMatch === null || repoMatch === void 0 ? void 0 : repoMatch.name) || repositories[0].name;
                const prUrl = `${collectionUri}${webContext.project.name}/_git/${repoName}/pullrequest/${pr.pullRequestId}`;
                alert(`Successfully created branch ${newBranchName} and pull request with ${numFilesUpdated} file(s) updated!\n\n` +
                    `View your PR here:\n${prUrl}`);
                console.log('PR URL:', prUrl);
            }
            catch (error) {
                console.error('Error creating fix branch:', error);
                alert(`Error creating fix branch: ${error.message}`);
            }
        };
        const handleApplySingleFix = async (filePath, flaw) => {
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
        const handleApplyAllFixes = async () => {
            const allFixes = [];
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
        return (<div style={{ fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '14px' }}>
        <h2>Veracode Fix Suggestions</h2>
        
        
        <div style={{ marginBottom: 20, padding: '12px', background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: 5 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showOnlyChangedCode} onChange={(e) => this.setState({ showOnlyChangedCode: e.target.checked })}/>
            Show only findings from changed code in this commit
          </label>
          <p style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
            {showOnlyChangedCode
                ? `Showing ${fileEntries.length} file(s) with findings from changed code only.`
                : `Showing all findings from ${Object.keys(fixes.results).length} file(s).`}
          </p>
          {this.state.fixes.changedFiles && this.state.fixes.changedFiles.length > 0 ? (<p style={{ marginTop: 4, fontSize: '11px', color: '#888' }}>
              Detected {this.state.fixes.changedFiles.length} changed file(s) from build comparison
            </p>) : (<p style={{ marginTop: 4, fontSize: '11px', color: '#888' }}>
              No changed files detected - showing all findings
            </p>)}
        </div>
        
        
        {fileEntries.length > 0 && (<div style={{ marginBottom: 20, padding: '12px', background: '#f0f0f0', borderRadius: 5 }}>
            <button style={{
                    padding: '8px 20px',
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px'
                }} onClick={handleApplyAllFixes}>
              Apply All Fixes ({fileEntries.reduce((total, [_, fileFixes]) => total + (fileFixes.flaws ? fileFixes.flaws.length : 0), 0)} fixes)
            </button>
            <p style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              This will create a new branch from the source branch and apply all available fixes.
            </p>
          </div>)}
        
        {fileEntries.map(([filePath, fileFixes]) => (<div key={filePath} style={{ marginBottom: 32 }}>
            <h3>{this.stripPrefix(filePath)}</h3>
            {fileFixes.flaws.map((flaw, idx) => (<div key={idx} style={{ marginBottom: 16 }}>
                <h4>CWE-{flaw.CWEId} (Line {flaw.line})</h4>
                {flaw.patches.length > 0 && (<div style={{ marginBottom: 8 }}>
                    <react_diff_viewer_1.default oldValue={this.parsePatch(flaw.patches[0])[0]} newValue={this.parsePatch(flaw.patches[0])[1]} splitView={true} leftTitle="Original Code" rightTitle="Fixed Code"/>
                    <button style={{ marginTop: 12, padding: '6px 16px', background: '#0078d4', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }} onClick={() => handleApplySingleFix(filePath, flaw)}>
                      Apply this fix
                    </button>
                  </div>)}
              </div>))}
          </div>))}
      </div>);
    }
    parsePatch(patch) {
        const lines = patch.split('\n');
        let oldCode = '';
        let newCode = '';
        let inHunk = false;
        for (const line of lines) {
            if (line.startsWith('@@')) {
                inHunk = true;
                continue;
            }
            if (!inHunk || line.startsWith('---') || line.startsWith('+++')) {
                continue;
            }
            if (line.startsWith('-')) {
                oldCode += line.substring(1) + '\n';
            }
            else if (line.startsWith('+')) {
                newCode += line.substring(1) + '\n';
            }
            else if (line.startsWith(' ')) {
                oldCode += line.substring(1) + '\n';
                newCode += line.substring(1) + '\n';
            }
        }
        return [oldCode.trimEnd(), newCode.trimEnd()];
    }
}
SDK.init();
SDK.ready().then(() => {
    ReactDOM.render(<VeracodeFixPipelineTab />, document.getElementById('root'));
});
