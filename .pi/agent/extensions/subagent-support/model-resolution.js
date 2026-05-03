const VALID_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

function isAlias(id) {
  if (id.endsWith("-latest")) return true;
  return !/-\d{8}$/.test(id);
}

function findExactModelReferenceMatch(modelReference, availableModels) {
  const trimmedReference = modelReference.trim();
  if (!trimmedReference) return undefined;

  const normalizedReference = trimmedReference.toLowerCase();
  const canonicalMatches = availableModels.filter(
    (model) => `${model.provider}/${model.id}`.toLowerCase() === normalizedReference,
  );
  if (canonicalMatches.length === 1) return canonicalMatches[0];
  if (canonicalMatches.length > 1) return undefined;

  const slashIndex = trimmedReference.indexOf("/");
  if (slashIndex !== -1) {
    const provider = trimmedReference.slice(0, slashIndex).trim();
    const modelId = trimmedReference.slice(slashIndex + 1).trim();
    if (provider && modelId) {
      const providerMatches = availableModels.filter(
        (model) =>
          model.provider.toLowerCase() === provider.toLowerCase() &&
          model.id.toLowerCase() === modelId.toLowerCase(),
      );
      if (providerMatches.length === 1) return providerMatches[0];
      if (providerMatches.length > 1) return undefined;
    }
  }

  const idMatches = availableModels.filter((model) => model.id.toLowerCase() === normalizedReference);
  return idMatches.length === 1 ? idMatches[0] : undefined;
}

function tryMatchModel(modelPattern, availableModels) {
  const exactMatch = findExactModelReferenceMatch(modelPattern, availableModels);
  if (exactMatch) return exactMatch;

  const matches = availableModels.filter(
    (model) =>
      model.id.toLowerCase().includes(modelPattern.toLowerCase()) ||
      model.name?.toLowerCase().includes(modelPattern.toLowerCase()),
  );
  if (matches.length === 0) return undefined;

  const aliases = matches.filter((model) => isAlias(model.id));
  const datedVersions = matches.filter((model) => !isAlias(model.id));

  if (aliases.length > 0) {
    aliases.sort((left, right) => right.id.localeCompare(left.id));
    return aliases[0];
  }

  datedVersions.sort((left, right) => right.id.localeCompare(left.id));
  return datedVersions[0];
}

function parseModelPattern(pattern, availableModels) {
  const exactMatch = tryMatchModel(pattern, availableModels);
  if (exactMatch) {
    return { model: exactMatch, thinkingLevel: undefined };
  }

  const lastColonIndex = pattern.lastIndexOf(":");
  if (lastColonIndex === -1) {
    return { model: undefined, thinkingLevel: undefined };
  }

  const prefix = pattern.slice(0, lastColonIndex);
  const suffix = pattern.slice(lastColonIndex + 1);
  if (!VALID_THINKING_LEVELS.has(suffix)) {
    return { model: undefined, thinkingLevel: undefined };
  }

  const resolved = parseModelPattern(prefix, availableModels);
  if (!resolved.model) {
    return resolved;
  }

  return {
    model: resolved.model,
    thinkingLevel: suffix,
  };
}

export function resolveAuthenticatedModelPattern(modelPattern, authenticatedModels) {
  if (!modelPattern) return undefined;
  if (!authenticatedModels || authenticatedModels.length === 0) return undefined;

  const { model, thinkingLevel } = parseModelPattern(modelPattern, authenticatedModels);
  if (!model) return undefined;

  const resolved = `${model.provider}/${model.id}`;
  return thinkingLevel ? `${resolved}:${thinkingLevel}` : resolved;
}
