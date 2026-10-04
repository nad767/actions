import { DEBIAN_UPDATE_LANE } from './config.js';
import { runDispatchFromWorkspace } from './run-dispatch-from-workspace.js';

/**
 * @deprecated Replaced by `packages/run-workflow`.
 */
await runDispatchFromWorkspace({
    repositoryDispatchEvent: 'publish-packages-deb',
    versionUpdateLanes:      [DEBIAN_UPDATE_LANE],
    workflowFilename:        'publish-packages-deb.yml',
    workflowName:            'Publish Packages (Debian)',
});
