type Options = {
    debug: boolean;
    bucket: {
        folder: string;
        prefix: string;
    };
};
export type IngestorOptions = Partial<Options>;
declare function Ingestor(this: any, options: Options): {
    name: string;
};
export default Ingestor;
