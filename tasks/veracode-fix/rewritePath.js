"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchFile = exports.rewritePath = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function rewritePath(options, filename) {
    var _a, _b, _c;
    async function replacePath(rewrite, path) {
        const replaceValues = rewrite.split(":");
        const newPath = path.replace(replaceValues[0], replaceValues[1]);
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('rewritePath.ts');
            console.log(`Value 1: ${replaceValues[0]} Value 2: ${replaceValues[1]} old path: ${path}`);
            console.log(`new Path: ${newPath}`);
            console.log('#######- DEBUG MODE -#######');
        }
        return newPath;
    }
    let filepath;
    if (options.source_base_path_1 || options.source_base_path_2 || options.source_base_path_3) {
        const orgPath1 = ((_a = options.source_base_path_1) === null || _a === void 0 ? void 0 : _a.split(":")) || ["", ""];
        const orgPath2 = ((_b = options.source_base_path_2) === null || _b === void 0 ? void 0 : _b.split(":")) || ["", ""];
        const orgPath3 = ((_c = options.source_base_path_3) === null || _c === void 0 ? void 0 : _c.split(":")) || ["", ""];
        if (options.DEBUG) {
            console.log('#######- DEBUG MODE -#######');
            console.log('rewritePath.ts');
            console.log(`path1: ${orgPath1[0]}:${orgPath1[1]} path2: ${orgPath2[0]}:${orgPath2[1]} path3: ${orgPath3[0]}:${orgPath3[1]}`);
            console.log('#######- DEBUG MODE -#######');
        }
        if (filename.includes(orgPath1[0])) {
            filepath = await replacePath(options.source_base_path_1, filename);
            if (options.DEBUG) {
                console.log('#######- DEBUG MODE -#######');
                console.log('rewritePath.ts');
                console.log(`file path1: ${filename}`);
                console.log(`Filepath rewrite 1: ${filepath}`);
                console.log('#######- DEBUG MODE -#######');
            }
        }
        else if (filename.includes(orgPath2[0])) {
            filepath = await replacePath(options.source_base_path_2, filename);
            if (options.DEBUG) {
                console.log('#######- DEBUG MODE -#######');
                console.log('rewritePath.ts');
                console.log(`file path2: ${filename}`);
                console.log(`Filepath rewrite 2: ${filepath}`);
                console.log('#######- DEBUG MODE -#######');
            }
        }
        else if (filename.includes(orgPath3[0])) {
            filepath = await replacePath(options.source_base_path_3, filename);
            if (options.DEBUG) {
                console.log('#######- DEBUG MODE -#######');
                console.log('rewritePath.ts');
                console.log(`file path3: ${filename}`);
                console.log(`Filepath rewrite 3: ${filepath}`);
                console.log('#######- DEBUG MODE -#######');
            }
        }
        console.log(`Rewritten Filepath: ${filepath}`);
    }
    return filepath;
}
exports.rewritePath = rewritePath;
async function searchFile(dir, filename, options) {
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('rewritePath.ts');
        console.log(`Searching for file: ${filename} in directory: ${dir}`);
        console.log('#######- DEBUG MODE -#######');
    }
    let result = null;
    const files = fs_1.default.readdirSync(dir);
    for (const file of files) {
        if (file === '.git' || file === '.metadata' || file === 'app')
            continue;
        const fullPath = path_1.default.join(dir, file);
        const stat = fs_1.default.statSync(fullPath);
        if (stat.isDirectory()) {
            result = await searchFile(fullPath, filename, options);
            if (result)
                break;
        }
        else if (file === filename) {
            console.log(`File found: ${fullPath}`);
            result = fullPath;
            break;
        }
    }
    if (options.DEBUG) {
        console.log('#######- DEBUG MODE -#######');
        console.log('rewritePath.ts');
        console.log(`Result: ${result}`);
        console.log('#######- DEBUG MODE -#######');
    }
    return result || '';
}
exports.searchFile = searchFile;
