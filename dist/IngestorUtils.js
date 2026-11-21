"use strict";
/* Copyright (c) 2024 Seneca contributors, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashContent = hashContent;
exports.findOrCreateDoc = findOrCreateDoc;
exports.saveIfNotExists = saveIfNotExists;
const crypto_1 = __importDefault(require("crypto"));
function hashContent(content) {
    return crypto_1.default.createHash('sha256').update(content).digest('hex');
}
async function findOrCreateDoc(seneca, filename, content, kind) {
    const hash = hashContent(content);
    const existing = await seneca.entity('ingest/doc').list$({ filename, hash });
    if (existing.length > 0 && 'done' === existing[0].status) {
        return { doc: existing[0], alreadyDone: true };
    }
    const doc = existing.length > 0
        ? existing[0]
        : await seneca
            .entity('ingest/doc')
            .make$()
            .data$({ filename, hash, kind, status: 'processing' })
            .save$();
    return { doc, alreadyDone: false };
}
async function saveIfNotExists(seneca, entityType, query, data) {
    const existing = await seneca.entity(entityType).list$(query);
    if (existing.length === 0) {
        await seneca.entity(entityType).make$().data$(data).save$();
    }
}
//# sourceMappingURL=IngestorUtils.js.map