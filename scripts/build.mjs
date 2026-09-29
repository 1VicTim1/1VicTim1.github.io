import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('site','dist',{recursive:true});
// Serve Vue locally. No CDN dependency in a published build. The UI also has a native
// renderer for local inspection when the dependency network is unavailable.
try{const response=await fetch('https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.prod.js',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Vue download failed');const source=await response.text();if(!source.includes('createApp'))throw Error('Unexpected Vue module');await writeFile('dist/assets/vue.esm-browser.prod.js',source);console.log('Bundled current Vue 3 browser runtime.')}catch(e){if(process.env.CI)throw e;console.warn('Offline preview: native renderer used; CI requires Vue to bundle successfully.')}
await writeFile('dist/.nojekyll','');console.log('Static build ready in dist/');
