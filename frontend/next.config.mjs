import path from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=path.dirname(fileURLToPath(import.meta.url));
export default {
  outputFileTracingRoot:projectRoot,
  async headers() {
    return [{
      source: '/:path*',
      headers: [{
        key: 'Cross-Origin-Opener-Policy',
        value: 'same-origin-allow-popups',
      }],
    }];
  },
};
