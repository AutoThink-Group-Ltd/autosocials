import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({test:{environment:'node',include:['release/oauth-target.test.ts','release/public-showcase.test.ts']},resolve:{alias:{'@':path.resolve(process.cwd(),'src')}}});
