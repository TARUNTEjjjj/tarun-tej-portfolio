import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readAppRelease,stampAppVersion,writeAppVersion} from './app-release.mjs';
import {stageResourceExplorer,stageRootOfflineWorker} from './stage-resource-explorer.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(root,'dist');
const release=await readAppRelease(root,{project:'tarun-tej-portfolio',sourcePaths:[
  'dist','resources','offline-resources-worker.js','scripts/build-app-release.mjs',
  'scripts/app-release.mjs','scripts/app-update-protocol.mjs','scripts/stage-resource-explorer.mjs',
  'package.json','package-lock.json'],ignorePaths:['dist/resources','dist/offline-resources-worker.js']});
const home=resolve(output,'index.html');
await writeFile(home,stampAppVersion(await readFile(home,'utf8'),release));
await stageResourceExplorer(root,resolve(output,'resources'),{release});
await stageRootOfflineWorker(root,output,{release});
await writeAppVersion(output,release,{workers:[
  {scope:'/',script:'/offline-resources-worker.js'},
  {scope:'/resources/',script:'/resources/offline-worker.js'}]});
console.log('Staged automatic app updates: '+release.version);
