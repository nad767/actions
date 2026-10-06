/**
 * Rewrite staged internal package import specifiers to their published names.
 *
 * Motivation: the publish flow renames workspace packages from `@repo-foo/*` to the GitHub namespace, so staged JavaScript must follow the renamed manifests or consumers will resolve the wrong package names at runtime.
 *
 * @param {string} sourceText
 * @param {Map<string, string>} renamedPackages
 * @returns {string}
 */
export function rewriteInternalNpmPackageSpecifiers(sourceText, renamedPackages) {
    let rewrittenSourceText = sourceText;

    for (const [packageName, rewrittenPackageName] of renamedPackages) {
        // Capture-then-reinstate the opening quotation mark: a lookbehind can't enforce quotation mark parity with the trailing lookahead via `\1`.
        const specifierRegex = new RegExp(String.raw`(["'])${RegExp.escape(packageName)}(?=/|\1)`, 'gu');
        rewrittenSourceText = rewrittenSourceText.replaceAll(specifierRegex, (_, quote) => `${quote}${rewrittenPackageName}`);
    }

    return rewrittenSourceText;
}
