const INVENTORY_MANAGEMENT_TASKS = [
  { name: "Manage Inventory Locator Key Flexfield", required: false },
  { name: "Advanced Inventory Parameters", required: false },
  { name: "Inventory Transaction Sources and Types", required: false },
  { name: "Manage Inventory Transaction Sources and Types", required: false },
  { name: "Material Statuses", required: false },
  { name: "Manage Material Statuses", required: false },
  { name: "Configure Subinventories", required: true, extractor: "subinventories" },
  { name: "Units of Measure Usages", required: true },
  { name: "Manage Units of Measure Usages", required: false },
  { name: "Inventory ABC Analysis", required: true },
  { name: "Manage ABC Classes", required: false },
  { name: "Manage ABC Classification Sets", required: false },
  { name: "Manage ABC Assignment Groups", required: false },
  { name: "Interorganization Parameters", required: true },
  { name: "Manage Interorganization Parameters", required: false },
  { name: "Intersubinventory Parameters", required: true },
];

const FACILITIES_TASKS = [
  {
    name: "Manage Inventory Organizations",
    required: true,
    extractor: "inventoryOrganizations",
  },
];

const SUPPLIERS_TASKS = [
  { name: "Specify Supplier Numbering", required: true },
  { name: "Manage Supplier Type Lookup", required: false },
  { name: "Manage Tax Organization Type Lookup", required: false },
  { name: "Manage Supplier Profile Options", required: false },
  {
    name: "Manage Supplier Products and Services Category Hierarchy",
    required: false,
  },
  { name: "Manage Supplier Value Sets", required: false },
  { name: "Manage Supplier Descriptive Flexfields", required: false },
  { name: "Manage Supplier Bank Account Descriptive Flexfields", required: false },
  { name: "Manage Supplier Messages", required: false },
  { name: "Configure Supplier Outbound Synchronization Service", required: false },
];

// Captured from Procurement > Approval Management in the customer's Oracle
// environment. Keep the Oracle display order so Required/All Tasks mirrors FSM.
const APPROVAL_MANAGEMENT_TASKS = [
  { name: "Manage Approval Groups", required: false },
  { name: "Manage Requisition Approvals", required: true },
  { name: "Manage Supplier Negotiation Approvals", required: false },
  { name: "Manage Supplier Negotiation Award Approvals", required: false },
  { name: "Manage Purchasing Document Approvals", required: true },
  { name: "Manage Internal Supplier Registration Approvals", required: false },
  { name: "Manage Supplier Registration Approvals", required: false },
  { name: "Manage Supplier Spend Authorization Approvals", required: false },
  { name: "Manage Internal Supplier Profile Change Approvals", required: false },
  { name: "Manage Supplier Profile Change Approvals", required: false },
  { name: "Manage External Purchase Price Approvals", required: false },
  { name: "Manage Task Configurations for Procurement", required: false },
  { name: "Manage Work Confirmation Approvals", required: false },
  { name: "Manage Intake Request Approvals", required: false },
];

// Oracle renders an additional scoped row for Manage Procurement Agents. The
// catalog intentionally keeps one task definition; scope is resolved at run time.
const PROCUREMENT_FOUNDATION_TASKS = [
  { name: "Manage Procurement Category Hierarchy", required: false },
  { name: "Manage Procurement Agents", required: true },
  { name: "Manage Payment Terms", required: true },
  { name: "Manage Units of Measure", required: true },
  { name: "Manage Carriers Lookups", required: false },
  { name: "Manage Carriers", required: false },
  { name: "Manage FOB Lookup", required: false },
  { name: "Manage Freight Terms Lookup", required: false },
  { name: "Manage Purchasing Profile Options", required: false },
  { name: "Manage Procurement Document Numbering", required: false },
  { name: "Manage Purchasing Line Types", required: false },
  { name: "Manage Document Styles", required: false },
  { name: "Configure Procurement Business Function", required: true },
  { name: "Configure Requisitioning Business Function", required: true },
  { name: "Manage Common Options for Payables and Procurement", required: false },
];

const AREA_TASKS = {
  "approval management": APPROVAL_MANAGEMENT_TASKS,
  facilities: FACILITIES_TASKS,
  "inventory management": INVENTORY_MANAGEMENT_TASKS,
  "procurement foundation": PROCUREMENT_FOUNDATION_TASKS,
  suppliers: SUPPLIERS_TASKS,
};

const EXACT_CATALOG_AREAS = new Set([
  "approval management",
  "facilities",
  "procurement foundation",
]);

function normalizeAreaName(functionalAreaName) {
  return String(functionalAreaName || "").trim().toLowerCase();
}

function getCatalogTasks(functionalAreaName) {
  return AREA_TASKS[normalizeAreaName(functionalAreaName)] || [];
}

function usesExactTaskCatalog(functionalAreaName) {
  return EXACT_CATALOG_AREAS.has(normalizeAreaName(functionalAreaName));
}

module.exports = { getCatalogTasks, usesExactTaskCatalog };
