import { NPM_UPDATE_LANE } from './config.js';
import { runDispatchFromWorkspace } from './run-dispatch-from-workspace.js';

/**
 * @deprecated Replaced by `packages/run-workflow`.
 */
await runDispatchFromWorkspace({
    repositoryDispatchEvent: 'publish-packages-npm',
    versionUpdateLanes:      [NPM_UPDATE_LANE],
    workflowFilename:        'publish-packages-npm.yml',
    workflowName:            'Publish Packages (npm)',
});
