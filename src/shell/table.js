const ShellHandler = require("../api/ShellHandler");
const { cli } = require("cli-ux");
const { FileHandler } = require("../api/FileHandler");
const COLUMN_TYPES = require("../api/const/columnTypes");
const COLUMN_TYPE_DESCRIPTIONS = require("../api/const/columnTypeDescription");
const DATA_TYPES = require("../api/const/datatypes");
const _ = require("lodash");

/**
 * @description Will shorten the name of a constraint.
 * @param {string} constraintName
 */
const shortenConstraintName = (constraintName, limit = 30) => {
  if (constraintName.length <= 30) {
    return constraintName;
  }

  const splConstraintName = constraintName.split("_");
  const afterPrefix = splConstraintName.slice(1).join("_");

  // First, remove the vowels.
  let result = afterPrefix.replace(/[aeiouy]/g, "");

  // If we still have too much characters, remove some random letters.
  while (result.length > limit) {
    result = result.split("").reduce((prev, curr) => {
      const opt = Math.random() > 0.8 ? curr : "";
      return `${prev}${opt}`;
    }, "");
  }

  result = `${splConstraintName[0]}_${result}`;
  result = result[result.length - 1] === "_" ? result.slice(0, -1) : result;

  return result;
};

const toBoolean = (text) => text.toUpperCase() === "Y";

const generateCreateColumnsQuery = (columns = []) => {
  const columnsQuery = columns.map(
    ({ columnType, columnName, isNotNull, defaultValue }) =>
      `${columnName} ${columnType}${isNotNull ? " NOT NULL" : ""}${
        defaultValue ? ` DEFAULT ${defaultValue}` : ""
      }`
  ).join(`,
    `);
  return columnsQuery === "" ? "" : `${columnsQuery},`;
};

const generateCreateConstraintsQuery = (constraints = []) => {
  const constraintsQuery = constraints.map(
    ({
      columnName,
      externalTableColumn,
      externalTableName,
      constraintName,
      type,
    }) => {
      if (type === "foreignKey") {
        return `CONSTRAINT ${shortenConstraintName(
          constraintName
        )} FOREIGN KEY (${columnName})
  REFERENCES public.${externalTableName} (${externalTableColumn}) MATCH SIMPLE`;
      }

      if (type === "ynCheck") {
        return `CONSTRAINT ${shortenConstraintName(
          constraintName
        )} CHECK (${columnName} = 'Y'::bpchar OR ${columnName} = 'N'::bpchar)`;
      }
    }
  ).join(`,
  `);

  return constraintsQuery === "" ? "" : `${constraintsQuery},`;
};

const generateCreateIndexQuery = (indexes = []) => {
  return indexes.map(({ fullTable, columnName }) => {
    let indexName = `${fullTable}_${columnName}_idx`;

    if (indexName.length > 30) {
      indexName = shortenConstraintName(indexName);
    }

    return `CREATE INDEX ${indexName} ON ${fullTable} (${columnName});`;
  }).join(`
  `);
};

const generateCreateQuery = (
  fullTableName,
  columns = [],
  constraints = [],
  indexes = []
) => {
  const query = `
    CREATE TABLE public.${fullTableName}
(
${fullTableName}_id character varying(32) NOT NULL,
ad_client_id character varying(32) NOT NULL,
ad_org_id character varying(32) NOT NULL,
isactive character(1) NOT NULL DEFAULT 'Y'::bpchar,
created timestamp without time zone DEFAULT now(),
createdby character varying(32) NOT NULL,
updated timestamp without time zone DEFAULT now(),
updatedby character varying(32),
${generateCreateColumnsQuery(columns)}
${generateCreateConstraintsQuery(constraints)}
CONSTRAINT ${fullTableName}_pk PRIMARY KEY (${fullTableName}_id),
CONSTRAINT ${fullTableName}_client FOREIGN KEY (ad_client_id)
  REFERENCES public.ad_client (ad_client_id) MATCH SIMPLE
  ON UPDATE NO ACTION
  ON DELETE NO ACTION,
CONSTRAINT ${fullTableName}_org FOREIGN KEY (ad_org_id)
  REFERENCES public.ad_org (ad_org_id) MATCH SIMPLE
  ON UPDATE NO ACTION
  ON DELETE NO ACTION,
CONSTRAINT ${fullTableName}_created FOREIGN KEY (createdby)
  REFERENCES public.ad_user (ad_user_id) MATCH SIMPLE
  ON UPDATE NO ACTION
  ON DELETE NO ACTION,
CONSTRAINT ${fullTableName}_updated FOREIGN KEY (updatedby)
  REFERENCES public.ad_user (ad_user_id) MATCH SIMPLE
  ON UPDATE NO ACTION
  ON DELETE NO ACTION,
CONSTRAINT ${fullTableName}_isactive CHECK (isactive = 'Y'::bpchar OR isactive = 'N'::bpchar)
);

ALTER TABLE public.${fullTableName}
  OWNER TO tad;

${generateCreateIndexQuery(indexes)}`;

  return query;
};

const askForColumnName = async (instance, fullTable) => {
  const columnName = await cli.prompt(
    `[${instance.pivot}][${fullTable}] Column name: `
  );

  if (columnName.length > 30) {
    cli.info("Invalid column length. Max character limit is 30 characters.");
    return await askForColumnName(instance, fullTable);
  }

  return columnName;
};

const askForForeignKey = async (instance, fullTable) => {
  const externalTableName = await cli.prompt(
    `[${instance.pivot}][${fullTable}] (FOREIGN KEY) External Table Name: `
  );

  const externalTableColumn = await cli.prompt(
    `[${instance.pivot}][${fullTable}] (FOREIGN KEY) External Table Column: `
  );

  const isLinkToParentColumn = await cli.prompt(
    `[${instance.pivot}][${fullTable}] (FOREIGN KEY) Is Link to Parent Column? (Y/N): `
  );

  let constraintName = `${fullTable}_${externalTableName}`;

  if (constraintName.length > 30) {
    cli.info(
      `The generated constraint would be ${constraintName} and it is too long to be exported by Etendo. It will be shortened to 30 characters.`
    );
    constraintName = shortenConstraintName(constraintName);
    cli.info(`The shortened constraint name is ${constraintName}.`);
  }

  return {
    externalTableName,
    externalTableColumn,
    constraintName,
    isLinkToParentColumn,
  };
};

const askForColumnType = async (label) => {
  const columnType = await cli.prompt(`${label}
  ${Object.keys(COLUMN_TYPES)
    .map(
      (key) => `${key}) ${COLUMN_TYPES[key]} (${COLUMN_TYPE_DESCRIPTIONS[key]})`
    )
    .join("\n")}`);

  if (!COLUMN_TYPES[columnType.trim()]) {
    cli.info("Invalid column type.");
    return await askForColumnType(label);
  }

  return COLUMN_TYPES[columnType.trim()];
};

const askForBooleanValue = async (label) => {
  const val = await askFor(`${label} (Y/N)`);
  return toBoolean(val);
};

const createColumnWizard = async (instance, tableName) => {
  const columnName = await askForColumnName(instance, tableName);
  const columnType = await askForColumnType("Select a column type: ");
  const notNull = await askForBooleanValue("NOT NULL");
  const extraQueries = [];

  let notNullDefaultValue = "";

  if (notNull) {
    notNullDefaultValue = "NOT NULL";
    const shouldAddDefaultValue = await askForBooleanValue("DEFAULT");
    if (shouldAddDefaultValue) {
      const defaultValueInput = await askFor("default value");
      notNullDefaultValue = `${notNullDefaultValue} DEFAULT ${defaultValueInput}`;
    }
  }

  const isForeignKey = await askForBooleanValue("FOREIGN KEY");

  if (isForeignKey) {
    const {
      externalTableName,
      externalTableColumn,
      constraintName,
      isLinkToParentColumn,
    } = await askForForeignKey(instance, tableName);

    extraQueries.push(
      `ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${columnName}) REFERENCES ${externalTableName}(${externalTableColumn});`
    );

    if (isLinkToParentColumn) {
      const indexQuery = generateCreateIndexQuery([
        {
          fullTable: tableName,
          columnName,
        },
      ]);

      extraQueries.push(indexQuery);
    }
  }

  const query = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType} ${notNullDefaultValue}; ${extraQueries.join(
    "\n"
  )}`;

  await askPrintOrExecute(query, instance);
};

const createTableWizard = async (instance) => {
  const tablePrefix = await cli.prompt(
    `[${instance.pivot}] Insert table prefix: `
  );

  const tableName = await cli.prompt(`[${instance.pivot}] Insert table name: `);

  let fullTable = `${tablePrefix}_${tableName}`;

  if (fullTable.length > 30) {
    cli.info(
      `The table name length is larger than 30. Because of this, it will be shortened to 30 characters. Are you agree, or do you want to retry?`
    );

    const wannaRetry = await cli.prompt(`(R or Any Key: Retry, C: Continue)`);

    if (wannaRetry === "C") {
      fullTable = shortenConstraintName(fullTable);
    } else {
      return await createTableWizard(instance);
    }
  }

  let columns = [];
  let constraints = [];
  let indexes = [];

  let creatingColumns = true;

  while (creatingColumns) {
    const columnType = await cli.prompt(`[${instance.prefix}][${fullTable}] Adding columns:
        1) Character Varying (32) (Used for ID references)
        2) Character (1) (Used for Y/N values or boolean values)
        3) Character Varying (60) (Used for short generic values)
        4) Character Varying (255) (Used for long generic values)
        5) Timestamp Without Time Zone (Used for dates)
        6) Character Varying (2000) (Used for really long generic values)
        7) Numeric (For numeric values)
        8) Character Varying (10) (For short values)
        9) Character Varying (3000) (For long values)
        10) Character Varying(9) (For hexadecimal values or colors)
        11) Stop creating columns
        `);

    if (columnType === "11") {
      creatingColumns = false;
      continue;
    }

    if (!COLUMN_TYPES[columnType]) {
      cli.info("Invalid column type.");
      continue;
    }

    const columnName = await askForColumnName(instance, fullTable);

    const alreadyExists = columns.some((col) => col.columnName === columnName);

    if (alreadyExists) {
      cli.warn(
        `The column name ${columnName} already exists. Please, elect another one.`
      );
      continue;
    }

    const isNotNull = toBoolean(
      await cli.prompt(`[${instance.pivot}][${fullTable}] Not Null? (Y/N) `)
    );

    const defaultValue = await cli.prompt(
      `[${instance.pivot}][${fullTable}] Default value: `,
      { required: false }
    );

    const isForeignKey = toBoolean(
      await cli.prompt(
        `[${instance.pivot}][${fullTable}] Is Foreign Key? (Y/N) `
      )
    );

    let externalTableName, externalTableColumn;

    if (isForeignKey) {
      const {
        externalTableName,
        externalTableColumn,
        constraintName,
        isLinkToParentColumn,
      } = await askForForeignKey(instance, fullTable);

      if (isLinkToParentColumn) {
        indexes.push({
          fullTable,
          columnName,
        });
      }

      constraints.push({
        tableName: fullTable,
        constraintName,
        columnName,
        columnType,
        externalTableColumn,
        externalTableName,
        type: "foreignKey",
      });
    }

    if (columnType === "2") {
      const shouldAddYNCheck = toBoolean(
        await cli.prompt(
          `[${instance.pivot}][${fullTable}] Do you want to add a Y/N check for this column?`
        )
      );

      if (shouldAddYNCheck) {
        let constraintName = `${fullTable}_${columnName}_chk`;

        if (constraintName.length > 30) {
          cli.info(
            `The check constraint for column ${columnName} which is ${constraintName} is too long to be exported by Etendo. It will be shortened to 30 characters.`
          );
          constraintName = shortenConstraintName(constraintName);
          cli.info(
            `The check constraint has been shortened to ${constraintName}`
          );
        }

        constraints.push({
          tableName: fullTable,
          columnName,
          columnType,
          constraintName,
          type: "ynCheck",
        });
      }
    }

    columns.push({
      columnType: COLUMN_TYPES[columnType],
      columnName,
      isNotNull,
      isForeignKey,
      defaultValue,
      externalTableName,
      externalTableColumn,
    });
  }

  return generateCreateQuery(fullTable, columns, constraints, indexes);
};

const askPrintOrExecute = async (query, instance) => {
  const printOrExecute = await cli.prompt(
    `Would you like to print the query, or to execute it directly to ${instance.dbUser}@${instance.pivot}? (P: Print, E: Execute, S: Save it to a file)`
  );

  if (
    printOrExecute !== "P" &&
    printOrExecute !== "E" &&
    printOrExecute !== "S"
  ) {
    cli.info(
      "Please, select a valid option. Write P to print the query, or E to execute it."
    );
    return await askPrintOrExecute(query, instance);
  }

  if (printOrExecute === "P") {
    cli.info(query);
  }

  if (printOrExecute === "E") {
    try {
      cli.action.start(
        `Executing query in ${instance.dbUser}@${instance.pivot}...`
      );
      await instance.executeQuery(query);
      cli.action.stop("Query executed successfully!");
    } catch (error) {
      instance.error(error);
    }
  }

  if (printOrExecute === "S") {
    try {
      cli.action.start("Saving file...");
      const fileName = await FileHandler.save(null, query);

      cli.info(`Query saved to file: ${fileName}`);
      cli.action.stop();
    } catch (error) {
      instance.error(error);
    }
  }
};

const dropTable = async (tableName, instance) => {
  const tblName = await askIfNotAvailable("table name", tableName);

  const query = `DROP TABLE public.${tblName};`;
  const confirmation = toBoolean(
    await cli.prompt(
      `Are you sure do you want to try to delete the table ${tblName}? (Y/N)`
    )
  );

  if (confirmation) {
    cli.action.start(`Dropping ${tblName}...`);
    await instance.executeQuery(query);
    cli.action.stop(`Done! The table ${tblName} has been dropped.`);
  }
};

const askFor = async (name) => {
  const result = await cli.prompt(`Enter ${name}: `);
  if (!result || result === "") {
    cli.info(`Invalid ${name}. Please, enter a valid ${name}`);
    return askFor(name);
  }

  return result;
};

const getTypeName = ({ dataTypeID }) => {
  return _.first(
    Object.keys(DATA_TYPES).filter((key) => DATA_TYPES[key] === dataTypeID)
  );
};

const parseColumnLabel = (field) => {
  const { name, dataTypeModifier } = field;

  return `${name} ${getTypeName(field)} (${dataTypeModifier})`;
};

const alterTable = async (instance, tableName) => {
  const tblName = await askIfNotAvailable("table name", tableName);
  const columnsQuery = `SELECT *
  FROM ${tblName} where false
     ;`;

  cli.action.start(`Fetching column information...`);
  const columnsResult = await instance.executeQuery(columnsQuery);

  const columnMap = columnsResult.fields.reduce((prev, curr) => {
    return {
      ...prev,
      [curr.name]: {
        label: parseColumnLabel(curr),
        column: curr,
        name: curr.name,
      },
    };
  }, {});

  const selectedColumnID = await askFor(`column to alter:
  ${Object.values(columnMap)
    .map((val) => `${val.column.columnID}) ${val.label}`)
    .join("\n")}

    0 to stop altering.
    -1 to create a column
  `);

  if (selectedColumnID === "0") {
    return;
  }

  if (selectedColumnID === "-1") {
    await createColumnWizard(instance, tblName);
    return alterTable(instance, tblName);
  }

  const selectedColumn = Object.values(columnMap).find(
    (col) => col.column.columnID === Number(selectedColumnID)
  );

  const operation = await askFor(
    `Enter operation to make to ${selectedColumn.label}:
    1) Drop column
    2) Add Foreign Key
    3) Add Check
    4) Remove Constraint
    5) Rename Column
    6) Change type of column
    `
  );

  if (operation === "1") {
    await dropColumn(tblName, selectedColumn.name, instance);
  }

  if (operation === "2") {
    await addForeignKey(tblName, null, selectedColumn.name, null, instance);
  }

  if (operation === "3") {
    await addCheck(tblName, selectedColumn.name, instance);
  }

  if (operation === "4") {
    await removeConstraint(tblName, selectedColumn.name, instance);
  }

  if (operation === "5") {
    await renameColumn(tblName, selectedColumn.name, null, instance);
  }

  if (operation === "6") {
    await changeColumnType(tblName, selectedColumn.name, instance);
  }

  return await alterTable(instance, tblName);
};

const askIfNotAvailable = async (label, elem) => {
  if (!elem) {
    return await askFor(label);
  }

  return elem;
};

const changeColumnType = async (tableName, columnName, instance) => {
  const tblName = await askIfNotAvailable("table name", tableName);
  const colName = await askIfNotAvailable("colum name", columnName);
  const newType = await askForColumnType("Enter a column type: ");

  const query = `ALTER TABLE ${tblName} ALTER COLUMN ${colName} TYPE ${newType};`;

  await handlePrintSaveOrExecute(query, instance);
};

const renameColumn = async (
  tableName,
  oldColumnName,
  newColumnName,
  instance
) => {
  const tblName = await askIfNotAvailable("table name", tableName);
  const oldColName = await askIfNotAvailable("column name", oldColumnName);
  const newColName = await askIfNotAvailable("new column name", newColumnName);

  const query = `ALTER TABLE ${tblName} RENAME COLUMN ${oldColName} TO ${newColName};`;
  await handlePrintSaveOrExecute(query, instance);
};

const removeConstraint = async (tableName, constraintName, instance) => {
  const tblName = await askIfNotAvailable("table name", tableName);
  const constName = await askIfNotAvailable("constraint name", constraintName);

  const query = `ALTER TABLE ${tblName} DROP CONSTRAINT ${constName};`;

  await handlePrintSaveOrExecute(query, instance);
};

const addCheck = async (tableName, instance) => {
  let tblName = await askIfNotAvailable("table name", tableName);
  let constraintName, check;

  constraintName = await askFor("constraint name");
  check = await askFor("check");

  const query = `ALTER TABLE ${tblName} ADD CONSTRAINT ${constraintName} CHECK (${check});`;

  await handlePrintSaveOrExecute(query, instance);
};

const handlePrintSaveOrExecute = async (query, instance) => {
  const operation = await askPrintOrExecute(query, instance);

  if (operation === "P") {
    cli.info(operation);
  }

  if (operation === "E") {
    const result = await instance.executeQuery(query);
    cli.styledJSON(result);
  }

  if (operation === "S") {
    try {
      cli.action.start("Saving file...");
      const fileName = await FileHandler.save(null, query);

      cli.info(`Query saved to file: ${fileName}`);
      cli.action.stop();
    } catch (error) {
      instance.error(error);
    }
  }
};

const addForeignKey = async (
  tableName,
  externalTableName,
  columnName,
  externalColumnName,
  instance
) => {
  const tblName = await askIfNotAvailable("table name", tableName);
  const colName = await askIfNotAvailable("column name", columnName);
  const extTblName = await askIfNotAvailable(
    "external table name",
    externalTableName
  );
  const extColName = await askIfNotAvailable(
    "external column name",
    externalColumnName
  );
  const fkName = await askFor("foreign key name");

  const query = `ALTER TABLE ${tblName} ADD CONTRAINT ${fkName} FOREIGN KEY (${colName}) REFERENCES ${extTblName}(${extColName});`;

  await handlePrintSaveOrExecute(query, instance);
};

const dropColumn = async (tableName, columnName, instance) => {
  let tblName = await askIfNotAvailable("table name", tableName);
  let colName = await askIfNotAvailable("column name", columnName);

  const query = `ALTER TABLE ${tblName} DROP COLUMN ${colName};`;

  await handlePrintSaveOrExecute(query, instance);
};

const tableActions = ["create", "drop", "alter", "rebase"];

const table = async ({ instance, cmdArgs }) => {
  const [operation] = cmdArgs;

  if (!tableActions.includes(operation)) {
    cli.info(`Invalid table action. Use one of: ${tableActions.join(", ")}`);
    return;
  }

  if (operation === "create") {
    const query = await createTableWizard(instance);
    await askPrintOrExecute(query, instance);
  }

  if (operation === "drop") {
    const tblName = cmdArgs[1];
    await dropTable(tblName, instance);
  }

  if (operation === "alter") {
    await alterTable(instance);
  }

  if (operation === "rebase") {
    // WIP: Make rebase tables
  }
};

ShellHandler.registerCommand(
  ":table",
  table,
  "Helper to create and modify tables."
);
