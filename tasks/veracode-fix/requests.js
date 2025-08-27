"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFilesPartOfPR = exports.pullBatchFixResults = exports.checkFixBatch = exports.checkFix = exports.uploadBatch = exports.upload = void 0;
const axios_1 = __importDefault(require("axios"));
const auth_1 = require("./auth");
const fs_1 = __importDefault(require("fs"));
const form_data_1 = __importDefault(require("form-data"));
const select_platform_1 = require("./select_platform");
axios_1.default.defaults.headers.common['X-CLIENT-TYPE'] = 'fix-ado-plugin';
async function upload(platform, options) {
    const fileBuffer = fs_1.default.readFileSync('data.tar.gz');
    const formData = new form_data_1.default();
    formData.append('data', fileBuffer, 'data.tar.gz');
    formData.append('name', 'data');
    const authHeader = await (0, auth_1.calculateAuthorizationHeader)({
        id: platform.cleanedID,
        key: platform.cleanedKEY,
        host: platform.apiUrl,
        url: '/fix/v1/project/upload_code',
        method: 'POST',
    });
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('requests.ts - upload');
        console.log('Formdata created');
        console.log(formData);
        console.log('ViD: ' + platform.cleanedID + ' Key: ' + platform.cleanedKEY + ' Host: ' + platform.apiUrl + ' URL: fix/v1/project/upload_code' + ' Method: POST');
        console.log('Auth header created');
        console.log(authHeader);
        console.log('#######- DEBUG MODE -#######');
    }
    console.log('Uploading data.tar.gz to Veracode');
    const response = await axios_1.default.post('https://' + platform.apiUrl + '/fix/v1/project/upload_code', formData, {
        headers: {
            'Authorization': authHeader,
            ...formData.getHeaders()
        }
    });
    if (response.status != 200) {
        console.log('Error uploading data');
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('requests.ts - upload');
            console.log(response.data);
            console.log('#######- DEBUG MODE -#######');
        }
    }
    else {
        console.log('Data uploaded successfully');
        console.log('Project ID is:');
        console.log(response.data);
        return response.data;
    }
}
exports.upload = upload;
async function uploadBatch(credentials, options) {
    const platform = await (0, select_platform_1.selectPlatfrom)(credentials);
    const fileBuffer = fs_1.default.readFileSync('app.tar.gz');
    const formData = new form_data_1.default();
    formData.append('data', fileBuffer, 'app.tar.gz');
    formData.append('name', 'data');
    const authHeader = await (0, auth_1.calculateAuthorizationHeader)({
        id: platform.cleanedID,
        key: platform.cleanedKEY,
        host: platform.apiUrl,
        url: '/fix/v1/project/batch_upload',
        method: 'POST',
    });
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('requests.ts - upload');
        console.log('Formdata created');
        console.log(formData);
        console.log('ViD: ' + platform.cleanedID + ' Key: ' + platform.cleanedKEY + ' Host: ' + platform.apiUrl + ' URL: fix/v1/project/batch_upload' + ' Method: POST');
        console.log('Auth header created');
        console.log(authHeader);
        console.log('#######- DEBUG MODE -#######');
    }
    console.log('Uploading app.tar.gz to Veracode');
    const response = await axios_1.default.post('https://' + platform.apiUrl + '/fix/v1/project/batch_upload', formData, {
        headers: {
            'Authorization': authHeader,
            ...formData.getHeaders()
        }
    });
    if (response.status != 200) {
        console.log('Error uploading data');
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('requests.ts - upload');
            console.log(response.data);
            console.log('#######- DEBUG MODE -#######');
        }
    }
    else {
        console.log('Data uploaded successfully');
        console.log('Project ID is:');
        console.log(response.data);
        return response.data;
    }
}
exports.uploadBatch = uploadBatch;
async function checkFix(platform, projectId, options) {
    const results = await makeRequest(platform, projectId, options);
    return results;
}
exports.checkFix = checkFix;
async function makeRequest(platform, projectId, options) {
    const authHeader = await (0, auth_1.calculateAuthorizationHeader)({
        id: platform.cleanedID,
        key: platform.cleanedKEY,
        host: platform.apiUrl,
        url: '/fix/v1/project/' + projectId + '/results',
        method: 'GET',
    });
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('requests.ts - cehckFix');
        console.log('ViD: ' + platform.cleanedID + ' Key: ' + platform.cleanedKEY + ' Host: ' + platform.apiUrl + ' URL: /fix/v1/project/' + projectId + '/results' + ' Method: POST');
        console.log('Auth header created');
        console.log(authHeader);
        console.log('#######- DEBUG MODE -#######');
    }
    const response = await axios_1.default.get('https://' + platform.apiUrl + '/fix/v1/project/' + projectId + '/results', {
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        }
    });
    if (!response.data) {
        console.log('Response is empty. Retrying in 10 seconds.');
        await new Promise(resolve => setTimeout(resolve, 10000));
        return await makeRequest(platform, projectId, options);
    }
    else {
        console.log('Fixes fetched successfully');
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('requests.ts - cehckFix');
            console.log('Response:');
            console.log(response.data);
            console.log('#######- DEBUG MODE -#######');
        }
        return response.data;
    }
}
async function checkFixBatch(platform, projectId, options) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const results = await makeRequestBatch(platform, projectId, options);
    return results;
}
exports.checkFixBatch = checkFixBatch;
async function makeRequestBatch(credentials, projectId, options) {
    const platform = await (0, select_platform_1.selectPlatfrom)(credentials);
    const authHeader = await (0, auth_1.calculateAuthorizationHeader)({
        id: platform.cleanedID,
        key: platform.cleanedKEY,
        host: platform.apiUrl,
        url: '/fix/v1/project/' + projectId + '/batch_status',
        method: 'GET',
    });
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('requests.ts - makeRequestBatch');
        console.log('ViD: ' + platform.cleanedID + ' Key: ' + platform.cleanedKEY + ' Host: ' + platform.apiUrl + ' URL: /fix/v1/project/' + projectId + '/results' + ' Method: POST');
        console.log('Auth header created');
        console.log(authHeader);
        console.log('#######- DEBUG MODE -#######');
    }
    const response = await axios_1.default.get('https://' + platform.apiUrl + '/fix/v1/project/' + projectId + '/batch_status', {
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        }
    });
    if (!response.data) {
        console.log('Response is empty. Something went wrong. No fixes generarted. ');
        return 0;
    }
    else {
        console.log('Status fetched successfully');
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('requests.ts - makeRequestBatch');
            console.log('Response:');
            console.log(response.data);
            console.log('#######- DEBUG MODE -#######');
        }
        if (response.data.hasMore == true) {
            console.log('More fixes are being generated. Retrying in 10 seconds.');
            if (options.DEBUG) {
                console.log('#######- DEBUG MODE -#######');
                console.log('requests.ts - makeRequestBatch');
                console.log('Response:');
                console.log(response.data);
                console.log('#######- DEBUG MODE -#######');
            }
            await new Promise(resolve => setTimeout(resolve, 10000));
            return await makeRequestBatch(credentials, projectId, options);
        }
        else {
            return 1;
        }
    }
}
async function pullBatchFixResults(credentials, projectId, options) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const platform = await (0, select_platform_1.selectPlatfrom)(credentials);
    const authHeader = await (0, auth_1.calculateAuthorizationHeader)({
        id: platform.cleanedID,
        key: platform.cleanedKEY,
        host: platform.apiUrl,
        url: '/fix/v1/project/' + projectId + '/batch_results',
        method: 'GET',
    });
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('requests.ts - pullBatchFixResults');
        console.log('ViD: ' + platform.cleanedID + ' Key: ' + platform.cleanedKEY + ' Host: ' + platform.apiUrl + ' URL: /fix/v1/project/' + projectId + '/results' + ' Method: POST');
        console.log('Auth header created');
        console.log(authHeader);
        console.log('#######- DEBUG MODE -#######');
    }
    const response = await axios_1.default.get('https://' + platform.apiUrl + '/fix/v1/project/' + projectId + '/batch_results', {
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        }
    });
    if (!response.data) {
        console.log('Response is empty. Something went wrong. No fixes generarted. ');
        return 0;
    }
    else {
        console.log('Fixes fetched successfully');
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('requests.ts - pullBatchFixResults');
            console.log('Response:');
            console.log(response.data);
            console.log('#######- DEBUG MODE -#######');
        }
        return response.data;
    }
}
exports.pullBatchFixResults = pullBatchFixResults;
async function getFilesPartOfPR(options) {
    const prId = process.env['SYSTEM_PULLREQUEST_PULLREQUESTID'];
    const repo = process.env['BUILD_REPOSITORY_NAME'];
    const project = process.env['SYSTEM_TEAMPROJECT'];
    const orgUrl = process.env['SYSTEM_COLLECTIONURI'];
    const accessToken = process.env['SYSTEM_ACCESSTOKEN'];
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('requests.ts - getFilesPartOfPR');
        console.log('SYSTEM_PULLREQUEST_PULLREQUESTID:', process.env['SYSTEM_PULLREQUEST_PULLREQUESTID']);
        console.log('BUILD_REPOSITORY_NAME:', process.env['BUILD_REPOSITORY_NAME']);
        console.log('SYSTEM_TEAMPROJECT:', process.env['SYSTEM_TEAMPROJECT']);
        console.log('SYSTEM_COLLECTIONURI:', process.env['SYSTEM_COLLECTIONURI']);
        console.log('SYSTEM_ACCESSTOKEN:', process.env['SYSTEM_ACCESSTOKEN']);
        console.log('#######- DEBUG MODE -#######');
    }
    if (!prId || !repo || !project || !orgUrl || !accessToken) {
        throw new Error('Missing required Azure DevOps environment variables for PR file detection.');
    }
    const iterationsUrl = `${orgUrl}${project}/_apis/git/repositories/${repo}/pullRequests/${prId}/iterations?api-version=7.1-preview.1`;
    const iterationsResp = await axios_1.default.get(iterationsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const latestIterationId = iterationsResp.data.value[iterationsResp.data.value.length - 1].id;
    const changesUrl = `${orgUrl}${project}/_apis/git/repositories/${repo}/pullRequests/${prId}/iterations/${latestIterationId}/changes?api-version=7.1-preview.1`;
    const changesResp = await axios_1.default.get(changesUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('changesResp.data:', JSON.stringify(changesResp.data, null, 2));
        console.log('#######- DEBUG MODE -#######');
    }
    const changes = changesResp.data.changeEntries;
    if (!Array.isArray(changes)) {
        throw new Error('Could not retrieve changed files from Azure DevOps API. Response: ' + JSON.stringify(changesResp.data));
    }
    const files = changes.map((change) => ({
        filename: change.item.path.replace(/^\//, '')
    }));
    return files;
}
exports.getFilesPartOfPR = getFilesPartOfPR;
