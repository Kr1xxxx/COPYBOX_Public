function shouldPruneRuntimeArtifact(fileName) {
  return fileName.endsWith(".map") || /\.d\.(?:ts|mts|cts)$/.test(fileName);
}

module.exports = { shouldPruneRuntimeArtifact };
