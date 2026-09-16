/**
 * Extracts the complete Manage Inventory Organizations setup record.
 * Oracle splits this screen across the inventoryOrganizations parent and
 * its invOrgParameters child. The workbook combines both into one wide row.
 */

const { getAllPages } = require("../fusionClient");
const logger = require("../logger");
const { mapAllFields } = require("./fieldMapper");

const ORGANIZATION_RESOURCE = "inventoryOrganizations";
const HCM_ORGANIZATIONS_PATH = "/hcmRestApi/resources/11.13.18.05/organizations";
const HCM_LOCATIONS_PATH = "/hcmRestApi/resources/11.13.18.05/locations";

const PARAMETER_FIELD_MAP = {
  "Starting Revision": "StartingRevision",
  Schedule: "ScheduleName",
  "Time Zone": "Timezone",
  "Locator Control": "StockLocatorControl",
  "Enable Inventory Tracking By Project": "TrackByProjectFlag",
  "Enable Inventory Tracking By Country of Origin": "TrackByCountryOfOriginFlag",
  "Warehouse Accepts Substitute Items": "AcceptSubstituteItemsFlag",
  "Allow Negative Balances": "NegativeInvReceiptFlag",
  "Allow Negative On-hand Transactions": "AllowNegativeOnhandTransactionsFlag",
  "Use Original Receipt Date": "UseOriginalReceiptDateFlag",
  "Round Reorder Quantity": "RoundReorderQuantityFlag",
  "Automatically Cancel Transfer Order Backorders": "FillKillTransferOrdersFlag",
  "Use Current Item Cost": "UseCurrentItemCostFlag",
  "Integrate Manufacturing and Maintenance with WMS":
    "IntegrateWmsWithManufacturingAndMaintenanceFlag",
  "Organization Is Associated With An Internal Customer": "InternalCustomerFlag",
  "Customer Name": "InternalCustomerName",
  "Account Number": "InternalCustomerAccountNumber",
  "Pick Slip Batch Size": "PickSlipBatchSize",
  "Replenishment Movement Request Grouping": "ReplenishmentMovementRequestGrouping",
  "Automatically Delete Picks When Movement Requests Are Cancelled":
    "AutomaticallyDeleteAllocationsFlag",
  "Close Movement Request Lines At Pick Confirmation": "FillKillMoveOrderFlag",
  "Lot Control: Uniqueness": "LotNumberUniqueness",
  "Lot Control: Generation": "LotNumberGeneration",
  "Lot Control: Allow Different Lot Status": "AllowDifferentLotStatus",
  "Lot Control: Automatically Create Lot UOM Conversion":
    "AutomaticallyCreateLotUOMConversion",
  "Lot Generation: Prefix": "AutoLotAlphaPrefix",
  "Lot Generation: Total Length": "LotNumberLength",
  "Lot Generation: Zero Pad Suffix": "LotNumberZeroPaddingFlag",
  "Child Lot Control: Generation": "ParentChildGeneration",
  "Child Lot Control: Prefix": "ChildLotControlPrefix",
  "Child Lot Control: Total Length": "ChildLotControlTotalLength",
  "Child Lot Control: Zero Pad Suffix": "ChildLotControlZeroPaddingFlag",
  "Child Lot Control: Copy Lot Attributes": "CopyLotAttributeFlag",
  "Child Lot Control: Format Validation": "ChildLotControlFormatValidationFlag",
  "Serial Number Generation: Uniqueness": "SerialNumberType",
  "Serial Number Generation: Generation": "SerialNumberGeneration",
  "Serial Number Generation: Prefix": "AutoSerialAlphaPrefix",
  "Serial Number Generation: Starting Serial Number": "StartAutoSerialNumber",
  "Serial Number Generation: System Selects Serial Numbers":
    "SystemSelectsSerialNumberFlag",
  "Packing Unit Generation: Total Length": "PackingUnitTotalLength",
  "Packing Unit Generation: Prefix": "PackingUnitPrefix",
  "Packing Unit Generation: GS1-128": "GS1128Flag",
  "Packing Unit Generation: Starting Packing Unit": "PackingUnitStartingNumber",
  "Packing Unit Generation: Suffix": "PackingUnitSuffix",
  "Picking Rule": "DefaultPickingRuleId",
  "Subinventory Order": "DefaultSubinventoryOrderValue",
  "Locator Order": "DefaultLocatorOrderValue",
  "Quantity Exception Reason": "PickQuantityDefaultReasonId",
  "Pick Confirmation Required": "PickConfirmationRequiredFlag",
  "Overpicking For Movement Requests Enabled": "OverpickTransferOrdersFlag",
  "Allow Overpicking For Special Handling": "OverpickForSpecialHandlingFlag",
  "Automatically Populate Picked Quantity During Pick Confirm": "PreFillPickedQuantityFlag",
  "Capture Picking Exceptions": "CapturePickingExceptionsFlag",
  "Item Sourcing Details: Type": "SourceType",
  "Item Sourcing Details: Organization": "SourceOrganizationName",
  "Item Sourcing Details: Subinventory": "SourceSubinventory",
  "Purchasing By Revision": "PurchasingByRevisionFlag",
  "Logistics Services Organization": "DistributedOrganizationFlag",
  Supplier: "SupplierId",
  "Supplier Site": "SupplierSiteId",
  Flexfield: "organizationParameterDFF",
};

function displayValue(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

function usageValue(inventoryFlag) {
  if (inventoryFlag === true) return "Inventory management";
  if (inventoryFlag === false) return "Item management";
  return inventoryFlag;
}

function childItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

async function getOptionalRecord(client, cfg, path, queryParams, description) {
  try {
    const items = await getAllPages(client, cfg, path, queryParams, true);
    return items[0] || {};
  } catch (error) {
    logger.info(`${description} enrichment unavailable: ${error.message}`);
    return {};
  }
}

async function getOrganizations(client, cfg, orgCodes) {
  const organizationsById = new Map();

  for (const orgCode of orgCodes) {
    const queryParams = { expand: "invOrgParameters" };
    if (orgCode.toUpperCase() !== "ALL") {
      const escapedCode = orgCode.replace(/'/g, "''");
      queryParams.q = `OrganizationCode='${escapedCode}'`;
    }

    const organizations = await getAllPages(
      client,
      cfg,
      ORGANIZATION_RESOURCE,
      queryParams
    );
    organizations.forEach((organization) => {
      organizationsById.set(String(organization.OrganizationId), organization);
    });

    if (orgCode.toUpperCase() === "ALL") break;
  }

  return Array.from(organizationsById.values());
}

async function getParameterRows(client, cfg, organization) {
  const expandedParameters = childItems(organization.invOrgParameters);
  if (expandedParameters.length) return expandedParameters;

  const path = `/fscmRestApi/resources/11.13.18.05/inventoryOrganizations/${encodeURIComponent(
    organization.OrganizationId
  )}/child/invOrgParameters`;
  return getAllPages(client, cfg, path, {}, true);
}

async function buildOrganizationRow(client, cfg, organization, parameters) {
  const [organizationDetails, location] = await Promise.all([
    getOptionalRecord(
      client,
      cfg,
      HCM_ORGANIZATIONS_PATH,
      { q: `OrganizationId=${organization.OrganizationId}` },
      `Organization ${organization.OrganizationCode}`
    ),
    organization.LocationId
      ? getOptionalRecord(
          client,
          cfg,
          HCM_LOCATIONS_PATH,
          { q: `LocationId=${organization.LocationId}` },
          `Location ${organization.LocationId}`
        )
      : Promise.resolve({}),
  ]);

  const leadingFields = {
    Name: organization.OrganizationName,
    Organization: organization.OrganizationCode,
    Usage: usageValue(organization.InventoryFlag),
    "Management Business Unit": organization.ManagementBusinessUnitName,
    "Legal Entity": organization.LegalEntityName,
    "Profit Centre Business Unit": organization.ProfitCenterBusinessUnitName,
    Status: organization.Status,
    "Fixed Asset Corporate Book": organization.FixedAssetCorporateBookTypeCode,
    Location: location.LocationName || organization.LocationCode,
    "Location Code": location.LocationCode || organization.LocationCode,
    "Internal or External": organization.ContractManufacturingFlag ? "External" : "Internal",
    "Internal Address Line": organizationDetails.InternalAddressLine,
    "Item Master Organization": organization.MasterOrganizationName,
    "Item Grouping Behaviour": organization.ItemGroupingName,
    "Item Definition Organization": organization.ItemDefinitionOrganizationName,
    "Organization Is A Manufacturing Plant": displayValue(organization.ManufacturingPlantFlag),
    "Organization Performs Maintenance Activities": displayValue(organization.MaintenanceEnabledFlag),
    "Organization Represents A Contract Manufacturer": displayValue(
      organization.ContractManufacturingFlag
    ),
    "Integrated System Type": organization.IntegratedSystemName,
  };

  const parameterFields = mapAllFields(parameters, PARAMETER_FIELD_MAP, {}, {
    mappedValueFormatter: displayValue,
    unmappedPrefix: "Parameter API: ",
    includeMissingMappedFields: true,
  });
  const organizationApiFields = mapAllFields(organization, {}, {}, {
    unmappedPrefix: "Organization API: ",
  });
  delete organizationApiFields["Organization API: invOrgParameters"];
  const organizationDetailApiFields = mapAllFields(organizationDetails, {}, {}, {
    unmappedPrefix: "Organization Detail API: ",
  });
  const locationApiFields = mapAllFields(location, {}, {}, {
    unmappedPrefix: "Location API: ",
  });

  return {
    ...leadingFields,
    ...parameterFields,
    ...organizationApiFields,
    ...organizationDetailApiFields,
    ...locationApiFields,
  };
}

async function extractInventoryOrganizations(client, cfg, orgCodes) {
  const organizations = await getOrganizations(client, cfg, orgCodes);
  const rows = [];

  for (const organization of organizations) {
    const parameterRows = await getParameterRows(client, cfg, organization);
    const rowsToWrite = parameterRows.length ? parameterRows : [{}];

    for (const parameters of rowsToWrite) {
      rows.push(await buildOrganizationRow(client, cfg, organization, parameters));
    }
  }

  logger.info(`Inventory organizations extracted: ${rows.length}`);
  return rows;
}

module.exports = {
  extractInventoryOrganizations,
  PARAMETER_FIELD_MAP,
};
