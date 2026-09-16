const AUDIT_HEADERS = new Set([
  "createdby",
  "creationdate",
  "lastupdatedby",
  "lastupdatedate",
  "lastupdatelogin",
]);

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sourceLabel(value) {
  return String(value || "Data")
    .replace(/\.csv$/i, "")
    .replace(/^(ORA_|FND_|POR_)/i, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b(Uom|Abc|Fob|Lpn|Id)\b/g, (word) => word.toUpperCase());
}

function readableHeaderLabel(value) {
  return String(value || "")
    .replace(/^[A-Z0-9_]+\./, "")
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(Id|Uom|Dff|Fob|Lpn|Rest|Sql|Bu)\b/g, (word) => word.toUpperCase());
}

function toTable(file) {
  const rows = file?.rows || [];
  const headers = rows[0] || [];
  const normalized = headers.map(normalizeHeader);
  return {
    file,
    headers,
    normalized,
    rows: rows.slice(1).filter((row) => row.some((value) => value !== "" && value != null)),
  };
}

function findTable(files, patterns) {
  return files.map(toTable).find((table) => patterns.some((pattern) => pattern.test(table.file.name)));
}

function findColumn(table, candidates) {
  const names = candidates.map(normalizeHeader);
  return table.normalized.findIndex((header) => names.includes(header));
}

function readValue(table, row, candidates) {
  const index = findColumn(table, candidates);
  return index >= 0 ? row[index] ?? "" : "";
}

function hasColumns(table, candidates) {
  return candidates.every((candidateGroup) => findColumn(table, candidateGroup) >= 0);
}

function readableColumns(table, preferred = []) {
  const selected = [];
  for (const definition of preferred) {
    const index = findColumn(table, definition.names);
    if (index >= 0 && !selected.some((item) => item.index === index)) {
      selected.push({ index, label: definition.label });
    }
  }
  for (let index = 0; index < table.headers.length; index += 1) {
    if (selected.some((item) => item.index === index)) continue;
    if (AUDIT_HEADERS.has(table.normalized[index])) continue;
    selected.push({ index, label: readableHeaderLabel(table.headers[index]) });
  }
  return selected;
}

function tableSection(title, table, preferred = []) {
  if (!table?.headers.length) return null;
  const columns = readableColumns(table, preferred);
  return {
    title,
    headers: columns.map((column) => column.label),
    rows: table.rows.map((row) => columns.map((column) => row[column.index] ?? "")),
  };
}

function appendColumnIfMissing(section, table, label, candidates) {
  if (!section || findColumn(table, candidates) >= 0) return section;
  section.headers.push(label);
  section.rows.forEach((row) => row.push(""));
  return section;
}

function buildLookupView(files) {
  const typeTable = findTable(files, [/STANDARD_LOOKUP\.csv$/i, /LOOKUP_TYPE/i]);
  const codeTable = findTable(files, [/LOOKUP_CODE/i]);
  if (!codeTable) return null;

  const sections = [];
  const typeSection = tableSection("Lookup Type Details", typeTable, [
    { label: "Lookup Type", names: ["LookupType"] },
    { label: "Meaning", names: ["Meaning"] },
    { label: "Description", names: ["Description"] },
    { label: "Module", names: ["ModuleId", "ModuleName"] },
    { label: "Configuration Level", names: ["CustomizationLevel"] },
    { label: "REST Access Secured", names: ["RestAccessSecured"] },
  ]);
  if (typeSection) sections.push(typeSection);

  const codeSection = appendColumnIfMissing(tableSection("Lookup Codes", codeTable, [
    {
      label: "Lookup Type",
      names: ["LookupType", "FND_APP_STANDARD_LOOKUP.LookupType"],
    },
    { label: "Lookup Code", names: ["LookupCode"] },
    { label: "Display Sequence", names: ["DisplaySequence"] },
    { label: "Enabled", names: ["EnabledFlag"] },
    { label: "Start Date", names: ["StartDateActive"] },
    { label: "End Date", names: ["EndDateActive"] },
    { label: "Meaning", names: ["Meaning"] },
    { label: "Description", names: ["Description"] },
    { label: "Tag", names: ["Tag"] },
  ]), codeTable, "Lookup_DFF", ["Lookup_DFF"]);
  if (codeSection) sections.push(codeSection);

  return {
    title: "Lookup Configuration",
    sections,
  };
}

function buildProfileOptionView(files) {
  const optionTable = findTable(files, [/PROFILE_OPTION\.csv$/i]);
  const valueTable = findTable(files, [/PROFILE_VALUE/i]);
  const levelTable = findTable(files, [/PROFILE_OPTION_LEVEL/i]);
  if (!optionTable) return null;

  const sections = [];
  const optionSection = tableSection("Profile Option Definitions", optionTable, [
    { label: "Profile Option", names: ["ProfileOptionName"] },
    { label: "Display Name", names: ["UserProfileOptionName"] },
    { label: "Description", names: ["Description"] },
    { label: "SQL Validation", names: ["SqlValidation"] },
    { label: "Start Date", names: ["StartDateActive"] },
    { label: "End Date", names: ["EndDateActive"] },
  ]);
  if (optionSection) sections.push(optionSection);

  const valueSection = tableSection("Configured Profile Values", valueTable, [
    {
      label: "Profile Option",
      names: ["ProfileOptionName", "FND_APP_PROFILE_OPTION.ProfileOptionName"],
    },
    { label: "Level", names: ["LevelName"] },
    { label: "Level Value", names: ["LevelValue"] },
    { label: "Configured Value", names: ["ProfileOptionValue"] },
  ]);
  if (valueSection) sections.push(valueSection);

  const levelSection = tableSection("Available Profile Levels", levelTable, [
    {
      label: "Profile Option",
      names: ["ProfileOptionName", "FND_APP_PROFILE_OPTION.ProfileOptionName"],
    },
    { label: "Level", names: ["LevelName"] },
    { label: "Enabled", names: ["EnabledFlag"] },
    { label: "User Updateable", names: ["UpdateableFlag"] },
  ]);
  if (levelSection) sections.push(levelSection);

  return {
    title: "Profile Option Configuration",
    sections,
  };
}

function buildValueSetView(files) {
  const definitions = findTable(files, [/FLEX_VALUE_SET\.csv$/i]);
  if (!definitions) return null;
  const classify = (table) => {
    const name = table.file.name;
    if (/FLEX_VALUE_SET\.csv$/i.test(name)) return {
      title: "Value Set Definitions",
      preferred: [
        { label: "Value Set Code", names: ["ValueSetCode"] },
        { label: "Description", names: ["Description"] },
        { label: "Validation Type", names: ["ValidationType"] },
        { label: "Data Type", names: ["ValueDataType"] },
        { label: "Maximum Length", names: ["MaximumLength"] },
        { label: "Security Enabled", names: ["SecurityEnabledFlag"] },
      ],
    };
    if (/RELATED_VALUE_SET_VALUE/i.test(name)) return {
      title: "Related Value Set Values",
      preferred: [
        { label: "Value Set Code", names: ["FND_APP_FLEX_VALUE_SET.ValueSetCode"] },
        { label: "Related Value Set", names: ["ORA_APPLICATION_FLEXFIELD_RELATED_VALUE_SET.ValueSetCode1"] },
        { label: "Parent Value", names: ["Value1"] },
        { label: "Related Value", names: ["Value2"] },
        { label: "Enabled", names: ["EnabledFlag"] },
      ],
    };
    if (/VALUE_SET_VALUE\.csv$/i.test(name)) return {
      title: "Permitted Values",
      preferred: [
        { label: "Value Set Code", names: ["FND_APP_FLEX_VALUE_SET.ValueSetCode"] },
        { label: "Value", names: ["Value"] },
        { label: "Translated Value", names: ["TranslatedValue"] },
        { label: "Description", names: ["Description"] },
        { label: "Enabled", names: ["EnabledFlag"] },
        { label: "Start Date", names: ["StartDateActive"] },
        { label: "End Date", names: ["EndDateActive"] },
      ],
    };
    if (/VALIDATION_(TABLE|VIEW_OBJECT)/i.test(name)) return {
      title: "Validation Sources",
      preferred: [
        { label: "Value Set Code", names: ["FND_APP_FLEX_VALUE_SET.ValueSetCode"] },
        { label: "View Object", names: ["ViewObjectName"] },
        { label: "From Clause", names: ["FromClause"] },
        { label: "Where Clause", names: ["WhereClause"] },
        { label: "Value Column", names: ["ValueColumnName", "ValueAttributeName"] },
      ],
    };
    if (/RELATED_VALUE_SET/i.test(name)) return {
      title: "Related Value Sets",
      preferred: [
        { label: "Value Set Code", names: ["FND_APP_FLEX_VALUE_SET.ValueSetCode"] },
        { label: "Related Value Set", names: ["ValueSetCode1"] },
        { label: "Enabled", names: ["EnabledFlag"] },
      ],
    };
    return { title: sourceLabel(name), preferred: [] };
  };

  const sections = files.map(toTable).map((table) => {
    const definition = classify(table);
    return tableSection(definition.title, table, definition.preferred);
  }).filter(Boolean);
  return { title: "Value Set Configuration", sections };
}

function buildFlexfieldView(files) {
  const sections = files.map(toTable).map((table) => {
    let title = sourceLabel(table.file.name);
    if (/CONTEXT/i.test(table.file.name)) title = "Contexts";
    else if (/SEGMENT/i.test(table.file.name)) title = "Segments";
    else if (/VALUE_SET/i.test(table.file.name)) title = "Value Sets and Validation";
    return tableSection(title, table, [
      { label: "Context Code", names: ["ContextCode", "ContextName"] },
      { label: "Segment Code", names: ["SegmentCode", "SegmentName"] },
      { label: "Display Name", names: ["DisplayName", "Prompt"] },
      { label: "Value Set", names: ["ValueSetCode", "ValueSetName"] },
      { label: "Required", names: ["RequiredFlag"] },
      { label: "Enabled", names: ["EnabledFlag"] },
    ]);
  }).filter(Boolean);
  return sections.length ? { title: "Flexfield Configuration", sections } : null;
}

function buildStatusView(files) {
  const sections = files.map(toTable).map((table) => {
    const isTransactionTable = hasColumns(table, [
      ["MaterialStatusCode", "StatusCode", "StatusName"],
      ["TransactionTypeName", "TransactionType", "TransactionName"],
    ]);
    return tableSection(
      isTransactionTable ? "Allowed Transactions" : sourceLabel(table.file.name),
      table,
      [
      { label: "Status Code", names: ["MaterialStatusCode", "StatusCode"] },
      { label: "Status Name", names: ["MaterialStatusName", "StatusName"] },
      { label: "Description", names: ["Description"] },
      { label: "Transaction", names: ["TransactionTypeName", "TransactionType", "TransactionName"] },
      { label: "Allowed", names: ["AllowedFlag", "TransactionAllowedFlag"] },
      { label: "Enabled", names: ["EnabledFlag"] },
      ]
    );
  }).filter(Boolean);
  return sections.length ? { title: "Material Status Configuration", sections } : null;
}

function buildReadableTaskView(title, files, preferred) {
  const sections = files.map(toTable)
    .map((table) => tableSection(sourceLabel(table.file.name), table, preferred))
    .filter(Boolean);
  return sections.length ? { title, sections } : null;
}

function buildTaskCustomerView(taskResult) {
  const taskName = String(taskResult.name || "").toLowerCase();
  const files = taskResult.files || [];
  if (!files.length) return null;

  if (/lookup/.test(taskName)) return buildLookupView(files);
  if (/profile option/.test(taskName)) return buildProfileOptionView(files);
  if (/value set/.test(taskName) && !/flexfield/.test(taskName)) return buildValueSetView(files);
  if (/flexfield/.test(taskName)) return buildFlexfieldView(files);
  if (/material status/.test(taskName)) return buildStatusView(files);
  if (/unit(s)? of measure/.test(taskName)) {
    return buildReadableTaskView("Unit of Measure Configuration", files, [
      { label: "UOM Class", names: ["UOMClass", "UnitOfMeasureClass"] },
      { label: "From UOM", names: ["FromUOMCode", "FromUnitOfMeasure"] },
      { label: "To UOM", names: ["ToUOMCode", "ToUnitOfMeasure"] },
      { label: "Conversion Rate", names: ["ConversionRate", "ConversionFactor"] },
      { label: "Enabled", names: ["EnabledFlag"] },
      { label: "Start Date", names: ["StartDateActive"] },
      { label: "End Date", names: ["EndDateActive"] },
    ]);
  }
  if (/payment terms?/.test(taskName)) {
    return buildReadableTaskView("Payment Terms", files, [
      { label: "Name", names: ["Name", "TermName", "PaymentTermName", "PaymentTerm"] },
      { label: "Description", names: ["Description"] },
      { label: "Cut-off Day", names: ["CutoffDay", "CutOffDay", "CutoffDayOfMonth"] },
      { label: "Rank", names: ["Rank", "TermRank"] },
      { label: "From Date", names: ["StartDateActive", "EffectiveStartDate", "FromDate"] },
      { label: "To Date", names: ["EndDateActive", "EffectiveEndDate", "ToDate"] },
      { label: "Flexfield", names: ["AttributeCategory", "Flexfield", "TermDFF"] },
      { label: "Sequence Num", names: ["SequenceNum", "SequenceNumber"] },
      { label: "Due Percentage", names: ["DuePercent", "DuePercentage"] },
      { label: "Amount Due", names: ["DueAmount", "AmountDue"] },
      { label: "Calendar", names: ["Calendar", "CalendarName"] },
      { label: "Fixed Date", names: ["FixedDate"] },
      { label: "Days", names: ["DueDays", "Days"] },
      { label: "Day Of Month", names: ["DayOfMonth", "DueDayOfMonth"] },
    ]);
  }
  if (/interorganization|intersubinventory/.test(taskName)) {
    return buildReadableTaskView("Transfer Route Configuration", files, [
      { label: "Source Organization", names: ["FromOrganizationCode", "SourceOrganizationCode"] },
      { label: "Source Subinventory", names: ["FromSubinventoryCode", "SourceSubinventoryCode"] },
      { label: "Destination Organization", names: ["ToOrganizationCode", "DestinationOrganizationCode"] },
      { label: "Destination Subinventory", names: ["ToSubinventoryCode", "DestinationSubinventoryCode"] },
      { label: "Transfer Type", names: ["TransferType", "TransferTypeCode"] },
      { label: "Intransit Type", names: ["IntransitType", "IntransitTypeCode"] },
      { label: "FOB", names: ["FOBPoint", "FOBPointCode"] },
    ]);
  }
  if (/abc/.test(taskName)) {
    return buildReadableTaskView("ABC Analysis Configuration", files, [
      { label: "ABC Class", names: ["ABCClassName", "ABCClassCode"] },
      { label: "Classification Set", names: ["ClassificationSetName", "ABCClassificationSetName"] },
      { label: "Assignment Group", names: ["AssignmentGroupName", "ABCAssignmentGroupName"] },
      { label: "Organization", names: ["OrganizationCode", "OrganizationName"] },
      { label: "Sequence", names: ["SequenceNumber", "Sequence"] },
      { label: "Enabled", names: ["EnabledFlag"] },
    ]);
  }
  return null;
}

module.exports = { buildTaskCustomerView, readableHeaderLabel };
