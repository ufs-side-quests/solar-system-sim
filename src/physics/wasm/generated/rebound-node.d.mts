import type { ReboundModule } from "../rebound-module";

// The Node build finds its WebAssembly file through locateFile alone.
declare const createReboundModule: (options: {
  locateFile(path: string): string;
}) => Promise<ReboundModule>;

export default createReboundModule;
