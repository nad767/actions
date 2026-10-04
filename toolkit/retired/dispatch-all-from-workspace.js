import { DEBIAN_UPDATE_LANE, NPM_UPDATE_LANE } from './config.js';
import { runDispatchFromWorkspace } from './run-dispatch-from-workspace.js';

/**
 * @deprecated Replaced by `packages/run-workflow`.
 */
await runDispatchFromWorkspace({
    repositoryDispatchEvent: 'publish-packages-all',
    versionUpdateLanes:      [NPM_UPDATE_LANE, DEBIAN_UPDATE_LANE],
    workflowFilename:        'publish-packages-all.yml',
    workflowName:            'Publish Packages (All)',
});
