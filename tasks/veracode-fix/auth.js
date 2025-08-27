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
exports.calculateAuthorizationHeader = void 0;
const sjcl_1 = __importDefault(require("sjcl"));
const crypto = __importStar(require("crypto"));
const authorizationScheme = 'VERACODE-HMAC-SHA-256';
const requestVersion = 'vcode_request_version_1';
const nonceSize = 16;
function computeHashHex(message, key_hex) {
    const key_bits = sjcl_1.default.codec.hex.toBits(key_hex);
    const hmac_bits = new sjcl_1.default.misc.hmac(key_bits, sjcl_1.default.hash.sha256).mac(message);
    const hmac = sjcl_1.default.codec.hex.fromBits(hmac_bits);
    return hmac;
}
function calulateDataSignature(apiKeyBytes, nonceBytes, dateStamp, data) {
    const kNonce = computeHashHex(nonceBytes, apiKeyBytes);
    const kDate = computeHashHex(dateStamp, kNonce);
    const kSig = computeHashHex(requestVersion, kDate);
    const kFinal = computeHashHex(data, kSig);
    return kFinal;
}
function newNonce() {
    return crypto.randomBytes(nonceSize).toString('hex').toUpperCase();
}
function toHexBinary(input) {
    return sjcl_1.default.codec.hex.fromBits(sjcl_1.default.codec.utf8String.toBits(input));
}
function calculateAuthorizationHeader(params) {
    const uriString = params.url;
    const data = `id=${params.id}&host=${params.host}&url=${uriString}&method=${params.method}`;
    const dateStamp = Date.now().toString();
    const nonceBytes = newNonce();
    const dataSignature = calulateDataSignature(params.key, nonceBytes, dateStamp, data);
    const authorizationParam = `id=${params.id},ts=${dateStamp},nonce=${toHexBinary(nonceBytes)},sig=${dataSignature}`;
    const header = authorizationScheme + ' ' + authorizationParam;
    return header;
}
exports.calculateAuthorizationHeader = calculateAuthorizationHeader;
