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
const react_diff_viewer_1 = __importDefault(require("react-diff-viewer"));
const azure_devops_extension_api_1 = require("azure-devops-extension-api");
const Build_1 = require("azure-devops-extension-api/Build");
const azure_devops_extension_sdk_1 = require("azure-devops-extension-sdk");
const Git_1 = require("azure-devops-extension-api/Git");
const fetchFixesForPR = async () => {
    try {
        const webContext = await (0, azure_devops_extension_sdk_1.getService)("ms.vss-tfs-web.tfs-page-data-service");
        const project = await webContext.getProject();
        if (!(project === null || project === void 0 ? void 0 : project.id)) {
            throw new Error("Could not get project ID");
        }
        const projectId = project.id;
        const gitClient = (0, azure_devops_extension_api_1.getClient)(Git_1.GitRestClient);
        const urlParams = new URLSearchParams(window.location.search);
        const repositoryId = urlParams.get('repositoryId');
        const pullRequestId = urlParams.get('pullRequestId');
        if (!repositoryId || !pullRequestId) {
            throw new Error("Could not get PR information from URL");
        }
        const currentPR = await gitClient.getPullRequestById(parseInt(pullRequestId), projectId);
        if (!currentPR) {
            throw new Error("Could not get PR details");
        }
        const buildClient = (0, azure_devops_extension_api_1.getClient)(Build_1.BuildRestClient);
        const builds = await buildClient.getBuilds(projectId, [parseInt(currentPR.repository.id)]);
        if (builds.length === 0) {
            console.log("No builds found for this PR");
            return [];
        }
        const buildId = builds[0].id;
        const artifact = await buildClient.getArtifact(projectId, buildId, "veracode-fixes");
        const downloadUrl = artifact.resource.downloadUrl;
        const response = await fetch(downloadUrl);
        const fixes = await response.json();
        return fixes;
    }
    catch (error) {
        console.error("Error fetching fixes:", error);
        return [];
    }
};
const VeracodeFixPRTab = () => {
    const [fixes, setFixes] = React.useState([]);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        fetchFixesForPR()
            .then(setFixes)
            .catch(err => {
            console.error("Failed to fetch fixes:", err);
            setError("Failed to load Veracode fixes. Please try again later.");
        });
    }, []);
    if (error) {
        return <div className="error-message">{error}</div>;
    }
    return (<div>
      <h2>Veracode Fix Suggestions</h2>
      {fixes.length === 0 ? (<p>No fixes available for this pull request.</p>) : (fixes.map((fix, idx) => (<div key={idx} style={{ marginBottom: 32 }}>
            <h3>{fix.file} (CWE: {fix.cwe})</h3>
            <react_diff_viewer_1.default oldValue={fix.oldCode} newValue={fix.newCode} splitView={true}/>
          </div>)))}
    </div>);
};
ReactDOM.render(<VeracodeFixPRTab />, document.getElementById('root'));
