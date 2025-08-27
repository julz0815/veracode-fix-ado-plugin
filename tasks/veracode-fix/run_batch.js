"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBatch = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const createFlawInfo_1 = require("./createFlawInfo");
const check_cwe_support_1 = require("./check_cwe_support");
const requests_1 = require("./requests");
const child_process_1 = require("child_process");
const rewritePath_1 = require("./rewritePath");
async function runBatch(options, credentials) {
    const jsonRead = fs_1.default.readFileSync(options.file, 'utf8');
    const jsonData = JSON.parse(jsonRead);
    const jsonFindings = jsonData.findings;
    const flawCount = jsonFindings.length;
    console.log(`Number of flaws: ${flawCount}`);
    let filesPartOfPR = [];
    if (options.isPR === 'true') {
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('run_batch.ts - runBatch()');
            console.log('Fetching files part of the PR');
            console.log('#######- DEBUG MODE -#######');
        }
        filesPartOfPR = await (0, requests_1.getFilesPartOfPR)(options);
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('run_batch.ts - runBatch()');
            console.log('Files part of PR:');
            console.log(filesPartOfPR);
            console.log('#######- DEBUG MODE -#######');
        }
    }
    const flawArray = {};
    for (let i = 0; i < flawCount; i++) {
        const sourceFile = jsonFindings[i].files.source_file.file;
        if (!flawArray[sourceFile]) {
            flawArray[sourceFile] = [];
        }
        flawArray[sourceFile].push(jsonFindings[i]);
    }
    const sourceFiles = Object.keys(flawArray);
    const sourceFilesCount = sourceFiles.length;
    console.log(`Number of source files with flaws: ${sourceFilesCount}`);
    for (let i = 0; i < sourceFilesCount; i++) {
        console.log('#############################\n\n');
        const sourceFile = sourceFiles[i];
        console.log('Source file with flaws:', sourceFile);
        const flawCount = flawArray[sourceFile].length;
        console.log(`Number of flaws for ${sourceFile}: ${flawCount}`);
        for (let j = 0; j < flawCount; j++) {
            const initialFlawInfo = {
                resultsFile: options.file,
                issuedID: flawArray[sourceFile][j].issue_id,
                cweID: parseInt(flawArray[sourceFile][j].cwe_id),
                language: options.language,
                sourceFile: sourceFile,
            };
            let include = 0;
            if (options.files === 'changed') {
                console.log('Checking if file is part of PR');
                const filepath = await (0, rewritePath_1.rewritePath)(options, sourceFile);
                if (options.isPR !== '') {
                    for (const file of filesPartOfPR) {
                        if (file.filename === filepath) {
                            include = 1;
                            break;
                        }
                    }
                }
                else {
                    console.log('Not a PR, all files should be fixed');
                    include = 1;
                }
            }
            if (include === 0 && options.files === 'changed') {
                console.log('File is not part of PR, and only changed files should be fixed. -> Parameter "files" is set to "changed"');
            }
            else {
                console.log('File is part of PR, either all files should be fixed or this file is part of changed files to be fixed');
                if (options.cwe !== '') {
                    console.log(`Fix only for CWE: ${options.cwe}`);
                    const cweList = options.cwe.includes(',') ? options.cwe.split(',') : [options.cwe];
                    if (cweList.includes(flawArray[sourceFile][j].cwe_id)) {
                        console.log(`CWE ${flawArray[sourceFile][j].cwe_id} is in the list of CWEs to fix, creating flaw info`);
                        if (options.DEBUG) {
                            console.log('#######- DEBUG MODE -#######');
                            console.log('run_batch.ts - runBatch() - before checkCWE');
                            console.log('Flaw Info:', initialFlawInfo);
                            console.log('#######- DEBUG MODE -#######');
                        }
                        if (await (0, check_cwe_support_1.checkCWE)(initialFlawInfo, options) === true) {
                            const flawInfo = await (0, createFlawInfo_1.createFlawInfo)(initialFlawInfo, options);
                            if (options.DEBUG) {
                                console.log('#######- DEBUG MODE -#######');
                                console.log('run_batch.ts - runBatch() - after checkCWE and after createFlawInfo');
                                console.log('Flaw Info:', flawInfo);
                                console.log('#######- DEBUG MODE -#######');
                            }
                            const flawFoldername = `cwe-${flawInfo.CWEId}-line-${flawInfo.line}-issue-${flawInfo.issueId}`;
                            const flawFilename = `flaw_${flawInfo.issueId}.json`;
                            console.log(`Writing flaw to: app/flaws/${flawFoldername}/${flawFilename}`);
                            fs_1.default.mkdirSync(`app/flaws/${flawFoldername}`, { recursive: true });
                            fs_1.default.writeFileSync(`app/flaws/${flawFoldername}/${flawFilename}`, JSON.stringify(flawInfo, null, 2));
                            if (fs_1.default.existsSync(`app/${flawInfo.sourceFile}`)) {
                                console.log('File exists nothing to do');
                            }
                            else {
                                console.log('File does not exist, copying file');
                                const str = flawInfo.sourceFile;
                                const lastSlashIndex = str.lastIndexOf('/');
                                const strBeforeLastSlash = str.substring(0, lastSlashIndex);
                                if (!fs_1.default.existsSync(`app/${strBeforeLastSlash}`)) {
                                    console.log('Destination directory does not exist let\'s create it');
                                    fs_1.default.mkdirSync(`app/${strBeforeLastSlash}`, { recursive: true });
                                }
                                fs_1.default.copyFileSync(flawInfo.sourceFile, `app/${flawInfo.sourceFile}`);
                            }
                        }
                        else {
                            console.log(`CWE ${flawArray[sourceFile][j].cwe_id} is not supported for ${options.language}`);
                        }
                    }
                    else {
                        console.log(`CWE ${flawArray[sourceFile][j].cwe_id} is not in the list of CWEs to fix`);
                    }
                }
                else {
                    console.log('Fix for all CWEs');
                    if (await (0, check_cwe_support_1.checkCWE)(initialFlawInfo, options) === true) {
                        const flawInfo = await (0, createFlawInfo_1.createFlawInfo)(initialFlawInfo, options);
                        const flawFoldername = `cwe-${flawInfo.CWEId}-line-${flawInfo.line}-issue-${flawInfo.issueId}`;
                        const flawFilename = `flaw_${flawInfo.issueId}.json`;
                        console.log(`Writing flaw to: app/flaws/${flawFoldername}/${flawFilename}`);
                        fs_1.default.mkdirSync(`app/flaws/${flawFoldername}`, { recursive: true });
                        fs_1.default.writeFileSync(`app/flaws/${flawFoldername}/${flawFilename}`, JSON.stringify(flawInfo, null, 2));
                        if (fs_1.default.existsSync(`app/${flawInfo.sourceFile}`)) {
                            console.log('File exists nothing to do');
                        }
                        else {
                            console.log('File does not exist, copying file');
                            const str = flawInfo.sourceFile;
                            const lastSlashIndex = str.lastIndexOf('/');
                            const strBeforeLastSlash = str.substring(0, lastSlashIndex);
                            if (!fs_1.default.existsSync(`app/${strBeforeLastSlash}`)) {
                                console.log('Destination directory does not exist let\'s create it');
                                fs_1.default.mkdirSync(`app/${strBeforeLastSlash}`, { recursive: true });
                            }
                            fs_1.default.copyFileSync(flawInfo.sourceFile, `app/${flawInfo.sourceFile}`);
                        }
                    }
                    else {
                        console.log(`CWE ${flawArray[sourceFile][j].cwe_id} is not supported for ${options.language}`);
                    }
                }
            }
        }
    }
    (0, child_process_1.execSync)('tar -czf app.tar.gz -C app .');
    console.log('Tar is created');
    const projectID = await (0, requests_1.uploadBatch)(credentials, options);
    console.log('Project ID is: ' + projectID);
    const checkBatchFixStatus = await (0, requests_1.checkFixBatch)(credentials, projectID, options);
    if (checkBatchFixStatus == 1) {
        console.log('Batch Fixs are ready to be reviewed');
        const batchFixResults = await (0, requests_1.pullBatchFixResults)(credentials, projectID, options);
        if (batchFixResults == 0) {
            console.log('Something went wrong, no fixes generated');
        }
        else {
            console.log('Fixs pulled from batch fix');
            if (options.DEBUG) {
                console.log('#######- DEBUG MODE -#######');
                console.log('run_batch.ts - runBatch()');
                console.log('Batch Fix Results:');
                console.log(batchFixResults);
                console.log('#######- DEBUG MODE -#######');
            }
            const fixes = batchFixResults;
            const outputPath = path_1.default.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || '$(Build.ArtifactStagingDirectory)', 'veracode-fixes.json');
            fs_1.default.writeFileSync(outputPath, JSON.stringify(fixes, null, 2));
        }
    }
    else {
        console.log('Batch Fix failed');
    }
    console.log('Creating metadata artifact');
    const metadata = {
        prId: process.env['SYSTEM_PULLREQUEST_PULLREQUESTID'] || null,
        sourceBranch: process.env['SYSTEM_PULLREQUEST_SOURCEBRANCH'] || null,
        targetBranch: process.env['SYSTEM_PULLREQUEST_TARGETBRANCH'] || null,
        commitId: process.env['BUILD_SOURCEVERSION'] || null,
        buildId: process.env['BUILD_BUILDID'] || null,
        repositoryName: process.env['BUILD_REPOSITORY_NAME'] || null,
        projectName: process.env['SYSTEM_TEAMPROJECT'] || null,
        collectionUri: process.env['SYSTEM_COLLECTIONURI'] || null,
        buildDefinitionId: process.env['SYSTEM_DEFINITIONID'] || null,
        buildDefinitionName: process.env['BUILD_DEFINITIONNAME'] || null,
        timestamp: new Date().toISOString()
    };
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('run_batch.ts - runBatch() - Metadata creation');
        console.log('Environment variables:');
        console.log('SYSTEM_PULLREQUEST_PULLREQUESTID:', process.env['SYSTEM_PULLREQUEST_PULLREQUESTID']);
        console.log('SYSTEM_PULLREQUEST_SOURCEBRANCH:', process.env['SYSTEM_PULLREQUEST_SOURCEBRANCH']);
        console.log('SYSTEM_PULLREQUEST_TARGETBRANCH:', process.env['SYSTEM_PULLREQUEST_TARGETBRANCH']);
        console.log('BUILD_SOURCEVERSION:', process.env['BUILD_SOURCEVERSION']);
        console.log('BUILD_BUILDID:', process.env['BUILD_BUILDID']);
        console.log('BUILD_REPOSITORY_NAME:', process.env['BUILD_REPOSITORY_NAME']);
        console.log('SYSTEM_TEAMPROJECT:', process.env['SYSTEM_TEAMPROJECT']);
        console.log('SYSTEM_COLLECTIONURI:', process.env['SYSTEM_COLLECTIONURI']);
        console.log('SYSTEM_DEFINITIONID:', process.env['SYSTEM_DEFINITIONID']);
        console.log('BUILD_DEFINITIONNAME:', process.env['BUILD_DEFINITIONNAME']);
        console.log('BUILD_ARTIFACTSTAGINGDIRECTORY:', process.env['BUILD_ARTIFACTSTAGINGDIRECTORY']);
        console.log('Metadata object:', metadata);
        console.log('#######- DEBUG MODE -#######');
    }
    const metadataPath = path_1.default.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || '$(Build.ArtifactStagingDirectory)', 'veracode-fix-metadata.json');
    fs_1.default.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log('Metadata artifact created:', metadataPath);
    const localMetadataPath = path_1.default.join(process.cwd(), 'veracode-fix-metadata.json');
    fs_1.default.writeFileSync(localMetadataPath, JSON.stringify(metadata, null, 2));
    console.log('Local metadata copy created:', localMetadataPath);
}
exports.runBatch = runBatch;
