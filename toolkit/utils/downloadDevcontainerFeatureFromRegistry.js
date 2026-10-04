import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Download a published devcontainer feature tarball from the registry.
 *
 * Motivation: to perform a build diff check, we need to download the latest published version of the feature from the container registry.
 *
 * @param {string} packageName The container package name (e.g. "repo-foo/cdp-proxy").
 * @param {string} version The version to download (e.g. "0.0.4").
 * @param {string} outDir Directory to save the downloaded tarball.
 * @param {string} apiToken GitHub token for authenticating to the registry.
 * @returns {Promise<string>} Path to the downloaded tarball.
 */
export async function downloadDevcontainerFeatureFromRegistry(packageName, version, outDir, apiToken) {
    const registry = process.env.REGISTRY;
    const namespace = process.env.NAMESPACE;
    const [owner] = namespace.split('/');
    const ociRepo = `${owner.toLowerCase()}/${packageName}`;

    // 1. Get registry token from the registry.
    // OCI registry APIs (like GHCR or other registries) do not accept PATs or Actions GITHUB_TOKENs directly in the Authorization headers of sub-endpoints (manifests, blobs). Instead, they conform to the Docker Registry V2 authentication specification.
    // Therefore, consumers must first request a short-lived Bearer token from the registry's authentication service (/token) scoping permissions to the target repository.
    // We send basic auth credentials (username "x-access-token" + GitHub API token) to obtain a Bearer token authorizing us to pull from this specific repository namespace.
    const tokenRes = await fetch(
        `https://${registry}/token?service=${registry}&scope=${encodeURIComponent(`repository:${ociRepo}:pull`)}`,
        {
            headers: {
                Authorization: `Basic ${Buffer.from(`x-access-token:${apiToken}`).toString('base64')}`,
            },
        },
    );
    if (!tokenRes.ok) throw new Error(`Failed to get ${registry} token: ${tokenRes.statusText}`);
    const { token } = await tokenRes.json();

    // 2. Fetch OCI manifest.
    // In the OCI Image Specification, a package is not stored as a single download file, but rather as an image configuration and one or more layer blobs. The list of these layer digests is detailed inside the "manifest" JSON.
    // We query the package manifest for the requested version, specifying the custom OCI media type header so that the registry understands we expect the JSON-based manifest descriptor instead of raw data.
    // This manifest contains the SHA-256 digest hashes pointing to the actual content layers.
    const manifestUrl = `https://${registry}/v2/${ociRepo}/manifests/${version}`;
    const manifestRes = await fetch(
        manifestUrl,
        {
            headers: {
                Accept:        'application/vnd.oci.image.manifest.v1+json',
                Authorization: `Bearer ${token}`,
            },
        },
    );
    if (!manifestRes.ok) throw new Error(`Failed to fetch manifest: ${manifestRes.statusText}`);
    const manifest = await manifestRes.json();

    // 3. Find the layer digest.
    // A devcontainer feature OCI package is published as a single layer containing the feature's files compressed into a tarball.
    // However, the manifest could technically contain other layers or descriptors (such as configuration, annotations, or base images).
    // We search the manifest layers to find the layer representing the compressed tarball files.
    // Specifically, we look for a media type containing "tar+gzip" or "tar" (e.g. "application/vnd.devcontainers.layer.v1+tar" or "application/vnd.oci.image.layer.v1.tar+gzip").
    // The "digest" property (the SHA-256 hash of that layer) acts as the unique address to download the layer.
    const layer = manifest.layers?.find(l => l.mediaType.includes('tar+gzip') || l.mediaType.includes('tar'));
    if (!layer) throw new Error(`No suitable layer found in manifest for ${ociRepo}:${version}`);
    const digest = layer.digest;

    // 4. Download blob to a temp file.
    // Registry blobs are fetched content-addressably using the digest found in the manifest.
    // We make a GET request to the registry blobs endpoint with our Bearer token to download the raw compressed tarball file, read its binary content into a Buffer, and save it locally as "feature.tgz".
    const blobUrl = `https://${registry}/v2/${ociRepo}/blobs/${digest}`;
    const blobRes = await fetch(blobUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!blobRes.ok) throw new Error(`Failed to download blob: ${blobRes.statusText}`);

    const tarballPath = path.join(outDir, 'feature.tgz');
    const buffer = Buffer.from(await blobRes.arrayBuffer());
    // Ensure the output directory exists before writing the downloaded tarball.
    await mkdir(outDir, { recursive: true });
    await writeFile(tarballPath, buffer);
    return tarballPath;
}
