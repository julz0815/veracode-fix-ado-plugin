"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectPlatfrom = void 0;
async function selectPlatfrom(creds) {
    var _a, _b, _c, _d;
    let requestParameters = {};
    if (creds.vid.startsWith('vera01ei-')) {
        requestParameters = {
            apiUrl: 'api.veracode.eu',
            cleanedID: (_b = (_a = creds.vid) === null || _a === void 0 ? void 0 : _a.replace('vera01ei-', '')) !== null && _b !== void 0 ? _b : '',
            cleanedKEY: (_d = (_c = creds.vkey) === null || _c === void 0 ? void 0 : _c.replace('vera01es-', '')) !== null && _d !== void 0 ? _d : ''
        };
        console.log('Region: EU');
    }
    else {
        requestParameters = {
            apiUrl: 'api.veracode.com',
            cleanedID: creds.vid,
            cleanedKEY: creds.vkey
        };
        console.log('Region: US');
    }
    return requestParameters;
}
exports.selectPlatfrom = selectPlatfrom;
