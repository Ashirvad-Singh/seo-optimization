function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildAuditInput(manualData = {}) {
  return {
    name: normalizeText(manualData.name),
    category: normalizeText(manualData.category),
    city: normalizeText(manualData.city),
    website: normalizeText(manualData.website),
  };
}

export function validateAuditRequest(body = {}) {
  const manualData = buildAuditInput(body.manualData);

  if (!manualData.name) {
    return {
      isValid: false,
      message: "Please provide business name.",
    };
  }

  if (!manualData.category) {
    return {
      isValid: false,
      message: "Please provide primary category.",
    };
  }

  if (!manualData.city) {
    return {
      isValid: false,
      message: "Please provide city or location.",
    };
  }

  if (manualData.website && !isValidHttpUrl(manualData.website)) {
    return {
      isValid: false,
      message: "Website must be a valid http or https URL.",
    };
  }

  return {
    isValid: true,
  };
}
