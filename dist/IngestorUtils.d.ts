export declare function hashContent(content: Buffer): string;
export declare function findOrCreateDoc(seneca: any, filename: string, content: Buffer, kind: string): Promise<{
    doc: any;
    alreadyDone: boolean;
}>;
export declare function saveIfNotExists(seneca: any, entityType: string, query: Record<string, any>, data: Record<string, any>): Promise<void>;
