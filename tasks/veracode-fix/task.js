const tl = require('azure-pipelines-task-lib/task');
const path = require('path');
const fs = require('fs');
const { runBatch } =  require('./run_batch');

let credentials = {}
let options= {}

async function run() {
    try {
        // Get task inputs
        credentials['vid'] = tl.getInput('veracodeApiId', true);
        credentials['vkey'] = tl.getInput('veracodeApiKey', true)

        options['file'] = tl.getInput('inputFile', true);
        options['fixType'] = 'batch'; // Fixed value - always run batch mode
        options['source_base_path_1'] = 
        options['source_base_path_2'] = 
        options['source_base_path_3'] = 
        options['DEBUG'] = tl.getBoolInput('DEBUG', false);
        options['language'] = tl.getInput('language', true);
        options['prComment'] = tl.getBoolInput('prComment', false);
        // options['createPR'] removed - not used in current code
        options['cwe'] = tl.getInput('CWEs', false);
        options['files'] = 'all'; // Fixed value - always process all files

        // Get task inputs


        // Detect if this is a PR run
        options['isPR'] = !!tl.getVariable('System.PullRequest.PullRequestId');
        if (options.DEBUG) {
            console.log(`[DEBUG] isPR: ${options.isPR}`);
        }

        if ( options.fixType == 'batch' ){
            console.log('Running Batch Fix')
            await runBatch(options, credentials)
        }
        else if ( options.fixType == 'single' ){
            console.log('Running Single Fix - Not implemented yet')
            tl.setResult(tl.TaskResult.Failed, 'Single fix type is not implemented yet');
            return;
        }
        else {
            console.log('no Fix Type selected')
        }

        tl.setResult(tl.TaskResult.Succeeded, 'Veracode Fix completed successfully');
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

run(); 