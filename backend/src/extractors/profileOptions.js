const logger = require("../logger");

const SUPPLIER_PROFILE_OPTIONS = [
  {
    name: "ORA_POZ_FROM_EMAIL_ADDRESS",
    displayName: "Sender for Suppliers' Email Notifications",
    description:
      "Enter the sender's email address for the external registration and approved spend authorized notifications that are sent to suppliers.",
    level: "SITE",
  },
];

function hasProfileDefinitions(files) {
  return (files || []).some(
    (file) => /FND_APP_PROFILE_OPTION\.csv$/i.test(file.name) && (file.rows?.length || 0) > 1
  );
}

function rowForHeaders(headers, values) {
  return headers.map((header) => values[String(header)] ?? "");
}

function addRow(files, namePattern, defaultName, defaultHeaders, values) {
  const file = files.find((candidate) => namePattern.test(candidate.name));
  if (file?.rows?.[0]) {
    return files.map((candidate) => candidate === file
      ? { ...candidate, rows: [...candidate.rows, rowForHeaders(candidate.rows[0], values)] }
      : candidate);
  }
  return [...files, { name: defaultName, rows: [defaultHeaders, rowForHeaders(defaultHeaders, values)] }];
}

async function fetchProfileValue(client, profileOptionName) {
  let response;
  try {
    response = await client.get(
      "/fscmRestApi/resources/11.13.18.05/profileValues",
      {
        params: {
          finder: `ProfileOptionNameFinder;ProfileOptionName=${profileOptionName}`,
          onlyData: true,
        },
      }
    );
  } catch (error) {
    logger.info(`Profile value fallback failed for ${profileOptionName}: ${error.message}`);
    return null;
  }
  if (response.status !== 200) {
    logger.info(
      `Profile value fallback returned HTTP ${response.status} for ${profileOptionName}.`
    );
    return null;
  }
  return response.data?.items?.[0] || null;
}

async function supplementSupplierProfileOptions(client, files) {
  if (hasProfileDefinitions(files)) return files;

  let supplemented = [...(files || [])];
  for (const definition of SUPPLIER_PROFILE_OPTIONS) {
    const item = await fetchProfileValue(client, definition.name);
    const profileOptionName = item?.ProfileOptionName || definition.name;
    const applicationId = item?.ApplicationId ?? "";
    supplemented = addRow(
      supplemented,
      /FND_APP_PROFILE_OPTION\.csv$/i,
      "FND_APP_PROFILE_OPTION.csv",
      ["ProfileOptionName", "ApplicationId", "UserProfileOptionName"],
      {
        ProfileOptionName: profileOptionName,
        ApplicationId: applicationId,
        UserProfileOptionName: item?.UserProfileOptionName || definition.displayName,
        Description: definition.description,
      }
    );
    supplemented = addRow(
      supplemented,
      /FND_APP_PROFILE_VALUE\.csv$/i,
      "FND_APP_PROFILE_VALUE.csv",
      [
        "FND_APP_PROFILE_OPTION.ProfileOptionName",
        "FND_APP_PROFILE_OPTION.ApplicationId",
        "LevelName",
        "LevelValue",
        "ProfileOptionValue",
      ],
      {
        "FND_APP_PROFILE_OPTION.ProfileOptionName": profileOptionName,
        "FND_APP_PROFILE_OPTION.ApplicationId": applicationId,
        LevelName: definition.level,
        LevelValue: "",
        ProfileOptionValue: "",
      }
    );
    supplemented = addRow(
      supplemented,
      /ORA_FND_APP_PROFILE_OPTION_LEVEL\.csv$/i,
      "ORA_FND_APP_PROFILE_OPTION_LEVEL.csv",
      [
        "FND_APP_PROFILE_OPTION.ProfileOptionName",
        "FND_APP_PROFILE_OPTION.ApplicationId",
        "LevelName",
        "UpdateableFlag",
        "EnabledFlag",
      ],
      {
        "FND_APP_PROFILE_OPTION.ProfileOptionName": profileOptionName,
        "FND_APP_PROFILE_OPTION.ApplicationId": applicationId,
        LevelName: definition.level,
        UpdateableFlag: "",
        EnabledFlag: "",
      }
    );
  }

  if (hasProfileDefinitions(supplemented)) {
    logger.info("Recovered the Supplier Profile Options task view from its Oracle task definition.");
  } else {
    logger.info(
      "Supplier profile option CSVs were empty and profileValues returned no accessible records."
    );
  }
  return supplemented;
}

module.exports = { supplementSupplierProfileOptions };
