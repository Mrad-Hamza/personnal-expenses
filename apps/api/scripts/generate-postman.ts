import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const converter = require('openapi-to-postmanv2');

const openapiPath = join(__dirname, '..', 'openapi.json');
const outDir = join(__dirname, '..', '..', '..', 'docs', 'postman');
const outPath = join(outDir, 'personnal-expenses.postman_collection.json');

if (!existsSync(openapiPath)) {
  console.error(`No openapi.json found at ${openapiPath}. Run "npm run docs:openapi" first.`);
  process.exit(1);
}

const openapiData = readFileSync(openapiPath, 'utf-8');

converter.convert(
  { type: 'string', data: openapiData },
  { folderStrategy: 'Tags', requestParametersResolution: 'Example' },
  (err: unknown, result: { result: boolean; reason?: string; output: { data: unknown }[] }) => {
    if (err || !result.result) {
      console.error('Postman conversion failed:', err ?? result.reason);
      process.exit(1);
    }
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(result.output[0].data, null, 2));
    console.log(`Postman collection written to ${outPath}`);
  },
);
