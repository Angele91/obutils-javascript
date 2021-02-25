const ShellHandler = require("../api/ShellHandler");
const { cli } = require("cli-ux");
const { FileHandler } = require("../api/FileHandler");

const COLUMN_TYPES = {
  1: "character varying (32)",
  2: "character (1)",
  3: "character varying (60)",
  4: "character varying (255)",
  5: "timestamp without time zone",
  6: "character varying (2000)",
  7: "numeric",
  8: "character varying (10)",
  9: "character varying (3000)",
};

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
  return columnsQuery;
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

  return constraintsQuery;
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
isactive character(1) NOT NULL DEFAULT 'N'::bpchar,
created timestamp without time zone DEFAULT now(),
createdby character varying(32) NOT NULL,
updated timestamp without time zone DEFAULT now(),
updatedby character varying(32),
${generateCreateColumnsQuery(columns)},
${generateCreateConstraintsQuery(constraints)},
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
    instance.log(
      "Invalid column length. Max character limit is 30 characters."
    );
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
    instance.log(
      `The generated constraint would be ${constraintName} and it is too long to be exported by Etendo. It will be shortened to 30 characters.`
    );
    constraintName = shortenConstraintName(constraintName);
    instance.log(`The shortened constraint name is ${constraintName}.`);
  }

  return {
    externalTableName,
    externalTableColumn,
    constraintName,
    isLinkToParentColumn,
  };
};

const createTableWizard = async (instance) => {
  const tablePrefix = await cli.prompt(
    `[${instance.pivot}] Insert table prefix: `
  );

  const tableName = await cli.prompt(`[${instance.pivot}] Insert table name: `);

  let fullTable = `${tablePrefix}_${tableName}`;

  if (fullTable.length > 30) {
    instance.log(
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
        10) Stop creating columns
        `);

    if (columnType === "10") {
      creatingColumns = false;
      continue;
    }

    if (!COLUMN_TYPES[columnType]) {
      instance.log("Invalid column type.");
      continue;
    }

    const columnName = await askForColumnName(instance, fullTable);

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
          instance.log(
            `The check constraint for column ${columnName} which is ${constraintName} is too long to be exported by Etendo. It will be shortened to 30 characters.`
          );
          constraintName = shortenConstraintName(constraintName);
          instance.log(
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
    instance.log(
      "Please, select a valid option. Write P to print the query, or E to execute it."
    );
    return await askPrintOrExecute();
  }

  if (printOrExecute === "P") {
    instance.log(query);
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

      instance.log(`Query saved to file: ${fileName}`);
      cli.action.stop();
    } catch (error) {
      instance.error(error);
    }
  }
};

const dropTable = async (tblName, instance) => {
  const query = `DROP TABLE ${tblName};`;
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

const table = async ({ instance, cmdArgs }) => {
  const [operation] = cmdArgs;
  if (operation === "create") {
    const query = await createTableWizard(instance);
    await askPrintOrExecute(query, instance);
  }

  if (operation === "drop") {
    const tblName = cmdArgs[1];
    await dropTable(tblName, instance);
  }
};

ShellHandler.registerCommand(
  ":table",
  table,
  "Helper to create and modify tables."
);
