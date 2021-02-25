const ShellHandler = require("../api/ShellHandler");
const { cli } = require("cli-ux");

const getColumns = (rows) =>
  Object.keys(rows[0]).reduce((prev, curr) => ({ ...prev, [curr]: {} }), {});

const query = async ({ instance, cmdArgs }) => {
  const query = cmdArgs.join(" ");

  try {
    cli.action.start("Executing query...");
    const result = await instance.executeQuery(query);
    cli.action.stop("Query executed.");
    const columns = getColumns(result.rows);
    cli.table(result.rows, columns);
  } catch (error) {
    instance.error(error);
  }
};

ShellHandler.registerCommand(
  ":query",
  query,
  "Executes a query directly in the database."
);
