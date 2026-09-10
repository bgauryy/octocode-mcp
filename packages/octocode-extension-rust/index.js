import native from './index.cjs';
export const { NativeCancellation, ensurePrivateDirectory, flushFile, readGitObject, snapshotFile, fingerprintFiles, replaceFile, deleteFile, computeLineDiff, computeLineDiffAsync, generateDiffArtifacts, generateDiffArtifactsAsync } = native;
