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
Object.defineProperty(exports, "__esModule", { value: true });
const React = __importStar(require("react"));
const ReactDOM = __importStar(require("react-dom"));
const FixSuggestionsHub_1 = require("./components/FixSuggestionsHub");
const veracode_fix_service_1 = require("./veracode-fix-service");
const SDK = __importStar(require("azure-devops-extension-sdk"));
SDK.init();
SDK.ready().then(() => {
    const container = document.getElementById('root');
    if (container) {
        const config = SDK.getConfiguration();
        const veracodeService = new veracode_fix_service_1.VeracodeFixService({
            vid: config.veracodeCredentials.vid,
            vkey: config.veracodeCredentials.vkey
        }, {
            fixType: config.fixOptions.fixType || 'single',
            language: config.fixOptions.language,
            createPR: config.fixOptions.createPR,
            prComment: config.fixOptions.prComment,
            sourceBasePath: config.fixOptions.sourceBasePath
        });
        const options = {
            fixType: config.fixOptions.fixType || 'single',
            language: config.fixOptions.language,
            createPR: config.fixOptions.createPR,
            prComment: config.fixOptions.prComment,
            sourceBasePath: config.fixOptions.sourceBasePath
        };
        const flawInfos = config.flawInfos || [];
        ReactDOM.render(React.createElement(FixSuggestionsHub_1.FixSuggestionsHub, { veracodeService: veracodeService, options: options, flawInfos: flawInfos }), container);
    }
});
//# sourceMappingURL=index.js.map