import fs from 'fs';
import path from 'path';
import { createFlawInfo } from './createFlawInfo';
import { checkCWE } from './check_cwe_support';
import { uploadBatch, checkFixBatch, pullBatchFixResults, getFilesPartOfPR } from './requests';
//import { createPRCommentBatch } from './create_pr_comment'
import { execSync } from 'child_process';
import { rewritePath } from './rewritePath';
//import { createPR } from './create_pr'

interface FlawInfo {
    resultsFile: string;
    issuedID: string;
    cweID: number;
    language: string;
    sourceFile: string;
}

interface Options {
    file: string;
    isPR: string;
    DEBUG?: boolean;
    files: string;
    cwe: string;
    language: string;
    source_base_path_1?: string;
    source_base_path_2?: string;
    source_base_path_3?: string;
}

interface Credentials {
    apiId: string;
    apiKey: string;
}

export async function runBatch(options: Options, credentials: Credentials): Promise<void> {
    // Create unique folder name with timestamp to avoid conflicts
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const workFolder = `veracode-fix-${timestamp}`;
    
    // Clean up any existing work folder
    if (fs.existsSync(workFolder)) {
        console.log(`Removing existing work folder: ${workFolder}`);
        fs.rmSync(workFolder, { recursive: true, force: true });
    }
    
    // Create fresh work folder
    fs.mkdirSync(workFolder, { recursive: true });
    console.log(`Created work folder: ${workFolder}`);
    
    //read json file
    const jsonRead = fs.readFileSync(options.file, 'utf8');
    const jsonData = JSON.parse(jsonRead);
    const jsonFindings = jsonData.findings;
    const flawCount = jsonFindings.length;
    console.log(`Number of flaws: ${flawCount}`);

    let filesPartOfPR: Array<{ filename: string }> = [];
    if (options.isPR === 'true') {
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('run_batch.ts - runBatch()');
            console.log('Fetching files part of the PR');
            console.log('#######- DEBUG MODE -#######');
        }
        filesPartOfPR = await getFilesPartOfPR(options);
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('run_batch.ts - runBatch()');
            console.log('Files part of PR:');
            console.log(filesPartOfPR);
            console.log('#######- DEBUG MODE -#######');
        }
    }

    //loop through json file and create a new array
    const flawArray: Record<string, any[]> = {};
    for (let i = 0; i < flawCount; i++) {
        //create a new array per source file
        const sourceFile = jsonFindings[i].files.source_file.file;

        if (!flawArray[sourceFile]) {
            flawArray[sourceFile] = [];
        }
        flawArray[sourceFile].push(jsonFindings[i]);
    }

    //loop through the new array per source file and find fixable flaws, supported CWE's and CWE's to be fixed
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
            const initialFlawInfo: FlawInfo = {
                resultsFile: options.file,
                issuedID: flawArray[sourceFile][j].issue_id,
                cweID: parseInt(flawArray[sourceFile][j].cwe_id),
                language: options.language,
                sourceFile: sourceFile,
            };

            let include = 0;
            if (options.files === 'changed') {
                console.log('Checking if file is part of PR');
                //sourceFile needs rewrite before checking if its part of the PR

                const filepath = await rewritePath(options, sourceFile);

                if (options.isPR !== '') {
                    for (const file of filesPartOfPR) {
                        if (file.filename === filepath) {
                            include = 1;
                            break;
                        }
                    }
                } else {
                    console.log('Not a PR, all files should be fixed');
                    include = 1;
                }
            }

            if (include === 0 && options.files === 'changed') {
                console.log('File is not part of PR, and only changed files should be fixed. -> Parameter "files" is set to "changed"');
            } else {
                console.log('File is part of PR, either all files should be fixed or this file is part of changed files to be fixed');

                if (options.cwe !== '') {
                    console.log(`Fix only for CWE: ${options.cwe}`);

                    //get CWE list input
                    const cweList = options.cwe.includes(',') ? options.cwe.split(',') : [options.cwe];

                    if (cweList.includes(flawArray[sourceFile][j].cwe_id)) {
                        console.log(`CWE ${flawArray[sourceFile][j].cwe_id} is in the list of CWEs to fix, creating flaw info`);

                        if (options.DEBUG) {
                            console.log('#######- DEBUG MODE -#######');
                            console.log('run_batch.ts - runBatch() - before checkCWE');
                            console.log('Flaw Info:', initialFlawInfo);
                            console.log('#######- DEBUG MODE -#######');
                        }

                        if (await checkCWE(initialFlawInfo, options) === true) {
                            const flawInfo = await createFlawInfo(initialFlawInfo, options);

                            if (options.DEBUG) {
                                console.log('#######- DEBUG MODE -#######');
                                console.log('run_batch.ts - runBatch() - after checkCWE and after createFlawInfo');
                                console.log('Flaw Info:', flawInfo);
                                console.log('#######- DEBUG MODE -#######');
                            }

                            //write flaw info and source file
                            const flawFoldername = `cwe-${flawInfo.CWEId}-line-${flawInfo.line}-issue-${flawInfo.issueId}`;
                            const flawFilename = `flaw_${flawInfo.issueId}.json`;
                            console.log(`Writing flaw to: ${workFolder}/flaws/${flawFoldername}/${flawFilename}`);
                            fs.mkdirSync(`${workFolder}/flaws/${flawFoldername}`, { recursive: true });
                            fs.writeFileSync(`${workFolder}/flaws/${flawFoldername}/${flawFilename}`, JSON.stringify(flawInfo, null, 2));

                            if (fs.existsSync(`${workFolder}/${flawInfo.sourceFile}`)) {
                                console.log('File exists nothing to do');
                            } else {
                                console.log('File does not exist, copying file');
                                const str = flawInfo.sourceFile;
                                const lastSlashIndex = str.lastIndexOf('/');
                                const strBeforeLastSlash = str.substring(0, lastSlashIndex);
                                if (!fs.existsSync(`${workFolder}/${strBeforeLastSlash}`)) {
                                    console.log('Destination directory does not exist let\'s create it');
                                    fs.mkdirSync(`${workFolder}/${strBeforeLastSlash}`, { recursive: true });
                                }

                                fs.copyFileSync(flawInfo.sourceFile, `${workFolder}/${flawInfo.sourceFile}`);
                            }
                        } else {
                            console.log(`CWE ${flawArray[sourceFile][j].cwe_id} is not supported for ${options.language}`);
                        }
                    } else {
                        console.log(`CWE ${flawArray[sourceFile][j].cwe_id} is not in the list of CWEs to fix`);
                    }
                } else {
                    console.log('Fix for all CWEs');

                    if (await checkCWE(initialFlawInfo, options) === true) {
                        const flawInfo = await createFlawInfo(initialFlawInfo, options);

                        //write flaw info and source file
                        const flawFoldername = `cwe-${flawInfo.CWEId}-line-${flawInfo.line}-issue-${flawInfo.issueId}`;
                        const flawFilename = `flaw_${flawInfo.issueId}.json`;
                        console.log(`Writing flaw to: ${workFolder}/flaws/${flawFoldername}/${flawFilename}`);
                        fs.mkdirSync(`${workFolder}/flaws/${flawFoldername}`, { recursive: true });
                        fs.writeFileSync(`${workFolder}/flaws/${flawFoldername}/${flawFilename}`, JSON.stringify(flawInfo, null, 2));

                        if (fs.existsSync(`${workFolder}/${flawInfo.sourceFile}`)) {
                            console.log('File exists nothing to do');
                        } else {
                            console.log('File does not exist, copying file');
                            const str = flawInfo.sourceFile;
                            const lastSlashIndex = str.lastIndexOf('/');
                            const strBeforeLastSlash = str.substring(0, lastSlashIndex);
                            if (!fs.existsSync(`${workFolder}/${strBeforeLastSlash}`)) {
                                console.log('Destination directory does not exist let\'s create it');
                                fs.mkdirSync(`${workFolder}/${strBeforeLastSlash}`, { recursive: true });
                            }

                            fs.copyFileSync(flawInfo.sourceFile, `${workFolder}/${flawInfo.sourceFile}`);
                        }
                    } else {
                        console.log(`CWE ${flawArray[sourceFile][j].cwe_id} is not supported for ${options.language}`);
                    }
                }
            }
        }
    }

    //create the tar after all files are created and copied
    // the tar for the batch run has to be created with the local tar. The node module is not working
    execSync(`tar -czf app.tar.gz -C ${workFolder} .`);
    console.log('Tar is created');
    
    // Clean up the work folder after creating the tar
    console.log(`Cleaning up work folder: ${workFolder}`);
    fs.rmSync(workFolder, { recursive: true, force: true });

    const projectID = await uploadBatch(credentials, options);
    console.log('Project ID is: ' + projectID);

    const checkBatchFixStatus = await checkFixBatch(credentials, projectID, options);


    if (checkBatchFixStatus == 1) {
        console.log('Batch Fixs are ready to be reviewed');
        const batchFixResults = await pullBatchFixResults(credentials, projectID, options);

        if (batchFixResults == 0) {
            console.log('Something went wrong, no fixes generated');
        } else {
            console.log('Fixs pulled from batch fix');

            if (options.DEBUG) {
                console.log('#######- DEBUG MODE -#######');
                console.log('run_batch.ts - runBatch()');
                console.log('Batch Fix Results:');
                console.log(batchFixResults);
                console.log('#######- DEBUG MODE -#######');
            }

            //working with results
            const fixes = batchFixResults;
            const outputPath = path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || '$(Build.ArtifactStagingDirectory)', 'veracode-fixes.json');
            fs.writeFileSync(outputPath, JSON.stringify(fixes, null, 2));

            /*

            if ( options.createPR == 'true' ){
                console.log('Creating PRs is enabled')
                const createPr = await createPR(batchFixResults, options, flawArray)
            }
            */
        }
    } else {
        console.log('Batch Fix failed');
    }

    console.log('Creating metadata artifact');
    // Create metadata artifact with PR information (always create this)
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
    
    // Debug logging for metadata creation
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
    
    const metadataPath = path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || '$(Build.ArtifactStagingDirectory)', 'veracode-fix-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log('Metadata artifact created:', metadataPath);
    
    // Also create a copy in the current directory for debugging
    const localMetadataPath = path.join(process.cwd(), 'veracode-fix-metadata.json');
    fs.writeFileSync(localMetadataPath, JSON.stringify(metadata, null, 2));
    console.log('Local metadata copy created:', localMetadataPath);
}