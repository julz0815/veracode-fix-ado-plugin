"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFlawInfo = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const rewritePath_1 = require("./rewritePath");
async function createFlawInfo(flawInfo, options) {
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('createFlawInfo.ts');
        console.log('Flaw Info:');
        console.log(flawInfo);
        console.log('#######- DEBUG MODE -#######');
    }
    const resultsFile = fs_1.default.readFileSync(flawInfo.resultsFile, 'utf8');
    const data = JSON.parse(resultsFile);
    console.log('Reviewing issueID: ' + flawInfo.issuedID);
    const resultArray = data.findings.find((issue) => issue.issue_id == flawInfo.issuedID && issue.files.source_file.file == flawInfo.sourceFile);
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('createFlawInfo.ts');
        console.log('Results array:');
        console.log(resultArray);
        console.log('#######- DEBUG MODE -#######');
    }
    const sourceFile = resultArray.files.source_file.file;
    let flows = [];
    if (resultArray.stack_dumps.stack_dump) {
        if (resultArray.stack_dumps.stack_dump.length > 0) {
            const flowArray = resultArray.stack_dumps.stack_dump[0].Frame;
            flowArray.forEach(async (element) => {
                if (element.SourceFile == sourceFile && element.VarNames != undefined) {
                    if (options.DEBUG) {
                        console.log('#######- DEBUG MODE -#######');
                        console.log('createFlawInfo.ts');
                        console.log('Flow element: ');
                        console.log(element);
                        console.log('#######- DEBUG MODE -#######');
                    }
                    let flow = {
                        "expression": element.VarNames,
                        "region": {
                            "startLine": parseInt(element.SourceLine) + 1,
                            "endLine": parseInt(element.SourceLine) + 1,
                            "startColumn": 0,
                            "endColumn": 0
                        }
                    };
                    flows.push(flow);
                }
            });
            if (options.DEBUG) {
                console.log('#######- DEBUG MODE -#######');
                console.log('createFlawInfo.ts');
                console.log('Flows:');
                console.log(flows);
                console.log('#######- DEBUG MODE -#######');
            }
        }
        else {
            let flow = {
                "expression": "",
                "region": {
                    "startLine": resultArray.files.source_file.line,
                    "endLine": resultArray.files.source_file.line,
                    "startColumn": 0,
                    "endColumn": 0
                }
            };
            flows.push(flow);
            console.log('No flows 1');
        }
    }
    else {
        let flow = {
            "expression": "",
            "region": {
                "startLine": resultArray.files.source_file.line,
                "endLine": resultArray.files.source_file.line,
            }
        };
        flows.push(flow);
        console.log('No flows 2');
    }
    const filename = resultArray.files.source_file.file;
    const dir = process.cwd();
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('createFlawInfo.ts');
        console.log('Searching for file: ' + filename + ' in directory: ' + dir);
        console.log('#######- DEBUG MODE -#######');
    }
    const filenameOnly = path_1.default.basename(flawInfo.sourceFile);
    let filepath = await (0, rewritePath_1.searchFile)(dir, filenameOnly, options);
    if (filepath == undefined) {
        filepath = filename;
    }
    const fullFlawInfo = {
        "sourceFile": filepath,
        "function": resultArray.files.source_file.function_name,
        "line": resultArray.files.source_file.line,
        "CWEId": resultArray.cwe_id,
        "issueId": resultArray.issue_id,
        "flow": flows
    };
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('createFlawInfo.ts');
        console.log('Full Flaw Info:');
        console.log(fullFlawInfo);
        console.log('#######- DEBUG MODE -#######');
    }
    return fullFlawInfo;
}
exports.createFlawInfo = createFlawInfo;
